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
 * One column on a phone, two from `lg`.
 *
 * Not three. The card now carries up to three reason rows, a rating line and a
 * seat meter, and at a third of 1180px the reason text wraps to two lines each
 * — which is how a card that explains itself turns back into a card nobody
 * reads. Two columns keeps every row on one line at the widths this app
 * actually renders at.
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
        "grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2",
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
 * `h-full` is what lets `FeedCardView`'s own `mt-auto` work: cards in a grid
 * row stretch to the tallest, and without the `li` filling that height the
 * seat meters sit wherever each card's text happened to end instead of landing
 * on one line across the row.
 */
export const FEED_CARD_SLOT = "flex h-full min-w-0";
