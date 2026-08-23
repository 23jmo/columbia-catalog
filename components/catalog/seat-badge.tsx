"use client";

import type { SectionListItem } from "@/lib/catalog-list-types";
import type { EnrollmentStatusCode } from "@/lib/types";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";

/**
 * Seat state with its provenance attached.
 *
 * Product rule (spec section 3, principle 2): every seat number renders with
 * the directory's own "as of" timestamp. That timestamp is a trust feature,
 * not a degradation notice, so it is always visible next to the count -- never
 * hidden behind a tooltip and never omitted when it is missing (we say so).
 *
 * Accessibility (spec section 18): seat state is never conveyed by color
 * alone. Every chip carries a word.
 *
 * NOTE: `components/home/seat-badge.tsx` did not exist when the Search screen
 * was built, so this is the catalog lane's own implementation. If the home
 * lane ships one, the two should be reconciled into a single component.
 */

const STATUS_LABEL: Record<EnrollmentStatusCode, string> = {
  open: "Open",
  full: "Full",
  waitlist: "Waitlist",
  closed: "Closed",
  unknown: "Unknown",
};

type ChipColor = "lime" | "rose" | "yellow" | "neutral" | "gray";

const STATUS_COLOR: Record<EnrollmentStatusCode, ChipColor> = {
  open: "lime",
  full: "rose",
  waitlist: "yellow",
  closed: "rose",
  unknown: "neutral",
};

/** Seat inputs, so this renders from a `Section` or an aggregate alike. */
export interface SeatFigures {
  status: EnrollmentStatusCode;
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  waitlistCount?: number | null;
  /** The directory's own "as of" string. Rendered verbatim when unparseable. */
  sourceAsOf: string | null;
}

export function seatFiguresFromSection(section: SectionListItem): SeatFigures {
  return {
    status: section.status,
    enrollmentCount: section.enrollmentCount,
    enrollmentCap: section.enrollmentCap,
    waitlistCount: section.waitlistCount,
    sourceAsOf: section.sourceAsOf,
  };
}

/**
 * Aggregate seat state across a course's sections. The collapsed course row
 * shows this: how many sections still have room, and the oldest provenance
 * across them (the weakest link is the honest one to advertise).
 */
export function aggregateSeatFigures(sections: SectionListItem[]): SeatFigures & {
  sectionsWithSeats: number;
  sectionCount: number;
} {
  let enrolled = 0;
  let capacity = 0;
  let waitlisted = 0;
  let sawCounts = false;
  let sawWaitlist = false;
  let sectionsWithSeats = 0;
  let oldest: { raw: string; time: number } | null = null;

  for (const section of sections) {
    if (section.enrollmentCount !== null && section.enrollmentCap !== null) {
      enrolled += section.enrollmentCount;
      capacity += section.enrollmentCap;
      sawCounts = true;
      if (section.enrollmentCount < section.enrollmentCap) sectionsWithSeats += 1;
    } else if (section.status === "open") {
      sectionsWithSeats += 1;
    }
    if (section.waitlistCount !== null) {
      waitlisted += section.waitlistCount;
      sawWaitlist = true;
    }
    if (section.sourceAsOf) {
      const time = Date.parse(section.sourceAsOf);
      const stamp = { raw: section.sourceAsOf, time: Number.isNaN(time) ? 0 : time };
      if (oldest === null || stamp.time < oldest.time) oldest = stamp;
    }
  }

  let status: EnrollmentStatusCode = "unknown";
  if (sectionsWithSeats > 0) status = "open";
  else if (sections.some((s) => s.status === "waitlist")) status = "waitlist";
  else if (sections.length > 0) status = "full";

  return {
    status,
    enrollmentCount: sawCounts ? enrolled : null,
    enrollmentCap: sawCounts ? capacity : null,
    waitlistCount: sawWaitlist ? waitlisted : null,
    sourceAsOf: oldest?.raw ?? null,
    sectionsWithSeats,
    sectionCount: sections.length,
  };
}

/**
 * The directory hands us strings like "as of 2:06PM Friday, August 21, 2026".
 * Render a compact form when it parses, and the raw string when it does not --
 * never a guess and never nothing.
 */
export function formatProvenance(sourceAsOf: string | null): string {
  if (!sourceAsOf) return "seat count provenance unknown";
  const parsed = Date.parse(sourceAsOf);
  if (Number.isNaN(parsed)) return `as of ${sourceAsOf}`;
  const date = new Date(parsed);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  return `as of ${date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  })}`;
}

export interface SeatBadgeProps {
  figures: SeatFigures;
  /** `full` stacks the provenance under the chip; `inline` keeps one line. */
  layout?: "inline" | "stacked";
  className?: string;
}

export function SeatBadge({ figures, layout = "inline", className }: SeatBadgeProps) {
  const { status, enrollmentCount, enrollmentCap, waitlistCount, sourceAsOf } = figures;
  const known = enrollmentCount !== null && enrollmentCap !== null;
  const remaining = known ? Math.max(0, enrollmentCap - enrollmentCount) : null;
  const provenance = formatProvenance(sourceAsOf);

  return (
    <div
      className={cx(
        "flex min-w-0 gap-x-2 gap-y-0.5",
        layout === "stacked" ? "flex-col items-start" : "flex-wrap items-center",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <Chip variant="caption" color={STATUS_COLOR[status]}>
          {STATUS_LABEL[status]}
        </Chip>
        <span className="text-caption-1-medium text-text-primary tabular-nums">
          {known ? `${remaining} of ${enrollmentCap} seats` : "seats not reported"}
        </span>
        {waitlistCount !== null && waitlistCount !== undefined && waitlistCount > 0 && (
          <span className="text-caption-1-regular text-text-secondary tabular-nums">
            {`${waitlistCount} waitlisted`}
          </span>
        )}
      </div>
      {/* Provenance is mandatory and travels with the number, always. */}
      <span
        className={cx(
          "text-caption-1-regular text-text-tertiary",
          !sourceAsOf && "italic",
        )}
        title={sourceAsOf ?? undefined}
      >
        {provenance}
      </span>
    </div>
  );
}
