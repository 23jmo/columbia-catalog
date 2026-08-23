-- =============================================================================
-- 0001_catalog.sql — Columbia Catalog core catalog schema
--
-- Spec reference: §11 "Data Model / Catalog".
--
-- Shape notes (deliberate departures from the spec sketch are marked DEVIATION
-- and explained; lib/db/README.md carries the full list):
--
--   * Times are stored as INTEGER minutes-from-midnight, not TIME, to match
--     `Meeting` in lib/types.ts exactly. 13:10 -> 790. No timezone math ever
--     happens on a class meeting.
--   * Ids are the same natural, human-readable strings the domain types use
--     (`"COMS4113W"`, `"20263COMS4113W001"`), so a row round-trips to a domain
--     object without a lookup table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared enums
-- -----------------------------------------------------------------------------

do $$ begin
  create type season as enum ('Spring', 'Summer', 'Fall');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campus_zone as enum
    ('morningside', 'barnard', 'manhattanville', 'cuimc', 'other', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type enrollment_status as enum
    ('open', 'full', 'waitlist', 'closed', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type weekday_code as enum ('Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Shared trigger helper: keep updated_at honest without application help.
-- -----------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at = now().';

-- -----------------------------------------------------------------------------
-- terms
-- -----------------------------------------------------------------------------
-- DEVIATION: season / year / directory_label are stored rather than derived at
-- read time. They are pure functions of term_code (see parseTermCode in
-- lib/constants.ts) but storing them lets SQL sort chronologically and lets the
-- directory label be used in URL construction without a round trip.

create table if not exists terms (
  term_code           text primary key
                      check (term_code ~ '^[0-9]{4}[123]$'),
  season              season      not null,
  year                integer     not null check (year between 1990 and 2100),
  -- "Fall2026" — the label the Directory of Classes uses in its URLs.
  directory_label     text        not null,
  -- "Fall 2026" — the label humans see.
  label               text        not null,
  starts_on           date,
  ends_on             date,
  add_drop_deadline   timestamptz,
  is_registerable     boolean     not null default false,
  is_archived         boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

comment on table terms is
  'One row per Columbia term. term_code is YYYY + season digit (1 Spring, 2 Summer, 3 Fall).';

create index if not exists idx_terms_chronological on terms (year desc, season desc);
create index if not exists idx_terms_registerable  on terms (is_registerable) where is_registerable;

drop trigger if exists trg_terms_updated_at on terms;
create trigger trg_terms_updated_at before update on terms
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- subjects
-- -----------------------------------------------------------------------------
-- DEVIATION: the sketch had `subjects (subject_id PK, code, name, school)`.
-- The four-letter subject code is already globally unique, stable, and is what
-- every other table, every URL, and the `Subject` domain type carries. A
-- synthetic subject_id would buy nothing and force a join on the hottest
-- filter in the product, so subject_code IS the primary key.

create table if not exists subjects (
  subject_code  text primary key check (subject_code ~ '^[A-Z]{2,6}$'),
  subject_name  text not null,
  -- Owning school/division as printed on the directory index. Nullable: the
  -- index does not always print one.
  school        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table subjects is
  'Directory of Classes subject codes. subject_code is the natural key (see DEVIATION note).';

create index if not exists idx_subjects_school on subjects (school) where school is not null;

drop trigger if exists trg_subjects_updated_at on subjects;
create trigger trg_subjects_updated_at before update on subjects
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- buildings
-- -----------------------------------------------------------------------------

create table if not exists buildings (
  building_id  text primary key,
  name         text        not null,
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  campus_zone  campus_zone not null default 'unknown',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table buildings is
  'Campus buildings with coordinates and zone, powering the commute feasibility check.';

-- Meeting rows arrive carrying a building *name* scraped from HTML. This index
-- is what lets the ingest resolve that string to a building_id.
create unique index if not exists idx_buildings_normalized_name
  on buildings (lower(btrim(name)));
create index if not exists idx_buildings_zone on buildings (campus_zone);

drop trigger if exists trg_buildings_updated_at on buildings;
create trigger trg_buildings_updated_at before update on buildings
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- instructors
-- -----------------------------------------------------------------------------
-- DEVIATION: the sketch had (instructor_id, uni, first, last, email). The
-- directory only ever gives us one printed full name ("Adam H Cannon"), and
-- `Section.instructors` in lib/types.ts is `string[]` of exactly that. So
-- full_name is authoritative and first/last/uni/email are optional enrichment.
-- normalized_name is a stored generated column so the ingest can upsert on it
-- without every caller reimplementing the same normalization.

create table if not exists instructors (
  instructor_id     uuid primary key default gen_random_uuid(),
  full_name         text not null check (btrim(full_name) <> ''),
  normalized_name   text generated always as
                      (lower(btrim(regexp_replace(full_name, '\s+', ' ', 'g')))) stored,
  uni               text,
  first_name        text,
  last_name         text,
  email             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column instructors.normalized_name is
  'Whitespace-collapsed lowercase full_name. The upsert key for ingest.';

create unique index if not exists idx_instructors_normalized_name
  on instructors (normalized_name);
create unique index if not exists idx_instructors_uni
  on instructors (uni) where uni is not null;

drop trigger if exists trg_instructors_updated_at on instructors;
create trigger trg_instructors_updated_at before update on instructors
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- courses
-- -----------------------------------------------------------------------------
-- DEVIATION 1: the sketch's `number` column is named course_number here.
-- `number` is a non-reserved keyword; quoting it forever in every query and
-- every PostgREST select string is a papercut with no upside.
-- DEVIATION 2: the sketch's `prerequisite_formula` / `corequisite_formula`
-- promised structured parse output we do not have. The directory prints prose.
-- Stored as *_text to be honest about what it is; a structured formula column
-- can be added later without a rewrite.

create table if not exists courses (
  -- `${subjectCode}${number}${qualifier}` e.g. "COMS4113W".
  course_id           text primary key,
  subject_code        text    not null references subjects (subject_code)
                        on update cascade on delete restrict,
  course_number       integer not null check (course_number between 0 and 9999),
  qualifier           text    check (qualifier is null or qualifier ~ '^[A-Z]$'),
  title               text    not null,
  description         text,
  points_min          numeric(4, 2) check (points_min >= 0),
  points_max          numeric(4, 2) check (points_max >= 0),
  prerequisite_text   text,
  corequisite_text    text,
  department          text,
  -- Curriculum booleans (Global Core, science, Ways of Knowing, Nine Ways of
  -- Knowing) as JSONB rather than ~60 columns. Shape: RequirementFlags in
  -- lib/types.ts — a flat object of string -> boolean.
  requirement_flags   jsonb   not null default '{}'::jsonb
                        check (jsonb_typeof(requirement_flags) = 'object'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (points_max is null or points_min is null or points_max >= points_min)
);

comment on table courses is
  'Term-independent course records. course_id is subject + number + qualifier.';
comment on column courses.requirement_flags is
  'RequirementFlags JSONB: flat map of requirement key -> true. Only true keys are stored.';

create index if not exists idx_courses_subject_number
  on courses (subject_code, course_number);
create index if not exists idx_courses_number
  on courses (course_number);
-- Answers "which courses satisfy Global Core?" — requirement_flags @> '{"globalCore":true}'
create index if not exists idx_courses_requirement_flags
  on courses using gin (requirement_flags jsonb_path_ops);

drop trigger if exists trg_courses_updated_at on courses;
create trigger trg_courses_updated_at before update on courses
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- sections
-- -----------------------------------------------------------------------------
-- DEVIATION 1: `subject_code` is denormalized onto sections and kept correct by
-- a trigger. Subject + term is the single hottest access pattern in the product
-- (it is the search filter, AND it is the crawl unit of work — one directory
-- page per subject-term). Making it a two-column index on one table instead of
-- a join is worth the trigger.
-- DEVIATION 2: `source_as_of` is split in two. The directory prints a
-- human-formatted stamp ("August 22, 2026"). source_as_of_raw keeps that string
-- byte-for-byte because the product rule is that the directory's own timestamp
-- is what gets displayed; source_as_of holds the parsed timestamptz for
-- ordering and staleness math. Never display source_as_of when raw exists.
-- DEVIATION 3: `class_identifier` from the sketch is dropped — nothing in the
-- product or the parsed HTML uses it. call_number is the registrar's key and is
-- uniquely indexed per term.

create table if not exists sections (
  -- `${termCode}${courseId}${sectionCode}` e.g. "20263COMS4113W001".
  section_id            text primary key,
  course_id             text not null references courses (course_id)
                          on update cascade on delete cascade,
  term_code             text not null references terms (term_code)
                          on update cascade on delete restrict,
  -- Denormalized from courses.subject_code by trg_sections_fill_subject.
  subject_code          text not null references subjects (subject_code)
                          on update cascade on delete restrict,
  -- The registrar call number a student actually registers with.
  call_number           text not null check (btrim(call_number) <> ''),
  section_code          text not null,
  component             text,
  method_of_instruction text,
  grading_mode          text,
  min_unit              numeric(4, 2) check (min_unit >= 0),
  max_unit              numeric(4, 2) check (max_unit >= 0),
  enrollment_count      integer check (enrollment_count >= 0),
  enrollment_cap        integer check (enrollment_cap >= 0),
  waitlist_count        integer check (waitlist_count >= 0),
  waitlist_cap          integer check (waitlist_cap >= 0),
  status                enrollment_status not null default 'unknown',
  -- Provenance. Always travels with the seat numbers, always displayed.
  source_as_of          timestamptz,
  source_as_of_raw      text,
  -- When our pipeline last successfully read this section.
  last_seen_at          timestamptz,
  detail_url            text,
  note                  text,
  open_to               text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (max_unit is null or min_unit is null or max_unit >= min_unit)
);

comment on table sections is
  'One offering of a course in one term. Seat columns hold the latest reading; history lives in enrollment_snapshots.';
comment on column sections.source_as_of_raw is
  'The directory''s "as of" stamp verbatim. This is what the UI renders (product rule: provenance always shown).';

-- A call number identifies exactly one section within a term.
create unique index if not exists idx_sections_term_call_number
  on sections (term_code, call_number);
-- The product's hottest read: everything a subject offers this term.
create index if not exists idx_sections_subject_term
  on sections (subject_code, term_code);
create index if not exists idx_sections_term_course
  on sections (term_code, course_id);
create index if not exists idx_sections_course
  on sections (course_id);
-- Bare call-number lookup (deep link, MCP tool, "paste your call number").
create index if not exists idx_sections_call_number
  on sections (call_number);
-- openSeatsOnly filter.
create index if not exists idx_sections_term_status
  on sections (term_code, status);
-- Staleness sweeps and "what has the pipeline not seen lately".
create index if not exists idx_sections_last_seen
  on sections (last_seen_at nulls first);

drop trigger if exists trg_sections_updated_at on sections;
create trigger trg_sections_updated_at before update on sections
  for each row execute function set_updated_at();

-- Keep the denormalized subject_code correct, in both directions.
create or replace function sections_fill_subject_code()
returns trigger
language plpgsql
as $$
begin
  select c.subject_code into new.subject_code
    from courses c where c.course_id = new.course_id;
  if new.subject_code is null then
    raise exception 'sections.course_id % has no course row', new.course_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sections_fill_subject on sections;
create trigger trg_sections_fill_subject
  before insert or update of course_id on sections
  for each row execute function sections_fill_subject_code();

create or replace function courses_cascade_subject_code()
returns trigger
language plpgsql
as $$
begin
  update sections set subject_code = new.subject_code
   where course_id = new.course_id and subject_code is distinct from new.subject_code;
  return null;
end;
$$;

drop trigger if exists trg_courses_cascade_subject on courses;
create trigger trg_courses_cascade_subject
  after update of subject_code on courses
  for each row execute function courses_cascade_subject_code();

-- -----------------------------------------------------------------------------
-- meetings
-- -----------------------------------------------------------------------------
-- Times are minutes from midnight (see header). building_id is a resolved FK
-- for geography; building_name keeps the raw printed string, because a room in
-- a building we have no record of must still render.

create table if not exists meetings (
  meeting_id     uuid primary key default gen_random_uuid(),
  section_id     text not null references sections (section_id)
                   on update cascade on delete cascade,
  weekday        weekday_code not null,
  start_minute   integer not null check (start_minute between 0 and 1440),
  end_minute     integer not null check (end_minute between 0 and 1440),
  building_id    text references buildings (building_id)
                   on update cascade on delete set null,
  building_name  text,
  room           text,
  created_at     timestamptz not null default now(),
  check (end_minute >= start_minute)
);

comment on table meetings is
  'One weekly meeting block. start_minute/end_minute are minutes from midnight, local (13:10 -> 790).';

-- Re-ingesting a section must not duplicate its meetings. NULL room would
-- defeat a plain unique constraint, hence coalesce.
create unique index if not exists idx_meetings_natural_key
  on meetings (section_id, weekday, start_minute, end_minute, coalesce(room, ''));
create index if not exists idx_meetings_section on meetings (section_id);
-- Day/time filters ("Tuesdays after 2pm").
create index if not exists idx_meetings_day_time on meetings (weekday, start_minute, end_minute);
create index if not exists idx_meetings_building on meetings (building_id) where building_id is not null;

-- -----------------------------------------------------------------------------
-- section_instructors
-- -----------------------------------------------------------------------------
-- DEVIATION: `position` added. `Section.instructors` is an ordered array and
-- the directory prints the instructor of record first. A plain join table would
-- lose that ordering.

create table if not exists section_instructors (
  section_id     text not null references sections (section_id)
                   on update cascade on delete cascade,
  instructor_id  uuid not null references instructors (instructor_id)
                   on update cascade on delete cascade,
  position       integer not null default 0 check (position >= 0),
  primary key (section_id, instructor_id)
);

comment on column section_instructors.position is
  'Zero-based print order. Preserves the ordering of Section.instructors.';

create index if not exists idx_section_instructors_instructor
  on section_instructors (instructor_id);
create index if not exists idx_section_instructors_section_position
  on section_instructors (section_id, position);

-- -----------------------------------------------------------------------------
-- Row level security — catalog is world-readable, writes are service-role only
-- -----------------------------------------------------------------------------
-- Reads are free and require no account (spec §15). Writes have no policy at
-- all, which under RLS means "denied" for anon and authenticated; the ingest
-- runs with the service role, which bypasses RLS.

alter table terms               enable row level security;
alter table subjects            enable row level security;
alter table buildings           enable row level security;
alter table instructors         enable row level security;
alter table courses             enable row level security;
alter table sections            enable row level security;
alter table meetings            enable row level security;
alter table section_instructors enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'terms', 'subjects', 'buildings', 'instructors',
    'courses', 'sections', 'meetings', 'section_instructors'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_world_readable', t);
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_world_readable', t);
  end loop;
end $$;
