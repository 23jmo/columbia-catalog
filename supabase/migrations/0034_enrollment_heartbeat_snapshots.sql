-- =============================================================================
-- 0034_enrollment_heartbeat_snapshots.sql
--
-- Every successful seat look is a row, even when the count did not move.
--
-- 0002 stored change-only history: a BEFORE INSERT trigger dropped any reading
-- identical to the previous one, and the sections capture trigger skipped the
-- insert when enrollment columns were unchanged. That collapsed storage, but
-- it also erased the evidence that we looked. A flat stretch on the chart
-- could not be told apart from "the crawler stopped", and same-day polls on
-- subject pages collided on the date-only directory stamp so even a real
-- change later the same day could miss the table.
--
-- New rule: enrollment_snapshots is still append-only (no UPDATE), but it is
-- no longer change-only. Each ingest that writes seat columns records a
-- snapshot stamped with our look time (`last_seen_at`), not Columbia's "as of".
-- The live chip still displays the directory stamp from `sections.source_as_of`.
-- =============================================================================

-- Drop the trigger that silently ate identical readings.
drop trigger if exists trg_snapshots_change_only on enrollment_snapshots;
drop function if exists enforce_change_only_snapshot();

comment on table enrollment_snapshots is
  'Append-only seat history. One row per look, including unchanged counts. Retention: forever.';
comment on column enrollment_snapshots.observed_at is
  'When we looked, from sections.last_seen_at. Not the directory as-of stamp — subject pages print a date with no clock, and using that as the PK would drop later looks the same day.';

-- Updates would still rewrite history. History stays append-only.
create or replace function reject_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'enrollment_snapshots is append-only; % rejected', tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- -----------------------------------------------------------------------------
-- Capture every look
-- -----------------------------------------------------------------------------
-- Fires when ingest writes the seat columns (subject page, section detail).
-- Bulletin updates last_seen_at without touching seats and must not invent a
-- reading we did not take.
--
-- The previous body returned early when counts were unchanged. That was the
-- second half of change-only. Removing it is what makes a heartbeat a row.

create or replace function sections_capture_enrollment_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.enrollment_count is null then
    -- A look with no count is not a reading. Never fabricate a zero.
    return null;
  end if;

  insert into enrollment_snapshots (
    section_id, observed_at, enrollment_count, enrollment_cap, waitlist_count, status
  ) values (
    new.section_id,
    -- Our fetch time. source_as_of stays on `sections` for provenance display.
    coalesce(new.last_seen_at, now()),
    new.enrollment_count, new.enrollment_cap, new.waitlist_count, new.status
  )
  -- Two writers finishing in the same timestamptz is normal, not an error.
  on conflict (section_id, observed_at) do nothing;

  return null;
end;
$$;

comment on function sections_capture_enrollment_snapshot() is
  'AFTER INSERT/UPDATE of seat columns on sections: appends one snapshot per look, stamped with last_seen_at.';

-- Trigger definition is unchanged (still only seat columns). Recreate so a
-- database that only has this file still matches 0002's attachment.
drop trigger if exists trg_sections_capture_snapshot on sections;
create trigger trg_sections_capture_snapshot
  after insert or update of enrollment_count, enrollment_cap, waitlist_count, status
  on sections
  for each row execute function sections_capture_enrollment_snapshot();

comment on function record_enrollment_reading is
  'Records one seat reading. Returns true when a row was written. Identical counts still write; only a missing count or a duplicate (section_id, observed_at) does not.';

-- -----------------------------------------------------------------------------
-- Alerts: LAG is still the transition detector, but candidates are no longer
-- "sections that changed". Every crawled section now has rows in the window.
-- Scan only the window plus one prior row per section, not the full history.
-- -----------------------------------------------------------------------------

create or replace function sections_opened_since(
  p_since       timestamptz default (now() - interval '1 hour'),
  p_section_ids text[] default null
) returns table (
  section_id       text,
  transition_at    timestamptz,
  enrollment_count integer,
  enrollment_cap   integer,
  waitlist_count   integer,
  status           enrollment_status,
  previous_status  enrollment_status,
  seats_open       integer
)
language sql
stable
security definer
set search_path = public
as $$
  with windowed as (
    select s.*
      from enrollment_snapshots s
     where s.observed_at >= p_since
       and (p_section_ids is null or s.section_id = any (p_section_ids))
  ),
  -- One row before the window so LAG has a left edge. Without this, a section
  -- that was already open and is only heartbeating would look like a first
  -- snapshot (prev null) rather than "still open".
  prior as (
    select distinct on (s.section_id) s.*
      from enrollment_snapshots s
      join (select distinct section_id from windowed) w on w.section_id = s.section_id
     where s.observed_at < p_since
     order by s.section_id, s.observed_at desc
  ),
  series as (
    select sn.section_id,
           sn.observed_at,
           sn.enrollment_count,
           sn.enrollment_cap,
           sn.waitlist_count,
           sn.status,
           lag(sn.status)           over w as prev_status,
           lag(sn.enrollment_count) over w as prev_count,
           lag(sn.enrollment_cap)   over w as prev_cap
      from (
        select * from windowed
        union all
        select * from prior
      ) sn
    window w as (partition by sn.section_id order by sn.observed_at)
  )
  select s.section_id,
         s.observed_at,
         s.enrollment_count,
         s.enrollment_cap,
         s.waitlist_count,
         s.status,
         s.prev_status,
         greatest(coalesce(s.enrollment_cap, 0) - coalesce(s.enrollment_count, 0), 0)::integer
    from series s
   where s.observed_at >= p_since
     and s.prev_status is not null
     and has_open_seat(s.status, s.enrollment_count, s.enrollment_cap)
     and not has_open_seat(s.prev_status, s.prev_count, s.prev_cap)
   order by s.observed_at desc;
$$;

comment on function sections_opened_since is
  'Sections whose seat state transitioned to open at or after p_since. Heartbeat rows are ignored; only a closed→open change alerts. A first-ever snapshot is not a transition.';
