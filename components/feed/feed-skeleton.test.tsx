import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeedSkeleton } from "./feed-skeleton";

/**
 * The live feed is a snap rail. The skeleton used to stack full-width cards
 * in a column, so the layout jumped when content landed. Keep these assertions
 * on the markup — if the rail chrome moves, the skeleton has to move with it.
 */
describe("FeedSkeleton", () => {
  const html = renderToStaticMarkup(<FeedSkeleton />);

  it("uses the same horizontal snap rail as the live feed", () => {
    expect(html).toContain("snap-x");
    expect(html).toContain("snap-mandatory");
    expect(html).toContain("w-[min(85vw,22rem)]");
  });

  it("lays cards out as a row, not a column", () => {
    expect(html).toContain("flex w-max items-stretch gap-3");
    expect(html).not.toContain("flex flex-col gap-3.5");
  });

  it("renders four card slots so the next card peeks", () => {
    const slots = html.match(/w-\[min\(85vw,22rem\)\]/g) ?? [];
    expect(slots).toHaveLength(4);
  });

  it("announces that recommendations are loading", () => {
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading your recommendations"');
  });

  it("shows a horizontal scrollbar on desktop and hides it below", () => {
    expect(html).toContain("xl:[scrollbar-width:thin]");
    expect(html).toContain("max-xl:[scrollbar-width:none]");
  });
});
