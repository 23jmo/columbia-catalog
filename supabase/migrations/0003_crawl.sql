-- =============================================================================
-- 0003_crawl.sql — the crawl queue
--
-- Spec reference: §10 "Ingest Architecture".
--
-- crawl_jobs is the single source of truth for pacing. `next_fetch_at` IS the
-- recency cache: a job is due only when now() > next_fetch_at, so nothing fresh
-- is ever re-polled. Three consumers claim from the same queue with
-- SELECT ... FOR UPDATE SKIP LOCKED:
--
--   * Visitor browsers  — PRIMARY. Take anything due.
--   * Vercel cron       — SAFETY NET. Takes only jobs overdue past a grace
--                         window, which is what min_overdue_seconds expresses.
--   * Backfill runner   — ONE-SHOT. Cold catalog and archived terms.
--
-- More users therefore means both fresher data and less server-side crawling.
-- =============================================================================

do $$ begin
  create type crawl_job_kind as enum
    ('subject_term', 'section_detail', 'bulletin_department', 'subject_index', 'academic_calendar');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crawl_tier as enum ('baseline', 'hot', 'registration');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ingest_status as enum ('running', 'ok', 'failed', 'quarantined');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Tunables, mirrored from lib/constants.ts
-- -----------------------------------------------------------------------------
-- lib/constants.ts is the source of truth for humans; these tables are the copy
-- the database plans against. They are tables rather than constants baked into
-- the functions so cadence can be retuned mid-registration-window without a
-- migration and a redeploy.

create table if not exists crawl_cadence (
  tier              crawl_tier primary key,
  interval_seconds  integer not null check (interval_seconds > 0),
  -- Fraction of the interval applied as +/- jitter on every next_fetch_at write,
  -- so jobs never re-cluster into synchronized waves. CADENCE_JITTER.
  jitter            numeric(4, 3) not null default 0.250
                      check (jitter >= 0 and jitter < 1),
  updated_at        timestamptz not null default now()
);

insert into crawl_cadence (tier, interval_seconds, jitter) values
  ('baseline',     3600, 0.250),   -- CADENCE_SECONDS.baseline     = 60 * 60
  ('hot',           120, 0.250),   -- CADENCE_SECONDS.hot          = 2 * 60
  ('registration',   30, 0.250)    -- CADENCE_SECONDS.registration = 30
on conflict (tier) do update
  set interval_seconds = excluded.interval_seconds,
      jitter           = excluded.jitter,
      updated_at       = now();

create table if not exists crawl_config (
  key         text primary key,
  value_int   integer not null,
  note        text,
  updated_at  timestamptz not null default now()
);

insert into crawl_config (key, value_int, note) values
  ('lease_seconds',               90,    'LEASE_SECONDS — how long a worker holds a job before it returns to the pool'),
  ('max_lease_batch',              3,    'MAX_LEASE_BATCH — ceiling on jobs handed to one browser worker per request'),
  ('cron_grace_seconds',         600,    'CRON_GRACE_SECONDS — cron claims only jobs overdue past this'),
  ('failure_backoff_cap_seconds', 86400, 'Upper bound on exponential failure backoff'),
  ('failure_backoff_max_shift',    6,    'Backoff doubles at most this many times')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- crawl_jobs
-- -----------------------------------------------------------------------------
-- DEVIATION from the §11 sketch: `url` and `lease_token` are stored.
--   url         — the sketch derives it from (kind, target_key, term_code).
--                 CrawlJob in lib/types.ts carries it explicitly, and a browser
--                 worker must be handed a literal URL, never a template it
--                 fills in itself.
--   lease_token — CrawlSubmission carries a leaseToken. Without a stored token
--                 an anonymous browser could complete a job it never held.

create table if not exists crawl_jobs (
  job_id                uuid primary key default gen_random_uuid(),
  kind                  crawl_job_kind not null,
  -- Subject code, department slug, or other kind-specific key.
  target_key            text not null,
  term_code             text references terms (term_code)
                          on update cascade on delete cascade,
  url                   text not null,
  tier                  crawl_tier  not null default 'baseline',
  -- The recency cache. Due only when now() > next_fetch_at.
  next_fetch_at         timestamptz not null default now(),
  leased_until          timestamptz,
  leased_by             text,
  lease_token           uuid,
  last_ok_at            timestamptz,
  last_failed_at        timestamptz,
  last_error            text,
  consecutive_failures  integer not null default 0 check (consecutive_failures >= 0),
  lease_count           bigint  not null default 0,
  enabled               boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table crawl_jobs is
  'The pacing source of truth. next_fetch_at is the recency cache; claim_jobs() is the only sanctioned way to lease.';

-- One job per (kind, target, term). term_code is NULL for term-independent
-- kinds, so NULLS NOT DISTINCT is required for the constraint to actually bite.
create unique index if not exists idx_crawl_jobs_natural_key
  on crawl_jobs (kind, target_key, coalesce(term_code, ''));

-- The claim query's index: due, unleased, ordered by urgency then staleness.
create index if not exists idx_crawl_jobs_due
  on crawl_jobs (next_fetch_at, tier) where enabled;
create index if not exists idx_crawl_jobs_leased
  on crawl_jobs (leased_until) where leased_until is not null;
create index if not exists idx_crawl_jobs_failing
  on crawl_jobs (consecutive_failures desc) where consecutive_failures > 0;

drop trigger if exists trg_crawl_jobs_updated_at on crawl_jobs;
create trigger trg_crawl_jobs_updated_at before update on crawl_jobs
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- ingest_runs
-- -----------------------------------------------------------------------------
-- Every parse attempt, whether it committed or was quarantined. Quarantine is
-- the production half of parse safety (spec §10): a run producing fewer or
-- emptier records than the previous run for the same key is recorded here and
-- never committed.

create table if not exists ingest_runs (
  run_id           uuid primary key default gen_random_uuid(),
  job_id           uuid references crawl_jobs (job_id) on delete set null,
  -- Denormalized so a run survives its job being deleted or retargeted.
  kind             crawl_job_kind,
  target_key       text,
  term_code        text,
  worker_id        text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           ingest_status not null default 'running',
  records_written  integer not null default 0 check (records_written >= 0),
  -- Set when this run's output was rejected as worse than the previous run's.
  quarantined      boolean not null default false,
  -- Comparison evidence for the quarantine decision.
  records_seen     integer check (records_seen >= 0),
  previous_records integer check (previous_records >= 0),
  notes            text,
  check (finished_at is null or finished_at >= started_at)
);

comment on table ingest_runs is
  'One row per parse attempt. quarantined runs are recorded and never committed (spec §10 parse safety).';

create index if not exists idx_ingest_runs_job         on ingest_runs (job_id, started_at desc);
create index if not exists idx_ingest_runs_started     on ingest_runs (started_at desc);
create index if not exists idx_ingest_runs_quarantined on ingest_runs (started_at desc) where quarantined;
create index if not exists idx_ingest_runs_target      on ingest_runs (kind, target_key, term_code, started_at desc);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Urgency ordering. registration > hot > baseline.
create or replace function crawl_tier_rank(p_tier crawl_tier)
returns integer
language sql
immutable
as $$
  select case p_tier
           when 'registration' then 2
           when 'hot'          then 1
           else 0
         end;
$$;

create or replace function crawl_config_int(p_key text, p_fallback integer)
returns integer
language sql
stable
as $$
  select coalesce((select value_int from crawl_config where key = p_key), p_fallback);
$$;

-- The role PostgREST is executing as, readable from inside a SECURITY DEFINER
-- function (where current_user is the function owner, not the caller).
create or replace function request_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    'anon'
  );
$$;

-- Jittered next-fetch time for a tier. Every write goes through here so no
-- caller can accidentally schedule an unjittered wave.
create or replace function next_fetch_with_jitter(
  p_tier crawl_tier,
  p_multiplier numeric default 1.0
) returns timestamptz
language plpgsql
volatile
as $$
declare
  v_interval numeric;
  v_jitter   numeric;
  v_seconds  numeric;
  v_cap      numeric := crawl_config_int('failure_backoff_cap_seconds', 86400);
begin
  select interval_seconds, jitter into v_interval, v_jitter
    from crawl_cadence where tier = p_tier;

  -- Cadence rows are seeded above; this only fires if someone deletes one.
  v_interval := coalesce(v_interval, 3600);
  v_jitter   := coalesce(v_jitter, 0.25);

  v_seconds := v_interval * greatest(p_multiplier, 1.0);
  -- +/- jitter as a fraction of the interval. CADENCE_JITTER = 0.25 gives a
  -- baseline job a next fetch somewhere in [45 min, 75 min].
  v_seconds := v_seconds * (1 + ((random() * 2) - 1) * v_jitter);
  v_seconds := least(greatest(v_seconds, 5), v_cap);

  return now() + make_interval(secs => v_seconds);
end;
$$;

comment on function next_fetch_with_jitter is
  'now() + tier cadence, jittered by CADENCE_JITTER. p_multiplier carries failure backoff.';

-- -----------------------------------------------------------------------------
-- claim_jobs — the atomic lease
-- -----------------------------------------------------------------------------
-- SELECT ... FOR UPDATE SKIP LOCKED means N browsers and cron can claim
-- concurrently without blocking each other and without ever handing the same
-- job to two workers.
--
-- Parameters:
--   worker_id           opaque client identifier, recorded in leased_by
--   batch_size          how many jobs to lease; clamped to max_lease_batch
--   max_tier            urgency ceiling. A worker asking for 'baseline' will
--                       never be handed a 30-second registration job. Default
--                       'registration' means "anything".
--   min_overdue_seconds only claim jobs overdue by at least this much. This is
--                       the whole "browsers primary, cron safety net" mechanism:
--                       browsers pass 0 and take anything due; cron passes
--                       CRON_GRACE_SECONDS (600) and so only picks up work the
--                       browsers did not get to. Near-idle at 2pm with 200 users
--                       online; carries the whole load at 4am.

create or replace function claim_jobs(
  worker_id           text,
  batch_size          integer default 3,
  max_tier            text    default 'registration',
  min_overdue_seconds integer default 0
) returns setof crawl_jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_batch    integer;
  v_max_rank integer;
  v_lease    integer := crawl_config_int('lease_seconds', 90);
  v_cutoff   timestamptz;
begin
  if worker_id is null or btrim(worker_id) = '' then
    raise exception 'claim_jobs requires a worker_id' using errcode = 'invalid_parameter_value';
  end if;

  -- Hard ceiling regardless of what the client asks for: no browser ever walks
  -- a dozen directory pages in a row.
  v_batch := least(
    greatest(coalesce(batch_size, 1), 1),
    greatest(crawl_config_int('max_lease_batch', 3), 1)
  );

  -- Service-role callers (the backfill runner) may take larger batches.
  if request_role() = 'service_role' then
    v_batch := least(greatest(coalesce(batch_size, 1), 1), 500);
  end if;

  v_max_rank := crawl_tier_rank(coalesce(nullif(max_tier, ''), 'registration')::crawl_tier);
  v_cutoff   := now() - make_interval(secs => greatest(coalesce(min_overdue_seconds, 0), 0));

  return query
  with due as (
    select j.job_id
      from crawl_jobs j
     where j.enabled
       and j.next_fetch_at <= v_cutoff
       and (j.leased_until is null or j.leased_until < now())
       and crawl_tier_rank(j.tier) <= v_max_rank
     order by crawl_tier_rank(j.tier) desc, j.next_fetch_at asc
     limit v_batch
     for update skip locked
  )
  update crawl_jobs j
     set leased_by    = worker_id,
         leased_until = now() + make_interval(secs => v_lease),
         lease_token  = gen_random_uuid(),
         lease_count  = j.lease_count + 1,
         updated_at   = now()
    from due
   where j.job_id = due.job_id
  returning j.*;
end;
$$;

comment on function claim_jobs is
  'Atomically leases up to batch_size due jobs using FOR UPDATE SKIP LOCKED. min_overdue_seconds is how cron restricts itself to overdue-only work while browsers take anything due.';

revoke all on function claim_jobs(text, integer, text, integer) from public;
grant execute on function claim_jobs(text, integer, text, integer) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- complete_job — release the lease and reschedule
-- -----------------------------------------------------------------------------
-- On success: next_fetch_at moves forward by the tier cadence WITH jitter, the
-- failure counter resets, the lease clears.
-- On failure: exponential backoff (cadence * 2^failures, capped at 24h, also
-- jittered). Jobs are never auto-disabled — a permanently broken URL becomes a
-- once-a-day request, which is cheap, and stays visible in the failing index
-- rather than silently vanishing from the queue.

create or replace function complete_job(
  job_id      uuid,
  ok          boolean,
  lease_token uuid default null,
  error_text  text default null
) returns crawl_jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job    crawl_jobs%rowtype;
  v_shift  integer;
  v_result crawl_jobs%rowtype;
begin
  select * into v_job from crawl_jobs j where j.job_id = complete_job.job_id for update;

  if not found then
    raise exception 'no such crawl job %', complete_job.job_id
      using errcode = 'no_data_found';
  end if;

  -- Untrusted callers must prove they hold the lease. The service role (cron,
  -- backfill) may complete a job it recovered without one.
  if request_role() <> 'service_role' then
    if complete_job.lease_token is null
       or v_job.lease_token is null
       or v_job.lease_token <> complete_job.lease_token then
      raise exception 'invalid or missing lease token for job %', complete_job.job_id
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if coalesce(ok, false) then
    update crawl_jobs j
       set next_fetch_at        = next_fetch_with_jitter(j.tier, 1.0),
           last_ok_at           = now(),
           consecutive_failures = 0,
           last_error           = null,
           leased_until         = null,
           leased_by            = null,
           lease_token          = null
     where j.job_id = complete_job.job_id
    returning j.* into v_result;
  else
    v_shift := least(
      v_job.consecutive_failures,
      greatest(crawl_config_int('failure_backoff_max_shift', 6), 0)
    );

    update crawl_jobs j
       set next_fetch_at        = next_fetch_with_jitter(j.tier, power(2, v_shift)::numeric),
           consecutive_failures = j.consecutive_failures + 1,
           last_failed_at       = now(),
           last_error           = left(coalesce(complete_job.error_text, 'unspecified'), 2000),
           leased_until         = null,
           leased_by            = null,
           lease_token          = null
     where j.job_id = complete_job.job_id
    returning j.* into v_result;
  end if;

  return v_result;
end;
$$;

comment on function complete_job is
  'Releases a lease and reschedules: tier cadence with jitter on success, jittered exponential backoff on failure.';

revoke all on function complete_job(uuid, boolean, uuid, text) from public;
grant execute on function complete_job(uuid, boolean, uuid, text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Lease recovery and queue maintenance
-- -----------------------------------------------------------------------------

-- A browser that closes its tab mid-fetch never calls complete_job. Expired
-- leases must return to the pool; cron calls this before claiming.
create or replace function release_expired_leases()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update crawl_jobs
     set leased_until = null,
         leased_by    = null,
         lease_token  = null
   where leased_until is not null
     and leased_until < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function release_expired_leases() from public;
grant execute on function release_expired_leases() to service_role;

-- Idempotent enqueue, used by the backfill runner and by tier escalation.
create or replace function upsert_crawl_job(
  p_kind       crawl_job_kind,
  p_target_key text,
  p_term_code  text,
  p_url        text,
  p_tier       crawl_tier default 'baseline',
  p_due_now    boolean default false
) returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  insert into crawl_jobs (kind, target_key, term_code, url, tier, next_fetch_at)
  values (p_kind, p_target_key, p_term_code, p_url, p_tier,
          case when p_due_now then now() else next_fetch_with_jitter(p_tier, 1.0) end)
  on conflict (kind, target_key, coalesce(term_code, '')) do update
     set url  = excluded.url,
         tier = excluded.tier,
         next_fetch_at = case
           when p_due_now then now()
           -- Escalating a job's tier must pull its next fetch forward, never push it back.
           when crawl_tier_rank(excluded.tier) > crawl_tier_rank(crawl_jobs.tier)
             then least(crawl_jobs.next_fetch_at, next_fetch_with_jitter(excluded.tier, 1.0))
           else crawl_jobs.next_fetch_at
         end,
         enabled = true
  returning job_id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function upsert_crawl_job(crawl_job_kind, text, text, text, crawl_tier, boolean) from public;
grant execute on function upsert_crawl_job(crawl_job_kind, text, text, text, crawl_tier, boolean) to service_role;

-- How much work is waiting, for the health surface. Safe for anyone to read:
-- it is a count, not a target list.
create or replace function crawl_queue_health()
returns table (
  tier            crawl_tier,
  total           bigint,
  due             bigint,
  overdue_grace   bigint,
  leased          bigint,
  failing         bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select j.tier,
         count(*),
         count(*) filter (where j.enabled and j.next_fetch_at <= now()),
         count(*) filter (
           where j.enabled
             and j.next_fetch_at <= now() - make_interval(secs => crawl_config_int('cron_grace_seconds', 600))
         ),
         count(*) filter (where j.leased_until is not null and j.leased_until > now()),
         count(*) filter (where j.consecutive_failures > 0)
    from crawl_jobs j
   group by j.tier;
$$;

revoke all on function crawl_queue_health() from public;
grant execute on function crawl_queue_health() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Ingest run bookkeeping
-- -----------------------------------------------------------------------------

create or replace function start_ingest_run(p_job_id uuid, p_worker_id text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  insert into ingest_runs (job_id, kind, target_key, term_code, worker_id)
  select p_job_id, j.kind, j.target_key, j.term_code, p_worker_id
    from crawl_jobs j where j.job_id = p_job_id
  returning run_id into v_run_id;

  if v_run_id is null then
    insert into ingest_runs (job_id, worker_id) values (p_job_id, p_worker_id)
    returning run_id into v_run_id;
  end if;

  return v_run_id;
end;
$$;

create or replace function finish_ingest_run(
  p_run_id           uuid,
  p_status           ingest_status,
  p_records_written  integer default 0,
  p_quarantined      boolean default false,
  p_records_seen     integer default null,
  p_previous_records integer default null,
  p_notes            text default null
) returns void
language sql
volatile
security definer
set search_path = public
as $$
  update ingest_runs
     set finished_at      = now(),
         status           = p_status,
         records_written  = coalesce(p_records_written, 0),
         quarantined      = coalesce(p_quarantined, false),
         records_seen     = p_records_seen,
         previous_records = p_previous_records,
         notes            = p_notes
   where run_id = p_run_id;
$$;

revoke all on function start_ingest_run(uuid, text) from public;
grant execute on function start_ingest_run(uuid, text) to service_role;
revoke all on function finish_ingest_run(uuid, ingest_status, integer, boolean, integer, integer, text) from public;
grant execute on function finish_ingest_run(uuid, ingest_status, integer, boolean, integer, integer, text) to service_role;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
-- The queue is NOT world-readable. Browsers reach it only through claim_jobs
-- and complete_job, which is what keeps a lease meaningful: no policy exists
-- for anon or authenticated, so direct table access is denied and the SECURITY
-- DEFINER functions are the only door. The service role bypasses RLS.

alter table crawl_jobs    enable row level security;
alter table ingest_runs   enable row level security;
alter table crawl_cadence enable row level security;
alter table crawl_config  enable row level security;
