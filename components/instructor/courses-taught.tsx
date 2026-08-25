import { PrefetchLink } from "@/components/catalog/prefetch-link";
import { RiMapPin2Line, RiTimeLine } from "@remixicon/react";

import { ProvenanceStamp, SeatPill } from "@/components/course/seat-state";
import { InstructorSection } from "./section-block";
import { InstructorLinks } from "@/components/instructor/instructor-link";
import { vergilSectionUrl } from "@/lib/constants";
import type { InstructorCourseRef } from "@/lib/data/instructors";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";
import { countLabel } from "./format";

/**
 * What this person actually teaches — the substance the template's card layout
 * exists to frame.
 *
 * One block per course, sections nested inside it. Every seat figure carries
 * the directory's own "as of" (spec §3): the row prints it inline rather than
 * hoisting a single timestamp to the top of the card, because sections are
 * crawled independently and two rows genuinely can be as of different times.
 *
 * Co-instructors are links, so a co-taught section is a way into the other
 * person's page rather than a dead end.
 */

export interface CoursesTaughtProps {
  courses: InstructorCourseRef[];
  termCode: TermCode;
  termLabel: string;
  className?: string;
}

export function CoursesTaught({
  courses,
  termCode,
  termLabel,
  className,
}: CoursesTaughtProps) {
  return (
    <div className={cx("w-full", className)}>
      <InstructorSection
        id="courses-taught"
        title={`Teaching in ${termLabel}`}
        /*
          No `count` here on purpose. The label pill and the headline would both
          read "2" one line apart — the pill exists for blocks whose heading is
          the only place a size can go, and this block states it in words
          directly underneath.
        */
        headline={`${courses.length} ${courses.length === 1 ? "course" : "courses"}`}
      >
        {/*
          Hairline-separated rows, not a stack of cards — the same decision
          `app/course/[courseId]/sections-panel.tsx` documents and for the same
          reason. This block used to nest a filled course card inside the
          section, and bordered section boxes inside that: two boxes drawn to
          say "this is one section of one course", indented away from the
          "TEACHING IN …" label so nothing on the page shared a left edge.

          Now the course header starts at the section label's edge and the
          sections are rules between rows. `-mx-2` with `px-2` lets the hover
          fill bleed past the text column while the text itself stays aligned,
          which is what makes the list read as part of the document rather than
          a widget dropped into it.
        */}
        <div className="flex flex-col gap-5">
        {courses.map((course) => (
          <article key={course.courseId} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-caption-1-semibold tracking-[0.04em] tabular-nums text-accent-600">
                  {course.code}
                </span>
                <h3 className="text-headline-semibold text-pretty text-text-primary">
                  {/*
                    A 20px-tall heading link is the main way into the course,
                    and it is under the WCAG 2.5.8 floor. The hit area grows
                    rather than the box: `py` here would push every sections
                    list down. The halo is tighter than it was — the card
                    padding it used to sit inside is gone, and the first
                    section row now begins ~10px below, so `-inset-y-1.5`
                    keeps it clear of the first tappable thing under it.
                  */}
                  <PrefetchLink
                    href={`/course/${course.courseId}`}
                    className="relative rounded-lg outline-none transition-colors duration-150 hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
                  >
                    {course.title}
                  </PrefetchLink>
                </h3>
              </div>
              {/*
                Plain dot-separated text, the way the course page's own hero
                prints "COMS 1002 · Fall 2026 · 4 credits". This was a filled
                `Chip`, which on a zero-credit course rendered a grey pill
                reading "0 credits" — the loudest treatment on the row spent on
                its least interesting fact, and the only filled thing left in a
                column that is otherwise all hairlines and text.
              */}
              <div className="flex shrink-0 items-center gap-x-1.5 text-caption-1-medium tabular-nums text-text-secondary">
                {course.credits ? <span>{course.credits}</span> : null}
                {course.credits &&
                course.enrolled != null &&
                course.capacity != null ?
                  <span aria-hidden>·</span>
                : null}
                {course.enrolled != null && course.capacity != null ?
                  <span>
                    {countLabel(course.enrolled)} /{" "}
                    {countLabel(course.capacity)} seats
                  </span>
                : null}
              </div>
            </div>

            <ul className="-mx-2 flex list-none flex-col">
              {course.sections.map((section) => {
                return (
                  <li
                    key={section.sectionId}
                    className={cx(
                      "group/section relative flex flex-col gap-1 rounded-xl px-2 py-3",
                      "border-b border-border-table transition-colors duration-150 last:border-b-0",
                      "motion-reduce:transition-none hover:bg-background-primary-hover",
                      "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                    )}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {/*
                          The whole row opens the section, via the same
                          stretched link `app/course/[courseId]/sections-panel.tsx`
                          uses: `after:absolute after:inset-0` grows this
                          anchor's hit area over the entire <li>, so a pointer
                          gets a row-sized target while assistive tech still
                          sees one link with one accessible name. Wrapping the
                          row in an <a> is not an option — it already holds the
                          Vergil link and, on a co-taught section, instructor
                          links, and an anchor cannot contain interactive
                          descendants.

                          Anything that must stay clickable escapes with
                          `relative z-10`; `InstructorLinks` carries its own
                          `relative z-[1]` for exactly this reason.
                        */}
                        <PrefetchLink
                          href={`/course/${course.courseId}?section=${encodeURIComponent(section.sectionCode)}`}
                          className={cx(
                            "text-body-semibold text-text-primary",
                            "rounded outline-none transition-colors duration-100",
                            "hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                            "after:absolute after:inset-0 after:content-['']",
                          )}
                        >
                          Section {section.sectionCode}
                          {/*
                            "Section 001" is not a name — this page lists three
                            of them, one per course. The course it belongs to
                            is on screen in the heading above, but a reader
                            tabbing link-to-link never sees that heading, so it
                            joins the accessible name here instead.
                          */}
                          <span className="sr-only">
                            {" "}
                            of {course.code} {course.title}
                          </span>
                        </PrefetchLink>
                        {section.component ?
                          <span className="text-caption-1-regular text-text-secondary">
                            {section.component}
                          </span>
                        : null}
                        {/*
                          This link leaves for Vergil to register — the most
                          consequential tap on the page, and at 16px tall the
                          smallest. It gets the real 44px: it is a flex item on
                          its own line-box, so the row grows with it and the
                          wrapped lines stay separated by their own line height.
                        */}
                        <a
                          href={vergilSectionUrl(termCode, section.callNumber)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open this section in Vergil to register"
                          className="relative z-10 inline-flex items-center rounded text-caption-1-medium tabular-nums text-text-secondary underline decoration-dotted underline-offset-2 outline-none hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring pointer-coarse:min-h-11"
                        >
                          Call {section.callNumber}
                        </a>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption-1-regular text-text-secondary">
                        <span className="inline-flex items-center gap-1">
                          <RiTimeLine
                            aria-hidden
                            className="size-3.5 shrink-0"
                          />
                          <span className="tabular-nums">
                            {section.meetingSummary ??
                              "Meeting time not published"}
                          </span>
                        </span>
                        {section.placeSummary ?
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <RiMapPin2Line
                              aria-hidden
                              className="size-3.5 shrink-0"
                            />
                            <span className="truncate">
                              {section.placeSummary}
                            </span>
                          </span>
                        : null}
                      </div>

                      {section.coInstructors.length > 0 ?
                        <p className="text-caption-2-regular text-text-tertiary">
                          With <InstructorLinks names={section.coInstructors} />
                        </p>
                      : null}
                    </div>

                    {/*
                      `SeatPill` and `ProvenanceStamp`, not a local re-render of
                      the same two facts. This column used to hand-roll a toned
                      `<span>` and an "as of …" line, which put the identical
                      information in the identical position as the course page's
                      sections list while looking different — a filled pill there,
                      bare coloured text here. Two lists of sections that disagree
                      about how a section looks read as two products.

                      Sharing the components also means the seat tone thresholds
                      and the "no timestamp published" wording can only ever be
                      defined once.
                    */}
                    <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
                      <SeatPill section={section} />
                      {/* Every seat number carries the directory's own stamp. */}
                      <ProvenanceStamp sourceAsOf={section.sourceAsOf} />
                    </div>
                  </li>
                );
              })}
            </ul>
            </article>
          ))}
        </div>
      </InstructorSection>
    </div>
  );
}
