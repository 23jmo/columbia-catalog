import { cx } from "@/utils/cx";

import { FEED_CARD_SLOT, FeedGrid } from "./feed-layout";

/**
 * What the feed looks like while it is being computed.
 *
 * The feed is the slowest thing on the home page by a wide margin — a cold
 * process pages the whole active catalog and builds a prerequisite graph over
 * 8,189 courses, which is measured in seconds, and the memoised path is still a
 * database round trip. Awaiting it inline would hold back the greeting and the
 * box too, so `/` streams it behind a `<Suspense>` boundary and this is the
 * boundary's fallback.
 *
 * Deliberately a skeleton of the real grid rather than a spinner: the layout
 * does not jump when the content lands, and the reader can already see that
 * what is coming is a list of courses.
 *
 * Every block here paints a token that exists. `bg-background-secondary-default`
 * rather than `bg-background-secondary` — the latter looks like a real class,
 * resolves to nothing, and renders transparent. That exact mistake shipped once
 * as a drawer skeleton of nine invisible blocks, which is why
 * `lib/design-tokens.test.ts` exists.
 */

/**
 * Four — enough to overflow the first screen in one column.
 *
 * It was four for the rail, six for the two-column grid, and four again now
 * that a card is a full row. The number is not the point; overflowing the fold
 * is. A skeleton that stops above it makes the page look nearly loaded when
 * twenty-four cards are coming, and the reader stops waiting.
 */
const DEFAULT_CARDS = 4;

/**
 * Title and instructor widths, cycled so four identical pulses do not read as
 * one card stamped down the page. The live cards vary; a column of clones
 * would not.
 *
 * One title bar, even though the live title may now wrap to two. Most titles
 * are one line and the skeleton should shape the common case; reserving two
 * would leave a 26px hole under every short title, which is the same jump in
 * the other direction and visible on every card instead of a few.
 */
const CARD_SHAPES = [
  { title: "w-4/5", instructor: "w-48", time: "w-40", reasons: ["w-56", "w-44"] },
  { title: "w-3/5", instructor: "w-36", time: "w-32", reasons: ["w-48"] },
  { title: "w-11/12", instructor: "w-44", time: "w-48", reasons: ["w-52", "w-60", "w-40"] },
  { title: "w-[70%]", instructor: "w-40", time: "w-36", reasons: ["w-44", "w-56"] },
] as const;

export function FeedSkeleton({
  cards = DEFAULT_CARDS,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <section
      aria-busy="true"
      aria-label="Loading your recommendations"
      className={cx("flex flex-col gap-2.5", className)}
    >
      <FeedGrid>
        {Array.from({ length: cards }, (_, index) => (
          <li key={index} className={FEED_CARD_SLOT} aria-hidden>
            <FeedCardSkeleton shape={CARD_SHAPES[index % CARD_SHAPES.length]} />
          </li>
        ))}
      </FeedGrid>
    </section>
  );
}

/**
 * One placeholder card, in the same geometry as `FeedCardView`.
 *
 * Eyebrow, title, the reason rows, week strip, instructor chip, ratings, then
 * the meter pinned to the bottom with `mt-auto` so a grid row of stretched
 * cards keeps the bars on one line — the same trick the live card uses.
 *
 * The reason rows are the block worth keeping honest. They are the tallest
 * variable part of the live card and the whole point of the page; a skeleton
 * that omitted them would understate the card by ~60px and every row would
 * lurch downward when the feed landed.
 */
function FeedCardSkeleton({
  shape,
}: {
  shape: (typeof CARD_SHAPES)[number];
}) {
  return (
    <article
      className={cx(
        // Every `sm:` step here mirrors one in `FeedCardView`. The live card
        // grows at 640px; if this did not, the page would visibly shrink at
        // the moment the feed landed on every laptop that loads it.
        "flex h-full w-full flex-col gap-3 rounded-2xl border border-border-table",
        "bg-background-primary-default p-4 sm:gap-3.5 sm:p-5",
      )}
    >
      <header className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Bar className="h-4 w-40 sm:h-4.5" />
          <Bar className={cx("h-6.5", shape.title)} />
          <Bar className="h-4 w-36 sm:h-4.5" />
        </div>
        {/* Bookmark + Vergil sit in the corner: 28px, 32px from `sm`. */}
        <div className="flex shrink-0 items-center gap-0.5">
          <Bar className="size-7 rounded-lg sm:size-8" />
          <Bar className="size-7 rounded-lg sm:size-8" />
        </div>
      </header>

      {/* One icon + one line of text per reason, matching `Why`. */}
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {shape.reasons.map((width, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Bar className="size-4 shrink-0 rounded-sm" />
            <Bar className={cx("h-4 sm:h-4.5", width)} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2.5">
        {Array.from({ length: 5 }, (_, index) => (
          <Bar key={index} className="size-7 rounded-md" />
        ))}
        <Bar className={cx("h-5 sm:h-6", shape.time)} />
      </div>

      <div className="flex items-center gap-2">
        <Bar className="size-8 shrink-0 rounded-full" />
        <Bar className={cx("h-4 sm:h-4.5", shape.instructor)} />
      </div>

      {/* EnrollmentChip fill is `h-7`. `mt-auto` matches the live card. */}
      <Bar className="mt-auto h-7 w-full rounded-lg" />
    </article>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse bg-background-secondary-default motion-reduce:animate-none",
        "rounded-md",
        className,
      )}
    />
  );
}
