"use client";

import { useMemo, useState } from "react";
import { RiSearchLine } from "@remixicon/react";
import { Input } from "@/components/base/input/input";
import { Chip } from "@/components/base/badges/chip";
import { descendants, evaluateCourse, type ProgressionGraph } from "@/lib/prereqs/graph";
import { courseLabel } from "@/lib/progression/catalog";
import { DRAG_TYPE } from "./plan-board";
import { cx } from "@/utils/cx";

/**
 * The course source for the plan board, and the map's course picker.
 *
 * Sorted by downstream reach, not by course number. Course number order puts
 * COMS W1002 above COMS W1004 for no reason a student cares about; reach order
 * puts the courses that open the most doors first, which is the actual question
 * ("what should I take to keep options open?"). Search falls back to plain
 * relevance the moment the reader types, because then they know what they want.
 */

export interface CourseTrayProps {
  graph: ProgressionGraph;
  completed: ReadonlySet<string>;
  /** Ids already placed somewhere in the plan; shown dimmed and undraggable. */
  placed?: ReadonlySet<string>;
  selectedCourseId?: string;
  onSelectCourse: (courseId: string) => void;
  draggable?: boolean;
  className?: string;
}

export function CourseTray({
  graph,
  completed,
  placed,
  selectedCourseId,
  onSelectCourse,
  draggable = false,
  className,
}: CourseTrayProps) {
  const [query, setQuery] = useState("");

  const ranked = useMemo(() => {
    const rows = [...graph.courses.values()].map((course) => ({
      courseId: course.courseId,
      title: course.title,
      label: courseLabel(graph, course.courseId),
      reach: descendants(graph, course.courseId).length,
      points: course.points,
    }));
    return rows.sort((a, b) => b.reach - a.reach || a.courseId.localeCompare(b.courseId));
  }, [graph]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!needle) return ranked;
    return ranked.filter(
      (row) =>
        row.courseId.toLowerCase().includes(needle) ||
        row.title.toLowerCase().replace(/\s+/g, "").includes(needle),
    );
  }, [ranked, query]);

  /*
   * `min-w-0` on the root below is load-bearing, not defensive.
   *
   * Both call sites drop this tray into a grid that collapses to one column
   * below `xl`. A grid item's default `min-width: auto` refuses to shrink past
   * its own min-content width, so on a 390px phone this tray sized the whole
   * implicit column to 394px — and because grid items stretch, the map and the
   * detail panel inherited that width too and the document scrolled sideways by
   * 32px on every visit.
   */
  return (
    <div className={cx("flex min-h-0 min-w-0 flex-col gap-2", className)}>
      {/* BoardUI's Input wraps react-aria TextField, so `onChange` hands back
          the string, not a DOM event. */}
      <Input
        aria-label="Find a course"
        placeholder="Find a course"
        value={query}
        onChange={setQuery}
        leadingIcon={RiSearchLine}
      />

      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
        {filtered.map((row) => {
          const isPlaced = placed?.has(row.courseId) ?? false;
          const isSelected = row.courseId === selectedCourseId;
          const isDone = completed.has(row.courseId);
          const status = evaluateCourse(graph, row.courseId, completed).status;

          return (
            <li key={row.courseId}>
              <div
                role="button"
                tabIndex={0}
                draggable={draggable && !isPlaced}
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_TYPE, row.courseId);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => onSelectCourse(row.courseId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectCourse(row.courseId);
                  }
                }}
                className={cx(
                  // 36px rows stacked 2px apart is a scroll list you tap by
                  // luck. `py-3` takes each to 48 on a touch device; the tray
                  // scrolls anyway, so the only cost is seeing fewer rows at
                  // once, and the alternative is opening the wrong course.
                  "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 pointer-coarse:py-3 text-left transition-colors duration-150",
                  "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  draggable && !isPlaced && "cursor-grab active:cursor-grabbing",
                  isSelected ? "bg-background-tertiary-default" : "hover:bg-background-secondary-hover",
                  isPlaced && "opacity-45",
                )}
              >
                <span
                  className={cx(
                    "text-caption-1-medium w-[86px] shrink-0",
                    isDone ? "text-accent-500" : "text-text-primary",
                  )}
                >
                  {row.label}
                </span>
                <span className="text-caption-1-regular min-w-0 flex-1 truncate text-text-secondary">
                  {row.title}
                </span>
                {row.reach > 0 && (
                  <Chip
                    variant="caption"
                    color={status === "met" && !isDone ? "lime" : "soft"}
                    title={`${row.reach} courses downstream`}
                  >
                    {row.reach}
                  </Chip>
                )}
              </div>
            </li>
          );
        })}

        {filtered.length === 0 && (
          <li className="text-caption-1-regular px-2 py-6 text-center text-text-tertiary">
            Nothing matches “{query}”.
          </li>
        )}
      </ul>
    </div>
  );
}
