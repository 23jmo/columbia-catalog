import { cx } from "@/utils/cx";

/**
 * What `/saved` looks like while it is being read.
 *
 * ── Why this exists: the page used to lie ─────────────────────────────────
 *
 * `SavedGallery` gated on `snapshot.saved.size === 0`, and the bookmark store
 * starts at `status: "idle"` with an empty set — so for the whole of the
 * round trip that fetches your bookmarks, `/saved` rendered "Nothing saved
 * yet" with a Find classes button under it. Not a blank frame: a confident,
 * wrong answer, on the one screen whose entire content is a list the reader
 * knows they built. The empty state is now behind `status === "ready"`, and
 * this stands in front of it.
 *
 * ── Two loads, one skeleton ───────────────────────────────────────────────
 *
 * `/saved` waits twice — once on `useBookmarks` for the section ids, then on
 * `useSavedCatalog` for the records behind them. The second wait knows how
 * many cards are coming, so it passes `cards={sectionIds.length}` and the
 * skeleton is exactly the height of the list that replaces it. The first
 * cannot know, so it guesses `DEFAULT_CARDS`.
 *
 * Every block paints a token that exists. `bg-background-secondary-default`
 * rather than `bg-background-secondary` — the latter looks like a real class,
 * resolves to nothing, and renders transparent. That mistake shipped once as a
 * drawer skeleton of nine invisible blocks, which is why
 * `lib/design-tokens.test.ts` exists.
 */

/**
 * Three, not the feed's four.
 *
 * The feed skeleton overflows the fold on purpose — twenty-four cards are
 * coming and a skeleton that stops short makes the page look nearly loaded. A
 * shortlist is not that list. Most people have a handful saved, so four
 * placeholders would routinely be taller than the real thing and the page
 * would visibly SHRINK when the cards landed, which is the same jump the
 * skeleton is here to prevent.
 */
const DEFAULT_CARDS = 3;

/**
 * Title, instructor and time widths, cycled so three identical pulses do not
 * read as one card stamped down the page. The live cards vary; clones would
 * not.
 */
const CARD_SHAPES = [
  { title: "w-4/5", instructor: "w-44", time: "w-32" },
  { title: "w-3/5", instructor: "w-32", time: "w-40" },
  { title: "w-11/12", instructor: "w-48", time: "w-28" },
  { title: "w-[70%]", instructor: "w-36", time: "w-36" },
] as const;

export function SavedSkeleton({
  cards = DEFAULT_CARDS,
  className,
}: {
  /** How many are coming, when that is known. Clamped — see `SavedGallery`. */
  cards?: number;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your saved classes"
      className={cx("flex flex-col gap-4", className)}
    >
      {Array.from({ length: Math.max(1, cards) }, (_, index) => (
        <SavedCardSkeleton key={index} shape={CARD_SHAPES[index % CARD_SHAPES.length]} />
      ))}
    </div>
  );
}

/**
 * One placeholder, in `SavedCard`'s geometry.
 *
 * Every `sm:` step mirrors one in `SavedCard`. The live card grows at 640px;
 * if this did not, the page would shift at the moment the list landed on every
 * laptop that loads it.
 *
 * Folder chips are deliberately absent. They are the one row whose presence is
 * unknowable before the data arrives — most saved classes are in no folder at
 * all — and a placeholder for a row that usually is not there would make the
 * common case jump upward rather than settle.
 */
function SavedCardSkeleton({ shape }: { shape: (typeof CARD_SHAPES)[number] }) {
  return (
    <div
      aria-hidden
      className={cx(
        "flex w-full min-w-0 flex-col gap-3 rounded-2xl border border-border-table",
        "bg-background-primary-default p-4 sm:gap-3.5 sm:p-5",
      )}
    >
      <header className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* "COMS 4118 · Sec 001 · Fall 2026", then the title. */}
          <Bar className="h-4 w-44 sm:h-4.5" />
          <Bar className={cx("h-6.5", shape.title)} />
        </div>
        {/* Star, ⋯ menu, then the Add to Vergil button — 28px, 32px from `sm`. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Bar className="size-7 rounded-lg sm:size-8" />
          <Bar className="size-7 rounded-lg sm:size-8" />
          <Bar className="h-6 w-28 rounded-sm" />
        </div>
      </header>

      {/* `WeekStrip` is five 28px squares on a `gap-1`, then the time. */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex shrink-0 items-center gap-1">
          {Array.from({ length: 5 }, (_, index) => (
            <Bar key={index} className="size-7 rounded-md" />
          ))}
        </div>
        <Bar className={cx("h-5 sm:h-6", shape.time)} />
      </div>

      {/*
        `InstructorChip` — a 24px avatar and the name, in a row that measures
        28px. `h-7` is that measurement, not the avatar's: the chip is taller
        than the circle inside it, and sizing this row off `size-6` alone left
        the whole card 4px short of the one it stands in for.
      */}
      <div className="flex h-7 min-w-0 items-center gap-2">
        <Bar className="size-6 shrink-0 rounded-full" />
        <Bar className={cx("h-4 sm:h-4.5", shape.instructor)} />
      </div>

      {/* `EnrollmentChip fill` is `h-7`. `mt-auto` matches the live card. */}
      <Bar className="mt-auto h-7 w-full rounded-lg" />
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-md bg-background-secondary-default motion-reduce:animate-none",
        className,
      )}
    />
  );
}
