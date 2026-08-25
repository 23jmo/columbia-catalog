import type { ReactNode } from "react";

import { cx } from "@/utils/cx";

/**
 * Shared rail chrome for the live feed and its skeleton.
 *
 * The skeleton exists so the layout does not jump when the cards land. That
 * only works if both trees use the same scroller — the fade, the snap, and
 * the card width. Those used to live in `FeedPanel` alone, and the skeleton
 * kept stacking cards in a column after the feed became a rail.
 */

/** One card's slot. The live card and the placeholder both sit in this. */
export const FEED_CARD_SLOT =
  "flex w-[min(85vw,22rem)] shrink-0 snap-start";

/*
 * The underscores are Tailwind's escape for a space, and the spaces around the
 * minus are not optional: `calc(100%-3rem)` is invalid CSS, the whole gradient
 * is discarded, and the result is a mask property that silently does nothing —
 * which is exactly how this shipped once.
 */
const RAIL_FADE =
  "max-xl:[mask-image:linear-gradient(to_right,transparent_0,black_0.75rem,black_calc(100%_-_3rem),transparent_100%)]";

/**
 * The horizontal run the cards live in.
 *
 * Phone and tablet keep the fade and hide the bar: a thumb already knows how
 * to swipe, and a grey track under the cards is noise. Desktop (`xl`) shows a
 * real horizontal scrollbar instead. The mask is painted in the scroller's
 * own box, so leaving it on at desktop would fade the bar with the cards.
 *
 * `-m-1 p-1` is not spacing. `overflow-x-auto` also clips vertically, and a
 * focus ring is drawn outside its element's box; without the inset the ring on
 * the first card's title would be sliced off along the top edge. `xl:pb-2`
 * is extra room for the bar so it does not sit on the card's bottom border.
 *
 * `role="list"` restores what `display: flex` takes away — Safari drops list
 * semantics from a flexed `ul`, and "list, 12 items" is exactly the orientation
 * a screen reader user needs before walking a rail.
 */
export function FeedRailScroller({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "-m-1 overflow-x-auto overscroll-x-contain p-1 xl:pb-2",
        "snap-x snap-mandatory scroll-p-1",
        // Touch: no bar. Pointer: a thin track that is actually visible.
        "max-xl:[scrollbar-width:none] max-xl:[&::-webkit-scrollbar]:hidden",
        "xl:[scrollbar-width:thin] xl:[scrollbar-color:var(--color-foreground-icon-tertiary)_var(--color-background-secondary-default)]",
        "xl:[&::-webkit-scrollbar]:h-2.5",
        "xl:[&::-webkit-scrollbar-track]:rounded-full xl:[&::-webkit-scrollbar-track]:bg-background-secondary-default",
        "xl:[&::-webkit-scrollbar-thumb]:rounded-full xl:[&::-webkit-scrollbar-thumb]:bg-foreground-icon-tertiary",
        "xl:[&::-webkit-scrollbar-thumb:hover]:bg-foreground-icon-secondary",
        RAIL_FADE,
        className,
      )}
    >
      <ul role="list" className="flex w-max items-stretch gap-3">
        {children}
      </ul>
    </div>
  );
}
