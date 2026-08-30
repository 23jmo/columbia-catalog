import { describe, expect, it } from "vitest";

import { RAIL_FLICK_PX_S, RAIL_PX, clampRail, railSnap } from "./rail-swipe";

describe("railSnap", () => {
  it("opens on a slow drag past the midpoint", () => {
    expect(railSnap(RAIL_PX * 0.5, 0)).toBe(true);
  });

  it("closes on a slow drag that never reached the gate", () => {
    expect(railSnap(RAIL_PX * 0.2, 0)).toBe(false);
  });

  it("opens on a fast flick even when short", () => {
    expect(railSnap(24, RAIL_FLICK_PX_S)).toBe(true);
  });

  it("closes on a fast flick back even when far open", () => {
    expect(railSnap(RAIL_PX * 0.8, -RAIL_FLICK_PX_S)).toBe(false);
  });
});

describe("clampRail", () => {
  it("stays inside 0..rail", () => {
    expect(clampRail(-40)).toBe(0);
    expect(clampRail(RAIL_PX + 40)).toBe(RAIL_PX);
    expect(clampRail(80)).toBe(80);
  });
});
