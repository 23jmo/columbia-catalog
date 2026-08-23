"use client";

/**
 * Columbia Catalog — the browser-side refresh worker.
 *
 * Mount `<RefreshWorker />` once in the shell. On idle it asks the server for
 * due crawl jobs, fetches those public directory pages from the visitor's own
 * browser (legal cross-origin because `doc.sis.columbia.edu` serves
 * `Access-Control-Allow-Origin: *`), posts the raw HTML back, and sleeps for
 * the server-suggested jittered interval.
 *
 * Non-negotiables, all enforced below:
 *   · Invisible. Renders nothing, no layout, no state the UI can see.
 *   · Never blocks the UI. All work is scheduled through
 *     `requestIdleCallback`, and there is no synchronous work of any size.
 *   · Stops on page hide, resumes on return.
 *   · Hard off switch, three ways: the `enabled` prop, the
 *     `NEXT_PUBLIC_CRAWL_WORKER_DISABLED` env var, and a localStorage key a
 *     visitor (or we, in devtools) can set to opt out permanently.
 *   · Fetches only GET, only `doc.sis.columbia.edu`. The server should never
 *     send anything else, and the worker refuses it if it does.
 *   · Never parses. It moves bytes; the server decides what they mean.
 */

import { useEffect } from "react";

import { DOC_BASE } from "@/lib/constants";

/** Visitors who set this to "off" are never enrolled again. */
export const WORKER_OPT_OUT_KEY = "cc:crawl-worker";

const LEASE_ENDPOINT = "/api/crawl/lease";
const SUBMIT_ENDPOINT = "/api/crawl/submit";

/** Let the page settle before doing anything at all. */
const STARTUP_DELAY_MS = { min: 20_000, max: 45_000 } as const;
/** Fallback when the server declines to suggest one. */
const FALLBACK_DELAY_MS = 5 * 60_000;
/** A page fetch that takes longer than this is not worth waiting on. */
const FETCH_TIMEOUT_MS = 20_000;
/** Cap on what we will read from Columbia and relay back. */
const MAX_HTML_CHARS = 3 * 1024 * 1024;

interface LeasedJob {
  jobId: string;
  url: string;
  leaseToken: string;
}

interface LeaseResponse {
  jobs?: LeasedJob[];
  nextDelayMs?: number;
  betweenJobsMs?: number;
}

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}

/** Resolve when the browser is idle, or immediately on browsers without rIC. */
function whenIdle(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    if (typeof window.requestIdleCallback !== "function") {
      setTimeout(() => resolve(), 0);
      return;
    }
    window.requestIdleCallback(() => resolve(), { timeout: 10_000 });
  });
}

/** The only host a browser worker may touch, checked client-side too. */
function isAllowedTarget(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.origin === new URL(DOC_BASE).origin;
  } catch {
    return false;
  }
}

function optedOut(): boolean {
  try {
    return window.localStorage.getItem(WORKER_OPT_OUT_KEY) === "off";
  } catch {
    // Storage can throw in private modes; treat that as "not opted out" and
    // rely on the other switches.
    return false;
  }
}

/** Do not spend a metered or battery-saving connection on background crawling. */
function connectionIsUnsuitable(): boolean {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  const connection = nav.connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
}

async function postJson(
  endpoint: string,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown | null> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** Fetch one public directory page. GET only, no credentials, ever. */
async function fetchPublicPage(
  url: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; html?: string; error?: string }> {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.any([timeout, signal]),
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const html = await response.text();
    if (html.length > MAX_HTML_CHARS) return { ok: false, error: "response too large" };
    return { ok: true, html };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "fetch failed" };
  }
}

async function runWorkerLoop(signal: AbortSignal): Promise<void> {
  await sleep(randomBetween(STARTUP_DELAY_MS.min, STARTUP_DELAY_MS.max), signal);

  while (!signal.aborted) {
    if (document.visibilityState !== "visible") {
      // Hidden tabs do nothing. The visibility listener restarts the loop.
      return;
    }

    await whenIdle(signal);
    if (signal.aborted) return;

    const lease = (await postJson(LEASE_ENDPOINT, { maxJobs: 3 }, signal)) as LeaseResponse | null;
    const jobs = Array.isArray(lease?.jobs) ? lease.jobs : [];
    const betweenJobsMs = typeof lease?.betweenJobsMs === "number" ? lease.betweenJobsMs : 4_000;

    for (const job of jobs) {
      if (signal.aborted || document.visibilityState !== "visible") return;
      if (!job || typeof job.url !== "string" || typeof job.leaseToken !== "string") continue;
      if (!isAllowedTarget(job.url)) continue;

      const outcome = await fetchPublicPage(job.url, signal);
      if (signal.aborted) return;

      await postJson(
        SUBMIT_ENDPOINT,
        {
          jobId: job.jobId,
          leaseToken: job.leaseToken,
          ok: outcome.ok,
          html: outcome.ok ? outcome.html : undefined,
          error: outcome.ok ? undefined : outcome.error,
          fetchedAt: new Date().toISOString(),
        },
        signal,
      );

      // Randomized gap between our own fetches, so a batch of three does not
      // arrive at Columbia as a burst.
      await sleep(randomBetween(betweenJobsMs * 0.6, betweenJobsMs * 1.4), signal);
    }

    const nextDelayMs =
      typeof lease?.nextDelayMs === "number" && lease.nextDelayMs > 0
        ? lease.nextDelayMs
        : FALLBACK_DELAY_MS;
    await sleep(nextDelayMs, signal);
  }
}

export interface RefreshWorkerProps {
  /** Hard off switch for callers. Defaults to on. */
  enabled?: boolean;
}

/**
 * Invisible. Mount once, near the root of the shell. Rendering it twice is
 * harmless but pointless — the server's per-client hourly cap is shared.
 */
export function RefreshWorker({ enabled = true }: RefreshWorkerProps): null {
  useEffect(() => {
    if (!enabled) return;
    if (process.env.NEXT_PUBLIC_CRAWL_WORKER_DISABLED === "1") return;
    if (typeof window === "undefined") return;
    if (optedOut()) return;
    if (connectionIsUnsuitable()) return;

    let controller = new AbortController();
    let running = false;

    const start = () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      controller = new AbortController();
      void runWorkerLoop(controller.signal).finally(() => {
        running = false;
      });
    };

    const stop = () => {
      controller.abort();
      running = false;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", stop);
    start();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [enabled]);

  return null;
}

export default RefreshWorker;
