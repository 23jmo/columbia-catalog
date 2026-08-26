/**
 * When a swipe counts, and what it triggers.
 *
 * Pulled out of `feed-deck.tsx` on purpose. Everything else in the deck is
 * pointer events, layout and animation — the parts you have to look at to
 * judge — but these two decisions are arithmetic, and they are the two that
 * are actually easy to get wrong in a way no screenshot would show: a
 * threshold that fires on a scroll, and a milestone that fires on the wrong
 * count or fires twice. Keeping them here means they can be tested without a
 * DOM, a router, or a fake drag.
 */

/**
 * Past this far, or moving this fast, the card is going.
 *
 * Two conditions rather than one because they cover opposite gestures. A slow
 * deliberate drag never reaches the velocity bar, and a quick flick — the way
 * anyone actually dismisses something on a phone — is over before it reaches
 * 96px. Requiring both would make the deliberate gesture the only one that
 * works, which is backwards: the flick is the one people already know.
 *
 * 96px is roughly a thumb's travel and comfortably past the few pixels
 * `dragDirectionLock` samples before it commits to an axis, so a gesture that
 * was really a scroll cannot reach it.
 */
export const COMMIT_PX = 96;
export const COMMIT_VELOCITY = 420;

/**
 * Three saves is the point where a student has a shortlist rather than a
 * favourite, and a shortlist is the thing Vergil actually wants — we cannot
 * register anybody, so the only useful move we have is to hand over the list
 * at the moment it becomes one.
 *
 * Two discards is deliberately earlier. A discard is the student saying the
 * ranking is wrong, and the second one is evidence rather than noise; waiting
 * for a third would be waiting for them to give up.
 */
export const SAVES_BEFORE_HANDOFF = 3;
export const DISCARDS_BEFORE_REFINE = 2;

export type SwipeAction = "saved" | "discarded";

/**
 * `null` means the card springs back.
 *
 * Direction comes from the offset and never from the velocity, because a flick
 * can end with the pointer travelling back the way it came — decide with the
 * distance, gate with either.
 */
export function swipeVerdict(offsetX: number, velocityX: number): SwipeAction | null {
  const far = Math.abs(offsetX) >= COMMIT_PX;
  const fast = Math.abs(velocityX) >= COMMIT_VELOCITY;
  if (!far && !fast) return null;
  // A pure vertical flick can produce a tiny non-zero x with a large y
  // velocity; without a direction there is nothing to commit to.
  if (offsetX === 0) return null;
  return offsetX > 0 ? "saved" : "discarded";
}

export interface SwipeTally {
  saved: number;
  discarded: number;
}

/** Which prompt this swipe earns, given the running tally and what has fired. */
export function milestoneFor(
  action: SwipeAction,
  tally: SwipeTally,
  alreadyFired: { handoff: boolean; refine: boolean },
): "handoff" | "refine" | null {
  if (action === "saved" && !alreadyFired.handoff && tally.saved >= SAVES_BEFORE_HANDOFF) {
    return "handoff";
  }
  if (
    action === "discarded" &&
    !alreadyFired.refine &&
    tally.discarded >= DISCARDS_BEFORE_REFINE
  ) {
    return "refine";
  }
  return null;
}
