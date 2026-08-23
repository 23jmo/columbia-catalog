import Link from "next/link";
import { RiArrowRightUpLine, RiBookOpenLine } from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { meetingLines, placeSummary } from "@/components/course/format";
import type { SectionDetailData } from "@/components/course/load-section-detail";
import { RegistrationHandoff } from "@/components/course/registration-handoff";
import { ProvenanceStamp, SeatState } from "@/components/course/seat-state";
import { WatchButton } from "@/components/watch/watch-button";
import { REQUIREMENT_FILTERS } from "@/lib/constants";

/**
 * One section, as the drawer draws it.
 *
 * The drawer is section-specific by rule: clicking a class opens THAT class,
 * never the container it is filed under. On PHED1001UN — 64 sections named
 * "PHED: Swim (Beginner)", "PHED: Diving", "PHED: Walk to Run" — a course-level
 * overlay answers a question nobody asked, because "Physical Education
 * Activities" is a filing category, not a class anyone attends.
 *
 * So the section's own name is the `<h1>` when it has one, and the course
 * becomes a context line underneath rather than the subject of the page.
 *
 * ── Why this is not `CourseDetail` with a filter ───────────────────────────
 *
 * `CourseDetail` aggregates: meeting patterns unioned across sections, a
 * distinct-instructor roll-up, similar courses, eight terms of history. Every
 * one of those is a course-level claim, and narrowing them to one section would
 * mean either recomputing them (a second implementation of the same ideas) or
 * printing course-level numbers under a section-level heading — which is how a
 * page ends up saying "3 sections" while showing one. A separate component is
 * the honest shape; the standalone page keeps the aggregate view, and this
 * shows the specific one.
 *
 * Everything here is a fact about `data.section`. Course-level values appear
 * only where they are labelled as such.
 */

const REQUIREMENT_LABEL_BY_KEY = new Map(REQUIREMENT_FILTERS.map((r) => [r.key, r.label]));

export interface SectionDetailProps {
  data: SectionDetailData;
  /** The drawer points `aria-labelledby` at the heading. */
  titleId?: string;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption-2-medium tracking-[0.04em] text-text-tertiary uppercase">
        {label}
      </dt>
      <dd className="text-body-regular text-text-primary">{children}</dd>
    </div>
  );
}

function NotPublished() {
  return <span className="text-text-tertiary">Not published</span>;
}

export function SectionDetail({ data, titleId = "section-title" }: SectionDetailProps) {
  const { course, section, siblings, code, credits, headline, ownTitle, courseTitle } = data;

  const lines = meetingLines(section.meetings);
  const place = placeSummary(section.meetings);

  // Course-level, and labelled as such below — a Core requirement is satisfied
  // by the course, not by which section of it you sit in.
  const requirementLabels = Object.entries(course.requirementFlags)
    .filter(([, on]) => on === true)
    .map(([key]) => REQUIREMENT_LABEL_BY_KEY.get(key) ?? key);

  return (
    <article className="flex w-full flex-col gap-8">
      {/* ------------------------------------------------------------------ */}
      {/* Which class this is                                                 */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-1-medium text-text-secondary">
            <span className="text-caption-1-semibold tracking-[0.04em] tabular-nums text-accent-600">
              {code}
            </span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">Section {section.sectionCode}</span>
            <span aria-hidden>·</span>
            <span>{data.termLabel}</span>
            {credits ? (
              <>
                <span aria-hidden>·</span>
                <span>{credits}</span>
              </>
            ) : null}
          </div>

          <h1
            id={titleId}
            className="text-title-1-semibold -tracking-[0.02em] text-balance text-text-primary"
          >
            {headline}
          </h1>

          {/*
            Only when the section named itself. Printing "Part of X" under a
            heading that already says X is noise, and on an ordinary course the
            section title is the course title repeated verbatim.
          */}
          {ownTitle ? (
            <p className="text-body-regular text-text-secondary">
              Part of{" "}
              <Link
                href={`/course/${course.courseId}`}
                className="underline decoration-border-table underline-offset-2 transition-colors hover:text-text-primary"
              >
                {code} {courseTitle}
              </Link>
            </p>
          ) : null}

          <p className="text-headline-regular text-text-secondary">
            {section.instructors.length > 0
              ? section.instructors.join(" · ")
              : "Instructor TBA"}
          </p>

          {requirementLabels.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {requirementLabels.map((label) => (
                <Chip key={label} variant="caption" color="soft">
                  {label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

        {/* --------------------------------------------------------------- */}
        {/* The facts a registration decision needs — all section-scoped     */}
        {/* --------------------------------------------------------------- */}
        <div className="flex flex-col gap-5 rounded-[20px] border border-border-table bg-background-primary-default p-5 shadow-card">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Meets">
              {lines.length > 0 ? (
                <span className="flex flex-col gap-0.5">
                  {lines.map((line) => (
                    <span key={`${line.daysLabel}-${line.timeLabel}`} className="tabular-nums">
                      {line.daysLabel} {line.timeLabel}
                    </span>
                  ))}
                </span>
              ) : (
                <NotPublished />
              )}
            </Fact>
            <Fact label="Where">{place ?? <NotPublished />}</Fact>
            <Fact label="Call number">
              <span className="font-mono tabular-nums">{section.callNumber}</span>
            </Fact>
            <Fact label="Credits">{credits ?? <NotPublished />}</Fact>
            {section.component ? <Fact label="Type">{section.component}</Fact> : null}
            {section.methodOfInstruction ? (
              <Fact label="Method">{section.methodOfInstruction}</Fact>
            ) : null}
            {section.gradingMode ? <Fact label="Grading">{section.gradingMode}</Fact> : null}
          </dl>

          {/*
            Seats for THIS section. `SeatState` carries the directory's own
            "as of" stamp with the number (spec §3) — a seat count without its
            provenance is the one thing this surface must never render.
          */}
          <div className="flex flex-col gap-2 border-t border-border-table pt-4">
            <SeatState section={section} />
            <ProvenanceStamp sourceAsOf={section.sourceAsOf} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RegistrationHandoff
            section={section}
            courseCode={code}
            courseTitle={courseTitle}
            variant="full"
          />
          <WatchButton sectionId={section.sectionId} sectionCode={section.sectionCode} />
        </div>

        {section.openTo ? (
          <p className="text-caption-1-regular text-text-tertiary">Open to: {section.openTo}</p>
        ) : null}
        {section.note ? (
          <p className="text-caption-1-regular text-text-tertiary">{section.note}</p>
        ) : null}
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* What the course is about — context, not the subject                 */}
      {/* ------------------------------------------------------------------ */}
      {course.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-body-semibold text-text-primary">
            <RiBookOpenLine aria-hidden className="size-4 text-text-tertiary" />
            Description
          </h2>
          <p className="text-body-regular whitespace-pre-line text-text-secondary">
            {course.description}
          </p>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Sideways movement: the sibling sections of the same course          */}
      {/* ------------------------------------------------------------------ */}
      {siblings.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-body-semibold text-text-primary">
            Other sections of {code}
            <span className="ml-1.5 font-normal tabular-nums text-text-tertiary">
              {siblings.length}
            </span>
          </h2>
          {/*
            Links, not an expandable list. Each one swaps the drawer to that
            section in place, which is the movement a student actually makes
            here — "same class, different time" — without ever passing through
            a course-level view.
          */}
          <ul className="flex list-none flex-col">
            {siblings.map((sibling) => {
              const siblingLines = meetingLines(sibling.meetings);
              const when = siblingLines[0];
              return (
                <li key={sibling.sectionId}>
                  <Link
                    href={`/course/${course.courseId}?section=${encodeURIComponent(sibling.sectionCode)}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body-medium text-text-primary">
                        <span className="tabular-nums">{sibling.sectionCode}</span>
                        <span className="ml-2 font-normal text-text-secondary">
                          {sibling.instructors.length > 0
                            ? sibling.instructors.join(" · ")
                            : "Instructor TBA"}
                        </span>
                      </span>
                      {when ? (
                        <span className="text-caption-1-regular tabular-nums text-text-tertiary">
                          {when.daysLabel} {when.timeLabel}
                        </span>
                      ) : null}
                    </span>
                    <RiArrowRightUpLine
                      aria-hidden
                      className="size-4 shrink-0 text-text-tertiary"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Link
        href={`/course/${course.courseId}`}
        className="inline-flex items-center gap-1.5 self-start text-body-medium text-text-secondary underline decoration-border-table underline-offset-4 transition-colors outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        Full course page for {code}
        <RiArrowRightUpLine aria-hidden className="size-4" />
      </Link>
    </article>
  );
}
