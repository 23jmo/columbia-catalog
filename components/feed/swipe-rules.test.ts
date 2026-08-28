import { describe, expect, it } from "vitest";

import {
  COMMIT_PX,
  COMMIT_VELOCITY,
  DISCARDS_BEFORE_REFINE,
  SAVES_BEFORE_HANDOFF,
  milestoneFor,
  shouldRerank,
  swipeVerdict,
} from "./swipe-rules";

/**
 * The failure this file exists to catch is not "the swipe does not work" —
 * that one is obvious the first time anyone touches the page. It is the
 * opposite: a swipe that fires when the student was scrolling. That bug is
 * invisible in a screenshot, silent in a typecheck, and shows up as a course
 * quietly vanishing from a list nobody was swiping.
 */
describe("swipeVerdict", () => {
  it("springs back on a gesture that is neither far nor fast", () => {
    expect(swipeVerdict(40, 100)).toBeNull();
    expect(swipeVerdict(-40, -100)).toBeNull();
  });

  it("ignores a vertical scroll that drifts sideways", () => {
    // What a thumb does on a phone: a lot of y, a little x, no x speed.
    expect(swipeVerdict(12, 8)).toBeNull();
    expect(swipeVerdict(-9, -20)).toBeNull();
  });

  it("commits on distance alone, however slowly", () => {
    expect(swipeVerdict(COMMIT_PX, 0)).toBe("saved");
    expect(swipeVerdict(-COMMIT_PX, 0)).toBe("discarded");
  });

  it("commits on a flick that never travels the distance", () => {
    // The gesture everybody already knows. Requiring the full 96px here would
    // make the deliberate drag the only one that works, which is backwards.
    expect(swipeVerdict(30, COMMIT_VELOCITY)).toBe("saved");
    expect(swipeVerdict(-30, -COMMIT_VELOCITY)).toBe("discarded");
  });

  it("takes its direction from the offset, not the velocity", () => {
    // A flick can end with the pointer already travelling back the other way.
    // The card still goes where it was thrown.
    expect(swipeVerdict(120, -600)).toBe("saved");
    expect(swipeVerdict(-120, 600)).toBe("discarded");
  });

  it("has nothing to commit to at exactly zero", () => {
    expect(swipeVerdict(0, 5000)).toBeNull();
  });
});

describe("milestoneFor", () => {
  const nothingFired = { handoff: false, refine: false };

  it("stays quiet below the thresholds", () => {
    expect(
      milestoneFor("saved", { saved: SAVES_BEFORE_HANDOFF - 1, discarded: 0 }, nothingFired),
    ).toBeNull();
    expect(
      milestoneFor(
        "discarded",
        { saved: 0, discarded: DISCARDS_BEFORE_REFINE - 1 },
        nothingFired,
      ),
    ).toBeNull();
  });

  it("offers the Vergil handoff on the third save", () => {
    expect(
      milestoneFor("saved", { saved: SAVES_BEFORE_HANDOFF, discarded: 0 }, nothingFired),
    ).toBe("handoff");
  });

  it("offers the chat on the second discard", () => {
    expect(
      milestoneFor("discarded", { saved: 0, discarded: DISCARDS_BEFORE_REFINE }, nothingFired),
    ).toBe("refine");
  });

  it("never repeats a prompt that has already fired", () => {
    // The one that turns a suggestion into a nag: without this, every save
    // past the third re-opens the same toast.
    expect(
      milestoneFor("saved", { saved: 9, discarded: 0 }, { handoff: true, refine: false }),
    ).toBeNull();
    expect(
      milestoneFor("discarded", { saved: 0, discarded: 9 }, { handoff: false, refine: true }),
    ).toBeNull();
  });

  it("keeps the two tallies apart", () => {
    // Discarding six courses must not congratulate anyone on a shortlist.
    expect(milestoneFor("discarded", { saved: 0, discarded: 6 }, nothingFired)).toBe("refine");
    expect(milestoneFor("saved", { saved: 1, discarded: 6 }, nothingFired)).toBeNull();
  });
});

describe("shouldRerank", () => {
  it("rebuilds on every Nth discard, not just the first N", () => {
    expect(shouldRerank("discarded", { saved: 0, discarded: 1 })).toBe(false);
    expect(shouldRerank("discarded", { saved: 0, discarded: DISCARDS_BEFORE_REFINE })).toBe(true);
    expect(shouldRerank("discarded", { saved: 0, discarded: DISCARDS_BEFORE_REFINE + 1 })).toBe(
      false,
    );
    expect(shouldRerank("discarded", { saved: 0, discarded: DISCARDS_BEFORE_REFINE * 2 })).toBe(
      true,
    );
  });

  it("never rebuilds on a save", () => {
    // Saving is a keep, not a taste signal about the rest of the list.
    expect(shouldRerank("saved", { saved: 2, discarded: 2 })).toBe(false);
  });
});
