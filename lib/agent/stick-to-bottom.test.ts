import { describe, expect, it } from "vitest";

import {
  countMessagesBelowFold,
  distanceFromBottom,
  isNearBottom,
  moreMessagesLabel,
  NEAR_BOTTOM_PX,
} from "./stick-to-bottom";

describe("distanceFromBottom", () => {
  it("is zero when the viewport is flush with the document end", () => {
    expect(distanceFromBottom(400, 800, 1200)).toBe(0);
  });

  it("does not go negative past the end", () => {
    expect(distanceFromBottom(500, 800, 1200)).toBe(0);
  });

  it("reports how far the student has scrolled up", () => {
    expect(distanceFromBottom(100, 800, 1200)).toBe(300);
  });
});

describe("isNearBottom", () => {
  it("treats the threshold as pinned", () => {
    expect(isNearBottom(NEAR_BOTTOM_PX)).toBe(true);
    expect(isNearBottom(NEAR_BOTTOM_PX + 1)).toBe(false);
  });
});

describe("countMessagesBelowFold", () => {
  it("counts turns whose bottom sits under the composer", () => {
    expect(countMessagesBelowFold([200, 500, 900, 1200], 800)).toBe(2);
  });

  it("counts none when every turn ends above the fold", () => {
    expect(countMessagesBelowFold([100, 400, 700], 800)).toBe(0);
  });
});

describe("moreMessagesLabel", () => {
  it("singular for one, plural otherwise", () => {
    expect(moreMessagesLabel(1)).toBe("1 more message");
    expect(moreMessagesLabel(3)).toBe("3 more messages");
  });

  it("never says zero — the pill is only on screen when there is more", () => {
    expect(moreMessagesLabel(0)).toBe("1 more message");
  });
});
