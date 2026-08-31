"use client";

/** One shimmering bar. The pulse is the only thing these have in common. */
function Bar({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse bg-background-secondary-default motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * Placeholder for a feed card that has not been ranked yet.
 *
 * Two screens use it, and both swap it out for a real `FeedCardView` in the
 * same column: `FeedPreviewWorking` in `onboarding-flow.tsx`, which holds the
 * last screen while the recommender is still thinking, and `FeedPreviewGate`,
 * which falls back to placeholders when the recommender had nothing to say.
 *
 * ── Why it is shaped like this ──────────────────────────────────────────────
 *
 * It used to be six short bars in a box about 176px tall, standing in for a
 * card that measures 272–336px, and for a while that was this route's largest
 * layout shift: the gate stayed on screen through the ranking, the sign-in
 * panel sat under card one, and card one growing 150px dropped the panel and
 * everything below it — long after the 500ms window that excuses a shift as
 * something the student asked for.
 *
 * `FeedPreviewWorking` took that particular shift away by holding a screen of
 * its own while the ranking is in flight, so the swap is now screen to screen
 * rather than inside a live layout. What it did not do is make the placeholder
 * the right size, and the whole claim of that screen — that the swap "changes
 * what is in the cards and not where they are" — is only true if it is. A
 * 176px stand-in for a 328px card makes it a promise rather than a fact.
 *
 * So the bars below are not decoration. Each one stands for a band of the card
 * that replaces it, at the height that band actually measures on this route:
 *
 *     header (code · section · term, then the title)   48
 *     reason chips                                     42
 *     meeting days and time                            28
 *     instructor                                       28
 *     ratings                                          18
 *     seats and enrolment                              28
 *
 * With the card's own `gap` and padding — the `sm` step up included, which the
 * old placeholder was missing — that comes to 304px against a typical card's
 * 304px, and against 328px for the first card, whose reasons tend to run to a
 * second row.
 *
 * Exactness is neither available nor needed. A real card's height moves with
 * how its title wraps and how many reasons it earned; the range across a full
 * preview is 272 to 336. Landing in the middle of that is what turns a 150px
 * shove into a nudge, and it is as far as this can be taken without knowing
 * what the ranker is about to return.
 *
 * Four is the right count in both callers — they fill the first screen and peek
 * the fifth. The other six cards arrive underneath them, below everything
 * already painted, and appending below the last element in the flow moves
 * nothing.
 */
export function FeedPreviewCardSkeleton() {
  return (
    <article
      className="flex flex-col gap-3 rounded-2xl border border-border-table bg-background-primary-default p-4 sm:gap-3.5 sm:p-5"
      aria-hidden
    >
      <div className="flex h-12 flex-col justify-between">
        <Bar className="h-3 w-44 rounded-md" />
        <Bar className="h-4 w-3/5 rounded-md" />
      </div>

      <div className="flex h-10.5 items-center gap-2">
        <Bar className="h-6 w-40 rounded-full" />
        <Bar className="h-6 w-28 rounded-full" />
      </div>

      <Bar className="h-7 w-1/2 rounded-md" />
      <Bar className="h-7 w-2/5 rounded-md" />
      <Bar className="h-4.5 w-1/3 rounded-md" />
      <Bar className="h-7 w-full rounded-md" />
    </article>
  );
}
