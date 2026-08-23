/**
 * POST /api/crawl/lease — hand due jobs to a visitor's browser.
 *
 * Visitor browsers are the primary crawl consumer (spec §10): they can fetch
 * `doc.sis.columbia.edu` cross-origin because it serves
 * `Access-Control-Allow-Origin: *`, and their traffic is indistinguishable
 * from students browsing the directory, because it largely is.
 *
 * Everything this route hands out is rate-shaped:
 *   · at most MAX_LEASE_BATCH jobs, ever;
 *   · a per-client hourly ceiling of CLIENT_HOURLY_JOB_CAP jobs;
 *   · a randomized delay the worker is asked to sleep before returning.
 *
 * Bulletin jobs are never leased to a browser: `bulletin.columbia.edu` sends
 * no CORS header, so the fetch would fail — and a client that "succeeds"
 * anyway is lying. Those stay server-side.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_LEASE_BATCH } from "@/lib/constants";
import { getCrawlerRuntime, tryGetCrawlerRuntime } from "@/lib/crawler/contracts";
import { isBrowserFetchable } from "@/lib/crawler/fetcher";
import {
  checkClientQuota,
  clampLeaseBatch,
  clientIpFromHeaders,
  deriveClientId,
  getLeaseSecret,
  intraBatchDelayMs,
  issueLeaseToken,
  leaseExpiryIso,
  suggestNextDelayMs,
} from "@/lib/crawler/lease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The lease request is tiny; anything larger is not a lease request. */
const MAX_LEASE_BODY_BYTES = 2_048;

const LeaseRequestSchema = z
  .object({
    maxJobs: z.number().int().min(1).max(MAX_LEASE_BATCH).optional(),
  })
  .strict();

/** Kinds a browser is physically able to fetch. */
const BROWSER_KINDS = ["subject_term", "section_detail", "subject_index"] as const;

interface LeasedJobDto {
  jobId: string;
  kind: string;
  targetKey: string;
  termCode: string | null;
  url: string;
  leaseToken: string;
  leaseExpiresAt: string;
}

function idleResponse(reason: string, status = 200) {
  return NextResponse.json(
    { jobs: [] as LeasedJobDto[], nextDelayMs: suggestNextDelayMs(0), reason },
    { status },
  );
}

export async function POST(request: Request): Promise<Response> {
  // Hard off switch — flip the env var and every browser worker goes quiet on
  // its next poll without a deploy.
  if (process.env.CRAWL_WORKER_DISABLED === "1") {
    return idleResponse("worker_disabled");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_LEASE_BODY_BYTES) {
    return NextResponse.json({ error: "request too large" }, { status: 413 });
  }

  let secret: string;
  try {
    secret = getLeaseSecret();
  } catch {
    // Misconfiguration must not take the site down; the worker just idles.
    return idleResponse("lease_secret_unavailable", 503);
  }

  if (!tryGetCrawlerRuntime()) {
    return idleResponse("crawler_runtime_unavailable", 503);
  }

  let body: unknown = {};
  try {
    const raw = await request.text();
    if (raw.length > MAX_LEASE_BODY_BYTES) {
      return NextResponse.json({ error: "request too large" }, { status: 413 });
    }
    body = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = LeaseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const now = new Date();
  const clientId = deriveClientId({
    ip: clientIpFromHeaders(request.headers),
    userAgent: request.headers.get("user-agent"),
    secret,
  });
  const requested = clampLeaseBatch(parsed.data.maxJobs);

  const { jobStore } = getCrawlerRuntime();

  let quota;
  try {
    quota = await checkClientQuota(jobStore, { clientId, now, requested });
  } catch {
    // Fail closed: an unreadable quota means we do not know how much this
    // client has already taken, so it takes nothing.
    return idleResponse("quota_unavailable", 503);
  }

  if (quota.granted <= 0) {
    return NextResponse.json(
      {
        jobs: [] as LeasedJobDto[],
        nextDelayMs: (quota.retryAfterSeconds ?? 900) * 1000,
        reason: "hourly_cap_reached",
      },
      { status: 200, headers: { "retry-after": String(quota.retryAfterSeconds ?? 900) } },
    );
  }

  const leasedUntil = leaseExpiryIso(now);
  let claimed;
  try {
    claimed = await jobStore.claimDueJobs({
      leasedBy: clientId,
      limit: quota.granted,
      leasedUntil,
      dueBefore: now.toISOString(),
      includeKinds: [...BROWSER_KINDS],
      excludeKinds: ["bulletin_department", "academic_calendar"],
      allowedHosts: ["doc.sis.columbia.edu"],
    });
  } catch {
    return idleResponse("claim_failed", 503);
  }

  // Belt and braces: whatever the store returned, refuse to hand a browser a
  // URL it cannot legally fetch cross-origin.
  const fetchable = claimed.filter((job) => isBrowserFetchable(job.url));
  const rejected = claimed.filter((job) => !isBrowserFetchable(job.url));
  await Promise.all(
    rejected.map((job) => jobStore.releaseJob(job.jobId, clientId).catch(() => undefined)),
  );

  if (fetchable.length > 0) {
    try {
      await jobStore.recordClientLease(clientId, fetchable.length, now.toISOString());
    } catch {
      // Not fatal for this request, but the cap is now under-counted for this
      // client; the next poll re-reads the true count from the store.
    }
  }

  const jobs: LeasedJobDto[] = fetchable.map((job) => ({
    jobId: job.jobId,
    kind: job.kind,
    targetKey: job.targetKey,
    termCode: job.termCode,
    url: job.url,
    leaseToken: issueLeaseToken({ jobId: job.jobId, clientId, now, secret }).token,
    leaseExpiresAt: leasedUntil,
  }));

  return NextResponse.json(
    {
      jobs,
      nextDelayMs: suggestNextDelayMs(jobs.length),
      betweenJobsMs: intraBatchDelayMs(),
      remainingThisHour: Math.max(quota.remaining - jobs.length, 0),
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
