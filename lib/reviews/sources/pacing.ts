/**
 * Columbia Catalog — shared pacing primitives for review-source adapters.
 *
 * Every review source we touch belongs to somebody else: CULPA is a small
 * student-run site running on a student-run budget, and Reddit meters us by
 * OAuth token. Neither is a resource we are entitled to consume quickly.
 *
 * Pacing is therefore built into the adapter, not bolted on by the caller. A
 * caller cannot forget to rate-limit, because the only way to issue a request
 * is through a `Pacer`.
 *
 * Three independent ceilings, all enforced:
 *   1. a minimum interval between consecutive requests (plus jitter, so we do
 *      not produce a machine-perfect metronome in someone's access log);
 *   2. a hard budget of requests per adapter run, so a bug in a loop cannot
 *      turn into a crawl;
 *   3. a rolling hourly ceiling, so repeated runs cannot defeat (2).
 *
 * When a budget is exhausted the pacer returns `false` rather than throwing.
 * Adapters stop and report a warning; partial data is always better than an
 * exception thrown into an ingest worker.
 */

export interface PacingPolicy {
  /** Minimum milliseconds between the start of consecutive requests. */
  minIntervalMs: number;
  /** Uniform random jitter added on top of `minIntervalMs`, in ms. */
  jitterMs: number;
  /** Hard ceiling on requests issued by a single adapter run. */
  maxRequestsPerRun: number;
  /** Rolling ceiling across all runs sharing this pacer, per hour. */
  maxRequestsPerHour: number;
}

/** Injected so tests never actually sleep. */
export type SleepFn = (ms: number) => Promise<void>;

/** Injected so tests can drive the rolling window deterministically. */
export type NowFn = () => number;

const realSleep: SleepFn = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const HOUR_MS = 60 * 60 * 1000;

export interface PacerOptions {
  sleep?: SleepFn;
  now?: NowFn;
  /** Deterministic randomness for jitter; defaults to `Math.random`. */
  random?: () => number;
}

export class Pacer {
  private readonly policy: PacingPolicy;
  private readonly sleep: SleepFn;
  private readonly now: NowFn;
  private readonly random: () => number;

  private requestsThisRun = 0;
  private lastRequestAt: number | null = null;
  /** Timestamps of recent requests, pruned to the last hour. */
  private readonly recentRequestTimes: number[] = [];

  constructor(policy: PacingPolicy, options: PacerOptions = {}) {
    this.policy = policy;
    this.sleep = options.sleep ?? realSleep;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  /** Requests issued since the last `resetRun()`. */
  get issuedThisRun(): number {
    return this.requestsThisRun;
  }

  /** Call between logical runs so `maxRequestsPerRun` applies per run. */
  resetRun(): void {
    this.requestsThisRun = 0;
  }

  /**
   * Reserve one request slot, sleeping as long as the policy demands.
   *
   * @returns `true` when the caller may proceed, `false` when a budget is
   *   exhausted. Never throws.
   */
  async acquire(): Promise<boolean> {
    if (this.requestsThisRun >= this.policy.maxRequestsPerRun) return false;

    this.pruneWindow();
    if (this.recentRequestTimes.length >= this.policy.maxRequestsPerHour) return false;

    const waitMs = this.millisecondsUntilNextSlot();
    if (waitMs > 0) await this.sleep(waitMs);

    const issuedAt = this.now();
    this.requestsThisRun += 1;
    this.lastRequestAt = issuedAt;
    this.recentRequestTimes.push(issuedAt);
    return true;
  }

  /** Why `acquire()` would refuse right now, for warning messages. */
  exhaustionReason(): string | null {
    if (this.requestsThisRun >= this.policy.maxRequestsPerRun) {
      return `per-run request budget of ${this.policy.maxRequestsPerRun} exhausted`;
    }
    this.pruneWindow();
    if (this.recentRequestTimes.length >= this.policy.maxRequestsPerHour) {
      return `hourly request budget of ${this.policy.maxRequestsPerHour} exhausted`;
    }
    return null;
  }

  private millisecondsUntilNextSlot(): number {
    if (this.lastRequestAt === null) return 0;
    const jitter = Math.floor(this.random() * Math.max(0, this.policy.jitterMs));
    const earliestNext = this.lastRequestAt + this.policy.minIntervalMs + jitter;
    return Math.max(0, earliestNext - this.now());
  }

  private pruneWindow(): void {
    const cutoff = this.now() - HOUR_MS;
    while (this.recentRequestTimes.length > 0 && this.recentRequestTimes[0] < cutoff) {
      this.recentRequestTimes.shift();
    }
  }
}
