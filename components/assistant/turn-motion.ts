"use client";

import { useReducedMotion } from "motion/react";

/**
 * One entrance and one exit, shared by everything in an assistant turn.
 *
 * ── Why these values and not others ───────────────────────────────────────
 *
 * `EASE` is `--ease-out` from `styles/theme.css`, spelled out. Tailwind's
 * `ease-out` utility resolves to that custom property, but Motion cannot read
 * a CSS variable for a JS-driven curve, so the number has to be repeated here.
 * If the token ever moves, this moves with it — they are the same decision.
 *
 * 200ms in, 140ms out. The entrance is what the reader is watching, so it gets
 * the room; the exit is the interface getting out of the way of the answer,
 * and anything slower reads as the indicator being reluctant to leave.
 *
 * ── Why `swap` exits with opacity only ────────────────────────────────────
 *
 * A thing that LEAVES can drift as it goes. A thing that is REPLACED cannot:
 * `AnimatePresence mode="popLayout"` pops it out of flow the instant it
 * unmounts, so its successor is already sitting in that slot while the ghost
 * fades. Give the ghost a `y` and it slides across text that has arrived,
 * which reads as two things happening rather than one thing becoming another.
 *
 * ── Reduced motion ────────────────────────────────────────────────────────
 *
 * Fewer and gentler, not off. The 8px rise goes; the fade stays, because the
 * fade is the part that says "this is new" — and a thread that swaps a
 * thinking indicator for an answer with no transition at all is the jarring
 * change this exists to prevent.
 */

/** `--ease-out` in `styles/theme.css`. Keep the two in step. */
const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

const ENTER_SECONDS = 0.2;
const LEAVE_SECONDS = 0.14;

export function useTurnMotion() {
  const reduce = useReducedMotion();

  const rise = reduce ? {} : { y: 8 };
  const transition = { duration: ENTER_SECONDS, ease: EASE };

  return {
    /**
     * A block arriving in the thread — prose, an artifact, a card grid, the
     * activity panel. Enter only: these do not leave until the thread does.
     */
    enter: {
      initial: { opacity: 0, ...rise },
      animate: { opacity: 1, y: 0 },
      transition,
    },

    /**
     * Something the next thing takes the place of — the thinking indicator
     * once prose or a tool row exists, the elapsed counter once the run ends.
     * Needs an `AnimatePresence` with `mode="popLayout"` around it.
     */
    swap: {
      initial: { opacity: 0, ...rise },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, transition: { duration: LEAVE_SECONDS, ease: EASE } },
      transition,
    },
  };
}
