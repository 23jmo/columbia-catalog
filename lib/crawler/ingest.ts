/**
 * Columbia Catalog — the server-side ingest pipeline.
 *
 * One function, three callers: a browser submission, a cron fetch, and the
 * backfill runner all land here. Keeping it single-sourced is what guarantees
 * the quarantine guard cannot be bypassed by whichever consumer happens to be
 * carrying the load — clients are never trusted to parse, and no path writes
 * to the catalog except this one.
 */

import type { CrawlJob, IngestRunResult } from "@/lib/types";
import {
  getCrawlerRuntime,
  ingestKeyFor,
  type CrawlConsumer,
  type CrawlerRuntime,
  type IngestPayload,
  type ParseContext,
} from "./contracts";
import { committedFingerprint, evaluateQuarantine, fingerprintPayload } from "./quarantine";
import { computeBackoffFetchAt, computeNextFetchAt, type RandomSource } from "./scheduler";

/** Below this, the response is a stub, an error page or a truncated read. */
export const MIN_PLAUSIBLE_HTML_CHARS = 200;

export interface IngestInput {
  job: CrawlJob;
  html: string;
  /** When the *worker* read the page, not when we processed it. */
  fetchedAt: string;
  source: CrawlConsumer;
}

/**
 * Parses HTML into the payload shape for a job kind. Throws on unusable input;
 * the caller converts a throw into a recorded parse error.
 */
export function parseForJob(
  runtime: CrawlerRuntime,
  job: CrawlJob,
  html: string,
  fetchedAt: string,
): IngestPayload {
  const context: ParseContext = {
    url: job.url,
    targetKey: job.targetKey,
    termCode: job.termCode,
    fetchedAt,
  };
  switch (job.kind) {
    case "subject_term":
      return { kind: "subject_term", page: runtime.parsers.parseSubjectPage(html, context) };
    case "section_detail":
      return { kind: "section_detail", detail: runtime.parsers.parseSectionDetail(html, context) };
    case "bulletin_department":
      return {
        kind: "bulletin_department",
        department: job.targetKey,
        rows: runtime.parsers.parseBulletinPage(html, context),
        courses: runtime.parsers.parseBulletinCourses(html, context),
      };
    case "subject_index":
      return { kind: "subject_index", index: runtime.parsers.parseSubjectIndex(html, context) };
    case "academic_calendar":
      return {
        kind: "academic_calendar",
        calendar: runtime.parsers.parseAcademicCalendar(html, context),
      };
  }
}

/**
 * Parse → quarantine check → write → record. The job is always closed out,
 * whichever branch is taken, so a job can never be stranded in a leased state
 * by a parse failure.
 */
export async function ingestHtml(
  input: IngestInput,
  options: { runtime?: CrawlerRuntime; now?: Date; random?: RandomSource } = {},
): Promise<IngestRunResult> {
  const runtime = options.runtime ?? getCrawlerRuntime();
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const { job } = input;
  const ingestKey = ingestKeyFor(job);

  const fail = async (
    status: "parse_error" | "fetch_error",
    notes: string,
  ): Promise<IngestRunResult> => {
    await runtime.jobStore.recordIngestRun({
      jobId: job.jobId,
      ingestKey,
      startedAt,
      finishedAt: new Date().toISOString(),
      status,
      recordsWritten: 0,
      quarantined: false,
      notes,
      source: input.source,
    });
    await runtime.jobStore.completeJob({
      jobId: job.jobId,
      ok: false,
      nextFetchAt: computeBackoffFetchAt(
        job.tier,
        job.consecutiveFailures + 1,
        now,
        options.random,
      ),
      error: notes,
    });
    return { jobId: job.jobId, recordsWritten: 0, quarantined: false, reason: notes };
  };

  if (typeof input.html !== "string" || input.html.length < MIN_PLAUSIBLE_HTML_CHARS) {
    return fail("fetch_error", `implausibly short response (${input.html?.length ?? 0} chars)`);
  }

  let payload: IngestPayload;
  try {
    payload = parseForJob(runtime, job, input.html, input.fetchedAt);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return fail("parse_error", `parse failed: ${message.slice(0, 300)}`);
  }

  const incoming = fingerprintPayload(payload);
  const previous = await runtime.jobStore.getIngestFingerprint(ingestKey);
  const decision = evaluateQuarantine(incoming, previous);

  if (decision.quarantined) {
    const notes = `quarantined: ${decision.reason ?? "unknown"}`;
    await runtime.jobStore.recordIngestRun({
      jobId: job.jobId,
      ingestKey,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "quarantined",
      recordsWritten: 0,
      quarantined: true,
      notes,
      source: input.source,
    });
    // Counted as a failure for pacing purposes: a repeatedly quarantining job
    // is almost always a broken parser, and hammering the source will not fix
    // it. Backing off buys the operator time without losing the job.
    await runtime.jobStore.completeJob({
      jobId: job.jobId,
      ok: false,
      nextFetchAt: computeBackoffFetchAt(
        job.tier,
        job.consecutiveFailures + 1,
        now,
        options.random,
      ),
      error: notes,
    });
    return {
      jobId: job.jobId,
      recordsWritten: 0,
      quarantined: true,
      reason: decision.reason ?? "quarantined",
    };
  }

  let recordsWritten: number;
  try {
    recordsWritten = await runtime.writer.applyIngest(payload, input.fetchedAt);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return fail("parse_error", `write failed: ${message.slice(0, 300)}`);
  }

  const finishedAt = new Date().toISOString();
  await runtime.jobStore.putIngestFingerprint(ingestKey, committedFingerprint(incoming, finishedAt));
  await runtime.jobStore.recordIngestRun({
    jobId: job.jobId,
    ingestKey,
    startedAt,
    finishedAt,
    status: "ok",
    recordsWritten,
    quarantined: false,
    notes: null,
    source: input.source,
  });
  await runtime.jobStore.completeJob({
    jobId: job.jobId,
    ok: true,
    nextFetchAt: computeNextFetchAt(job.tier, now, options.random, job.kind),
    lastOkAt: input.fetchedAt,
  });

  return { jobId: job.jobId, recordsWritten, quarantined: false };
}

/**
 * A worker reported that it could not fetch the page at all. No parse, no
 * write — just a recorded failure and a backed-off schedule.
 */
export async function recordFetchFailure(
  job: CrawlJob,
  error: string,
  source: CrawlConsumer,
  options: { runtime?: CrawlerRuntime; now?: Date; random?: RandomSource } = {},
): Promise<IngestRunResult> {
  const runtime = options.runtime ?? getCrawlerRuntime();
  const now = options.now ?? new Date();
  const notes = `fetch failed: ${error.slice(0, 300)}`;
  await runtime.jobStore.recordIngestRun({
    jobId: job.jobId,
    ingestKey: ingestKeyFor(job),
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    status: "fetch_error",
    recordsWritten: 0,
    quarantined: false,
    notes,
    source,
  });
  await runtime.jobStore.completeJob({
    jobId: job.jobId,
    ok: false,
    nextFetchAt: computeBackoffFetchAt(job.tier, job.consecutiveFailures + 1, now, options.random),
    error: notes,
  });
  return { jobId: job.jobId, recordsWritten: 0, quarantined: false, reason: notes };
}
