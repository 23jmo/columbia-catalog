import { describe, expect, it } from "vitest";

import { measureScrollMargin } from "./scroll-parent";

/**
 * `measureScrollMargin` is the offset math the virtualizer needs when the
 * list does not start at the top of its scroller. Pure geometry — stub the
 * two rects and the scrollTop and check the sum.
 */
describe("measureScrollMargin", () => {
  it("adds scrollTop to the list's offset inside the scroller", () => {
    const scrollParent = {
      getBoundingClientRect: () => ({ top: 100 }),
      scrollTop: 40,
    } as HTMLElement;
    const list = {
      getBoundingClientRect: () => ({ top: 220 }),
    } as HTMLElement;

    // list is 120px below the scroller's visible top, plus 40 already scrolled
    expect(measureScrollMargin(list, scrollParent)).toBe(160);
  });
});
