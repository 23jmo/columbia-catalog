/**
 * Hover enrollment chart — a lone reading and a flat heartbeat run both plot.
 *
 * The empty state used to wait for the count to move because snapshots were
 * change-only. Heartbeats broke that: "still 42" is a look, so one point is
 * enough to draw.
 */

import { describe, expect, it } from "vitest";

import { buildEnrollmentAreaModel, niceCeiling } from "./enrollment-area-model";

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse("2026-08-24T12:00:00Z");

describe("buildEnrollmentAreaModel", () => {
  it("returns null only when there are no looks", () => {
    expect(buildEnrollmentAreaModel([], 80)).toBeNull();
  });

  it("plots a single reading instead of waiting for the count to move", () => {
    const model = buildEnrollmentAreaModel([{ t: T0, enrolled: 42 }], 80);
    expect(model).not.toBeNull();
    expect(model?.sorted).toHaveLength(1);
    expect(model?.delta).toBe(0);
    // Hold-tail past the look so the current level is a segment, not a point.
    expect(model?.drawn).toHaveLength(2);
    expect(model?.drawn[1].enrolled).toBe(42);
    expect(model?.drawn[1].t).toBeGreaterThan(T0);
  });

  it("plots a flat heartbeat run with a zero delta", () => {
    const model = buildEnrollmentAreaModel(
      [
        { t: T0, enrolled: 42 },
        { t: T0 + HOUR, enrolled: 42 },
        { t: T0 + 2 * HOUR, enrolled: 42 },
      ],
      80,
    );
    expect(model?.sorted).toHaveLength(3);
    expect(model?.delta).toBe(0);
    expect(model?.last.enrolled).toBe(42);
  });

  it("still reports a rise across looks that actually moved", () => {
    const model = buildEnrollmentAreaModel(
      [
        { t: T0, enrolled: 12 },
        { t: T0 + HOUR, enrolled: 40 },
      ],
      80,
    );
    expect(model?.delta).toBe(28);
    expect(model?.last.enrolled).toBe(40);
  });
});

describe("niceCeiling", () => {
  it("rounds a lecture peak to a readable tick", () => {
    expect(niceCeiling(86 * 1.08)).toBe(100);
  });
});
