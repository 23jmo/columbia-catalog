import type { ReactNode } from "react";

import { ReferenceBlock } from "@/components/course/reference-block";

/**
 * One section of the instructor page.
 *
 * ── Why this wraps ReferenceBlock rather than defining its own chrome ───────
 *
 * This page used to carry a THIRD heading system. `/course/[courseId]` renders
 * hairline-ruled `ReferenceBlock`s with small-caps labels; the drawer renders
 * carded `Panel`s with accent icon squares; and every card on this page rolled
 * its own — a `rounded-[20px] bg-background-secondary-default` tinted slab with
 * a sentence-case grey `<p>` for a heading and no landmark element at all.
 *
 * The result was that walking from a course to the instructor teaching it
 * changed the visual language mid-journey, which reads as two different
 * products. `course-level-panels.tsx` already names the rule this broke: "two
 * chrome treatments stacked in one column reads as two pages stitched
 * together." That applies across a click, not only down a column.
 *
 * So the container, the rule, and the label all come from the shared component.
 * `ReferenceBlock` is the right one of the two: this is a full page of
 * reference material at `max-w-4xl`, exactly like the course page, not a
 * drawer.
 *
 * ── What this adds on top ──────────────────────────────────────────────────
 *
 * `headline` is the one thing the old cards got right and it is kept. Each
 * section states its conclusion in words before the evidence — "45 class
 * meetings", "2 buildings this term", "164 at peak" — so a reader scrolling
 * fast collects answers rather than chart titles. A bare `ReferenceBlock` would
 * have dropped that and left seven sections that each open with a widget.
 */
export interface InstructorSectionProps {
  /** Anchor target, when something links here. */
  id?: string;
  /** Small-caps label. Says what the reader is looking at. */
  title: string;
  /** Rendered beside the label when the section is a list of known size. */
  count?: number;
  /**
   * The section's answer, in words. Omit when the content IS the answer and a
   * summary line would only restate it.
   */
  headline?: ReactNode;
  /** Right-aligned control on the headline row — a month stepper, a toggle. */
  action?: ReactNode;
  children: ReactNode;
}

export function InstructorSection({
  id,
  title,
  count,
  headline,
  action,
  children,
}: InstructorSectionProps) {
  return (
    <ReferenceBlock id={id} title={title} count={count}>
      {headline != null || action != null ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {headline != null ? (
            <p className="text-title-3-semibold -tracking-[0.01em] text-balance text-text-primary">
              {headline}
            </p>
          ) : (
            <span />
          )}
          {action != null ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </ReferenceBlock>
  );
}
