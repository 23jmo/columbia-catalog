"use client";

import { RiDeleteBinLine } from "@remixicon/react";
import { WEEKDAY_LABEL, minutesToLabel } from "@/lib/constants";
import type { Course, Section } from "@/lib/types";
import type { TypicalMeetingPattern } from "@/lib/db/typical-meetings";
import { cx } from "@/utils/cx";

/**
 * Plan rename + enrolled sections. Custom commitments are edited on the
 * calendar grid — not in a separate form here.
 */

export function CalendarManage({
  name,
  onRename,
  sections,
  courses,
  typical,
  isLoading,
  onRemoveSection,
  className,
}: {
  name: string;
  onRename: (name: string) => void;
  sections: Section[];
  courses: Course[];
  typical: Map<string, TypicalMeetingPattern>;
  isLoading: boolean;
  onRemoveSection: (sectionId: string) => void;
  className?: string;
}) {
  return (
    <div className={cx("grid gap-5 border-t border-border-table p-4 @lg:px-5", className)}>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-caption-1-regular text-text-tertiary">Plan name</span>
        <input
          key={name}
          defaultValue={name}
          onBlur={(event) => onRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label="Plan name"
          className="rounded-2lg border border-border-button-default bg-background-primary-default px-3 py-1.5 text-body-medium text-text-primary outline-none focus:border-border-button-hover"
        />
      </label>
      <SectionList
        sections={sections}
        courses={courses}
        typical={typical}
        isLoading={isLoading}
        onRemove={onRemoveSection}
      />
    </div>
  );
}

function SectionList({
  sections,
  courses,
  typical,
  isLoading,
  onRemove,
}: {
  sections: Section[];
  courses: Course[];
  typical: Map<string, TypicalMeetingPattern>;
  isLoading: boolean;
  onRemove: (sectionId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title-3-medium text-text-primary">Sections</h2>
      {isLoading ? <p className="text-caption-1-regular text-text-tertiary">Loading…</p> : null}
      {!isLoading && sections.length === 0 ? (
        <p className="text-caption-1-regular text-text-tertiary">
          Nothing added yet. Add sections from a course page.
        </p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {sections.map((section) => {
          const course = courses.find((item) => item.courseId === section.courseId);
          const pattern = typical.get(section.sectionId);
          const hasTimes = (section.meetings?.length ?? 0) > 0;
          return (
            <li
              key={section.sectionId}
              className="flex items-start justify-between gap-3 rounded-2lg border border-border-table p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-body-medium text-text-primary">
                  {section.courseId} {section.sectionCode} · {course?.title ?? "Untitled"}
                </p>
                <p className="text-caption-1-regular text-text-tertiary">
                  {hasTimes
                    ? section.meetings
                        .map(
                          (meeting) =>
                            `${WEEKDAY_LABEL[meeting.weekday]} ${minutesToLabel(meeting.startMinute)}–${minutesToLabel(meeting.endMinute)}`,
                        )
                        .join(" · ")
                    : pattern
                      ? `No published time this term. Last met ${pattern.meetings
                          .map(
                            (meeting) =>
                              `${WEEKDAY_LABEL[meeting.weekday]} ${minutesToLabel(meeting.startMinute)}–${minutesToLabel(meeting.endMinute)}`,
                          )
                          .join(", ")}.`
                      : "No published meeting time this term."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(section.sectionId)}
                aria-label={`Remove ${section.courseId} ${section.sectionCode}`}
                className="shrink-0 rounded-2lg p-1.5 text-foreground-icon-tertiary hover:bg-background-secondary-hover"
              >
                <RiDeleteBinLine className="size-4" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
