/**
 * Columbia Catalog — job leasing.
 *
 * ---------------------------------------------------------------------------
 * THREAT MODEL
 * ---------------------------------------------------------------------------
 * `/api/crawl/submit` accepts HTML from anonymous browsers. Nothing about the
 * submitter is trustworthy. The lease token is the only thing that binds a
 * submission to work the server actually handed out:
 *
 *   · The payload is signed with HMAC-SHA256 over a server-only secret, so a
 *     client cannot mint a token for a job it does not hold.
 *   · The payload names the job id AND the client id, so one client cannot
 *     replay another client's token.
 *   · The payload carries its own expiry (LEASE_SECONDS), so a stale token
 *     cannot be used after the job has returned to the pool and possibly been
 *     re-leased to someone else.
 *
 * The token proves *authorisation to submit*, never *correctness of content*.
 * Content is still parsed server-side and still passes the quarantine guard.
 *
 * ---------------------------------------------------------------------------
 * PACING
 * ---------------------------------------------------------------------------
 * Job targeting is purely by staleness and deliberately ignores what the
 * visitor is viewing (spec §10). That makes the traffic pattern the thing to
 * manage, so three mitigations are implemented here:
 *
 *   1. Leases capped at MAX_LEASE_BATCH (1–3) jobs per request.
 *   2. A randomized, cap-derived delay returned with every lease.
 *   3. A per-client hourly ceiling of CLIENT_HOURLY_JOB_CAP jobs.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { CLIENT_HOURLY_JOB_CAP, LEASE_SECONDS, MAX_LEASE_BATCH } from "@/lib/constants";
import type { CrawlJobStore } from "./contracts";

// ---------------------------------------------------------------------------
// Local tuning constants
// ---------------------------------------------------------------------------

/** Token version prefix. Bump to invalidate every outstanding lease at once. */
export const LEASE_TOKEN_VERSION = "v1";

/** Clock skew allowance when checking expiry, in milliseconds. */
export const LEASE_CLOCK_SKEW_MS = 5_000;

/** Never suggest a delay shorter than this, whatever the arithmetic says. */
export const MIN_SUGGESTED_DELAY_MS = 20_000;
/** Nor longer than this, or an idle tab never comes back. */
export const MAX_SUGGESTED_DELAY_MS = 15 * 60_000;
/** How long to wait when the queue had nothing due. */
export const IDLE_POLL_DELAY_MS = 5 * 60_000;
/** Fraction of the computed delay used as ± jitter. */
export const DELAY_JITTER = 0.4;
/** Delay a browser worker inserts between its own 1–3 fetches. */
export const INTRA_BATCH_DELAY_MS = { min: 2_000, max: 6_000 } as const;

export type RandomSource = () => number;
const defaultRandom: RandomSource = Math.random;

// ---------------------------------------------------------------------------
// Secret
// ---------------------------------------------------------------------------

/** Rejects short secrets outright — a 6-character HMAC key is not a key. */
export function getLeaseSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.CRAWL_LEASE_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "CRAWL_LEASE_SECRET is missing or too short (need >= 16 chars). " +
        "Lease tokens cannot be signed without it.",
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export interface LeaseTokenPayload {
  jobId: string;
  clientId: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  /** Random, so two leases of the same job by the same client differ. */
  nonce: string;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

export function signLeaseToken(payload: LeaseTokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const message = `${LEASE_TOKEN_VERSION}.${body}`;
  return `${message}.${hmac(secret, message)}`;
}

/** Mint a token for a job about to be handed to `clientId`. */
export function issueLeaseToken(options: {
  jobId: string;
  clientId: string;
  now: Date;
  secret: string;
  leaseSeconds?: number;
}): { token: string; payload: LeaseTokenPayload } {
  const payload: LeaseTokenPayload = {
    jobId: options.jobId,
    clientId: options.clientId,
    expiresAt: options.now.getTime() + (options.leaseSeconds ?? LEASE_SECONDS) * 1000,
    nonce: randomBytes(9).toString("base64url"),
  };
  return { token: signLeaseToken(payload, options.secret), payload };
}

export type LeaseVerification =
  | { ok: true; payload: LeaseTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "job_mismatch" | "client_mismatch" };

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies signature first, then expiry, then binding. Signature is checked in
 * constant time and before anything in the payload is trusted.
 */
export function verifyLeaseToken(
  token: string,
  options: { secret: string; now: Date; jobId?: string; clientId?: string },
): LeaseVerification {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [version, body, signature] = parts;
  if (version !== LEASE_TOKEN_VERSION) return { ok: false, reason: "malformed" };

  const expected = hmac(options.secret, `${version}.${body}`);
  if (!safeEqual(signature, expected)) return { ok: false, reason: "bad_signature" };

  let payload: LeaseTokenPayload;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof (decoded as LeaseTokenPayload).jobId !== "string" ||
      typeof (decoded as LeaseTokenPayload).clientId !== "string" ||
      typeof (decoded as LeaseTokenPayload).expiresAt !== "number"
    ) {
      return { ok: false, reason: "malformed" };
    }
    payload = decoded as LeaseTokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.expiresAt + LEASE_CLOCK_SKEW_MS < options.now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (options.jobId !== undefined && payload.jobId !== options.jobId) {
    return { ok: false, reason: "job_mismatch" };
  }
  if (options.clientId !== undefined && payload.clientId !== options.clientId) {
    return { ok: false, reason: "client_mismatch" };
  }
  return { ok: true, payload };
}

// ---------------------------------------------------------------------------
// Client identity
// ---------------------------------------------------------------------------

/**
 * The client id is derived server-side from request metadata and the lease
 * secret. A client-supplied identifier would make the hourly cap trivially
 * evadable by rotating a UUID; deriving it means a browser has to actually
 * change network address to reset its budget.
 */
export function deriveClientId(input: {
  ip: string | null;
  userAgent: string | null;
  secret: string;
}): string {
  const material = `${input.ip ?? "unknown-ip"}|${(input.userAgent ?? "unknown-ua").slice(0, 180)}`;
  return createHmac("sha256", input.secret).update(material).digest("base64url").slice(0, 32);
}

/** Best-effort client address behind Vercel's proxy. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip");
}

// ---------------------------------------------------------------------------
// Batch sizing and pacing
// ---------------------------------------------------------------------------

/** Clamp a client's request into [1, MAX_LEASE_BATCH]. */
export function clampLeaseBatch(requested: number | undefined): number {
  if (!Number.isFinite(requested ?? NaN)) return 1;
  const asInt = Math.floor(requested as number);
  if (asInt < 1) return 1;
  return Math.min(asInt, MAX_LEASE_BATCH);
}

function jitter(valueMs: number, random: RandomSource): number {
  const factor = 1 - DELAY_JITTER + random() * (2 * DELAY_JITTER);
  return Math.round(valueMs * factor);
}

/**
 * The suggested sleep before a worker asks again. Derived from the hourly cap
 * so that a worker following the suggestion naturally lands just under it:
 * `jobsGranted × (3600s / CLIENT_HOURLY_JOB_CAP)`, jittered ±DELAY_JITTER and
 * clamped. Granting zero jobs means the queue is fresh, so back off further.
 */
export function suggestNextDelayMs(
  jobsGranted: number,
  random: RandomSource = defaultRandom,
): number {
  if (jobsGranted <= 0) return jitter(IDLE_POLL_DELAY_MS, random);
  const perJobMs = (3600 / CLIENT_HOURLY_JOB_CAP) * 1000;
  const raw = jobsGranted * perJobMs;
  const jittered = jitter(raw, random);
  return Math.min(Math.max(jittered, MIN_SUGGESTED_DELAY_MS), MAX_SUGGESTED_DELAY_MS);
}

/** Randomized pause a worker takes between the fetches inside one lease. */
export function intraBatchDelayMs(random: RandomSource = defaultRandom): number {
  const { min, max } = INTRA_BATCH_DELAY_MS;
  return Math.round(min + random() * (max - min));
}

// ---------------------------------------------------------------------------
// Hourly ceiling
// ---------------------------------------------------------------------------

export interface QuotaDecision {
  /** How many jobs this client may still be handed right now. */
  granted: number;
  /** Jobs already charged to this client in the trailing hour. */
  used: number;
  remaining: number;
  /** Set when granted === 0. */
  retryAfterSeconds?: number;
}

/**
 * Per-client hourly ceiling. Deliberately fails closed: if the store cannot
 * answer, we grant nothing rather than uncapping the client.
 */
export async function checkClientQuota(
  store: Pick<CrawlJobStore, "countClientJobsSince">,
  options: { clientId: string; now: Date; requested: number; cap?: number },
): Promise<QuotaDecision> {
  const cap = options.cap ?? CLIENT_HOURLY_JOB_CAP;
  const since = new Date(options.now.getTime() - 3600 * 1000).toISOString();
  const used = await store.countClientJobsSince(options.clientId, since);
  const remaining = Math.max(cap - used, 0);
  if (remaining <= 0) {
    return { granted: 0, used, remaining: 0, retryAfterSeconds: 15 * 60 };
  }
  return { granted: Math.min(options.requested, remaining), used, remaining };
}

/** Lease expiry timestamp for a claim made now. */
export function leaseExpiryIso(now: Date, leaseSeconds: number = LEASE_SECONDS): string {
  return new Date(now.getTime() + leaseSeconds * 1000).toISOString();
}
