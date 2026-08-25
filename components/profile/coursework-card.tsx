import { RiAlertLine } from "@remixicon/react";

import { COURSE_SOURCE_LABEL, type TakenCourse } from "@/lib/profile/types";
import { formatCourseId } from "@/lib/requirements/code";
import { cx } from "@/utils/cx";
import { CoursePicker, type CourseSuggestion } from "./course-picker";
import { RemoveCourseButton } from "./remove-course-button";
import { TranscriptImport } from "./transcript-import";

/**
 * Everything the student says they have taken.
 *
 * ── Grouped by term, and by "term not recorded" last ────────────────────────
 *
 * A transcript import carries the term as printed (`"Fall 2024"`); a hand-typed
 * course usually does not. Rather than invent a term for the second kind or
 * sort them into a false chronology, they get their own group at the bottom.
 * The term is display-only either way — the audit never uses it, because we
 * cannot check prerequisite ordering and pretending otherwise would be another
 * false green.
 *
 * ── Every row shows where it came from ──────────────────────────────────────
 *
 * Spec §3: provenance travels. "Imported from a PDF" and "added by hand" are
 * different levels of care, and a student re-reading their own record months
 * later should be able to tell which rows they actually checked.
 */

export interface CourseworkCardProps {
  courses: TakenCourse[];
  /** Catalog titles, where we have them. Keyed by course id. */
  titles: Record<string, string>;
  /** Courses named by outstanding requirements, offered in the picker. */
  suggestions: CourseSuggestion[];
  /** Course ids on the record that our catalog does not contain. */
  unmatchedCourseIds: string[];
  /** Courses counting toward more than one requirement. Reported, not resolved. */
  crossCounted: string[];
  /** False when nobody is signed in; the add controls stay visible but inert. */
  signedIn?: boolean;
  className?: string;
}

interface TermGroup {
  label: string;
  courses: TakenCourse[];
}

/**
 * Newest term first, with the undated group pinned last.
 *
 * Term labels are free text off a transcript, so this sorts by the year and
 * season it can find in them and falls back to the label itself — good enough
 * for a display grouping, and it never throws away a row it cannot parse.
 */
const SEASON_ORDER: Record<string, number> = { spring: 1, summer: 2, fall: 3, autumn: 3, winter: 0 };

function termRank(label: string): number {
  const year = /(\d{4})/.exec(label)?.[1];
  if (!year) return -1;
  const season = /spring|summer|fall|autumn|winter/i.exec(label)?.[0].toLowerCase();
  return Number(year) * 10 + (season ? SEASON_ORDER[season] : 5);
}

function groupByTerm(courses: TakenCourse[]): TermGroup[] {
  const byLabel = new Map<string, TakenCourse[]>();
  const undated: TakenCourse[] = [];

  for (const course of courses) {
    const label = course.termLabel?.trim();
    if (!label) {
      undated.push(course);
      continue;
    }
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(course);
    else byLabel.set(label, [course]);
  }

  const dated = [...byLabel.entries()]
    .map(([label, entries]) => ({ label, courses: entries }))
    .sort((a, b) => termRank(b.label) - termRank(a.label));

  return undated.length > 0
    ? [...dated, { label: "Term not recorded", courses: undated }]
    : dated;
}

export function CourseworkCard({
  courses,
  titles,
  suggestions,
  unmatchedCourseIds,
  crossCounted,
  signedIn = true,
  className,
}: CourseworkCardProps) {
  const groups = groupByTerm(courses);
  const unmatched = new Set(unmatchedCourseIds);
  const crossed = new Set(crossCounted);

  return (
    <section
      className={cx(
        "flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
      aria-labelledby="coursework-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-1.5 pt-1">
        <div className="flex flex-col gap-0.5">
          <p id="coursework-heading" className="text-body-medium text-text-secondary">
            Courses you have taken
          </p>
          <p className="text-title-2-medium tabular-nums text-text-primary">
            {courses.length} {courses.length === 1 ? "course" : "courses"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TranscriptImport signedIn={signedIn} />
          <CoursePicker
            suggestions={suggestions}
            takenCourseIds={courses.map((course) => course.courseId)}
            signedIn={signedIn}
          />
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-2lg bg-background-primary-default p-4">
          {/*
            The two controls to do something about this are six inches above,
            labelled. An empty state that re-describes them in a sentence is
            narrating the interface. "Never uploaded" and "you confirm every
            row" are real promises, but they are made where they apply — in
            the importer itself, and once at the bottom of the page.
          */}
          <p className="text-body-regular text-pretty text-text-secondary">
            Nothing on your record yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <div
              key={group.label}
              className="flex flex-col gap-1.5 rounded-2lg bg-background-primary-default p-3"
            >
              <p className="text-caption-1-semibold tracking-[0.04em] text-text-tertiary">
                {group.label}
              </p>
              <ul className="flex flex-col gap-1">
                {group.courses.map((course) => {
                  const code = formatCourseId(course.courseId);
                  const title = titles[course.courseId];
                  return (
                    <li
                      key={course.courseId}
                      className="flex items-center gap-2 rounded-lg border border-border-table px-2.5 py-1.5"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <a
                            href={`/course/${course.courseId}`}
                            className="text-body-semibold tabular-nums text-text-primary outline-none transition-colors duration-150 hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                          >
                            {code}
                          </a>
                          {title ? (
                            <span className="min-w-0 truncate text-body-regular text-text-secondary">
                              {title}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-2-regular text-text-tertiary">
                          <span>{COURSE_SOURCE_LABEL[course.source]}</span>
                          {course.points != null ? <span>{course.points} pts</span> : null}
                          {/*
                            Both markers are two words, not a sentence. The
                            explanation lives once at the bottom of the card:
                            repeating it on every row turned a nine-course
                            record into nine paragraphs of the same caveat, and
                            a warning printed that often stops being read.
                          */}
                          {unmatched.has(course.courseId) ? (
                            <span className="text-status-yellow-text">not in our catalog</span>
                          ) : null}
                          {crossed.has(course.courseId) ? (
                            <span className="text-status-cyan-text">double-counted</span>
                          ) : null}
                        </div>
                      </div>
                      <RemoveCourseButton courseId={course.courseId} code={code} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {unmatchedCourseIds.length > 0 ? (
        <div className="flex items-start gap-2 rounded-2lg bg-background-primary-default p-3">
          <RiAlertLine className="mt-px size-4 shrink-0 text-status-yellow-text" aria-hidden />
          <p className="text-caption-1-regular text-pretty text-text-secondary">
            <span className="text-text-primary">
              {unmatchedCourseIds.length} course
              {unmatchedCourseIds.length === 1 ? " is" : "s are"} not in our catalog.
            </span>{" "}
            That is normal for transfer and AP credit, and for terms older than the ones we hold.
            Those rows still count toward requirements that name them by course code — but never
            toward one matched on a curriculum flag, because the flag lives on a catalog record we
            do not have.
          </p>
        </div>
      ) : null}

      {crossCounted.length > 0 ? (
        <div className="flex items-start gap-2 rounded-2lg bg-background-primary-default p-3">
          <RiAlertLine
            className="mt-px size-4 shrink-0 text-status-yellow-text"
            aria-hidden
          />
          <p className="text-caption-1-regular text-pretty text-text-secondary">
            <span className="text-text-primary">
              {crossCounted.length} course{crossCounted.length === 1 ? " is" : "s are"} counting
              toward more than one requirement.
            </span>{" "}
            Columbia&rsquo;s rules about that are department-specific and mostly unpublished — some
            programs allow it, most do not, and an adviser settles the rest. We show it rather than
            guess, because guessing wrong here is what gets someone to their last term a course
            short.{" "}
            {crossCounted.map((courseId) => formatCourseId(courseId)).join(", ")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
