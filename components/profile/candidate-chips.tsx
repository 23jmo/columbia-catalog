"use client";

import { useState, useTransition } from "react";
import { RiAddLine } from "@remixicon/react";

import { addCoursesAction } from "@/app/profile/actions";
import { formatCourseId } from "@/lib/requirements/code";
import { cx } from "@/utils/cx";

/**
 * "Any of these would finish it" — the courses a rule names that the student
 * has not taken.
 *
 * Each chip is two targets on purpose: the code is a link into the course page,
 * and the `+` marks it as already taken. That split is the whole point. A
 * single-target chip has to choose between "tell me about this" and "I did
 * this", and the two are asked in the same breath while reading a requirement.
 *
 * Only rules that name a finite set produce candidates (`all_of`, `n_of`,
 * `sequence_choice`). A flag-matched requirement has no list to print here —
 * the recommender is the right surface for those, and it is further down the
 * page.
 */

export interface CandidateChipsProps {
  courseIds: string[];
  /** How many to show before "+N more". Long lists are a real thing here. */
  limit?: number;
  className?: string;
}

export function CandidateChips({ courseIds, limit = 8, className }: CandidateChipsProps) {
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
          const isAdded = added.has(courseId);
          return (
            <span
              key={courseId}
              className={cx(
                "inline-flex items-center overflow-hidden rounded-md border transition-colors duration-150 ease",
                isAdded
                  ? "border-status-lime-text/40 bg-status-lime-background"
                  : "border-border-table bg-background-primary-default",
              )}
            >
              <a
                href={`/course/${courseId}`}
                className="px-1.5 py-1 text-caption-1-medium tabular-nums text-text-secondary outline-none transition-colors duration-150 ease hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                {code}
              </a>
              {isAdded ? (
                <span className="px-1.5 py-1 text-caption-2-regular text-status-lime-text">
                  added
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Mark ${code} as already taken`}
                  title={`Mark ${code} as already taken`}
                  onClick={() => markTaken(courseId)}
                  className="flex size-6 items-center justify-center border-l border-border-table text-foreground-icon-tertiary outline-none transition-colors duration-150 ease hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
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
            className="rounded-md px-1.5 py-1 text-caption-1-medium text-text-tertiary outline-none transition-colors duration-150 ease hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
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
