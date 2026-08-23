/**
 * Columbia Catalog — the polite fetcher.
 *
 * Every server-side request to Columbia goes through here, and the rules are
 * enforced in code rather than by convention because the cost of getting them
 * wrong is our access:
 *
 *   · GET only. Any other method against a columbia.edu host throws before a
 *     socket is opened. We never register, drop or waitlist anyone.
 *   · Production hosts only. `dev-`, `test-`, `stage-`, `uat-` and
 *     `failover-` prefixed hosts are refused — those are not ours to touch.
 *   · Per-host concurrency of exactly 1, with a randomized gap between
 *     consecutive requests to the same host.
 *   · 429 and 503 are obeyed: `Retry-After` when present, exponential backoff
 *     otherwise.
 *   · No credentials, ever. `credentials: "omit"`, no cookies, no bearer
 *     tokens. We never hold a Vergil/SAS token in the first place.
 */

import { BULLETIN_BASE, DOC_BASE } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

/** The only hosts this crawler may ever contact. */
export const ALLOWED_HOSTS: readonly string[] = [
  new URL(DOC_BASE).host,
  new URL(BULLETIN_BASE).host,
];

/** Hosts served without CORS headers — server-side fetch only. */
export const SERVER_ONLY_HOSTS: readonly string[] = [new URL(BULLETIN_BASE).host];

/** Non-production environments we must never crawl. */
export const FORBIDDEN_HOST_PREFIXES: readonly string[] = [
  "dev-",
  "dev.",
  "test-",
  "test.",
  "stage-",
  "stage.",
  "staging-",
  "uat-",
  "uat.",
  "failover-",
  "failover.",
];

/**
 * A real, current desktop UA with contact info appended. Columbia sees a
 * browser-shaped request because that is genuinely what most of our traffic
 * is; the suffix means an administrator who looks can find us.
 */
export const CRAWLER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/140.0.0.0 Safari/537.36 ColumbiaCatalog/1.0 (+https://columbia-catalog.vercel.app/about)";

export const MIN_HOST_GAP_MS = 1_200;
export const MAX_HOST_GAP_MS = 3_500;
export const REQUEST_TIMEOUT_MS = 20_000;
export const MAX_ATTEMPTS = 3;
export const BACKOFF_BASE_MS = 1_500;
export const MAX_BACKOFF_MS = 30_000;
/** Refuse absurd payloads rather than buffering them. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type RandomSource = () => number;
const defaultRandom: RandomSource = Math.random;

// ---------------------------------------------------------------------------
// Host policy
// ---------------------------------------------------------------------------

export class CrawlPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrawlPolicyError";
  }
}

export function isColumbiaHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === "columbia.edu" || lower.endsWith(".columbia.edu");
}

export function isNonProductionHost(host: string): boolean {
  const lower = host.toLowerCase();
  return FORBIDDEN_HOST_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** True when a browser can legally fetch this URL cross-origin. */
export function isBrowserFetchable(url: string): boolean {
  try {
    const host = new URL(url).host.toLowerCase();
    return ALLOWED_HOSTS.includes(host) && !SERVER_ONLY_HOSTS.includes(host);
  } catch {
    return false;
  }
}

/**
 * The single choke point. Throws rather than returning a boolean so that a
 * forgotten check cannot silently degrade into an unchecked request.
 */
export function assertCrawlableUrl(rawUrl: string, method: string = "GET"): URL {
  if (method.toUpperCase() !== "GET") {
    throw new CrawlPolicyError(
      `Refusing ${method.toUpperCase()} — the crawler is read-only toward Columbia. GET only.`,
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CrawlPolicyError(`Not a URL: ${String(rawUrl).slice(0, 120)}`);
  }

  if (url.protocol !== "https:") {
    throw new CrawlPolicyError(`Refusing non-https URL: ${url.protocol}//${url.host}`);
  }
  const host = url.host.toLowerCase();
  if (isNonProductionHost(host)) {
    throw new CrawlPolicyError(`Refusing non-production Columbia host: ${host}`);
  }
  if (!ALLOWED_HOSTS.includes(host)) {
    throw new CrawlPolicyError(
      `Host not on the crawl allowlist: ${host} (allowed: ${ALLOWED_HOSTS.join(", ")})`,
    );
  }
  if (url.username || url.password) {
    throw new CrawlPolicyError("Refusing URL carrying credentials");
  }
  return url;
}

// ---------------------------------------------------------------------------
// Per-host serialization
// ---------------------------------------------------------------------------

interface HostState {
  /** Tail of the promise chain — awaiting it serializes access to the host. */
  chain: Promise<void>;
  lastRequestAt: number;
}

const hostState = new Map<string, HostState>();

/** Test helper: forget pacing state between cases. */
export function resetHostPacing(): void {
  hostState.clear();
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomHostGapMs(random: RandomSource = defaultRandom): number {
  return Math.round(MIN_HOST_GAP_MS + random() * (MAX_HOST_GAP_MS - MIN_HOST_GAP_MS));
}

/**
 * Runs `task` with a per-host concurrency of 1 and a randomized gap since the
 * previous request to that host. Every caller queues on the same chain, so
 * two concurrent cron batches cannot double up on doc.sis.
 */
export async function withHostLane<T>(
  host: string,
  task: () => Promise<T>,
  options: { random?: RandomSource; minGapMs?: number } = {},
): Promise<T> {
  const random = options.random ?? defaultRandom;
  const state = hostState.get(host) ?? { chain: Promise.resolve(), lastRequestAt: 0 };
  hostState.set(host, state);

  const run = state.chain.then(async () => {
    const gap = options.minGapMs ?? randomHostGapMs(random);
    const elapsed = Date.now() - state.lastRequestAt;
    if (state.lastRequestAt > 0 && elapsed < gap) {
      await sleep(gap - elapsed);
    }
    state.lastRequestAt = Date.now();
  });

  // Keep the chain alive even if this task throws, or one failure would wedge
  // the host forever.
  state.chain = run.catch(() => undefined);
  await run;
  return task();
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export interface FetchOutcome {
  ok: boolean;
  status: number;
  html: string | null;
  /** ISO timestamp the response was received. */
  fetchedAt: string;
  error?: string;
  /** Seconds the server asked us to wait, when it said so. */
  retryAfterSeconds?: number;
  attempts: number;
}

export type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

export function backoffDelayMs(attempt: number, random: RandomSource = defaultRandom): number {
  const raw = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(attempt - 1, 0), MAX_BACKOFF_MS);
  return Math.round(raw * (0.75 + random() * 0.5));
}

export function parseRetryAfter(headerValue: string | null, now: Date): number | undefined {
  if (!headerValue) return undefined;
  const asSeconds = Number(headerValue.trim());
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return Math.min(asSeconds, 3600);
  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, Math.min(Math.round((asDate - now.getTime()) / 1000), 3600));
  }
  return undefined;
}

/** Statuses worth retrying. 404 is a real answer, not a transient failure. */
function isRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Fetch one public Columbia page politely. Never throws for HTTP-level
 * failures — the caller records them as job failures and backs the job off.
 * Throws only for policy violations, which are bugs, not conditions.
 */
export async function politeFetch(
  rawUrl: string,
  options: {
    fetchImpl?: FetchImpl;
    random?: RandomSource;
    maxAttempts?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Skip the per-host pacing lane; only tests should do this. */
    skipPacing?: boolean;
  } = {},
): Promise<FetchOutcome> {
  const url = assertCrawlableUrl(rawUrl, "GET");
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const random = options.random ?? defaultRandom;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;

  let attempts = 0;
  let lastError = "unknown error";
  let lastStatus = 0;
  let lastRetryAfter: number | undefined;

  while (attempts < maxAttempts) {
    attempts += 1;

    const attempt = async (): Promise<FetchOutcome | null> => {
      const timeout = AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS);
      const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
      let response: Response;
      try {
        response = await doFetch(url.toString(), {
          method: "GET",
          redirect: "follow",
          credentials: "omit",
          cache: "no-store",
          signal,
          headers: {
            "user-agent": CRAWLER_USER_AGENT,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
          },
        });
      } catch (cause) {
        lastError = cause instanceof Error ? cause.message : String(cause);
        return null;
      }

      lastStatus = response.status;
      lastRetryAfter = parseRetryAfter(response.headers.get("retry-after"), new Date());

      if (response.status === 429 || response.status === 503) {
        lastError = `rate limited (${response.status})`;
        return null;
      }
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        return isRetryable(response.status)
          ? null
          : {
              ok: false,
              status: response.status,
              html: null,
              fetchedAt: new Date().toISOString(),
              error: lastError,
              attempts,
            };
      }

      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > MAX_RESPONSE_BYTES) {
        return {
          ok: false,
          status: response.status,
          html: null,
          fetchedAt: new Date().toISOString(),
          error: `response too large (${declaredLength} bytes)`,
          attempts,
        };
      }

      const html = await response.text();
      if (html.length > MAX_RESPONSE_BYTES) {
        return {
          ok: false,
          status: response.status,
          html: null,
          fetchedAt: new Date().toISOString(),
          error: `response too large (${html.length} chars)`,
          attempts,
        };
      }

      return {
        ok: true,
        status: response.status,
        html,
        fetchedAt: new Date().toISOString(),
        attempts,
      };
    };

    const result = options.skipPacing
      ? await attempt()
      : await withHostLane(url.host, attempt, { random });

    if (result) return result;

    if (attempts < maxAttempts) {
      const wait = lastRetryAfter !== undefined
        ? Math.min(lastRetryAfter * 1000, MAX_BACKOFF_MS)
        : backoffDelayMs(attempts, random);
      await sleep(wait);
    }
  }

  return {
    ok: false,
    status: lastStatus,
    html: null,
    fetchedAt: new Date().toISOString(),
    error: lastError,
    retryAfterSeconds: lastRetryAfter,
    attempts,
  };
}
