"use client";

import type { EnrollmentStatusCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * Enrollment as a filled bar rather than a badge.
 *
 * The directory shows seats this way for a reason a chip cannot match: "105 /
 * 320" and "46 / 164" are both "open", but one is a third full and the other is
 * a quarter full, and that difference is the whole question a student is asking.
 * A bar answers it pre-attentively -- you read the fill before you read the
 * digits -- while the digits stay present for the cases where the exact number
 * matters (is there ONE seat left?).
 *
 * Two rules this component does not bend:
 *
 *  · **Never color alone** (spec section 18). Every bar carries a status word
 *    and a filled/hollow dot glyph, so the state survives greyscale, color
 *    blindness, and a screen reader. The bar is the fast path, not the only one.
 *
 *  · **Never invent a fill.** A section with no counts renders as an unfilled
 *    track with its status word and no ratio, not as 0%. Zero-of-unknown drawn
 *    as an empty bar reads as "wide open" when the truth is "we do not know" --
 *    ~10% of Fall 2026 sections are exactly this case.
 */

const STATUS_LABEL: Record<EnrollmentStatusCode, string> = {
  open: "Open",
  full: "Full",
  waitlist: "Waitlist",
  closed: "Closed",
  unknown: "Unknown",
};

/**
 * Alpha composites rather than solid tokens, so one definition survives both
 * themes: a 22%-opacity lime reads as a pale wash on white and a muted glow on
 * near-black, where a solid `lime-200` would disappear into one of them.
 */
const STATUS_FILL: Record<EnrollmentStatusCode, string> = {
  open: "bg-lime-500/25",
  full: "bg-red-500/25",
  waitlist: "bg-yellow-500/30",
  closed: "bg-red-500/25",
  unknown: "bg-neutral-500/20",
};

const STATUS_DOT: Record<EnrollmentStatusCode, string> = {
  open: "text-lime-600",
  full: "text-red-600",
  waitlist: "text-yellow-800",
  closed: "text-red-600",
  unknown: "text-text-tertiary",
};

export interface EnrollmentBarProps {
  status: EnrollmentStatusCode;
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  waitlistCount?: number | null;
  className?: string;
}

export function EnrollmentBar({
  status,
  enrollmentCount,
  enrollmentCap,
  waitlistCount,
  className,
}: EnrollmentBarProps) {
  const hasCounts =
    enrollmentCount !== null && enrollmentCap !== null && enrollmentCap > 0;

  // Clamped: the directory does report over-enrolled sections (count > cap),
  // and a bar wider than its track would spill past the rounded corners.
  const ratio = hasCounts ? Math.min(1, enrollmentCount / enrollmentCap) : 0;

  const label = STATUS_LABEL[status];
  const ratioText = hasCounts ? `${enrollmentCount} / ${enrollmentCap}` : null;

  return (
    <div
      className={cx(
        "relative flex h-7 w-full min-w-[9rem] items-center overflow-hidden rounded-md",
        "bg-background-secondary-default",
        className,
      )}
      /*
       * One label for the whole widget. Without this a screen reader reads the
       * dot, the word and the two numbers as four unrelated fragments.
       */
      role="img"
      aria-label={
        ratioText
          ? `${label}. ${enrollmentCount} of ${enrollmentCap} seats taken.`
          : `${label}. Seat counts unavailable.`
      }
    >
      {hasCounts ? (
        <div
          className={cx("absolute inset-y-0 left-0", STATUS_FILL[status])}
          style={{ width: `${ratio * 100}%` }}
          aria-hidden
        />
      ) : null}

      <div className="relative flex w-full items-center justify-between gap-2 px-2">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {/* Filled vs hollow glyph, so the state is legible without color. */}
          <span aria-hidden className={cx("text-[8px] leading-none", STATUS_DOT[status])}>
            {status === "open" ? "○" : "●"}
          </span>
          <span className="truncate text-caption-2-medium text-text-secondary">
            {label}
            {waitlistCount ? ` +${waitlistCount} wl` : ""}
          </span>
        </span>

        <span className="shrink-0 text-caption-2-medium tabular-nums text-text-primary">
          {ratioText ?? "—"}
        </span>
      </div>
    </div>
  );
}
