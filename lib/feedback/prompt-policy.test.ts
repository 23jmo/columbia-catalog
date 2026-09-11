import { describe, expect, it } from "vitest";

import {
  EMPTY_FEEDBACK_STATE,
  isEligible,
  isQuietRoute,
  MAX_ASKS,
  normalizeFeedbackState,
  SNOOZE_MS,
  VISITS_BEFORE_FIRST_ASK,
  withSettled,
  withShown,
  type FeedbackPromptState,
} from "@/lib/feedback/prompt-policy";

const NOW = 1_800_000_000_000;

/** A reader who has cleared every gate. Each test spoils exactly one. */
function eligibleReader(patch: Partial<FeedbackPromptState> = {}): FeedbackPromptState {
  return {
    visits: VISITS_BEFORE_FIRST_ASK,
    lastShownAt: null,
    shownCount: 0,
    settled: false,
    ...patch,
  };
}

describe("isEligible", () => {
  it("asks a reader who has cleared every gate", () => {
    expect(isEligible(eligibleReader(), NOW)).toBe(true);
  });

  it("never asks a brand-new visitor", () => {
    expect(isEligible(EMPTY_FEEDBACK_STATE, NOW)).toBe(false);
  });

  it("waits for the visit threshold", () => {
    const almost = eligibleReader({ visits: VISITS_BEFORE_FIRST_ASK - 1 });
    expect(isEligible(almost, NOW)).toBe(false);
  });

  it("stops for good once they open the form", () => {
    // `settled` has to outrank a reader who otherwise looks maximally
    // askable — it is the one gate that is a decision rather than a timer.
    expect(isEligible(eligibleReader({ settled: true, visits: 500 }), NOW)).toBe(false);
  });

  it("stops after the lifetime cap", () => {
    const capped = eligibleReader({ shownCount: MAX_ASKS, lastShownAt: NOW - SNOOZE_MS * 10 });
    expect(isEligible(capped, NOW)).toBe(false);
  });

  it("holds the snooze between asks", () => {
    const justAsked = eligibleReader({ shownCount: 1, lastShownAt: NOW - 1 });
    expect(isEligible(justAsked, NOW)).toBe(false);
  });

  it("asks again once the snooze has run out", () => {
    const stale = eligibleReader({ shownCount: 1, lastShownAt: NOW - SNOOZE_MS - 1 });
    expect(isEligible(stale, NOW)).toBe(true);
  });
});

describe("transitions", () => {
  it("showing the card starts the snooze and spends one ask", () => {
    const next = withShown(eligibleReader(), NOW);
    expect(next.lastShownAt).toBe(NOW);
    expect(next.shownCount).toBe(1);
    expect(isEligible(next, NOW)).toBe(false);
  });

  it("three asks reach the cap and stay there forever", () => {
    let state = eligibleReader();
    for (let ask = 0; ask < MAX_ASKS; ask += 1) {
      expect(isEligible(state, NOW + ask * SNOOZE_MS * 2)).toBe(true);
      state = withShown(state, NOW + ask * SNOOZE_MS * 2);
    }
    // A year later, with every timer long expired, it is still finished.
    expect(isEligible(state, NOW + SNOOZE_MS * 100)).toBe(false);
  });

  it("settling is terminal", () => {
    expect(isEligible(withSettled(eligibleReader()), NOW + SNOOZE_MS * 100)).toBe(false);
  });
});

describe("isQuietRoute", () => {
  it("suppresses the flows that have their own ask", () => {
    expect(isQuietRoute("/onboarding")).toBe(true);
    expect(isQuietRoute("/onboarding/transcript")).toBe(true);
    expect(isQuietRoute("/auth/callback")).toBe(true);
    expect(isQuietRoute("/support/thanks")).toBe(true);
  });

  it("leaves the browsing surfaces alone", () => {
    expect(isQuietRoute("/")).toBe(false);
    expect(isQuietRoute("/search")).toBe(false);
    expect(isQuietRoute("/course/COMS4113")).toBe(false);
  });

  it("matches on path segments, not on a bare prefix", () => {
    // `/supported` is not `/support`. A `startsWith` without the boundary
    // would silence a route that has nothing to do with the donate page.
    expect(isQuietRoute("/supported")).toBe(false);
    expect(isQuietRoute("/onboardingx")).toBe(false);
  });
});

describe("normalizeFeedbackState", () => {
  it("treats absent storage as a fresh reader", () => {
    expect(normalizeFeedbackState(null)).toEqual(EMPTY_FEEDBACK_STATE);
    expect(normalizeFeedbackState("garbage")).toEqual(EMPTY_FEEDBACK_STATE);
  });

  it("keeps the field it would be rude to forget", () => {
    // A record whose counters are corrupt still remembers that this reader
    // already answered. Losing `settled` means asking someone who is done.
    const salvaged = normalizeFeedbackState({ settled: true, visits: "lots", shownCount: null });
    expect(salvaged.settled).toBe(true);
    expect(salvaged.visits).toBe(0);
    expect(isEligible(salvaged, NOW)).toBe(false);
  });

  it("floors counters at a whole non-negative number", () => {
    const state = normalizeFeedbackState({ visits: -4, shownCount: 2.7, lastShownAt: NaN });
    expect(state.visits).toBe(0);
    expect(state.shownCount).toBe(2);
    expect(state.lastShownAt).toBeNull();
  });
});
