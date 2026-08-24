"use client";

import { useState } from "react";
import { RiScales3Line } from "@remixicon/react";

import { meetingLines, placeSummary, prettyTitle } from "@/components/course/format";
import { RegistrationHandoff } from "@/components/course/registration-handoff";
import { SectionCompare } from "@/components/course/section-compare";
import { ProvenanceStamp, SeatPill } from "@/components/course/seat-state";
import { BookmarkControls } from "@/components/bookmarks/bookmark-controls";
import { InstructorLinks } from "@/components/instructor/instructor-link";
import { useWatchlist } from "@/hooks/use-watchlist";
import { isDistinctSectionTitle } from "@/lib/catalog-list-types";
import type { Section } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * Every section of this course, with same-course compare (spec §7).
 *
 * This is the one genuinely stateful part of the detail surface — the compare
 * selection — which is why it is the client boundary. Everything above and
 * below it stays a server subtree.
 *
 * The list itself is not a table: choosing a section is a scan for *your*
 * constraint (that time, that professor, a seat), and cards let each section
 * carry its own seat provenance without a column of repeated timestamps. The
 * table appears only once you have picked sections to compare, which is when
 * reading down a row is finally the right shape.
 */

export interface SectionsPanelProps {
  sections: Section[];
  courseCode: string;
  courseTitle: string;
}

export function SectionsPanel({ sections, courseCode, courseTitle }: SectionsPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Watcher counts for every section on screen, and live seat readings for the
  // ones this student watches. A course page left open through a registration
  // window is showing history otherwise — the seat numbers the server rendered
  // are minutes old by the time anyone acts on them.
  const { seats } = useWatchlist(sections.map((section) => section.sectionId));

  const toggle = (sectionId: string) =>
    setSelectedIds((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId],
    );

  if (sections.length === 0) {
    return (
      <p className="text-body-regular text-text-secondary">
        No sections are published for this course in this term.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex list-none flex-col gap-2">
        {sections.map((section) => {
          const lines = meetingLines(section.meetings);
          const place = placeSummary(section.meetings);
          const isComparing = selectedIds.includes(section.sectionId);
          /*
           * `Section` here is the raw DB record, not the display projection, so
           * `title` still carries the directory's per-row <h1> verbatim -- which
           * for an ordinary course is the course title again, already rendered
           * at the top of this page. Only a title that says something the course
           * title does not is worth printing.
           */
          const ownTitle = isDistinctSectionTitle(section.title, courseTitle)
            ? prettyTitle(section.title!)
            : null;

          // A pushed reading replaces the rendered one wholesale, provenance
          // stamp included — half-updating would put a fresh seat count under
          // a stale "as of", which is the one combination worse than either.
          const live = seats.get(section.sectionId);
          const shown = live
            ? {
                ...section,
                enrollmentCount: live.enrollmentCount,
                enrollmentCap: live.enrollmentCap,
                waitlistCount: live.waitlistCount,
                status: live.status,
                sourceAsOf: live.sourceAsOf,
              }
            : section;

          return (
            <li
              key={section.sectionId}
              className={cx(
                "flex flex-col gap-3 rounded-2lg border p-3",
                isComparing
                  ? "border-accent-500/40 bg-background-secondary-default"
                  : "border-border-table bg-background-primary-default",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-body-semibold text-text-primary">
                      Section {section.sectionCode}
                    </span>
                    {/*
                      On a container course this is the actual name of the class
                      -- COMS6998's sections are 24 unrelated courses sharing one
                      catalog entry -- so it reads as a name, not as metadata.
                    */}
                    {ownTitle ? (
                      <span className="text-body-regular text-text-primary">{ownTitle}</span>
                    ) : null}
                    {section.component ? (
                      <span className="text-caption-1-regular text-text-secondary">
                        {section.component}
                      </span>
                    ) : null}
                    {section.methodOfInstruction ? (
                      <span className="text-caption-1-regular text-text-secondary">
                        {section.methodOfInstruction}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-caption-1-regular text-text-secondary">
                    <InstructorLinks names={section.instructors} separator=" · " />
                  </p>

                  <div className="mt-1 flex flex-col gap-0.5 text-caption-1-regular text-text-secondary">
                    {lines.length > 0 ? (
                      lines.map((line) => (
                        <span key={`${line.daysLabel}-${line.timeLabel}`} className="tabular-nums">
                          {line.daysLabel} {line.timeLabel}
                          {line.placeLabel ? ` · ${line.placeLabel}` : ""}
                        </span>
                      ))
                    ) : (
                      <span>Meeting time not published by the directory</span>
                    )}
                    {lines.length === 0 && place ? <span>{place}</span> : null}
                  </div>

                  {section.openTo ? (
                    <p className="mt-1 text-caption-2-regular text-text-tertiary">
                      Open to: {section.openTo}
                    </p>
                  ) : null}
                  {section.note ? (
                    <p className="mt-1 text-caption-2-regular text-text-tertiary">{section.note}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
                  <SeatPill section={shown} />
                  {/* Every seat number carries the directory's own stamp. */}
                  <ProvenanceStamp sourceAsOf={shown.sourceAsOf} />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-table pt-2.5">
                <RegistrationHandoff
                  section={section}
                  courseCode={courseCode}
                  courseTitle={courseTitle}
                  variant="inline"
                />
                <BookmarkControls
                  sectionId={section.sectionId}
                  sectionCode={section.sectionCode}
                  courseLabel={courseCode}
                />
                <button
                  type="button"
                  aria-pressed={isComparing}
                  onClick={() => toggle(section.sectionId)}
                  className={cx(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1",
                    "text-caption-1-medium transition-colors outline-none",
                    "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                    isComparing
                      ? "bg-background-tertiary-default text-text-primary"
                      : "text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
                  )}
                >
                  <RiScales3Line aria-hidden className="size-3.5" />
                  {isComparing ? "Comparing" : "Compare"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border-table pt-4">
        <SectionCompare
          sections={sections}
          selectedIds={selectedIds}
          onRemove={(sectionId) =>
            setSelectedIds((current) => current.filter((id) => id !== sectionId))
          }
          onClear={() => setSelectedIds([])}
          // TODO(reviews): pass instructor-level summaries from lib/reviews
          // once review ingest is populating them. Until then the compare
          // table honestly reports "No reviews matched".
        />
      </div>
    </div>
  );
}
