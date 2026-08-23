/**
 * GET/POST /api/crawl/cron — the safety net.
 *
 * Browsers are the engine; cron is the backstop (spec §10). It claims ONLY
 * jobs overdue past CRON_GRACE_SECONDS, which means:
 *
 *   · at 2pm with 200 users online it finds almost nothing and exits in
 *     milliseconds;
 *   · at 4am and over winter break it carries the entire load.
 *
 * It is also the only consumer that can touch `bulletin.columbia.edu`, which
 * sends no CORS header and is therefore unreachable from a browser.
 *
 * Runtime discipline: Vercel's ceiling is 300s. This handler budgets 45s and
 * exits cleanly on the deadline, leaving the rest of the queue for the next
 * tick. A cron that runs long is a cron that gets killed mid-write.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { CRON_GRACE_SECONDS, LEASE_SECONDS } from "@/lib/constants";
import { getCrawlerRuntime, tryGetCrawlerRuntime } from "@/lib/crawler/contracts";
import { politeFetch } from "@/lib/crawler/fetcher";
import { ingestHtml, recordFetchFailure } from "@/lib/crawler/ingest";
import { promoteToHot } from "@/lib/crawler/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Well under Vercel's 300s ceiling; the handler stops itself sooner still. */
export const maxDuration = 60;

/** Jobs claimed per store round-trip. Small batches keep the lease short. */
const CRON_BATCH_SIZE = 6;
/** Wall-clock budget for the whole run. */
const CRON_DEADLINE_MS = 45_000;
/** Stop starting new work when less than this remains. */
const CRON_RESERVE_MS = 8_000;
/** The identity written to `leased_by` for cron-claimed work. */
const CRON_WORKER_ID = "vercel-cron";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = header.slice(prefix.length);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface CronSummary {
  claimed: number;
  ingested: number;
  quarantined: number;
  failed: number;
  promotedSubjectTerms: number;
  elapsedMs: number;
  stoppedBecause: "queue_empty" | "deadline" | "disabled";
}

async function runCron(): Promise<CronSummary> {
  const startedAt = Date.now();
  const summary: CronSummary = {
    claimed: 0,
    ingested: 0,
    quarantined: 0,
    failed: 0,
    promotedSubjectTerms: 0,
    elapsedMs: 0,
    stoppedBecause: "queue_empty",
  };

  const crawler = getCrawlerRuntime();
  const { jobStore, watches } = crawler;

  // Keep the hot tier honest before doing any fetching: subjects containing
  // watched sections should already be escalated when we start claiming.
  if (watches) {
    try {
      const watched = await watches.watchedSectionIds();
      const promoted = await promoteToHot(watched, { store: jobStore });
      summary.promotedSubjectTerms = promoted.promoted.length;
    } catch {
      // Tier maintenance is best-effort; refreshing data matters more.
    }
  }

  const remainingMs = () => CRON_DEADLINE_MS - (Date.now() - startedAt);

  while (remainingMs() > CRON_RESERVE_MS) {
    const now = new Date();
    // The grace window is what makes cron a safety net rather than a
    // competitor: anything fresher than this belongs to the browsers.
    const dueBefore = new Date(now.getTime() - CRON_GRACE_SECONDS * 1000).toISOString();

    const jobs = await jobStore.claimDueJobs({
      leasedBy: CRON_WORKER_ID,
      limit: CRON_BATCH_SIZE,
      leasedUntil: new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString(),
      dueBefore,
    });

    if (jobs.length === 0) {
      summary.stoppedBecause = "queue_empty";
      break;
    }
    summary.claimed += jobs.length;

    for (const job of jobs) {
      if (remainingMs() <= CRON_RESERVE_MS) {
        // Hand the rest back rather than holding leases we cannot honour.
        await jobStore.releaseJob(job.jobId, CRON_WORKER_ID).catch(() => undefined);
        summary.stoppedBecause = "deadline";
        continue;
      }

      const outcome = await politeFetch(job.url, { timeoutMs: 15_000 });
      if (!outcome.ok || !outcome.html) {
        await recordFetchFailure(job, outcome.error ?? `HTTP ${outcome.status}`, "cron");
        summary.failed += 1;
        continue;
      }

      const result = await ingestHtml({
        job,
        html: outcome.html,
        fetchedAt: outcome.fetchedAt,
        source: "cron",
      });
      if (result.quarantined) summary.quarantined += 1;
      else if (result.recordsWritten > 0 || !result.reason) summary.ingested += 1;
      else summary.failed += 1;
    }

    if (summary.stoppedBecause === "deadline") break;
  }

  if (remainingMs() <= CRON_RESERVE_MS) summary.stoppedBecause = "deadline";
  summary.elapsedMs = Date.now() - startedAt;
  return summary;
}

async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.CRAWL_WORKER_DISABLED === "1") {
    return NextResponse.json(
      { claimed: 0, ingested: 0, quarantined: 0, failed: 0, stoppedBecause: "disabled" },
      { status: 200 },
    );
  }
  if (!tryGetCrawlerRuntime()) {
    return NextResponse.json({ error: "crawler runtime unavailable" }, { status: 503 });
  }

  try {
    const summary = await runCron();
    return NextResponse.json(summary, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
