"use client";

import { useState } from "react";
import { RiScales3Line } from "@remixicon/react";

import { PrefetchLink } from "@/components/catalog/prefetch-link";
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
      {/*
        Hairline-separated rows, not a stack of cards.

        Each section used to be a bordered, filled card — inside a bordered
        block, inside what was then a shadowed `Panel`. Three nested boxes to
        say "this is one section of one course", and on a five-section course
        the borders alone outnumbered the facts. A rule between rows separates
        them for one pixel, and it is the same mark the reference blocks above
        already use, so the list reads as part of the document instead of as a
        widget dropped into it.

        `-mx-2` lets the hover fill and the compare tint bleed past the text
        column the way the section view's sibling list does, so the highlight
        reads as a row rather than as a box drawn around the words.
      */}
      <ul className="-mx-2 flex list-none flex-col">
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
                "group/section relative flex flex-col gap-2.5 rounded-xl px-2 py-3",
                "border-b border-border-table transition-colors duration-150 last:border-b-0",
                isComparing
                  ? "bg-background-secondary-default"
                  : "hover:bg-background-primary-hover",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {/*
                      The whole row opens the section, via the same stretched
                      link the search results use: `after:absolute after:inset-0`
                      grows this anchor's hit area over the entire <li>, so the
                      pointer gets a row-sized target while assistive tech still
                      sees exactly one link with one accessible name. Wrapping
                      the row in an <a> is not an option — it holds a copy
                      button, a Vergil link, a bookmark and a compare toggle,
                      and an anchor cannot contain interactive descendants.

                      Anything that must stay clickable escapes with
                      `relative z-10`; `InstructorLink` already carries its own
                      `relative z-[1]` for exactly this reason.

                      The block is already titled "Sections", so the row leads
                      with the bare code — repeating the word on every row is
                      the label restating itself.
                    */}
                    <PrefetchLink
                      href={`/course/${section.courseId}?section=${encodeURIComponent(section.sectionCode)}`}
                      className={cx(
                        "text-body-medium tabular-nums text-text-primary",
                        "rounded outline-none transition-colors duration-100",
                        "hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                        "after:absolute after:inset-0 after:content-['']",
                      )}
                    >
                      {section.sectionCode}
                      {/*
                        Inside the link, not beside it. On a container course
                        the section's own title is the only string that says
                        which class this row is, so it has to be part of the
                        link's accessible name — and rendering it visibly here
                        rather than as a sibling avoids a screen reader hearing
                        it twice, once in the name and once as loose text.
                      */}
                      {ownTitle ? (
                        <span className="ml-1.5 text-body-regular text-text-primary">{ownTitle}</span>
                      ) : null}
                      <span className="sr-only">
                        {section.instructors.length > 0
                          ? ` — ${section.instructors.join(", ")}`
                          : ""}
                      </span>
                    </PrefetchLink>
                    {/*
                      On a container course this is the actual name of the class
                      -- COMS6998's sections are 24 unrelated courses sharing one
                      catalog entry -- so it reads as a name, not as metadata.
                    */}
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
                        <span
                          key={`${line.daysLabel}-${line.timeLabel}`}
                          className="tabular-nums"
                        >
                          {line.daysLabel} {line.timeLabel}
                          {line.placeLabel ? ` · ${line.placeLabel}` : ""}
                        </span>
                      ))
                    ) : (
                      /* "Time TBD", the phrase `MeetingSchedule` and the
                         section view's sibling list already use. The old
                         sentence explained WHY the time was missing, which is
                         worth saying once — the glance row at the top of the
                         page says it — and not once per section. On a
                         24-section course it was 24 identical apologies. */
                      <span>Time TBD</span>
                    )}
                    {lines.length === 0 && place ? <span>{place}</span> : null}
                  </div>

                  {section.openTo ? (
                    <p className="mt-1 text-caption-2-regular text-text-tertiary">
                      Open to: {section.openTo}
                    </p>
                  ) : null}
                  {section.note ? (
                    <p className="mt-1 text-caption-2-regular text-text-tertiary">
                      {section.note}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
                  <SeatPill section={shown} />
                  {/* Every seat number carries the directory's own stamp. */}
                  <ProvenanceStamp sourceAsOf={shown.sourceAsOf} />
                </div>
              </div>

              {/*
                No rule above this — the row's own bottom hairline already
                separates it from the next section.

                `relative z-10` lifts the whole cluster out from under the row's
                stretched link; without it every click on Copy, Vergil, the
                bookmark or Compare would open the section instead.

                Two groups, not three things spread across the full width.
                `justify-between` on a flat list put the bookmark alone in the
                middle of the row, equidistant from everything and attached to
                nothing. The hand-off pair (copy the call number, open Vergil)
                belongs on the left because both send you elsewhere; the two
                things you do to this section HERE — save it, compare it — sit
                together on the right.
              */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
                <RegistrationHandoff
                  section={section}
                  courseCode={courseCode}
                  courseTitle={courseTitle}
                  variant="inline"
                />
                <div className="flex items-center gap-1">
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
              </div>
            </li>
          );
        })}
      </ul>

      {/* The wrapper is inside the guard, not around it. `SectionCompare`
          returns null with nothing selected, but its bordered container did
          not — so an empty rule hung below the last section on every course
          page nobody had clicked Compare on. */}
      {selectedIds.length > 0 ? (
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
      ) : null}
    </div>
  );
}
