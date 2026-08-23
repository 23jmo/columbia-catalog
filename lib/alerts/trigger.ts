/**
 * Post-ingest alert trigger.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Spec §10's design is "browsers are the engine, cron is the safety net", and
 * that is exactly right for crawling. It turned out to be load-bearing for
 * ALERTS too, for a reason that has nothing to do with architecture: Vercel
 * Hobby refuses any cron that runs more than once a day, and it refuses it at
 * deploy time rather than quietly coercing the schedule. A seat-opened email
 * that arrives up to 24 hours late is not a late email, it is a missed class.
 *
 * So the sweep stops depending on the timer. A seat can only open when an
 * ingest writes a new reading, and every ingest already lands here — from the
 * browser worker or from the cron, it makes no difference. Running the sweep
 * as a consequence of the data changing is strictly better than running it on
 * a clock: it cannot fire early, it cannot be late by more than one crawl
 * interval, and a quiet catalog costs nothing.
 *
 * ── Why it is throttled and not awaited ────────────────────────────────────
 *
 * `/api/crawl/submit` is the hottest route we have and the visitor's browser
 * is blocked on its response. The sweep must never be on that critical path,
 * so it is fired without `await` and the handler returns immediately.
 *
 * The throttle is per-instance and in-memory, which is the right shape for
 * what it is guarding against: one Fluid Compute instance handling a burst of
 * submissions and starting a sweep for each. It is not a distributed lock and
 * does not need to be — `runAlertSweep` dedupes in `alerts_sent` keyed on the
 * exact transition timestamp, so two concurrent sweeps send one email between
 * them, not two. The throttle saves queries, not correctness.
 */

import { runAlertSweep } from "./sweep";

/**
 * Minimum gap between sweeps started by this instance.
 *
 * Matches the hot-tier crawl interval from spec §10: a section watched closely
 * enough to matter is re-read every two minutes, so sweeping faster than that
 * can only find what the previous sweep already found.
 */
export const SWEEP_THROTTLE_MS = 2 * 60_000;

/** Shorter than the route's own budget — this runs alongside a live request. */
const TRIGGERED_SWEEP_DEADLINE_MS = 20_000;

let lastSweepStartedAt = 0;
let inFlight = false;

/** Test seam. Resets the instance-local throttle. */
export function resetAlertTrigger(): void {
  lastSweepStartedAt = 0;
  inFlight = false;
}

export interface TriggerDecision {
  started: boolean;
  reason: "started" | "throttled" | "in-flight" | "nothing-written" | "disabled";
}

export interface TriggerOptions {
  /** Rows the ingest actually wrote. Zero means nothing can have changed. */
  recordsWritten: number;
  now?: number;
  /** Test seam. Defaults to the real sweep. */
  sweep?: typeof runAlertSweep;
}

/**
 * Start a sweep if this ingest could plausibly have opened a seat.
 *
 * Returns synchronously; the sweep itself runs detached. A failure is
 * swallowed rather than surfaced, because the caller is a crawl submission and
 * a mail problem is not its problem — the next ingest tries again, and the
 * daily cron remains as the floor.
 */
export function triggerAlertSweep(options: TriggerOptions): TriggerDecision {
  if (process.env.ALERTS_DISABLED === "1") return { started: false, reason: "disabled" };
  if (options.recordsWritten <= 0) return { started: false, reason: "nothing-written" };
  if (inFlight) return { started: false, reason: "in-flight" };

  const now = options.now ?? Date.now();
  if (now - lastSweepStartedAt < SWEEP_THROTTLE_MS) {
    return { started: false, reason: "throttled" };
  }

  lastSweepStartedAt = now;
  inFlight = true;
  const sweep = options.sweep ?? runAlertSweep;

  void sweep({ deadlineMs: TRIGGERED_SWEEP_DEADLINE_MS })
    .catch(() => {
      // Deliberately silent. See the header: the daily cron is the floor and
      // the next ingest is the retry.
    })
    .finally(() => {
      inFlight = false;
    });

  return { started: true, reason: "started" };
}
