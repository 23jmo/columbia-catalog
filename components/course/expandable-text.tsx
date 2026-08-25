"use client";

import { useId, useState } from "react";
import { RiArrowDownSLine } from "@remixicon/react";
import { useReducedMotion } from "motion/react";

import { cx } from "@/utils/cx";

/**
 * A long registrar blurb, clamped.
 *
 * The drawer is a fixed-height surface with its own scroll, and the two things
 * a reader most often wants after the description — the other sections of this
 * course, and the way out to the full page — sit below it. A 900-word course
 * description pushes both off the bottom of a panel that is only 88dvh tall,
 * so the reader has to scroll past something they have already decided not to
 * read in order to reach the thing they were going for.
 *
 * ── Why the length test, and not a measurement ─────────────────────────────
 *
 * The obvious implementation compares `scrollHeight` to `clientHeight` in an
 * effect and decides whether the toggle is needed. That reads layout the
 * server cannot have, so the first paint always shows no toggle and a second
 * one adds it — a visible jump on exactly the paragraphs that are long enough
 * to matter. A character count is a pure function of the props, so the server
 * and the client agree on the first render and nothing moves afterwards. It
 * is an approximation of height, but a clamp that occasionally engages on a
 * paragraph that would have fitted costs one click; a hydration jump costs
 * every reader a flicker.
 *
 * ── Why the reveal animates `max-height`, and where the ceiling comes from ──
 *
 * `height` cannot transition to or from `auto`, and the usual
 * `grid-template-rows: 0fr → 1fr` trick does not fit either: this component's
 * collapsed state is not zero height, it is `clampLines` visible lines. So the
 * animator is a `max-height` transition, which does interpolate and does
 * accommodate a non-zero collapsed state.
 *
 * `max-height` is a layout property, which is normally the wrong thing to
 * animate. It is accepted here because the alternatives do not fit, the
 * transition is 200ms, and it fires on a deliberate click rather than on a
 * hot path.
 *
 * The expanded ceiling is *estimated from the character count* rather than
 * measured, for the same reason the toggle itself is: a measurement would need
 * a layout read the server cannot do. `CHARS_PER_LINE_FLOOR` is deliberately
 * pessimistic so the estimate always lands ABOVE the real height — undershoot
 * would clip the description, which is a correctness bug, while overshoot only
 * means the last part of the transition happens after the text has already
 * finished arriving. Once the transition ends the ceiling is dropped entirely,
 * so a later reflow (a resize, a font swap) can never be clipped by it.
 */

export interface ExpandableTextProps {
  text: string;
  /** Lines shown while collapsed. */
  clampLines?: 4 | 5 | 6 | 8;
  /**
   * Shorter than this and the toggle never appears. Roughly the point where a
   * registrar description stops being a sentence and starts being a syllabus.
   */
  threshold?: number;
  className?: string;
}

const CLAMP: Record<NonNullable<ExpandableTextProps["clampLines"]>, string> = {
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
  8: "line-clamp-8",
};

/** `--text-body-regular--line-height` from styles/typography.css. */
const LINE_HEIGHT_REM = 1.25;

/**
 * Narrower than any real measure this text is rendered at, so the line estimate
 * is always too high rather than too low. See the header note on overshoot.
 */
const CHARS_PER_LINE_FLOOR = 40;

export function ExpandableText({
  text,
  clampLines = 6,
  threshold = 420,
  className,
}: ExpandableTextProps) {
  const [isExpanded, setExpanded] = useState(false);
  /** True from the moment a toggle is requested until its transition settles. */
  const [isAnimating, setAnimating] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const bodyId = useId();
  const isCollapsible = text.length > threshold;

  /*
   * The clamp is what draws the ellipsis, but it also crops the text to
   * `clampLines`, so it has to be off for the whole of the collapse animation —
   * otherwise the paragraph would snap to six lines at the start and the box
   * would then close around empty space. It comes back once the box has
   * finished shrinking, at which point it changes nothing visible.
   */
  const isClamped = isCollapsible && !isExpanded && !isAnimating;

  const collapsedMax = `${clampLines * LINE_HEIGHT_REM}rem`;
  const estimatedMax = `${Math.ceil(text.length / CHARS_PER_LINE_FLOOR) * LINE_HEIGHT_REM}rem`;

  let maxHeight: string | undefined;
  if (!isCollapsible || shouldReduceMotion) maxHeight = undefined;
  else if (isExpanded) maxHeight = isAnimating ? estimatedMax : "none";
  else maxHeight = collapsedMax;

  const toggle = () => {
    if (shouldReduceMotion) {
      setExpanded((open) => !open);
      return;
    }
    setAnimating(true);
    if (isExpanded) {
      /*
       * Collapsing starts from `max-height: none`, which has no length for the
       * transition to run from. Setting `isAnimating` first re-pins the ceiling
       * to the estimate; the collapse itself has to wait for that to be painted,
       * hence the frame.
       */
      requestAnimationFrame(() => setExpanded(false));
    } else {
      setExpanded(true);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className={cx(
          isCollapsible && !shouldReduceMotion && "overflow-hidden",
          "transition-[max-height] duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{ maxHeight }}
        onTransitionEnd={(event) => {
          // Only this element's own max-height settling counts — anything
          // bubbling up from the paragraph is a different animation.
          if (event.target !== event.currentTarget) return;
          if (event.propertyName !== "max-height") return;
          setAnimating(false);
        }}
      >
        <p
          id={bodyId}
          className={cx(
            "text-body-regular text-pretty whitespace-pre-line text-text-secondary",
            isClamped && CLAMP[clampLines],
            className,
          )}
        >
          {text}
        </p>
      </div>

      {isCollapsible ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isExpanded}
          aria-controls={bodyId}
          className={cx(
            "group -ml-1.5 inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-md px-1.5",
            "text-caption-1-medium text-accent-600",
            "transition-colors duration-150 outline-none",
            "hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          )}
        >
          {isExpanded ? "Show less" : "Show more"}
          <RiArrowDownSLine
            aria-hidden
            className={cx(
              "size-4 transition-transform duration-150 ease-out motion-reduce:transition-none",
              isExpanded && "rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}
