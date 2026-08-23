-- ---------------------------------------------------------------------------
-- 0010 — let the caller schedule a job it is creating.
--
-- `upsert_crawl_job` accepted only `p_due_now boolean`: a new row was either
-- due immediately or due at `now() + tier interval ± jitter`. Nothing in
-- between could be expressed.
--
-- That silently voided the backfill. `lib/crawler/backfill.ts` spreads ~1,800
-- subject-term jobs `--spacing` seconds apart specifically so a cold catalog
-- drains at a sustained ~0.25 req/s instead of arriving as one wave, and it
-- puts that schedule in `CrawlJobSpec.nextFetchAt`. The value reached the store
-- and had nowhere to go. Every job it created landed inside the same one-hour
-- jitter window — the exact synchronized burst the pacing exists to prevent.
--
-- Precedence: an explicit `p_next_fetch_at` wins, then `p_due_now`, then the
-- tier default. Escalation still pulls a fetch forward and never pushes it
-- back, so promoting a watched subject to `hot` cannot delay it.
--
-- The return type also changes. The old function returned a bare uuid, so the
-- store had no way to tell an insert from an update and reported every upsert
-- as "created" — a re-run over a warm catalog claimed to have created 1,800
-- jobs while creating none. `xmax = 0` in the RETURNING clause is the standard
-- way to distinguish the two on ON CONFLICT.
-- ---------------------------------------------------------------------------

drop function if exists upsert_crawl_job(crawl_job_kind, text, text, text, crawl_tier, boolean);

create or replace function upsert_crawl_job(
  p_kind          crawl_job_kind,
  p_target_key    text,
  p_term_code     text,
  p_url           text,
  p_tier          crawl_tier default 'baseline',
  p_due_now       boolean default false,
  p_next_fetch_at timestamptz default null
) returns table (job_id uuid, inserted boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- The insert lives in a CTE so its RETURNING list can be renamed. A
  -- `returns table (job_id ...)` signature declares an OUT parameter of that
  -- name, which would shadow the column of the same name in RETURNING.
  return query
  with upserted as (
    insert into crawl_jobs (kind, target_key, term_code, url, tier, next_fetch_at)
    values (
      p_kind, p_target_key, p_term_code, p_url, p_tier,
      coalesce(
        p_next_fetch_at,
        case when p_due_now then now() else next_fetch_with_jitter(p_tier, 1.0) end
      )
    )
    on conflict (kind, target_key, coalesce(term_code, '')) do update
       set url  = excluded.url,
           tier = excluded.tier,
           next_fetch_at = case
             -- Only an explicit reschedule may move a healthy job. A plain
             -- re-run of the backfill must leave the queue's shape alone.
             when p_due_now then coalesce(p_next_fetch_at, now())
             when crawl_tier_rank(excluded.tier) > crawl_tier_rank(crawl_jobs.tier)
               then least(crawl_jobs.next_fetch_at, next_fetch_with_jitter(excluded.tier, 1.0))
             else crawl_jobs.next_fetch_at
           end,
           enabled = true
    -- xmax is 0 on a row this statement inserted, and the id of the updating
    -- transaction on a row it updated. Cast through text because xid has no
    -- direct comparison with an integer literal in every server version.
    returning crawl_jobs.job_id as jid, (crawl_jobs.xmax::text::bigint = 0) as ins
  )
  select jid, ins from upserted;
end;
$$;

revoke all on function upsert_crawl_job(crawl_job_kind, text, text, text, crawl_tier, boolean, timestamptz) from public;
grant execute on function upsert_crawl_job(crawl_job_kind, text, text, text, crawl_tier, boolean, timestamptz) to service_role;
