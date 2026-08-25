import Link from "next/link";
import { RiArrowRightUpLine, RiShieldCheckLine } from "@remixicon/react";

import type { CitedCourse } from "@/lib/agent/transcript";
import { toolLabel } from "@/lib/agent/transcript";
import { cx } from "@/utils/cx";

/**
 * The courses the answer stands on.
 *
 * ── Why this is a pane and not a footnote ──────────────────────────────────
 *
 * The template's right pane shows the diff — the thing the agent actually
 * changed, beside the sentence claiming it changed it. That pairing is the
 * whole reason the pane exists, and it transfers exactly: an assistant that
 * says "take COMS W4111" is making a claim about a real catalog, and the
 * student's only defence against a fluent invention is being shown the row it
 * came from.
 *
 * `lib/agent/grounding.ts` already refuses ungrounded answers server-side.
 * This is the same fact pointed at the reader instead of at the log: every
 * course here was returned by a named tool, the tool is printed beside it, and
 * the code links to the course page where the seat counts carry their own
 * provenance stamp. Nothing in this list is generated from the prose.
 *
 * A server component. It renders from data the client already holds, but it
 * holds no state of its own, so there is no reason to ship it.
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
    <ul className={cx("flex flex-col gap-1.5", className)}>
      {courses.map((course) => (
        <li key={course.courseId}>
          <Link
            href={`/course/${course.courseId}`}
            className={cx(
              "group flex items-start gap-2.5 rounded-xl border border-border-table",
              "bg-background-primary-default px-3 py-2.5",
              "transition-colors hover:bg-background-primary-hover",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="text-caption-1-semibold text-text-primary">{course.code}</span>
                {/*
                  The tool that produced the row, named. It is the difference
                  between "the app says so" and "`recommend_courses` returned
                  it", and the second is checkable.
                */}
                <span className="truncate text-caption-2-regular text-text-tertiary">
                  {toolLabel(course.source)}
                </span>
              </span>

              {course.title ? (
                <span className="mt-0.5 block text-caption-1-regular text-text-secondary">
                  {course.title}
                </span>
              ) : null}

              {/*
                Only ever the engine's own reason. There is no branch here that
                writes a sentence when the engine did not supply one — an
                invented "why" in the pane that exists to prove nothing was
                invented would be the worst bug this file could have.
              */}
              {course.whyShown ? (
                <span className="mt-1 flex items-center gap-1 text-caption-2-medium text-text-tertiary">
                  <RiShieldCheckLine aria-hidden className="size-3.5 shrink-0" />
                  {course.whyShown}
                </span>
              ) : null}
            </span>

            <RiArrowRightUpLine
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-foreground-icon-quaternary transition-colors group-hover:text-foreground-icon-secondary"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
