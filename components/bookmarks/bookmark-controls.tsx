"use client";

import { BookmarkButton } from "./bookmark-button";
import { BookmarkMenu } from "./bookmark-menu";
import { cx } from "@/utils/cx";

/**
 * The star and its overflow menu, as one thing to drop into a section row.
 *
 * Six surfaces show these controls — search results, the sections panel, a
 * section page, the course header, the course drawer, and a week-grid block —
 * and the pair has to keep the same order, spacing and progression in all of
 * them. Six copies of two imports is how they stop matching.
 *
 * The menu contributes nothing until the section is saved (it returns `null`),
 * so an unsaved row is a single star and not a star with a dead `⋯` beside it.
 * The row therefore *grows* an affordance the moment you save — which is the
 * legible version of "watch is a child of bookmark", instead of a bell that
 * was there the whole time but greyed out.
 */

export interface BookmarkControlsProps {
  sectionId: string;
  sectionCode: string;
  /** "COMS4113" — what the toasts name. */
  courseLabel?: string;
  size?: "xs" | "sm";
  className?: string;
}

export function BookmarkControls({
  sectionId,
  sectionCode,
  courseLabel,
  size = "sm",
  className,
}: BookmarkControlsProps) {
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-0.5", className)}>
      <BookmarkButton
        sectionId={sectionId}
        sectionCode={sectionCode}
        courseLabel={courseLabel}
        size={size}
      />
      <BookmarkMenu
        sectionId={sectionId}
        sectionCode={sectionCode}
        courseLabel={courseLabel}
      />
    </span>
  );
}
