/**
 * The alert trigger's job is to be cheap and never to be on the critical path.
 * These tests pin exactly that: it decides synchronously, it refuses to start
 * a second sweep while one is running, and it never lets a sweep failure reach
 * the caller.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAlertTrigger, SWEEP_THROTTLE_MS, triggerAlertSweep } from "./trigger";
import type { AlertSweepSummary } from "./sweep";

function summary(): AlertSweepSummary {
  return {
    pending: 0,
    sent: 0,
    failed: 0,
    recorded: 0,
    sections: 0,
    elapsedMs: 0,
    stoppedBecause: "complete",
  };
}

/**
 * Let the detached sweep's promise chain settle, including the `.finally` that
 * clears the in-flight flag. `vi.waitFor` on the mock only proves the sweep was
 * CALLED, which is one tick too early for that.
 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  resetAlertTrigger();
  delete process.env.ALERTS_DISABLED;
});

describe("triggerAlertSweep", () => {
  it("starts a sweep when an ingest actually wrote something", () => {
    const sweep = vi.fn(async () => summary());
    expect(triggerAlertSweep({ recordsWritten: 12, sweep })).toEqual({
      started: true,
      reason: "started",
    });
    expect(sweep).toHaveBeenCalledOnce();
  });

  it("does nothing when the ingest wrote nothing — no rows, no new seats", () => {
    const sweep = vi.fn(async () => summary());
    expect(triggerAlertSweep({ recordsWritten: 0, sweep }).reason).toBe("nothing-written");
    expect(sweep).not.toHaveBeenCalled();
  });

  it("throttles a burst of submissions to one sweep", async () => {
    const sweep = vi.fn(async () => summary());
    const start = 1_000_000;
    expect(triggerAlertSweep({ recordsWritten: 1, now: start, sweep }).started).toBe(true);
    await settle();
    expect(sweep).toHaveBeenCalledOnce();

    expect(triggerAlertSweep({ recordsWritten: 1, now: start + 1_000, sweep }).reason).toBe(
      "throttled",
    );
    expect(sweep).toHaveBeenCalledOnce();
  });

  it("sweeps again once the throttle window has passed", async () => {
    const sweep = vi.fn(async () => summary());
    const start = 1_000_000;
    triggerAlertSweep({ recordsWritten: 1, now: start, sweep });
    await settle();
    expect(sweep).toHaveBeenCalledOnce();

    expect(
      triggerAlertSweep({ recordsWritten: 1, now: start + SWEEP_THROTTLE_MS, sweep }).started,
    ).toBe(true);
    await vi.waitFor(() => expect(sweep).toHaveBeenCalledTimes(2));
  });

  it("will not start a second sweep while one is still running", () => {
    let release!: (value: AlertSweepSummary) => void;
    const sweep = vi.fn(() => new Promise<AlertSweepSummary>((resolve) => (release = resolve)));

    const start = 1_000_000;
    expect(triggerAlertSweep({ recordsWritten: 1, now: start, sweep }).started).toBe(true);
    // Far past the throttle window, so "in-flight" is the only thing that can stop it.
    expect(
      triggerAlertSweep({ recordsWritten: 1, now: start + 10 * SWEEP_THROTTLE_MS, sweep }).reason,
    ).toBe("in-flight");
    release(summary());
  });

  it("swallows a sweep failure rather than surfacing it to the crawl submission", async () => {
    const sweep = vi.fn(async () => {
      throw new Error("resend is down");
    });
    expect(() => triggerAlertSweep({ recordsWritten: 1, sweep })).not.toThrow();
    await settle();
    // And the in-flight flag clears, so the next ingest can retry.
    expect(
      triggerAlertSweep({ recordsWritten: 1, now: Date.now() + SWEEP_THROTTLE_MS, sweep }).started,
    ).toBe(true);
  });

  it("respects the ALERTS_DISABLED kill switch", () => {
    process.env.ALERTS_DISABLED = "1";
    const sweep = vi.fn(async () => summary());
    expect(triggerAlertSweep({ recordsWritten: 5, sweep }).reason).toBe("disabled");
    expect(sweep).not.toHaveBeenCalled();
  });
});
