import { RiAlertLine } from "@remixicon/react";

import { displayCourseTitle } from "@/lib/onboarding/course-title";
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
        /*
         * ── One line per course, on one surface per term ──────────────────────
         *
         * This was three nested rounded surfaces deep — the card, a filled box
         * per term, and a bordered box per course — and the innermost one broke
         * the concentric rule outright: a 10px radius sitting inside 12px of
         * padding inside another 10px radius has nowhere to be concentric to.
         * Eighteen courses came to about twelve hundred pixels, four times what
         * the same eighteen rows cost in the audit tree directly above.
         *
         * The row is now a single line on the term's surface, separated by the
         * hairline the tree uses. Provenance stays on every row — spec §3, and
         * the point of it is that a student can tell months later which rows
         * they actually checked — but it moves to the right-hand column with
         * the other qualifiers instead of claiming a second line of its own.
         */
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <div
              key={group.label}
              className="flex flex-col overflow-hidden rounded-2lg bg-background-primary-default"
            >
              <p className="px-3 pb-1 pt-2.5 text-caption-1-semibold tracking-[0.04em] text-text-tertiary">
                {group.label}
              </p>
              <ul className="flex flex-col">
                {group.courses.map((course) => {
                  const code = formatCourseId(course.courseId);
                  const title = titles[course.courseId];
                  const name = title ? displayCourseTitle(title) : null;
                  return (
                    <li
                      key={course.courseId}
                      className="flex min-h-11 items-center gap-2 border-t border-border-table px-3 py-1.5"
                    >
                      <a
                        href={`/course/${course.courseId}`}
                        className={cx(
                          "min-w-0 flex-1 truncate rounded-md text-subheadline-regular text-text-primary outline-none",
                          "transition-colors duration-150 motion-reduce:transition-none",
                          "hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                          !name && "tabular-nums",
                        )}
                      >
                        {name ?? code}
                      </a>

                      {/*
                        Both markers are two words, not a sentence. The
                        explanation lives once at the bottom of the card:
                        repeating it on every row turned a nine-course record
                        into nine paragraphs of the same caveat, and a warning
                        printed that often stops being read.
                      */}
                      {unmatched.has(course.courseId) ? (
                        <span className="shrink-0 text-caption-2-regular text-status-yellow-text">
                          not in our catalog
                        </span>
                      ) : null}
                      {crossed.has(course.courseId) ? (
                        <span className="shrink-0 text-caption-2-regular text-status-cyan-text">
                          double-counted
                        </span>
                      ) : null}

                      {/*
                        Behind the markers, and a fixed width, so the codes
                        form a column an eye can run down. Ahead of them the
                        column stepped left on every row that carried a
                        "double-counted" or "not in our catalog" note.
                      */}
                      <span className="hidden w-[6.5rem] shrink-0 text-right text-caption-2-regular tabular-nums text-text-tertiary sm:inline">
                        {/* Empty, not absent, when the code is already the row's
                            label — an absent column would step every column to
                            its right off the grid on that one row. */}
                        {name ? code : null}
                      </span>

                      {course.points != null ? (
                        <span className="hidden shrink-0 text-caption-2-regular tabular-nums text-text-tertiary sm:inline">
                          {course.points} pts
                        </span>
                      ) : null}
                      <span className="hidden w-[7rem] shrink-0 truncate text-right text-caption-2-regular text-text-tertiary md:inline">
                        {COURSE_SOURCE_LABEL[course.source]}
                      </span>

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
