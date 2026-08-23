"use client";

import Link from "next/link";
import { RiCalendarLine, RiEyeLine, RiTimeLine, RiUserLine } from "@remixicon/react";
import type { Section } from "@/lib/types";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { formatSectionMeetings } from "./meetings";
import { SeatBadge, seatFiguresFromSection } from "./seat-badge";

/**
 * One section inside an expanded course row.
 *
 * Carries everything a student needs to choose between sections without
 * opening anything: section code, the call number they will actually type into
 * Vergil, instructors, meeting pattern, and seat state with its provenance.
 *
 * Navigation is a plain `next/link` to `/course/[courseId]`. The course lane's
 * intercepting route turns that into a drawer over these results when the
 * click happens inside the app, and a standalone page on a cold load. Nothing
 * here needs to know which.
 */

export interface SectionRowProps {
  section: Section;
  /** True when this section is one that satisfied an active section filter. */
  isMatch?: boolean;
  /** TODO(schedule): wired by the schedule lane. Writes require an account. */
  onAddToSchedule?: (sectionId: string) => void;
  /** TODO(alerts): wired by the watchlist lane. Writes require an account. */
  onWatch?: (sectionId: string) => void;
  className?: string;
}

export function SectionRow({
  section,
  isMatch = false,
  onAddToSchedule,
  onWatch,
  className,
}: SectionRowProps) {
  const meetings = formatSectionMeetings(section);
  const instructors = section.instructors.length ? section.instructors.join(", ") : null;

  return (
    <div
      className={cx(
        "flex flex-col gap-2 rounded-2lg border px-3 py-2.5",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        isMatch
          ? "border-accent-500/40 bg-background-secondary-default"
          : "border-border-table bg-background-primary-default",
        className,
      )}
    >
      <Link
        href={`/course/${section.courseId}`}
        className={cx(
          "flex min-w-0 flex-1 flex-col gap-1 rounded-lg",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body-semibold text-text-primary">
            Section {section.sectionCode}
          </span>
          {section.component && (
            <span className="text-caption-1-regular text-text-secondary">
              {section.component}
            </span>
          )}
          <span
            className="text-caption-1-medium text-text-secondary tabular-nums"
            title="Call number, used to register in Vergil"
          >
            Call {section.callNumber}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption-1-regular text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <RiTimeLine aria-hidden className="size-3.5 shrink-0" />
            {meetings ?? "Meeting time not published"}
          </span>
          {instructors && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <RiUserLine aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{instructors}</span>
            </span>
          )}
        </div>
      </Link>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <SeatBadge figures={seatFiguresFromSection(section)} layout="stacked" />
        <div className="flex items-center gap-1.5">
          {/* TODO(schedule/auth): both actions are inert until the schedule
              and auth lanes land. Reads are free; these are writes. */}
          <Button
            size="xs"
            variant="secondary"
            leadingIcon={RiCalendarLine}
            onClick={() => onAddToSchedule?.(section.sectionId)}
            aria-label={`Add section ${section.sectionCode} to schedule`}
            title="Add to schedule"
          >
            Add
          </Button>
          <Button
            size="xs"
            variant="ghost"
            iconOnly
            leadingIcon={RiEyeLine}
            onClick={() => onWatch?.(section.sectionId)}
            aria-label={`Watch section ${section.sectionCode} for open seats`}
            title="Watch for open seats"
          />
        </div>
      </div>
    </div>
  );
}
