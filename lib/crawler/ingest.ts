/**
 * LionPlan — the server-side ingest pipeline.
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
import { isSectionTombstone } from "@/lib/ingest/parsers/section-detail";
import { committedFingerprint, evaluateQuarantine, fingerprintPayload } from "./quarantine";
import { computeBackoffFetchAt, computeNextFetchAt, type RandomSource } from "./scheduler";

/** Below this, the response is a stub, an error page or a truncated read. */
export const MIN_PLAUSIBLE_HTML_CHARS = 200;

/**
 * Marks an `IngestRunResult.reason` as a withdrawal rather than a failure.
 *
 * `IngestRunResult` has one free-text `reason` and no success flag, so a
 * withdrawal — which succeeds — is carried on the same channel as a fault. The
 * operator script would otherwise print it with a ✗ and count it as failed,
 * which is exactly the confusion this whole change set out to remove.
 *
 * Exported so both sides agree on the wording instead of the reader
 * string-matching prose that the writer is free to reword.
 */
export const WITHDRAWN_REASON_PREFIX = "section withdrawn:";

/** Did this run end in a section being withdrawn rather than a failure? */
export function isWithdrawnReason(reason: string | undefined): boolean {
  return typeof reason === "string" && reason.startsWith(WITHDRAWN_REASON_PREFIX);
}

/**
 * Marks an `IngestRunResult.reason` as "this page correctly does not exist".
 * Same channel as `WITHDRAWN_REASON_PREFIX`, and for the same reason:
 * `IngestRunResult` has one free-text `reason` and no success flag.
 */
export const ABSENT_REASON_PREFIX = "correctly absent:";

/** Did this run end in a page that is legitimately not published? */
export function isAbsentReason(reason: string | undefined): boolean {
  return typeof reason === "string" && reason.startsWith(ABSENT_REASON_PREFIX);
}

/**
 * Is a 404 here a permanent, correct answer rather than a fault?
 *
 * Only for `subject_term`, and only for a status we observed ourselves.
 *
 * The Directory's root index lists every subject code that has EVER run, so a
 * subject offering nothing in a given term simply has no page for that term.
 * That 404 is correct and definitive, and treating it as a transient fault is
 * the same mistake the "Section Removed" tombstone was.
 *
 * Restricted to `subject_term` deliberately. A 404 on a section-detail page is
 * already handled as a withdrawal by its own tombstone, and a 404 on a
 * bulletin department or the subject index means a URL we build is wrong —
 * which is a bug that should stay loud rather than be reclassified as normal.
 */
function isCorrectlyAbsent(job: CrawlJob, status: number | undefined): boolean {
  return status === 404 && job.kind === "subject_term";
}

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

  /*
   * A withdrawn section, before anything tries to parse it.
   *
   * When Columbia pulls a section the Directory serves HTTP 200 and a ~474
   * byte "Section Removed" page. That is long enough to clear the plausibility
   * check above and shaped nothing like a section, so `parseSectionDetail`
   * threw, the run was recorded as a parse error, and the job backed off
   * exponentially — retrying, forever, a page whose answer will never change.
   * Nothing about it looked like a bug from the outside: the fetch succeeded,
   * the parser was right to refuse it, and the only symptom was a job that
   * never went quiet.
   *
   * The job completes OK rather than being disabled, and then waits out the
   * ordinary section-detail cadence. Disabling would be tidier and would
   * assume something we do not know: that a withdrawal is permanent. A weekly
   * re-read of a handful of pages costs nothing and is the only way we would
   * ever find out that a section came back.
   */
  if (job.kind === "section_detail" && isSectionTombstone(input.html)) {
    let rowsChanged: number;
    try {
      rowsChanged = await runtime.writer.markSectionWithdrawn(job.targetKey, input.fetchedAt);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return fail("parse_error", `withdraw failed: ${message.slice(0, 300)}`);
    }

    // Zero rows is a normal outcome, not a failure: the section was already
    // marked on an earlier pass, or we never carried a row for it because it
    // was pulled between the subject page listing it and this crawl arriving.
    const notes =
      rowsChanged > 0
        ? `${WITHDRAWN_REASON_PREFIX} Columbia no longer publishes ${job.targetKey}`
        : `${WITHDRAWN_REASON_PREFIX} ${job.targetKey} was already marked or is not in the catalog`;

    await runtime.jobStore.recordIngestRun({
      jobId: job.jobId,
      ingestKey,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "ok",
      recordsWritten: rowsChanged,
      quarantined: false,
      notes,
      source: input.source,
    });
    /*
     * The ingest fingerprint is deliberately NOT updated. It describes the
     * last real section page we read, and a tombstone carries no records at
     * all — writing it would hand the quarantine guard a baseline of zero, so
     * the section coming back would look like a suspicious jump rather than a
     * recovery, and would be refused.
     */
    await runtime.jobStore.completeJob({
      jobId: job.jobId,
      ok: true,
      nextFetchAt: computeNextFetchAt(job.tier, now, options.random, job.kind),
      lastOkAt: input.fetchedAt,
    });
    return { jobId: job.jobId, recordsWritten: rowsChanged, quarantined: false, reason: notes };
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
  options: {
    runtime?: CrawlerRuntime;
    now?: Date;
    random?: RandomSource;
    /**
     * The HTTP status WE observed, when we observed it ourselves.
     *
     * Deliberately optional, and deliberately never populated from a browser
     * submission. `SubmissionSchema` carries no status, and adding one would
     * mean honouring a client's claim that a page 404s — which would let any
     * browser mark a subject permanently absent for every other user. This
     * codebase already draws that line: provenance travels with the data and
     * must not be client-controlled.
     *
     * So the cron and the operator script, which hold a real `politeFetch`
     * outcome, may pass it. The submit route may not. That asymmetry is the
     * point, not an oversight.
     */
    status?: number;
  } = {},
): Promise<IngestRunResult> {
  const runtime = options.runtime ?? getCrawlerRuntime();
  const now = options.now ?? new Date();
  const absent = isCorrectlyAbsent(job, options.status);
  const notes = absent
    ? `${ABSENT_REASON_PREFIX} ${job.url} is not published for this term`
    : `fetch failed: ${error.slice(0, 300)}`;
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
  /*
   * "Correctly absent" completes OK and waits out the ordinary cadence; a real
   * failure backs off exponentially.
   *
   * The difference matters in both directions. Backing off a permanent 404
   * means retrying forever a question already answered — 196 subject-term jobs
   * were doing exactly that, pinned at the 6h ceiling, ~800 wasted requests a
   * day at Columbia's expense and a failure count that never returns to zero.
   * A permanently noisy failure metric is how a real failure gets missed.
   *
   * But it is scheduled, not disabled: a subject that offers nothing in Fall
   * 2026 may well offer something in Spring 2028, and the weekly re-read is
   * what would notice.
   */
  await runtime.jobStore.completeJob({
    jobId: job.jobId,
    ok: absent,
    ...(absent
      ? {
          nextFetchAt: computeNextFetchAt(job.tier, now, options.random, job.kind),
          lastOkAt: now.toISOString(),
        }
      : {
          nextFetchAt: computeBackoffFetchAt(
            job.tier,
            job.consecutiveFailures + 1,
            now,
            options.random,
          ),
          error: notes,
        }),
  });
  return { jobId: job.jobId, recordsWritten: 0, quarantined: false, reason: notes };
}
