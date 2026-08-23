-- =============================================================================
-- 0006_functions.sql — helper functions the product reads through
--
-- Spec reference: §14 "Alerts", §13 "Seat History".
--
-- Two jobs:
--   1. watcher_count — the number the watchlist UI states plainly and upfront.
--      Watches are private, watcher counts are public; that gap is exactly what
--      a SECURITY DEFINER function is for.
--   2. The open-transition sweep that drives alerts. Because seat history is
--      change-only, a transition is precisely a pair of adjacent snapshot rows,
--      which makes this a window function rather than a polling diff.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Seat-state predicate
-- -----------------------------------------------------------------------------
-- One definition of "has an open seat", used by both the alert sweep and any
-- caller that needs to agree with it. Trusting `status` alone is not enough:
-- the directory sometimes prints a stale label alongside fresh counts.

create or replace function has_open_seat(
  p_status enrollment_status,
  p_count  integer,
  p_cap    integer
) returns boolean
language sql
immutable
as $$
  select case
    when p_status in ('closed', 'full') then false
    when p_status = 'open' then true
    when p_cap is not null and p_count is not null then p_count < p_cap
    else false
  end;
$$;

comment on function has_open_seat is
  'The single definition of "a seat is available". Counts override an optimistic status label; an explicit closed/full label always wins.';

-- -----------------------------------------------------------------------------
-- watcher_count
-- -----------------------------------------------------------------------------
-- Shown upfront when a student adds a section to their watchlist (spec §14
-- fairness: everyone is notified at once and everyone can see the crowd).
-- SECURITY DEFINER because `watches` is owner-private under RLS — this exposes
-- the aggregate and nothing else. No user_id ever leaves the function.

create or replace function watcher_count(section_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*), 0)::integer
    from watches w
   where w.section_id = watcher_count.section_id;
$$;

comment on function watcher_count is
  'How many users watch a section. Public aggregate over a private table; never exposes who.';

revoke all on function watcher_count(text) from public;
grant execute on function watcher_count(text) to anon, authenticated, service_role;

-- Batched twin, so rendering fifty search results is one round trip. Sections
-- with no watchers are returned as 0 rather than omitted, so the caller does
-- not have to defensively coalesce.
create or replace function watcher_counts(section_ids text[])
returns table (section_id text, watcher_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.id as section_id,
         coalesce((select count(*) from watches w where w.section_id = s.id), 0)::integer
    from unnest(coalesce(section_ids, array[]::text[])) as s(id);
$$;

revoke all on function watcher_counts(text[]) from public;
grant execute on function watcher_counts(text[]) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- sections_opened_since — the alert trigger
-- -----------------------------------------------------------------------------
-- Returns every section whose seat state transitioned from "no open seat" to
-- "open seat" at or after p_since. Change-only history means consecutive rows
-- ARE consecutive distinct readings, so LAG over (section_id ORDER BY
-- observed_at) gives the true previous state with no gap-filling.
--
-- A section's very first snapshot is not a transition — there is nothing it
-- transitioned from, and treating it as one would alert every watcher the
-- first time we ever saw an open section.

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
  with candidates as (
    -- Only sections that recorded a change in the window can contain a
    -- transition in the window, which keeps the window scan narrow.
    select distinct s.section_id
      from enrollment_snapshots s
     where s.observed_at >= p_since
       and (p_section_ids is null or s.section_id = any (p_section_ids))
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
      from enrollment_snapshots sn
      join candidates c on c.section_id = sn.section_id
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
  'Sections whose seat state transitioned to open at or after p_since. Drives alerts. A first-ever snapshot is not a transition.';

revoke all on function sections_opened_since(timestamptz, text[]) from public;
grant execute on function sections_opened_since(timestamptz, text[]) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- pending_seat_alerts — who to email, right now
-- -----------------------------------------------------------------------------
-- Joins the transitions above to watchers, minus anyone already notified for
-- that exact transition. Everyone eligible comes back in one set: notification
-- is instant and simultaneous for all watchers, never staggered (spec §14 —
-- deciding who gets a head start into a class is not this product's role).
--
-- Service role only. It returns email addresses.

create or replace function pending_seat_alerts(
  p_since timestamptz default (now() - interval '1 hour')
) returns table (
  user_id          uuid,
  email            text,
  section_id       text,
  transition_at    timestamptz,
  enrollment_count integer,
  enrollment_cap   integer,
  seats_open       integer,
  watcher_count    integer
)
language sql
volatile
security definer
set search_path = public
as $$
  with opened as (
    select * from sections_opened_since(p_since, null)
  ),
  -- One section can open more than once in a window; only the latest
  -- transition is worth an email.
  latest as (
    select distinct on (o.section_id) o.*
      from opened o
     order by o.section_id, o.transition_at desc
  )
  select w.user_id,
         u.email,
         l.section_id,
         l.transition_at,
         l.enrollment_count,
         l.enrollment_cap,
         l.seats_open,
         (select count(*)::integer from watches w2 where w2.section_id = l.section_id)
    from latest l
    join watches w on w.section_id = l.section_id
    join users   u on u.user_id = w.user_id
   where w.notify_email
     and not exists (
       select 1 from alerts_sent a
        where a.user_id = w.user_id
          and a.section_id = l.section_id
          and a.transition_at = l.transition_at
     );
$$;

comment on function pending_seat_alerts is
  'Watchers owed a seat-opened email, deduped against alerts_sent. Service role only — returns email addresses.';

revoke all on function pending_seat_alerts(timestamptz) from public;
grant execute on function pending_seat_alerts(timestamptz) to service_role;

-- Recording a send is a separate call so an email that fails to deliver is not
-- marked as sent. Returns the number of rows actually recorded.
create or replace function record_alerts_sent(
  p_user_ids       uuid[],
  p_section_id     text,
  p_transition_at  timestamptz,
  p_reason         text default 'seat_opened',
  p_channel        text default 'email'
) returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into alerts_sent (user_id, section_id, transition_at, reason, channel)
  select uid, p_section_id, p_transition_at, p_reason, p_channel
    from unnest(coalesce(p_user_ids, array[]::uuid[])) as uid
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function record_alerts_sent(uuid[], text, timestamptz, text, text) from public;
grant execute on function record_alerts_sent(uuid[], text, timestamptz, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Watchlist read helper
-- -----------------------------------------------------------------------------
-- Everything WatchWithState needs that cannot be selected under RLS: the public
-- watcher count, and the delta against the baseline stamped at watch time.
-- Scoped to the calling user; there is no user_id parameter to abuse.

create or replace function my_watch_states()
returns table (
  section_id                text,
  created_at                timestamptz,
  watcher_count             integer,
  enrollment_count_at_watch integer,
  enrollment_count          integer,
  delta_since_watched       integer
)
language sql
stable
security definer
set search_path = public
as $$
  select w.section_id,
         w.created_at,
         (select count(*)::integer from watches w2 where w2.section_id = w.section_id),
         w.enrollment_count_at_watch,
         s.enrollment_count,
         case
           when w.enrollment_count_at_watch is null or s.enrollment_count is null then null
           else s.enrollment_count - w.enrollment_count_at_watch
         end
    from watches w
    join sections s on s.section_id = w.section_id
   where w.user_id = (select auth.uid())
   order by w.created_at desc;
$$;

comment on function my_watch_states is
  'The calling user''s watchlist with public watcher counts and enrollment delta since watching.';

revoke all on function my_watch_states() from public;
grant execute on function my_watch_states() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
-- Seat changes push to open tabs without polling our own API (spec §15). Only
-- the two world-readable tables are published; nothing user-scoped is.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table sections;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table enrollment_snapshots;
    exception when duplicate_object then null; end;
  end if;
end $$;
