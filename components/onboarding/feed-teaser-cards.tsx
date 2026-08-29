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
 * Placeholder while the last onboarding screen ranks its cards.
 *
 * ── Why it is shaped like this ──────────────────────────────────────────────
 *
 * It used to be six short bars in a box about 176px tall, standing in for a
 * `FeedCardView` that measures 272–336px. Four of those became four real cards,
 * and the first one alone grew by roughly 150px — which on this screen is not a
 * card quietly getting taller, because the sign-in gate is tucked under card one
 * and everything below it sits in normal flow. The gate, the Columbia button and
 * the whole rest of the stack dropped by that much, and they dropped when the
 * preview request came back, which is far outside the 500ms window that excuses
 * a shift as something the student asked for. It was the largest single
 * contributor to this route's Cumulative Layout Shift.
 *
 * So the bars below are not decoration. Each one stands for a band of the card
 * that replaces it, at the height that band actually measures on this route:
 *
 *     header (code · section · term, then the title)   48
 *     reason chips                                     42
 *     meeting days and time                            28
 *     instructor                                       28
 *     ratings                                          18
 *     seats and enrollment                             28
 *
 * With the card's own `gap` and padding — the `sm` step up included, which the
 * old placeholder was missing — that comes to about 302px against a typical
 * card's 304px.
 *
 * Exactness is neither available nor needed. A real card's height moves with how
 * its title wraps and whether its reasons run to a second line; the range across
 * a full preview is 272 to 336. Landing in the middle of that turns a 150px
 * shove into a nudge of a couple of dozen pixels, and the nudge is as far as
 * this can be taken without knowing what the ranker is about to return.
 *
 * Only four are ever rendered, and that is still right — the four fill the first
 * screen and peek the fifth. The other six cards arrive underneath them, below
 * everything already painted, and appending below the last element in the flow
 * moves nothing.
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
