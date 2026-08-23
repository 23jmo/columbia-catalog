-- =============================================================================
-- 0002_history.sql — seat history with CHANGE-ONLY write semantics
--
-- Spec reference: §11 "Data Model / History", §13 "Seat History & Waitlist Odds".
--
-- The rule: a row exists in enrollment_snapshots ONLY when a reading differs
-- from the previous reading for that section. Most of the catalog is static
-- most of the time, so change-only writes collapse storage enormously while
-- keeping perfect fidelity exactly during registration, when things move.
-- Charts interpolate flat between points. Retention is forever.
--
-- The rule is enforced in the database, not in application code, because there
-- are three independent writers (browser workers, cron, the backfill runner)
-- and any one of them forgetting would silently corrupt the series.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- enrollment_snapshots
-- -----------------------------------------------------------------------------

create table if not exists enrollment_snapshots (
  section_id        text        not null references sections (section_id)
                      on update cascade on delete cascade,
  -- The directory's own "as of" stamp when we have it, else our read time.
  -- This is an observation timestamp, not a write timestamp.
  observed_at       timestamptz not null,
  enrollment_count  integer     not null check (enrollment_count >= 0),
  -- Nullable: the directory sometimes prints a count with no cap.
  enrollment_cap    integer     check (enrollment_cap >= 0),
  waitlist_count    integer     check (waitlist_count >= 0),
  status            enrollment_status not null,
  primary key (section_id, observed_at)
);

comment on table enrollment_snapshots is
  'Change-only seat history. A row exists only where a reading differed from the previous one for that section. Retention: forever.';
comment on column enrollment_snapshots.observed_at is
  'Observation time, preferring the directory''s own "as of" stamp over our read time.';

-- The PK (section_id, observed_at) already serves forward range scans. This
-- descending twin is what makes "latest reading for this section" and
-- "last N points" index-only lookups, which is the shape every chart read and
-- every change-detection read actually uses.
create index if not exists idx_snapshots_section_recent
  on enrollment_snapshots (section_id, observed_at desc);

-- Cross-section time-window scans: "everything that moved in the last hour",
-- which is what the alert sweep in 0006 runs.
create index if not exists idx_snapshots_observed_at
  on enrollment_snapshots (observed_at desc);

-- -----------------------------------------------------------------------------
-- Change-only enforcement
-- -----------------------------------------------------------------------------
-- A BEFORE INSERT trigger that returns NULL silently drops the row. That is
-- exactly the semantics wanted here: writers can fire a reading at every poll
-- without caring whether it is new, and the table only grows on change.
--
-- "Previous" means the most recent row at or before the incoming observed_at,
-- so out-of-order arrivals (a browser posting a stale page after cron posted a
-- fresh one) still compare against the right neighbour rather than the newest.

create or replace function enforce_change_only_snapshot()
returns trigger
language plpgsql
as $$
declare
  prev enrollment_snapshots%rowtype;
begin
  select * into prev
    from enrollment_snapshots s
   where s.section_id = new.section_id
     and s.observed_at <= new.observed_at
   order by s.observed_at desc
   limit 1;

  if found
     and prev.enrollment_count is not distinct from new.enrollment_count
     and prev.enrollment_cap   is not distinct from new.enrollment_cap
     and prev.waitlist_count   is not distinct from new.waitlist_count
     and prev.status           is not distinct from new.status
  then
    -- Identical to the previous reading: not a change, not a row.
    return null;
  end if;

  return new;
end;
$$;

comment on function enforce_change_only_snapshot() is
  'BEFORE INSERT on enrollment_snapshots: drops readings identical to the previous one for that section. This is the change-only guarantee.';

drop trigger if exists trg_snapshots_change_only on enrollment_snapshots;
create trigger trg_snapshots_change_only
  before insert on enrollment_snapshots
  for each row execute function enforce_change_only_snapshot();

-- Updates would rewrite history. History is append-only.
create or replace function reject_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'enrollment_snapshots is append-only (change-only writes); % rejected', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists trg_snapshots_immutable on enrollment_snapshots;
create trigger trg_snapshots_immutable
  before update on enrollment_snapshots
  for each row execute function reject_snapshot_mutation();

-- -----------------------------------------------------------------------------
-- The documented insert function
-- -----------------------------------------------------------------------------
-- Callers should use this rather than a raw INSERT. It returns TRUE when the
-- reading was a change (a row was written) and FALSE when it was a repeat,
-- which is exactly the signal an ingest run needs for records_written.

create or replace function record_enrollment_reading(
  p_section_id       text,
  p_enrollment_count integer,
  p_enrollment_cap   integer   default null,
  p_waitlist_count   integer   default null,
  p_status           enrollment_status default 'unknown',
  p_observed_at      timestamptz default now()
) returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_written integer;
begin
  if p_enrollment_count is null then
    -- A reading with no count is not a reading. Never fabricate a zero.
    return false;
  end if;

  insert into enrollment_snapshots (
    section_id, observed_at, enrollment_count, enrollment_cap, waitlist_count, status
  ) values (
    p_section_id, p_observed_at, p_enrollment_count, p_enrollment_cap, p_waitlist_count, p_status
  )
  -- Two writers observing the same directory stamp is normal, not an error.
  on conflict (section_id, observed_at) do nothing;

  get diagnostics v_written = row_count;
  return v_written > 0;
end;
$$;

comment on function record_enrollment_reading is
  'Records one seat reading. Returns true only if it differed from the previous reading (change-only). The canonical write path for seat history.';

revoke all on function record_enrollment_reading(text, integer, integer, integer, enrollment_status, timestamptz) from public;
grant execute on function record_enrollment_reading(text, integer, integer, integer, enrollment_status, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- Automatic capture from sections
-- -----------------------------------------------------------------------------
-- The ingest updates `sections` with the latest reading. Rather than asking
-- every writer to remember a second call, an AFTER trigger mirrors the seat
-- columns into history. The change-only trigger above then decides whether it
-- is actually a row. Net effect: history is correct by construction.

create or replace function sections_capture_enrollment_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.enrollment_count is null then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and old.enrollment_count is not distinct from new.enrollment_count
     and old.enrollment_cap   is not distinct from new.enrollment_cap
     and old.waitlist_count   is not distinct from new.waitlist_count
     and old.status           is not distinct from new.status
  then
    -- Cheap early-out; the trigger on the history table is the real guarantee.
    return null;
  end if;

  insert into enrollment_snapshots (
    section_id, observed_at, enrollment_count, enrollment_cap, waitlist_count, status
  ) values (
    new.section_id,
    coalesce(new.source_as_of, new.last_seen_at, now()),
    new.enrollment_count, new.enrollment_cap, new.waitlist_count, new.status
  )
  on conflict (section_id, observed_at) do nothing;

  return null;
end;
$$;

comment on function sections_capture_enrollment_snapshot() is
  'AFTER INSERT/UPDATE on sections: mirrors the seat reading into enrollment_snapshots, stamped with the directory''s own as-of time where available.';

drop trigger if exists trg_sections_capture_snapshot on sections;
create trigger trg_sections_capture_snapshot
  after insert or update of enrollment_count, enrollment_cap, waitlist_count, status
  on sections
  for each row execute function sections_capture_enrollment_snapshot();

-- -----------------------------------------------------------------------------
-- registration_milestones
-- -----------------------------------------------------------------------------
-- The annotations that make the seat-history line mean anything: registration
-- open, each school/class-year appointment window, add/drop deadline, term
-- start. Ingested from Columbia's published academic calendar (spec §10) and
-- also used to escalate the crawl tier during a registration window.

do $$ begin
  create type registration_milestone_kind as enum
    ('registration_open', 'appointment_window', 'add_drop_deadline', 'term_start');
exception when duplicate_object then null; end $$;

create table if not exists registration_milestones (
  milestone_id  uuid primary key default gen_random_uuid(),
  term_code     text not null references terms (term_code)
                  on update cascade on delete cascade,
  kind          registration_milestone_kind not null,
  label         text        not null,
  occurs_at     timestamptz not null,
  -- Appointments stagger by school and class year, so a window needs an end and
  -- an audience. Both null for point-in-time milestones.
  ends_at       timestamptz,
  audience      text,
  source_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at is null or ends_at >= occurs_at)
);

comment on table registration_milestones is
  'Academic-calendar events annotating the seat-history chart and driving registration-window crawl escalation.';

create unique index if not exists idx_milestones_natural_key
  on registration_milestones (term_code, kind, label);
create index if not exists idx_milestones_term_time
  on registration_milestones (term_code, occurs_at);
-- "Is a registration window open right now?" — the crawl tier escalation read.
create index if not exists idx_milestones_window
  on registration_milestones (occurs_at, ends_at) where ends_at is not null;

drop trigger if exists trg_milestones_updated_at on registration_milestones;
create trigger trg_milestones_updated_at before update on registration_milestones
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Time-series read helper
-- -----------------------------------------------------------------------------

create or replace function seat_history(
  p_section_id text,
  p_from       timestamptz default null,
  p_to         timestamptz default null
) returns setof enrollment_snapshots
language sql
stable
as $$
  -- The point immediately before the window is included so a chart starting
  -- mid-series still knows where the flat line came in from.
  (
    select *
      from enrollment_snapshots
     where section_id = p_section_id
       and p_from is not null
       and observed_at < p_from
     order by observed_at desc
     limit 1
  )
  union all
  (
    select *
      from enrollment_snapshots
     where section_id = p_section_id
       and (p_from is null or observed_at >= p_from)
       and (p_to   is null or observed_at <= p_to)
     order by observed_at asc
  );
$$;

comment on function seat_history is
  'Seat history for one section, including the last point before the window so flat interpolation has a left edge.';

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
-- Seat history and the academic calendar are free reads (spec §15).

alter table enrollment_snapshots    enable row level security;
alter table registration_milestones enable row level security;

drop policy if exists enrollment_snapshots_world_readable on enrollment_snapshots;
create policy enrollment_snapshots_world_readable on enrollment_snapshots
  for select to anon, authenticated using (true);

drop policy if exists registration_milestones_world_readable on registration_milestones;
create policy registration_milestones_world_readable on registration_milestones
  for select to anon, authenticated using (true);
