"use client";

import Link from "next/link";
import { useMemo } from "react";

import { WEEKDAY_SHORT, minutesToLabel } from "@/lib/constants";
import type { ResolvedSharedSchedule } from "@/lib/db/shared-schedule";
import type { Meeting } from "@/lib/types";

import { ScheduleWeek } from "./schedule-week";
import { toWeekGridBlocks } from "./to-blocks";

/**
 * The shared page's body: the same week canvas `/schedule` draws, with no
 * tap targets, and the class list under it. The course links still work —
 * the catalog is public — so a friend can read about a class they saw.
 */
export function SharedScheduleView({ shared }: { shared: ResolvedSharedSchedule }) {
  const blocks = useMemo(
    () => toWeekGridBlocks({ sections: shared.sections, customBlocks: shared.customBlocks }),
    [shared.sections, shared.customBlocks],
  );
  const commitmentIds = useMemo(
    () => new Set(shared.customBlocks.map((block) => block.blockId)),
    [shared.customBlocks],
  );
  const titleFor = (courseId: string) =>
    shared.courses.find((course) => course.courseId === courseId)?.title ?? courseId;

  return (
    <>
      <ScheduleWeek blocks={blocks} commitmentIds={commitmentIds} />
      {shared.sections.length > 0 ? (
        <ul className="overflow-hidden rounded-2xl border border-border-table bg-background-primary-default">
          {shared.sections.map((section) => (
            <li key={section.sectionId} className="border-t border-border-table first:border-t-0">
              <Link
                href={`/course/${section.courseId}`}
                className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-body-medium tabular-nums text-text-primary">{section.courseId}</span>
                    <span className="text-caption-1-regular tabular-nums text-text-tertiary">§{section.sectionCode}</span>
                  </span>
                  <span className="truncate text-caption-1-regular text-text-secondary">{titleFor(section.courseId)}</span>
                  <span className="truncate text-caption-1-regular text-text-tertiary">
                    {meetingSummary(section.meetings)}
                    {section.instructors.length > 0 ? ` · ${section.instructors.join(", ")}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-background-secondary-default p-5 text-center text-caption-1-regular text-text-secondary">
          Nothing on this schedule yet.
        </p>
      )}
    </>
  );
}

function meetingSummary(meetings: Meeting[]): string {
  if (meetings.length === 0) return "Time not published";
  const days = [...new Set(meetings.map((meeting) => WEEKDAY_SHORT[meeting.weekday]))].join("/");
  const first = meetings[0];
  return `${days} ${minutesToLabel(first.startMinute)}–${minutesToLabel(first.endMinute)}`;
}
