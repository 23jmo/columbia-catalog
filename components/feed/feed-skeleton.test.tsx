import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEED_CARD_SLOT, FeedGrid } from "./feed-layout";
import { FeedSkeleton } from "./feed-skeleton";

/**
 * The skeleton exists to hold the feed's place, so every assertion here is
 * really one assertion: does the page look the same the instant the cards
 * land? A skeleton that is close but not identical is worse than no skeleton,
 * because the reader's eye has already committed to a line that then moves.
 *
 * This file has now caught the same bug twice in two different shapes — a
 * column of full-width blocks under a rail, then a rail's chrome under a grid.
 * Both times the fix was to make the skeleton import the live container rather
 * than re-describe it, which is what the first test below actually enforces.
 */
describe("FeedSkeleton", () => {
  const html = renderToStaticMarkup(<FeedSkeleton />);

  it("renders inside the exact container the live feed uses", () => {
    // Not a copy of the class string: the real `<ul>`, rendered, and its class
    // attribute lifted out. If `FeedGrid` changes and the skeleton somehow
    // does not follow, there is nothing left for this to match against.
    const live = renderToStaticMarkup(
      <FeedGrid>
        <li className={FEED_CARD_SLOT} />
      </FeedGrid>,
    );
    const gridClass = live.match(/<ul[^>]*class="([^"]*)"/)?.[1];
    const slotClass = live.match(/<li[^>]*class="([^"]*)"/)?.[1];

    expect(gridClass).toBeTruthy();
    expect(html).toContain(`class="${gridClass}"`);
    expect(html).toContain(`class="${slotClass}"`);
  });

  it("reads down the page in one column, and two from lg", () => {
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("lg:grid-cols-2");
  });

  it("is no longer a rail", () => {
    // The rail is what the owner asked us to stop doing: eleven of twelve
    // recommendations off the right edge behind a guessed-at gesture.
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("snap-mandatory");
    expect(html).not.toContain("w-max");
    expect(html).not.toContain("w-[min(85vw,22rem)]");
  });

  it("renders six card slots, so the first screen is not the whole list", () => {
    const slots = html.match(/<li /g) ?? [];
    expect(slots).toHaveLength(6);
  });

  it("stretches cards so the seat meters land on one line per row", () => {
    // `items-stretch` on the grid, `h-full` on the slot AND on the card: drop
    // any one of the three and `mt-auto` inside the live card has no height to
    // push against, so the meters sit wherever each card's text ended.
    expect(html).toContain("items-stretch");
    expect(html).toContain("flex h-full min-w-0");
    expect(html).toContain("flex h-full w-full flex-col");
  });

  it("leaves room for the reasons, which are the tallest variable block", () => {
    // Between one and three rows per card. Omitting them would understate the
    // card by ~60px and lurch every row down when the feed arrived — the same
    // failure mode as the column-under-a-rail bug, one level in.
    const icons = html.match(/size-4 shrink-0 rounded-sm/g) ?? [];
    expect(icons.length).toBeGreaterThanOrEqual(6);
  });

  it("announces that recommendations are loading", () => {
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading your recommendations"');
  });
});
