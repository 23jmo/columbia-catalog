import Link from "next/link";
import { RiMapPin2Line, RiTimeLine } from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { provenanceLabel, readSeats } from "@/components/course/format";
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

/**
 * Colour reinforces the seat state, it never carries it (spec §18): the
 * headline beside it already says "Full" / "12 of 80 seats left" in words.
 */
const TONE_CLASS: Record<ReturnType<typeof readSeats>["tone"], string> = {
  open: "text-status-lime-text",
  tight: "text-status-yellow-text",
  full: "text-status-rose-text",
  waitlist: "text-status-purple-text",
  unknown: "text-text-tertiary",
};

export interface CoursesTaughtProps {
  courses: InstructorCourseRef[];
  termCode: TermCode;
  termLabel: string;
  className?: string;
}

export function CoursesTaught({ courses, termCode, termLabel, className }: CoursesTaughtProps) {
  return (
    <section
      className={cx(
        "flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
      aria-labelledby="courses-taught-heading"
    >
      <div className="flex w-full flex-col gap-0.5 px-1.5 pt-1">
        <p id="courses-taught-heading" className="text-body-medium text-text-secondary">
          Teaching in {termLabel}
        </p>
        <p className="text-title-2-medium tabular-nums text-text-primary">
          {courses.length} {courses.length === 1 ? "course" : "courses"}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {courses.map((course) => (
          <article
            key={course.courseId}
            className="flex flex-col gap-2 rounded-2lg bg-background-primary-default p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-caption-1-semibold tracking-[0.04em] tabular-nums text-accent-600">
                  {course.code}
                </span>
                <h3 className="text-headline-semibold text-pretty text-text-primary">
                  <Link
                    href={`/course/${course.courseId}`}
                    className="rounded-lg outline-none transition-colors duration-150 ease hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    {course.title}
                  </Link>
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {course.credits ? (
                  <Chip variant="caption" color="soft">
                    {course.credits}
                  </Chip>
                ) : null}
                {course.enrolled != null && course.capacity != null ? (
                  <span className="text-caption-1-medium tabular-nums text-text-secondary">
                    {countLabel(course.enrolled)} / {countLabel(course.capacity)} seats
                  </span>
                ) : null}
              </div>
            </div>

            <ul className="flex flex-col gap-1.5">
              {course.sections.map((section) => {
                const seats = readSeats(section);
                const asOf = provenanceLabel(section.sourceAsOf);
                return (
                  <li
                    key={section.sectionId}
                    className="flex flex-col gap-1 rounded-lg border border-border-table px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-body-semibold text-text-primary">
                          Section {section.sectionCode}
                        </span>
                        {section.component ? (
                          <span className="text-caption-1-regular text-text-secondary">
                            {section.component}
                          </span>
                        ) : null}
                        <a
                          href={vergilSectionUrl(termCode, section.callNumber)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open this section in Vergil to register"
                          className="rounded text-caption-1-medium tabular-nums text-text-secondary underline decoration-dotted underline-offset-2 outline-none hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                        >
                          Call {section.callNumber}
                        </a>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption-1-regular text-text-secondary">
                        <span className="inline-flex items-center gap-1">
                          <RiTimeLine aria-hidden className="size-3.5 shrink-0" />
                          <span className="tabular-nums">
                            {section.meetingSummary ?? "Meeting time not published"}
                          </span>
                        </span>
                        {section.placeSummary ? (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <RiMapPin2Line aria-hidden className="size-3.5 shrink-0" />
                            <span className="truncate">{section.placeSummary}</span>
                          </span>
                        ) : null}
                      </div>

                      {section.coInstructors.length > 0 ? (
                        <p className="text-caption-2-regular text-text-tertiary">
                          With <InstructorLinks names={section.coInstructors} />
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col sm:items-end">
                      <span
                        className={cx(
                          "text-caption-1-medium tabular-nums",
                          TONE_CLASS[seats.tone],
                        )}
                      >
                        {seats.headline}
                      </span>
                      {/* Provenance travels with the number, always (spec §3). */}
                      <span className="text-caption-2-regular text-text-tertiary">
                        {asOf ? `as of ${asOf}` : "no “as of” published"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
