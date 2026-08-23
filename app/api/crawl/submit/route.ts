/**
 * POST /api/crawl/submit — a worker posts back the raw HTML it fetched.
 *
 * ---------------------------------------------------------------------------
 * THIS ENDPOINT IS FED BY UNTRUSTED BROWSERS. EVERY FIELD IS HOSTILE.
 * ---------------------------------------------------------------------------
 * The defences, in order:
 *
 *   1. Body size is capped before the payload is read into memory.
 *   2. Shape is validated with zod; unknown keys are rejected outright.
 *   3. The lease token is HMAC-verified and bound to both the job id and the
 *      derived client id, so a client cannot submit for a job it never held
 *      nor replay another client's lease.
 *   4. The live lease is re-checked against the store — a signed token whose
 *      job has already been re-leased to someone else is refused.
 *   5. `fetchedAt` is clamped to a sane window; a client cannot backdate or
 *      post-date provenance.
 *   6. The server parses. Clients never send records, only bytes.
 *   7. The quarantine guard runs before anything is written.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getCrawlerRuntime } from "@/lib/crawler/contracts";
// Side-effect import: binds the Supabase job store, catalog writer and parser
// registry into the crawler's runtime registry. Without it every handler in
// this directory answers 503 — the crawler is fully written and structurally
// unable to run. See lib/db/crawler-runtime.ts.
import { ensureCrawlerRuntime } from "@/lib/db/crawler-runtime";
import { triggerAlertSweep } from "@/lib/alerts/trigger";
import { ingestHtml, recordFetchFailure } from "@/lib/crawler/ingest";
import {
  clientIpFromHeaders,
  deriveClientId,
  getLeaseSecret,
  suggestNextDelayMs,
  verifyLeaseToken,
} from "@/lib/crawler/lease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A subject-term page for the largest subject is a few hundred KB. 3 MB is
 * generous headroom and still small enough that a malicious client cannot use
 * this endpoint as free storage.
 */
export const MAX_SUBMISSION_BYTES = 3 * 1024 * 1024;

/** How far `fetchedAt` may sit from server time before we distrust it. */
const FETCHED_AT_TOLERANCE_MS = 10 * 60_000;

const SubmissionSchema = z
  .object({
    jobId: z.string().min(1).max(128),
    leaseToken: z.string().min(16).max(2048),
    ok: z.boolean(),
    html: z.string().max(MAX_SUBMISSION_BYTES).optional(),
    error: z.string().max(500).optional(),
    fetchedAt: z.string().min(4).max(64),
  })
  .strict();

/**
 * Provenance travels with the data, so it must not be client-controlled in
 * any meaningful way. Anything implausible is replaced with server time.
 */
function clampFetchedAt(candidate: string, now: Date): string {
  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) return now.toISOString();
  if (Math.abs(parsed - now.getTime()) > FETCHED_AT_TOLERANCE_MS) return now.toISOString();
  return new Date(parsed).toISOString();
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.CRAWL_WORKER_DISABLED === "1") {
    return NextResponse.json({ error: "ingest disabled" }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SUBMISSION_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let secret: string;
  try {
    secret = getLeaseSecret();
  } catch {
    return NextResponse.json({ error: "ingest unavailable" }, { status: 503 });
  }

  if (!ensureCrawlerRuntime()) {
    return NextResponse.json({ error: "ingest unavailable" }, { status: 503 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "unreadable body" }, { status: 400 });
  }
  // The declared length can lie; the real one cannot.
  if (raw.length > MAX_SUBMISSION_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = SubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid submission" }, { status: 400 });
  }
  const submission = parsed.data;

  if (submission.ok && (!submission.html || submission.html.length === 0)) {
    return NextResponse.json({ error: "ok submission without html" }, { status: 400 });
  }

  const now = new Date();
  const clientId = deriveClientId({
    ip: clientIpFromHeaders(request.headers),
    userAgent: request.headers.get("user-agent"),
    secret,
  });

  const verification = verifyLeaseToken(submission.leaseToken, {
    secret,
    now,
    jobId: submission.jobId,
    clientId,
  });
  if (!verification.ok) {
    const status = verification.reason === "expired" ? 409 : 403;
    return NextResponse.json({ error: `lease ${verification.reason}` }, { status });
  }

  const { jobStore } = getCrawlerRuntime();

  let job;
  try {
    job = await jobStore.getJob(submission.jobId);
  } catch {
    return NextResponse.json({ error: "ingest unavailable" }, { status: 503 });
  }
  if (!job) {
    return NextResponse.json({ error: "unknown job" }, { status: 404 });
  }

  // A signed token is necessary but not sufficient: the job must still be
  // held by this client. Otherwise a client that sat on an unexpired token
  // could clobber a fresher read from whoever holds the lease now.
  if (job.leasedBy !== clientId) {
    return NextResponse.json({ error: "lease no longer held" }, { status: 409 });
  }
  if (job.leasedUntil && Date.parse(job.leasedUntil) < now.getTime()) {
    return NextResponse.json({ error: "lease expired" }, { status: 409 });
  }

  const fetchedAt = clampFetchedAt(submission.fetchedAt, now);

  if (!submission.ok) {
    const result = await recordFetchFailure(
      job,
      submission.error ?? "client reported failure",
      "browser",
      { now },
    );
    return NextResponse.json(
      { ...result, nextDelayMs: suggestNextDelayMs(1) },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  let result;
  try {
    result = await ingestHtml(
      { job, html: submission.html as string, fetchedAt, source: "browser" },
      { now },
    );
  } catch {
    // The pipeline already closes out the job on every branch it controls; a
    // throw here means the store itself failed, which is not the client's
    // problem and must not leak internals.
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }

  // A seat can only open when an ingest writes a new reading, so this is the
  // moment to look. Fired detached and throttled — the visitor's browser is
  // waiting on this response and must never wait on our mail. See
  // lib/alerts/trigger.ts for why the sweep no longer rides a timer.
  triggerAlertSweep({ recordsWritten: result.recordsWritten });

  return NextResponse.json(
    { ...result, nextDelayMs: suggestNextDelayMs(1) },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
