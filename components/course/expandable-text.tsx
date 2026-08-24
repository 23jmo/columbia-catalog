"use client";

import { useId, useState } from "react";
import { RiArrowDownSLine } from "@remixicon/react";

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

export function ExpandableText({
  text,
  clampLines = 6,
  threshold = 420,
  className,
}: ExpandableTextProps) {
  const [isExpanded, setExpanded] = useState(false);
  const bodyId = useId();
  const isCollapsible = text.length > threshold;
  const isClamped = isCollapsible && !isExpanded;

  return (
    <div className="flex flex-col items-start gap-1">
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

      {isCollapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={isExpanded}
          aria-controls={bodyId}
          className={cx(
            "group -ml-1.5 inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-md px-1.5",
            "text-caption-1-medium text-accent-600",
            "transition-colors duration-150 ease outline-none",
            "hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          )}
        >
          {isExpanded ? "Show less" : "Show more"}
          <RiArrowDownSLine
            aria-hidden
            className={cx(
              "size-4 transition-transform duration-200 ease motion-reduce:transition-none",
              isExpanded && "rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}
