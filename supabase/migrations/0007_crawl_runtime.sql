-- =============================================================================
-- 0007 — crawl runtime support
-- =============================================================================
-- Three gaps between the schema as shipped in 0003 and the `CrawlJobStore`
-- contract in `lib/crawler/contracts.ts`:
--
--   1. `ingest_fingerprints` — the quarantine guard (spec §10) compares an
--      incoming run against the last COMMITTED run for the same key. That is
--      deliberately not the same as the last `ingest_runs` row, which also
--      records refused runs. Storing it separately keeps "what we last
--      accepted" un-poisoned by the runs we rejected.
--
--   2. `client_leases` — the per-client hourly ceiling (spec §10, "Mitigations")
--      needs a count of jobs handed to a client over a window. It cannot be
--      derived from `crawl_jobs.leased_by`, because a lease is cleared on
--      completion and the same job may be leased repeatedly.
--
--   3. `complete_job` gains an explicit `p_next_fetch_at` override. The
--      scheduler in `lib/crawler/scheduler.ts` is documented as the ONLY place
--      allowed to decide `next_fetch_at`; without an override the SQL function
--      silently recomputed it and there were two authorities for one value.
--      When the override is null the previous behaviour is preserved exactly,
--      so cron and the backfill runner are unaffected.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ingest_fingerprints — last committed shape per quarantine key
-- -----------------------------------------------------------------------------

create table if not exists ingest_fingerprints (
  -- `${kind}:${target_key}:${term_code ?? '-'}` — see `ingestKeyFor()`.
  ingest_key         text        primary key,
  record_count       integer     not null check (record_count >= 0),
  filled_field_count integer     not null check (filled_field_count >= 0),
  captured_at        timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table ingest_fingerprints is
  'Size/shape of the last COMMITTED ingest per key. The quarantine guard refuses any run that shrinks against this row.';

drop trigger if exists trg_ingest_fingerprints_updated_at on ingest_fingerprints;
create trigger trg_ingest_fingerprints_updated_at
  before update on ingest_fingerprints
  for each row execute function set_updated_at();

alter table ingest_fingerprints enable row level security;

-- World-readable: it is three integers about our own pipeline's health, and the
-- crawl health surface renders it. Writes are service-role only.
drop policy if exists ingest_fingerprints_world_readable on ingest_fingerprints;
create policy ingest_fingerprints_world_readable
  on ingest_fingerprints for select using (true);

-- -----------------------------------------------------------------------------
-- client_leases — per-client request ceiling
-- -----------------------------------------------------------------------------

create table if not exists client_leases (
  lease_id   bigserial   primary key,
  -- Opaque per-browser id. Never a user id: this table must not become a way
  -- to attribute crawl traffic to a person.
  client_id  text        not null,
  job_count  integer     not null check (job_count > 0),
  leased_at  timestamptz not null default now()
);

comment on table client_leases is
  'Ledger of jobs handed to each crawl client, backing the per-client hourly ceiling. client_id is an opaque browser id, never a user id.';

create index if not exists client_leases_client_time_idx
  on client_leases (client_id, leased_at desc);

alter table client_leases enable row level security;
-- No select policy at all: nothing outside the service role reads this.

-- Rows older than a day cannot influence an hourly ceiling. Cron prunes them.
create or replace function prune_client_leases(p_older_than interval default interval '1 day')
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from client_leases where leased_at < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function prune_client_leases(interval) from public;
grant execute on function prune_client_leases(interval) to service_role;

-- -----------------------------------------------------------------------------
-- complete_job — add an explicit next_fetch_at override
-- -----------------------------------------------------------------------------
-- Dropped and recreated rather than `create or replace`d: adding a defaulted
-- parameter creates an overload, and two candidates with the same first four
-- argument types make every existing call site ambiguous.

drop function if exists complete_job(uuid, boolean, uuid, text);

create or replace function complete_job(
  job_id          uuid,
  ok              boolean,
  lease_token     uuid        default null,
  error_text      text        default null,
  p_next_fetch_at timestamptz default null
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
       set next_fetch_at        = coalesce(complete_job.p_next_fetch_at,
                                           next_fetch_with_jitter(j.tier, 1.0)),
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
       set next_fetch_at        = coalesce(complete_job.p_next_fetch_at,
                                           next_fetch_with_jitter(j.tier, power(2, v_shift)::numeric)),
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
  'Releases a lease and reschedules. p_next_fetch_at lets lib/crawler/scheduler.ts remain the single authority on cadence; when null the tier cadence with jitter is used exactly as before.';

revoke all on function complete_job(uuid, boolean, uuid, text, timestamptz) from public;
grant execute on function complete_job(uuid, boolean, uuid, text, timestamptz)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- set_tier — bulk tier move for hot-tier promotion / demotion
-- -----------------------------------------------------------------------------
-- `promoteToHot` moves a batch of (kind, target_key, term_code) triples at once.
-- Doing it as one statement keeps promotion atomic: a half-promoted subject
-- would poll some of its pages at 2 min and the rest at an hour.

create or replace function set_crawl_tier(
  p_selectors     jsonb,
  p_tier          crawl_tier,
  p_next_fetch_at timestamptz
) returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  with wanted as (
    select
      (entry ->> 'kind')::crawl_job_kind as kind,
      entry ->> 'targetKey'              as target_key,
      coalesce(entry ->> 'termCode', '') as term_code
    from jsonb_array_elements(coalesce(p_selectors, '[]'::jsonb)) as entry
  )
  update crawl_jobs j
     set tier          = p_tier,
         next_fetch_at = p_next_fetch_at,
         updated_at    = now()
    from wanted w
   where j.kind = w.kind
     and j.target_key = w.target_key
     and coalesce(j.term_code, '') = w.term_code;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function set_crawl_tier(jsonb, crawl_tier, timestamptz) from public;
grant execute on function set_crawl_tier(jsonb, crawl_tier, timestamptz) to service_role;
