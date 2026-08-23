-- =============================================================================
-- 0008 — kind- and host-filtered job claiming
-- =============================================================================
-- `claim_jobs` (0003) claims strictly by tier and due time. The `ClaimOptions`
-- contract additionally carries `includeKinds`, `excludeKinds` and
-- `allowedHosts`, and those filters cannot be applied after the fact:
--
--   · `bulletin.columbia.edu` sends no CORS header, so a browser can never
--     fetch a `bulletin_department` job. If a browser claimed one and released
--     it, the queue would hand it straight back on the next poll and the
--     browser would make no progress at all — a livelock, not an inefficiency.
--
--   · Releasing a claimed job still burns a lease and a round trip, and the
--     per-client ceiling counts leases, so filtering client-side would spend a
--     browser's whole hourly budget on jobs it cannot do.
--
-- So the predicate has to be inside the same statement that takes the lock.
-- `claim_jobs` is left untouched for any caller that wants the simple form.
-- =============================================================================

create or replace function claim_crawl_jobs(
  p_worker_id           text,
  p_batch_size          integer default 3,
  p_min_overdue_seconds integer default 0,
  p_include_kinds       text[]  default null,
  p_exclude_kinds       text[]  default null,
  p_allowed_hosts       text[]  default null,
  p_lease_seconds       integer default null
) returns setof crawl_jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_batch  integer;
  v_lease  integer;
  v_cutoff timestamptz;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'claim_crawl_jobs requires a worker id'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Same ceiling discipline as claim_jobs: an untrusted caller never walks a
  -- dozen directory pages in a row, whatever it asks for.
  v_batch := least(
    greatest(coalesce(p_batch_size, 1), 1),
    greatest(crawl_config_int('max_lease_batch', 3), 1)
  );
  if request_role() = 'service_role' then
    v_batch := least(greatest(coalesce(p_batch_size, 1), 1), 500);
  end if;

  v_lease  := greatest(coalesce(p_lease_seconds, crawl_config_int('lease_seconds', 90)), 10);
  v_cutoff := now() - make_interval(secs => greatest(coalesce(p_min_overdue_seconds, 0), 0));

  return query
  with due as (
    select j.job_id
      from crawl_jobs j
     where j.enabled
       and j.next_fetch_at <= v_cutoff
       and (j.leased_until is null or j.leased_until < now())
       and (p_include_kinds is null or j.kind::text = any (p_include_kinds))
       and (p_exclude_kinds is null or not (j.kind::text = any (p_exclude_kinds)))
       -- Host match is a suffix test so a job on `doc.sis.columbia.edu` is
       -- allowed by either the exact host or the registrable domain.
       and (
         p_allowed_hosts is null
         or exists (
           select 1
             from unnest(p_allowed_hosts) as h
            where split_part(split_part(j.url, '://', 2), '/', 1) = h
               or split_part(split_part(j.url, '://', 2), '/', 1) like ('%.' || h)
         )
       )
     order by crawl_tier_rank(j.tier) desc, j.next_fetch_at asc
     limit v_batch
     for update skip locked
  )
  update crawl_jobs j
     set leased_by    = p_worker_id,
         leased_until = now() + make_interval(secs => v_lease),
         lease_token  = gen_random_uuid(),
         lease_count  = j.lease_count + 1,
         updated_at   = now()
    from due
   where j.job_id = due.job_id
  returning j.*;
end;
$$;

comment on function claim_crawl_jobs is
  'Leases due jobs with kind and host predicates applied inside the locking statement. Browsers must exclude bulletin_department: bulletin.columbia.edu sends no CORS header, and claim-then-release would livelock them.';

revoke all on function claim_crawl_jobs(text, integer, integer, text[], text[], text[], integer) from public;
grant execute on function claim_crawl_jobs(text, integer, integer, text[], text[], text[], integer)
  to anon, authenticated, service_role;
