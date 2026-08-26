import type { ReactNode } from "react";

import { cx } from "@/utils/cx";

/**
 * Shared chrome for the recommendation grid and its skeleton.
 *
 * ── This was a rail, and the rail was a compromise ─────────────────────────
 *
 * When the feed shared the home page with the assistant's box, a horizontal
 * run was the only honest way to fit it: a rail spends one card-height of
 * vertical space no matter how many cards it holds, so the box stayed on
 * screen. The cost was that eleven of the twelve recommendations lived off the
 * right edge, reachable only by a gesture the reader had to guess at, and the
 * cards had to stay narrow enough to peek the next one — which is why the
 * reason for each recommendation was one clamped grey line.
 *
 * Recommendations are the page now and the box has moved to `/chat`, so the
 * compromise is over. Every card is on the page, in reading order, wide enough
 * to say why it is there.
 *
 * The skeleton and the live grid must use this same container, or the layout
 * jumps when the cards land — the mistake that shipped once when the skeleton
 * kept stacking a column after the feed became a rail.
 */

/**
 * One column, at every width.
 *
 * It was two from `lg`, and two columns are how you show more at once — which
 * is the right goal for a gallery and the wrong one here. These cards are
 * ranked: `assembleFeedCards` sorts by score and caps one per subject, so the
 * card above is a stronger claim than the card below it. Side by side, that
 * ordering becomes a guess about whether you read in Z or in columns, and the
 * top-left and top-right cards look like a tie they are not.
 *
 * One column also gives every card the same measure, so the reason rows, the
 * rating line and the seat meters all start on the same x — a list you scan
 * down a single edge rather than four.
 *
 * The page narrows to match (`app/page.tsx`). A single column inside a 1024px
 * container would be a 1024px-wide seat meter, which is the other way to make
 * a card unreadable.
 */
export function FeedGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      role="list"
      className={cx(
        "grid grid-cols-1 items-stretch gap-3",
        className,
      )}
    >
      {children}
    </ul>
  );
}

/**
 * One card's slot.
 *
 * `h-full` is what lets `FeedCardView`'s own `mt-auto` work. It matters less
 * now that a row holds one card — a row of one is always its own tallest — but
 * it is what the card is written against, and removing it here would put the
 * seat meter back wherever each card's text happened to end the moment anyone
 * tries a second column again.
 */
export const FEED_CARD_SLOT = "flex h-full min-w-0";
