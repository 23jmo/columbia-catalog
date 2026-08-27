"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RiArrowRightLine } from "@remixicon/react";

import { haptic } from "@/lib/haptics";
import { cx } from "@/utils/cx";

/**
 * The last control in onboarding: a ring that fills as you scroll past it, and
 * opens the full feed when it closes.
 *
 * ── Why the exit is a gesture and not only a button ────────────────────────
 *
 * This screen ends with ten real recommendations, and the thing a student
 * actually does with them is scroll. The old exit was a secondary button
 * reading "Take me to the catalog" sitting under the last card, which asked
 * them to stop scrolling, find a control, and read it — three deliberate acts
 * to leave a screen they were already leaving. Reading the scroll they are
 * mid-way through is cheaper than interrupting it.
 *
 * So the gesture that ends the flow is the one already in progress. The ring
 * tracks a `RUNWAY` of empty space below the control; scrolling that blank
 * band past the bottom edge closes the ring, and a closed ring opens the feed.
 *
 * ── Why an empty runway rather than the page's own scroll ──────────────────
 *
 * "Fill as they scroll" has an obvious cheap reading — progress = scrollTop /
 * scrollHeight — and that reading fires on arrival. A short feed, a tall
 * monitor, or a student who flicks hard lands at the document bottom with the
 * ring already full, and the screen throws them somewhere they never asked to
 * go. Worse, it is unrecoverable: they cannot scroll back to un-fire it.
 *
 * The runway removes that. It is empty space that exists only to be scrolled
 * through, so progress is zero at the moment the control first sits fully on
 * screen no matter how the student got there, and reaching one takes a
 * separate, deliberate push into blankness past everything there is to read.
 * Scrolling back up drains the ring, so the gesture is reversible right up
 * until it completes — which is the same "no one-way doors" rule the back
 * arrow exists for.
 *
 * The circle is still a button. Tapping it is the whole gesture at once, and
 * it is the only path for anyone driving by keyboard or reading by screen
 * reader, neither of whom generates the scroll this measures.
 */

/**
 * Height of the blank band below the control, and therefore how much scroll
 * closes the ring. A viewport fraction rather than a fixed height because it
 * is measured in flicks, not pixels: a phone flick is most of a short viewport
 * and a trackpad push is a fraction of a tall one. The `14rem` floor keeps a
 * landscape phone from making the gesture a twitch.
 */
const RUNWAY = "h-[max(14rem,38vh)]";

/**
 * Dead travel before the ring starts drawing, in px.
 *
 * Without it, progress leaves zero at the exact moment the runway's top edge
 * crosses the bottom of the viewport — which is the moment the caption under
 * the disc is still flat against that edge. The ring would begin filling on a
 * control the student cannot fully see yet. Sixty-four pixels is roughly the
 * caption plus its gap, so the first pixel of arc lands on a control that has
 * cleared the edge. It comes off the denominator too, so the ring still closes
 * exactly where it did: when the whole runway has passed.
 */
const RING_LEAD_PX = 64;

/** SVG user units. The ring is drawn in a square viewBox and scaled by CSS. */
const RING_RADIUS = 45;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface FeedFinishControlProps {
  /** Opens the full feed. May be async — the control locks while it settles. */
  onFinish: () => void;
  /**
   * The caller could not save and is showing why. Re-opens the button so the
   * student can ask again; see the note on the latch below.
   */
  failed?: boolean;
}

export function FeedFinishControl({ onFinish, failed = false }: FeedFinishControlProps) {
  const runwayRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [hasFired, setHasFired] = useState(false);

  /*
   * ── Two different latches, because the two paths fail differently ─────────
   *
   * `onFinish` navigates, but on the way it flushes the guest record to the
   * server, and that can come back failed — in which case the caller prints
   * why and this component is still mounted, still on screen, still at the
   * bottom of a scroller.
   *
   * The scroll path is latched permanently (`hasScrollFiredRef`). A student
   * sitting at a closed ring next to a save error must not have every stray
   * wheel tick retry the request; a failure that repeats would repeat forever.
   *
   * The press path is only latched while the attempt is live, which is what
   * `failed` unlocks. That asymmetry is the point: a retry should cost a
   * deliberate press, never an accidental scroll.
   */
  const hasScrollFiredRef = useRef(false);
  const isLeaving = hasFired && !failed;

  const leave = useCallback(() => {
    setHasFired(true);
    haptic("success");
    onFinish();
  }, [onFinish]);

  /*
   * The scroll effect must not re-subscribe when `onFinish` changes identity —
   * the caller rebuilds it every render — so it reads the latest `leave`
   * through a ref and keeps an empty dependency list.
   */
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });

  useEffect(() => {
    const runway = runwayRef.current;
    if (!runway) return;

    /*
     * The scrollport is `OnboardingScreen`'s own `h-dvh overflow-y-auto` shell,
     * not the document, so neither `window.scrollY` nor `window.innerHeight`
     * describes this. Walking up for the real scroller keeps the measurement
     * right if that shell ever moves, and gives the correct bottom edge on a
     * phone, where `dvh` and `innerHeight` disagree by the browser chrome.
     */
    const scroller = scrollParentOf(runway);
    const target: HTMLElement | Window = scroller ?? window;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = runway.getBoundingClientRect();
      if (rect.height === 0) return;
      const viewportBottom = scroller
        ? scroller.getBoundingClientRect().bottom
        : window.innerHeight;
      // Zero until the runway's top edge has cleared the bottom of the
      // viewport by `RING_LEAD_PX` — i.e. until the control is not merely on
      // screen but off the edge it entered from.
      const traveled = viewportBottom - rect.top - RING_LEAD_PX;
      const span = Math.max(1, rect.height - RING_LEAD_PX);
      const next = Math.min(1, Math.max(0, traveled / span));
      setProgress(next);
      // Fired from the rAF callback rather than from an effect watching
      // `progress`: this is the tail of a scroll event, so it stays an event
      // handler and never becomes a render-triggered cascade.
      if (next >= 1 && !hasScrollFiredRef.current) {
        hasScrollFiredRef.current = true;
        leaveRef.current();
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    schedule();
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const isClosed = progress >= 1 || isLeaving;

  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <div className="relative size-[4.75rem]">
          {/*
            `-rotate-90` starts the arc at twelve o'clock; without it a ring
            drawn from `strokeDashoffset` opens at three and reads as a dial
            rather than as something filling up.
          */}
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            className="absolute inset-0 size-full -rotate-90 overflow-visible"
          >
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="5"
              className="stroke-accent-500/15"
            />
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className="stroke-accent-500"
              style={{
                strokeDasharray: RING_CIRCUMFERENCE,
                // Bound straight to the scroll position with no transition:
                // the arc IS the student's own gesture, and easing it would
                // make the ring lag the finger that is drawing it.
                strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress),
              }}
            />
          </svg>

          {/*
            Filled, where every other advance control in the flow is an
            outline. Those are "onward, there is more"; this one is the end of
            the setup, and it is the only place in onboarding where being the
            loudest thing on the screen is the correct answer.
          */}
          <button
            type="button"
            onClick={leave}
            disabled={isLeaving}
            aria-label="Go to my full feed"
            className={cx(
              "absolute inset-[0.5rem] flex items-center justify-center rounded-full bg-accent-500 text-text-white outline-none transition-[box-shadow,background-color] duration-300",
              "shadow-[0_8px_24px_-8px_var(--color-accent-500)]",
              "focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2",
              isLeaving
                ? "cursor-default"
                : "cursor-pointer hover:bg-accent-600 hover:shadow-[0_12px_32px_-8px_var(--color-accent-500)]",
              // A closed ring deepens the disc rather than growing it. Scaling
              // was the first try and it ate the result: the disc expanded
              // into the gap and the completed ring — the one piece of
              // feedback the whole gesture is for — disappeared behind it.
              isClosed && "bg-accent-600 shadow-[0_14px_40px_-8px_var(--color-accent-500)]",
            )}
          >
            <RiArrowRightLine className="size-6" aria-hidden />
          </button>
        </div>

        {/*
          `aria-hidden`, deliberately: this narrates a scroll a screen-reader
          user is not performing, and the button already names the destination.
          It is a hint for the eye that is watching the ring.
        */}
        <p aria-hidden className="text-center text-caption-1-regular text-text-tertiary">
          {failed
            ? "Try again"
            : isClosed
              ? "Opening your full feed…"
              : "Keep scrolling for your full feed"}
        </p>
      </div>

      {/*
        The gesture's runway. Blank by design — see the note at the top of this
        file — and `aria-hidden` because there is nothing in it to read.
      */}
      <div ref={runwayRef} aria-hidden className={cx("w-full shrink-0", RUNWAY)} />
    </>
  );
}

/** Nearest ancestor that actually scrolls, or null for the document. */
function scrollParentOf(node: HTMLElement): HTMLElement | null {
  for (let current = node.parentElement; current; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
  }
  return null;
}
