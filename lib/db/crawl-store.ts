/**
 * Supabase-backed `CrawlJobStore`.
 *
 * This is the seam the crawler lane declared in `lib/crawler/contracts.ts` and
 * deliberately did not implement: everything in `lib/crawler/**` codes against
 * the interface, and this file is the one place that knows the queue lives in
 * Postgres.
 *
 * ── Why almost every method is an RPC call ─────────────────────────────────
 *
 * Three consumers — visitor browsers, Vercel cron, the backfill runner — claim
 * from one queue concurrently. Every operation that touches a lease has to be
 * a single statement that takes its own lock, or two consumers will fetch the
 * same directory page at the same instant, which is exactly the synchronized
 * pattern spec §10 is built to avoid. `SELECT ... FOR UPDATE SKIP LOCKED`
 * cannot be expressed through PostgREST, so the locking lives in SQL functions
 * (`supabase/migrations/0003`, `0007`, `0008`) and this file is a typed shell
 * over them.
 *
 * ── Which client ───────────────────────────────────────────────────────────
 *
 * Service role. Every caller is server-side (a route handler or the backfill
 * script), and `claim_crawl_jobs` grants the service role larger batches so the
 * one-shot backfill is not throttled to a browser's three-job ceiling. The
 * browser never talks to this store directly — it goes through
 * `/api/crawl/lease` and `/api/crawl/submit`, which is what keeps the service
 * key server-side and lets those routes enforce the per-client ceiling.
 */

import type {
  ClaimOptions,
  CrawlJobSpec,
  CrawlJobStore,
  IngestFingerprint,
  IngestRunRecord,
  JobOutcome,
} from "@/lib/crawler/contracts";
import type { CrawlJob, CrawlJobKind, CrawlTier, TermCode } from "@/lib/types";

import { requireServiceRoleClient, type CatalogClient } from "./client";
import { rowToCrawlJob, rowToLeasedCrawlJob, type CrawlJobRow, type LeasedCrawlJob } from "./schema";

/**
 * Lease tokens are credentials, not catalog data, so `CrawlJob` does not carry
 * one. The store still needs them to complete a job on behalf of a browser, and
 * holding them here — rather than widening the shared type — keeps the token
 * out of anything that gets serialized to a client.
 *
 * Bounded so a long-lived server process cannot accumulate tokens for jobs
 * whose leases expired and were reclaimed by somebody else.
 */
const MAX_TRACKED_LEASES = 2_000;

const leaseTokens = new Map<string, string>();

function rememberLeaseToken(job: LeasedCrawlJob): void {
  if (!job.leaseToken) return;
  if (leaseTokens.size >= MAX_TRACKED_LEASES) {
    // Oldest first — Map preserves insertion order.
    const oldest = leaseTokens.keys().next();
    if (!oldest.done) leaseTokens.delete(oldest.value);
  }
  leaseTokens.set(job.jobId, job.leaseToken);
}

/** The token most recently issued for a job, if this process claimed it. */
export function leaseTokenFor(jobId: string): string | null {
  return leaseTokens.get(jobId) ?? null;
}

/** Hand a token back to the store — used by `/api/crawl/submit`, which
 *  receives the token from the browser rather than having claimed the job. */
export function rememberExternalLeaseToken(jobId: string, token: string): void {
  rememberLeaseToken({ jobId, leaseToken: token } as LeasedCrawlJob);
}

function forgetLeaseToken(jobId: string): void {
  leaseTokens.delete(jobId);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class SupabaseCrawlJobStore implements CrawlJobStore {
  private readonly db: CatalogClient;

  constructor(db?: CatalogClient) {
    this.db = db ?? requireServiceRoleClient();
  }

  /**
   * `dueBefore` is an absolute timestamp in the contract but the SQL function
   * takes a relative grace window, because the cutoff has to be computed from
   * the *database's* clock. A serverless function whose clock has drifted a few
   * seconds would otherwise silently widen or narrow the grace window that
   * separates cron from the browsers.
   */
  async claimDueJobs(options: ClaimOptions): Promise<CrawlJob[]> {
    const graceSeconds = Math.max(
      0,
      Math.round((Date.now() - Date.parse(options.dueBefore)) / 1000),
    );
    const leaseSeconds = Math.max(
      10,
      Math.round((Date.parse(options.leasedUntil) - Date.now()) / 1000),
    );

    const { data, error } = await this.db.rpc("claim_crawl_jobs", {
      p_worker_id: options.leasedBy,
      p_batch_size: options.limit,
      p_min_overdue_seconds: Number.isFinite(graceSeconds) ? graceSeconds : 0,
      p_include_kinds: options.includeKinds ?? null,
      p_exclude_kinds: options.excludeKinds ?? null,
      p_allowed_hosts: options.allowedHosts ?? null,
      p_lease_seconds: Number.isFinite(leaseSeconds) ? leaseSeconds : null,
    });

    if (error) throw new Error(`claim_crawl_jobs failed: ${error.message}`);

    const rows = (data ?? []) as CrawlJobRow[];
    const jobs = rows.map(rowToLeasedCrawlJob);
    for (const job of jobs) rememberLeaseToken(job);
    return jobs.map(({ leaseToken: _leaseToken, ...job }) => job);
  }

  async getJob(jobId: string): Promise<CrawlJob | null> {
    const { data, error } = await this.db
      .from("crawl_jobs")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) throw new Error(`getJob failed: ${error.message}`);
    return data ? rowToCrawlJob(data as CrawlJobRow) : null;
  }

  /**
   * `p_next_fetch_at` is always supplied: `lib/crawler/scheduler.ts` documents
   * itself as the only place allowed to decide cadence, and migration 0007 added
   * the override precisely so the SQL function stops being a second authority
   * on the same value.
   */
  async completeJob(outcome: JobOutcome): Promise<void> {
    const { error } = await this.db.rpc("complete_job", {
      job_id: outcome.jobId,
      ok: outcome.ok,
      lease_token: leaseTokenFor(outcome.jobId),
      error_text: outcome.error ?? null,
      p_next_fetch_at: outcome.nextFetchAt,
    });

    forgetLeaseToken(outcome.jobId);
    if (error) throw new Error(`complete_job failed: ${error.message}`);
  }

  /**
   * A release must not look like a failure. The job goes back to the pool with
   * its schedule and failure counter untouched — a browser that closed its tab
   * told us nothing about whether Columbia is healthy, and backing the job off
   * would punish the queue for a user closing a laptop.
   *
   * Scoped to `leased_by` so a stale client cannot release a lease that has
   * already expired and been reclaimed by someone else.
   */
  async releaseJob(jobId: string, leasedBy: string): Promise<void> {
    const { error } = await this.db
      .from("crawl_jobs")
      .update({ leased_until: null, leased_by: null, lease_token: null })
      .eq("job_id", jobId)
      .eq("leased_by", leasedBy);

    forgetLeaseToken(jobId);
    if (error) throw new Error(`releaseJob failed: ${error.message}`);
  }

  /**
   * Upserts on `(kind, target_key, coalesce(term_code, ''))`.
   *
   * The contract is explicit that an existing job's `nextFetchAt` must survive
   * unless `resetSchedule` is set — re-running the backfill over a warm catalog
   * would otherwise mark all ~1,800 subject-term jobs due at once and produce
   * exactly the synchronized wave the jitter exists to prevent.
   */
  async upsertJobs(specs: CrawlJobSpec[]): Promise<number> {
    let created = 0;
    for (const spec of specs) {
      const { data, error } = await this.db.rpc("upsert_crawl_job", {
        p_kind: spec.kind,
        p_target_key: spec.targetKey,
        p_term_code: spec.termCode,
        p_url: spec.url,
        p_tier: spec.tier,
        p_due_now: spec.resetSchedule ?? false,
        // The backfill's paced schedule. On a brand-new row this is what makes
        // a cold catalog arrive as a stream rather than a wave; on an existing
        // row the function ignores it unless `resetSchedule` asked for a move.
        p_next_fetch_at: spec.nextFetchAt,
      });
      if (error) {
        throw new Error(`upsert_crawl_job(${spec.kind}:${spec.targetKey}) failed: ${error.message}`);
      }
      // Count creates, not calls. Reporting every upsert as "created" would
      // make a re-run over a warm catalog claim 1,800 new jobs and none exist.
      if (data?.[0]?.inserted) created += 1;
    }
    return created;
  }

  /** One statement so a subject is never half-promoted across its pages. */
  async setTier(
    selector: { kind: CrawlJobKind; targetKey: string; termCode: TermCode | null }[],
    tier: CrawlTier,
    nextFetchAt: string,
  ): Promise<number> {
    if (selector.length === 0) return 0;

    const { data, error } = await this.db.rpc("set_crawl_tier", {
      p_selectors: selector,
      p_tier: tier,
      p_next_fetch_at: nextFetchAt,
    });

    if (error) throw new Error(`set_crawl_tier failed: ${error.message}`);
    return typeof data === "number" ? data : 0;
  }

  async countClientJobsSince(clientId: string, since: string): Promise<number> {
    const { data, error } = await this.db
      .from("client_leases")
      .select("job_count")
      .eq("client_id", clientId)
      .gte("leased_at", since);

    if (error) throw new Error(`countClientJobsSince failed: ${error.message}`);
    return (data ?? []).reduce<number>((total, row) => total + (row.job_count ?? 0), 0);
  }

  async recordClientLease(clientId: string, count: number, at: string): Promise<void> {
    if (count <= 0) return;
    const { error } = await this.db
      .from("client_leases")
      .insert({ client_id: clientId, job_count: count, leased_at: at });

    if (error) throw new Error(`recordClientLease failed: ${error.message}`);
  }

  /**
   * `ingest_runs` is an append-only audit log, quarantined runs included — the
   * whole point of recording a refusal is being able to see it later.
   */
  async recordIngestRun(run: IngestRunRecord): Promise<void> {
    const [kind, targetKey, termCode] = splitIngestKey(run.ingestKey);

    const { error } = await this.db.from("ingest_runs").insert({
      job_id: run.jobId,
      kind,
      target_key: targetKey,
      term_code: termCode,
      worker_id: run.source,
      started_at: run.startedAt,
      finished_at: run.finishedAt,
      status: toIngestStatus(run.status),
      records_written: run.recordsWritten,
      quarantined: run.quarantined,
      // The column enum cannot say *how* a run failed, so the distinction the
      // crawler drew is preserved in the note rather than thrown away.
      notes: annotateFailure(run.status, run.notes),
    });

    if (error) throw new Error(`recordIngestRun failed: ${error.message}`);
  }

  async getIngestFingerprint(ingestKey: string): Promise<IngestFingerprint | null> {
    const { data, error } = await this.db
      .from("ingest_fingerprints")
      .select("record_count, filled_field_count, captured_at")
      .eq("ingest_key", ingestKey)
      .maybeSingle();

    if (error) throw new Error(`getIngestFingerprint failed: ${error.message}`);
    if (!data) return null;

    return {
      recordCount: data.record_count,
      filledFieldCount: data.filled_field_count,
      capturedAt: data.captured_at,
    };
  }

  /**
   * Only ever called for a run that was actually committed. Writing a
   * fingerprint for a quarantined run would ratchet the guard down to the
   * broken parse's output and let the next equally-broken run through.
   */
  async putIngestFingerprint(ingestKey: string, fingerprint: IngestFingerprint): Promise<void> {
    const { error } = await this.db.from("ingest_fingerprints").upsert(
      {
        ingest_key: ingestKey,
        record_count: fingerprint.recordCount,
        filled_field_count: fingerprint.filledFieldCount,
        captured_at: fingerprint.capturedAt,
      },
      { onConflict: "ingest_key" },
    );

    if (error) throw new Error(`putIngestFingerprint failed: ${error.message}`);
  }
}

/**
 * The `ingest_status` enum has four values and the crawler's `IngestRunRecord`
 * has four, but they are not the same four: SQL distinguishes `running`, which
 * the crawler never reports, and the crawler distinguishes `parse_error` from
 * `fetch_error`, which SQL folds into `failed`.
 *
 * Widening the enum was the alternative and was rejected — every consumer of
 * `ingest_runs` cares about "did this commit", and the failure *cause* belongs
 * in the note a human reads during triage, not in an index.
 */
function toIngestStatus(status: IngestRunRecord["status"]): "ok" | "failed" | "quarantined" {
  if (status === "ok") return "ok";
  if (status === "quarantined") return "quarantined";
  return "failed";
}

function annotateFailure(status: IngestRunRecord["status"], notes: string | null): string | null {
  if (status !== "parse_error" && status !== "fetch_error") return notes;
  return notes ? `[${status}] ${notes}` : `[${status}]`;
}

/**
 * `${kind}:${targetKey}:${termCode ?? "-"}` — see `ingestKeyFor()`. Split from
 * the right so a target key containing a colon survives the round trip.
 */
function splitIngestKey(ingestKey: string): [CrawlJobKind, string, TermCode | null] {
  const firstColon = ingestKey.indexOf(":");
  const lastColon = ingestKey.lastIndexOf(":");
  if (firstColon < 0 || lastColon <= firstColon) {
    return ["subject_term", ingestKey, null];
  }
  const kind = ingestKey.slice(0, firstColon) as CrawlJobKind;
  const targetKey = ingestKey.slice(firstColon + 1, lastColon);
  const term = ingestKey.slice(lastColon + 1);
  return [kind, targetKey, term === "-" ? null : term];
}
