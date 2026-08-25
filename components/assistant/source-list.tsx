"use client";

import { useState } from "react";
import Link from "next/link";
import { RiShieldCheckLine } from "@remixicon/react";

import type { CitedCourse } from "@/lib/agent/transcript";
import { Collapse, CollapseMark } from "@/components/assistant/collapse";
import { cx } from "@/utils/cx";

/**
 * The courses the answer leaned on that never became cards.
 *
 * Occasional — once per turn, if at all — so the panel may animate. Purpose
 * is preventing a jarring change when twenty chips appear. They stagger by
 * index (first cited first, 50ms, capped at 4) rather than uniformly.
 */

export function SourceList({
  courses,
  className,
}: {
  courses: readonly CitedCourse[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (courses.length === 0) return null;

  const count = `${courses.length} ${courses.length === 1 ? "course" : "courses"}`;

  return (
    <div
      className={cx(
        "w-full max-w-90 rounded-2xl border border-border-table",
        "bg-background-primary-default p-3",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "flex w-full cursor-pointer items-center gap-2 text-left",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        <RiShieldCheckLine
          aria-hidden
          className="size-3.5 shrink-0 text-foreground-icon-quaternary"
        />
        <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-secondary">
          Also looked at {count}
        </span>
        <CollapseMark open={open} />
      </button>

      <Collapse open={open}>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {courses.map((course, index) => (
            <li
              key={course.courseId}
              className={cx(
                "min-w-0",
                "transition-[opacity,transform] duration-200 ease-out",
                "motion-reduce:translate-y-0 motion-reduce:transition-opacity",
                open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              )}
              style={{
                // First cited lands alone, then the rest follow. 50ms is the
                // stagger recipe. Cap so a twenty-hit search does not sit
                // idle for hundreds of milliseconds before the last chip.
                transitionDelay: open ? `${Math.min(index, 4) * 50}ms` : "0ms",
              }}
            >
              <LinkChip course={course} />
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}

function LinkChip({ course }: { course: CitedCourse }) {
  return (
    <Link
      href={`/course/${course.courseId}`}
      title={course.title ? `${course.code} ${course.title}` : course.code}
      className={cx(
        "flex max-w-56 items-center gap-1.5 rounded-full",
        "border border-border-table bg-background-primary-default",
        "px-2.5 py-1 text-caption-1-medium text-text-secondary",
        "transition-[color,border-color,transform] duration-150 ease-out",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:border-border-button-hover",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:text-text-primary",
        "active:scale-[0.97] active:duration-160",
        "motion-reduce:transition-colors motion-reduce:active:scale-100",
        "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
      )}
    >
      <span className="shrink-0 tabular-nums">{course.code}</span>
      {course.title ? (
        <span className="min-w-0 truncate text-caption-1-regular text-text-tertiary">
          {course.title}
        </span>
      ) : null}
    </Link>
  );
}
