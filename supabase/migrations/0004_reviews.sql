-- =============================================================================
-- 0004_reviews.sql — ratings and reviews
--
-- Spec reference: §12 "Ratings & Reviews".
--
-- RATEMYPROFESSOR IS NEVER STORED. There is deliberately no table for it and
-- no source_id that can hold it — the review_sources.kind check constraint
-- makes an rmp row impossible to insert, not merely discouraged. RMP is
-- fetched live at drawer-open, displayed attributed with a link out, and
-- discarded. `RmpSnapshot` in lib/types.ts exists only as an in-memory shape.
--
-- Course quality and instructor quality are scored SEPARATELY and never
-- averaged into one number, so nothing here aggregates across the two.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- review_sources
-- -----------------------------------------------------------------------------

create table if not exists review_sources (
  source_id   uuid primary key default gen_random_uuid(),
  -- ReviewSourceKind in lib/types.ts. The check is the enforcement point for
  -- the never-store-RMP rule.
  kind        text not null check (kind in ('culpa', 'reddit')),
  name        text not null,
  base_url    text,
  -- CULPA is a partnership, not a scrape. Recorded so the provenance of a
  -- review's licence travels with the data.
  license_note text,
  created_at  timestamptz not null default now()
);

comment on table review_sources is
  'Ingestable review sources. CULPA (partnership) and Reddit (official API) only. RateMyProfessor is never ingested and cannot be represented here.';

create unique index if not exists idx_review_sources_kind on review_sources (kind);

insert into review_sources (kind, name, base_url, license_note) values
  ('culpa',  'CULPA',  'https://culpa.info',   'Partnership — not scraped.'),
  ('reddit', 'Reddit', 'https://www.reddit.com', 'Official API with registered credentials.')
on conflict (kind) do nothing;

-- -----------------------------------------------------------------------------
-- reviews_raw
-- -----------------------------------------------------------------------------
-- DEVIATION: `source_review_key` and `excerpt` added, and `url` is uniquely
-- indexed. review_id in lib/types.ts is our own stable id; source_review_key is
-- the source's id, and it is what makes re-ingest idempotent. excerpt is the
-- short quote the UI renders, kept separate from body so a display surface
-- never has to hold a full review in memory or make a truncation decision.

create table if not exists reviews_raw (
  review_id          text primary key,
  source_id          uuid not null references review_sources (source_id)
                       on update cascade on delete restrict,
  -- The source's own identifier for this review. Idempotency key for re-ingest.
  source_review_key  text,
  -- Whatever the source names the subject of the review before we resolve it.
  subject_ref        text,
  instructor_id      uuid references instructors (instructor_id)
                       on update cascade on delete set null,
  course_id          text references courses (course_id)
                       on update cascade on delete set null,
  posted_at          timestamptz,
  body               text,
  excerpt            text,
  url                text not null,
  fetched_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

comment on table reviews_raw is
  'One ingested review, unmodified. Dimensions are extracted once at ingest into review_dimensions.';

create unique index if not exists idx_reviews_raw_source_key
  on reviews_raw (source_id, source_review_key) where source_review_key is not null;
create unique index if not exists idx_reviews_raw_url on reviews_raw (url);
create index if not exists idx_reviews_raw_course     on reviews_raw (course_id, posted_at desc)
  where course_id is not null;
create index if not exists idx_reviews_raw_instructor on reviews_raw (instructor_id, posted_at desc)
  where instructor_id is not null;
create index if not exists idx_reviews_raw_source     on reviews_raw (source_id, posted_at desc);
-- Coverage honesty: "which courses have any review at all" drives the
-- include-unrated toggle.
create index if not exists idx_reviews_raw_unresolved on reviews_raw (subject_ref)
  where course_id is null and instructor_id is null;

-- -----------------------------------------------------------------------------
-- review_dimensions
-- -----------------------------------------------------------------------------
-- Extraction runs ONCE per review through an LLM at ingest time. Expensive
-- once, free forever. model_version is what makes a re-extraction campaign
-- possible: bump the version, select where model_version <> current, re-run.

create table if not exists review_dimensions (
  review_id          text primary key references reviews_raw (review_id)
                       on update cascade on delete cascade,
  -- All 1-5. NULL means the review carried no signal on that dimension —
  -- distinct from "scored it low", and never coerced to a number.
  workload           numeric(3, 2) check (workload           between 1 and 5),
  difficulty         numeric(3, 2) check (difficulty         between 1 and 5),
  teaching_quality   numeric(3, 2) check (teaching_quality   between 1 and 5),
  grading_fairness   numeric(3, 2) check (grading_fairness   between 1 and 5),
  -- -1..1
  sentiment          numeric(4, 3) check (sentiment          between -1 and 1),
  would_take_again   boolean,
  extracted_at       timestamptz not null default now(),
  model_version      text not null
);

comment on table review_dimensions is
  'Structured dimensions extracted once per review. NULL means no signal, never a defaulted score.';

create index if not exists idx_review_dimensions_model on review_dimensions (model_version);

-- -----------------------------------------------------------------------------
-- Aggregation
-- -----------------------------------------------------------------------------
-- Course reputation and instructor reputation are separate views on purpose.
-- Nothing here joins them into a single score; a section combines them only at
-- render time, and even then side by side.

create or replace view course_reputation as
  select r.course_id,
         count(*)                                            as sample_size,
         avg(d.workload)                                     as workload,
         avg(d.difficulty)                                   as difficulty,
         avg(d.teaching_quality)                             as teaching_quality,
         avg(d.grading_fairness)                             as grading_fairness,
         avg(d.sentiment)                                    as sentiment,
         avg(case when d.would_take_again then 1.0
                  when d.would_take_again is false then 0.0 end) as would_take_again_rate,
         min(r.posted_at)                                    as first_posted_at,
         max(r.posted_at)                                    as last_posted_at,
         count(*) filter (where s.kind = 'culpa')            as culpa_count,
         count(*) filter (where s.kind = 'reddit')           as reddit_count
    from reviews_raw r
    join review_sources s using (source_id)
    left join review_dimensions d on d.review_id = r.review_id
   where r.course_id is not null
   group by r.course_id;

comment on view course_reputation is
  'Per-course review aggregate. Deliberately separate from instructor_reputation — the two are never averaged together.';

create or replace view instructor_reputation as
  select r.instructor_id,
         count(*)                                            as sample_size,
         avg(d.workload)                                     as workload,
         avg(d.difficulty)                                   as difficulty,
         avg(d.teaching_quality)                             as teaching_quality,
         avg(d.grading_fairness)                             as grading_fairness,
         avg(d.sentiment)                                    as sentiment,
         avg(case when d.would_take_again then 1.0
                  when d.would_take_again is false then 0.0 end) as would_take_again_rate,
         min(r.posted_at)                                    as first_posted_at,
         max(r.posted_at)                                    as last_posted_at,
         count(*) filter (where s.kind = 'culpa')            as culpa_count,
         count(*) filter (where s.kind = 'reddit')           as reddit_count
    from reviews_raw r
    join review_sources s using (source_id)
    left join review_dimensions d on d.review_id = r.review_id
   where r.instructor_id is not null
   group by r.instructor_id;

comment on view instructor_reputation is
  'Per-instructor review aggregate. Deliberately separate from course_reputation.';

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
-- Reviews are a free read (spec §15). Writes are ingest-only.

alter table review_sources    enable row level security;
alter table reviews_raw       enable row level security;
alter table review_dimensions enable row level security;

drop policy if exists review_sources_world_readable on review_sources;
create policy review_sources_world_readable on review_sources
  for select to anon, authenticated using (true);

drop policy if exists reviews_raw_world_readable on reviews_raw;
create policy reviews_raw_world_readable on reviews_raw
  for select to anon, authenticated using (true);

drop policy if exists review_dimensions_world_readable on review_dimensions;
create policy review_dimensions_world_readable on review_dimensions
  for select to anon, authenticated using (true);

-- Views run as their owner by default. security_invoker makes them respect the
-- caller's RLS on the underlying tables instead of leaking around it. Guarded
-- because the option only exists from PostgreSQL 15; Supabase is well past
-- that, but a local PG14 shell should not fail the whole migration.
do $$
begin
  if current_setting('server_version_num')::integer >= 150000 then
    execute 'alter view course_reputation     set (security_invoker = true)';
    execute 'alter view instructor_reputation set (security_invoker = true)';
  else
    raise notice 'security_invoker requires PostgreSQL 15+; reputation views left as security definer';
  end if;
end $$;
