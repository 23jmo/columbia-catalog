"use client";

import { useState, useTransition } from "react";
import { RiAddLine, RiCheckLine } from "@remixicon/react";

import { addCoursesAction } from "@/app/profile/actions";
import { displayCourseTitle } from "@/lib/onboarding/course-title";
import { formatCourseId } from "@/lib/requirements/code";
import { cx } from "@/utils/cx";

/**
 * "Any of these would finish it" — the courses a rule names that the student
 * has not taken.
 *
 * Each chip is two targets on purpose: the label is a link into the course page,
 * and the `+` marks it as already taken. That split is the whole point. A
 * single-target chip has to choose between "tell me about this" and "I did
 * this", and the two are asked in the same breath while reading a requirement.
 *
 * ── The chip says the course's NAME ─────────────────────────────────────────
 *
 * It used to say `COMS W3261` and nothing else, which asks a student to hold a
 * catalog in their head. Nobody decides whether they have taken a class from
 * its course number; they decide from "Computer Science Theory". So the name
 * leads and the code follows in brackets — the code still has to be there,
 * because it is what the Bulletin and SSOL are indexed by and it is what a
 * student types when they go looking.
 *
 * The catalog stores registrar titles in whatever case they arrived in, so
 * `displayCourseTitle` runs over them for the same reason the recommendation
 * strip runs it: a row of "COMPUTER SCIENCE THEORY" next to "Data Structures in
 * Java" reads as a rendering bug.
 *
 * A candidate we have no title for keeps the bare code. That is the honest
 * rendering of "this course is named by the Bulletin but is not offered in
 * either term we hold" — inventing a name from the code would be worse.
 *
 * Only rules that name a finite set produce candidates (`all_of`, `n_of`,
 * `sequence_choice`). A flag-matched requirement has no list to print here —
 * the recommender is the right surface for those, and it is further up the
 * page.
 */

export interface CandidateChipsProps {
  courseIds: string[];
  /** `courseId` → catalog title. Missing ids fall back to the bare code. */
  titles?: Record<string, string>;
  /**
   * How many to show before "+N more". Long lists are a real thing here — the
   * CS major's Area Foundation rule names more than twenty — and a titled chip
   * is three or four times the width of a bare code, so this is lower than it
   * was when the chips were codes.
   */
  limit?: number;
  className?: string;
}

export function CandidateChips({
  courseIds,
  titles,
  limit = 6,
  className,
}: CandidateChipsProps) {
  const [expanded, setExpanded] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (courseIds.length === 0) return null;

  const shown = expanded ? courseIds : courseIds.slice(0, limit);
  const hidden = courseIds.length - shown.length;

  const markTaken = (courseId: string) => {
    setError(null);
    setAdded((current) => new Set(current).add(courseId));
    startTransition(async () => {
      const result = await addCoursesAction([{ code: courseId, source: "picker" }]);
      if (!result.ok) {
        setAdded((current) => {
          const next = new Set(current);
          next.delete(courseId);
          return next;
        });
        setError(result.error ?? "Could not add that course.");
      }
    });
  };

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((courseId) => {
          const code = formatCourseId(courseId);
          const title = titles?.[courseId];
          const name = title ? displayCourseTitle(title) : null;
          const isAdded = added.has(courseId);
          return (
            <span
              key={courseId}
              className={cx(
                "inline-flex min-h-8 max-w-full items-center overflow-hidden rounded-lg border transition-colors duration-150 motion-reduce:transition-none",
                isAdded
                  ? "border-status-lime-text/40 bg-status-lime-background"
                  : "border-border-table bg-background-primary-default",
              )}
            >
              <a
                href={`/course/${courseId}`}
                className={cx(
                  "flex min-w-0 items-center gap-1 px-2 py-1 text-caption-1-regular text-text-primary outline-none transition-colors duration-150 motion-reduce:transition-none",
                  "hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
                )}
              >
                {name ? (
                  <>
                    {/*
                      The NAME gives way, not the code. Truncating the whole
                      label together cut "Fundamentals of Computer Systs (CSEE
                      W3827)" to "…(CSEE …" — and half a course code is worth
                      nothing, while half a course name is still recognisable.
                      So the name shrinks and the code holds its width.
                    */}
                    <span className="min-w-0 truncate">{name}</span>
                    <span className="shrink-0 tabular-nums text-text-tertiary">({code})</span>
                  </>
                ) : (
                  <span className="tabular-nums">{code}</span>
                )}
              </a>
              {isAdded ? (
                <span
                  className="flex size-8 items-center justify-center border-l border-status-lime-text/40 text-status-lime-text"
                  title="On your record"
                >
                  <RiCheckLine className="size-3.5" aria-hidden />
                  <span className="sr-only">On your record</span>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Mark ${name ? `${name} (${code})` : code} as already taken`}
                  title="Mark as already taken"
                  onClick={() => markTaken(courseId)}
                  className={cx(
                    "flex size-8 shrink-0 items-center justify-center border-l border-border-table text-foreground-icon-tertiary outline-none",
                    "transition-[background-color,color,transform] duration-150 motion-reduce:transition-none",
                    "hover:bg-background-secondary-hover hover:text-text-primary active:scale-[0.96]",
                    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
                  )}
                >
                  <RiAddLine className="size-3.5" aria-hidden />
                </button>
              )}
            </span>
          );
        })}

        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-lg px-2 py-1 text-caption-1-medium text-text-tertiary outline-none transition-colors duration-150 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring motion-reduce:transition-none"
          >
            +{hidden} more
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-caption-2-regular text-text-error-primary" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
