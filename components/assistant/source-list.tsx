import Link from "next/link";
import { RiArrowRightUpLine } from "@remixicon/react";

import type { CitedCourse } from "@/lib/agent/transcript";
import { toolLabel } from "@/lib/agent/transcript";
import { cx } from "@/utils/cx";

/**
 * The courses the answer stands on.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * The template's answers end in an artifact — the diff, sitting directly under
 * the sentence claiming a change was made. That pairing is the whole point of
 * it, and it transfers exactly: an assistant that says "take COMS W4111" is
 * making a claim about a real catalog, and the student's only defence against a
 * fluent invention is being shown the row it came from.
 *
 * `lib/agent/grounding.ts` already refuses ungrounded answers server-side. This
 * is the same fact pointed at the reader instead of at the log: every course
 * here was returned by a named tool, the tool is printed beside it, and the
 * code links through to the course page where seat counts carry their own
 * provenance stamp. Nothing in this list is generated from the prose.
 *
 * Rows only — the card chrome around them belongs to the caller, because the
 * same list appears under an answer and could appear anywhere else evidence is
 * wanted. A server component: it renders from data the client already holds,
 * and holds no state of its own, so there is no reason to ship it.
 */

export function SourceList({
  courses,
  className,
}: {
  courses: readonly CitedCourse[];
  className?: string;
}) {
  if (courses.length === 0) return null;

  return (
    <ul className={cx("divide-y divide-border-table", className)}>
      {courses.map((course) => (
        <li key={course.courseId}>
          <Link
            href={`/course/${course.courseId}`}
            className={cx(
              "group flex items-center gap-3 px-3 py-2.5",
              "transition-colors hover:bg-background-primary-hover",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="shrink-0 text-caption-1-semibold text-text-primary">
                  {course.code}
                </span>
                {course.title ? (
                  <span className="min-w-0 truncate text-caption-1-regular text-text-secondary">
                    {course.title}
                  </span>
                ) : null}
              </span>

              <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                {/*
                  The tool that produced the row, named. It is the difference
                  between "the app says so" and "`recommend_courses` returned
                  it", and the second is checkable.
                */}
                <span className="shrink-0 text-caption-2-regular text-text-tertiary">
                  {toolLabel(course.source)}
                </span>

                {/*
                  Only ever the engine's own reason. There is no branch here
                  that writes a sentence when the engine did not supply one — an
                  invented "why" inside the card that exists to prove nothing
                  was invented would be the worst bug this file could have.
                */}
                {course.whyShown ? (
                  <>
                    <span aria-hidden className="shrink-0 text-foreground-icon-quaternary">
                      ·
                    </span>
                    <span className="min-w-0 truncate text-caption-2-regular text-text-tertiary">
                      {course.whyShown}
                    </span>
                  </>
                ) : null}
              </span>
            </span>

            <RiArrowRightUpLine
              aria-hidden
              className={cx(
                "size-4 shrink-0 text-foreground-icon-quaternary transition-colors",
                "group-hover:text-foreground-icon-secondary",
              )}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
