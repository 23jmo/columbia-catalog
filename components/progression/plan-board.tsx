"use client";

import { useState, type DragEvent } from "react";
import {
  RiAlertLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiInformationLine,
} from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import type { ProgressionGraph } from "@/lib/prereqs/graph";
import { courseLabel } from "@/lib/progression/catalog";
import {
  TERM_POINTS,
  type FourYearPlan,
  type PlanAnalysis,
  type PlanIssue,
  type PlanIssueSeverity,
} from "@/lib/progression/plan";
import { cx } from "@/utils/cx";

/**
 * The eight-term board.
 *
 * ── Why HTML5 drag and drop, and not a drag library ─────────────────────────
 *
 * The only interaction is "pick up a course, drop it in a term". Native DnD
 * does that, works with the keyboard fallback below, and adds nothing to the
 * bundle. A pointer-based library earns its weight when you need reordering
 * with live reflow, which a term's course list does not have — order inside a
 * term is meaningless, because a term is a set.
 *
 * ── Why issues render on the card, not in a summary ─────────────────────────
 *
 * A validation list under the board makes the reader hold a course code in
 * their head while they scan for it. The error belongs where the mistake is:
 * the card whose prerequisite is missing shows it, in the term where it sits.
 * The header keeps only the count, as a way in.
 */

export interface PlanBoardProps {
  graph: ProgressionGraph;
  plan: FourYearPlan;
  analysis: PlanAnalysis;
  onMoveCourse: (courseId: string, toTermKey: string) => void;
  onRemoveCourse: (courseId: string, fromTermKey: string) => void;
}

const DRAG_TYPE = "application/x-columbia-course";

export function PlanBoard({
  graph,
  plan,
  analysis,
  onMoveCourse,
  onRemoveCourse,
}: PlanBoardProps) {
  const [dragOverTermKey, setDragOverTermKey] = useState<string | null>(null);

  const handleDrop = (event: DragEvent<HTMLElement>, termKey: string) => {
    event.preventDefault();
    setDragOverTermKey(null);
    const courseId = event.dataTransfer.getData(DRAG_TYPE);
    if (courseId) onMoveCourse(courseId, termKey);
  };

  const byYear = groupByAcademicYear(plan);

  return (
    <div className="flex flex-col gap-5">
      {byYear.map(([academicYear, terms]) => (
        <section key={academicYear} className="flex flex-col gap-2">
          <h3 className="text-caption-1-semibold tracking-[0.08em] text-text-tertiary uppercase">
            Year {academicYear}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {terms.map((term) => {
              const termAnalysis = analysis.terms.find((entry) => entry.termKey === term.termKey);
              const points = termAnalysis?.points ?? 0;

              return (
                <div
                  key={term.termKey}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverTermKey(term.termKey);
                  }}
                  onDragLeave={() => setDragOverTermKey((current) => (current === term.termKey ? null : current))}
                  onDrop={(event) => handleDrop(event, term.termKey)}
                  className={cx(
                    "flex min-h-[132px] flex-col gap-2 rounded-2lg border p-3 transition-colors duration-150",
                    dragOverTermKey === term.termKey
                      ? "border-accent-500 bg-background-secondary-hover"
                      : "border-border-table bg-background-primary-default",
                  )}
                >
                  <header className="flex items-baseline justify-between gap-2">
                    <span className="text-body-medium text-text-primary">{term.label}</span>
                    <PointsChip points={points} empty={term.courseIds.length === 0} />
                  </header>

                  {term.courseIds.length === 0 ? (
                    <p className="text-caption-1-regular flex flex-1 items-center justify-center rounded-md border border-dashed border-border-button-default text-text-tertiary">
                      Drop a course here
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {term.courseIds.map((courseId) => (
                        <PlannedCourse
                          key={courseId}
                          graph={graph}
                          courseId={courseId}
                          termKey={term.termKey}
                          issues={(termAnalysis?.issues ?? []).filter(
                            (issue) => issue.courseId === courseId,
                          )}
                          onRemove={onRemoveCourse}
                        />
                      ))}
                    </ul>
                  )}

                  {(termAnalysis?.issues ?? [])
                    .filter((issue) => issue.courseId === null)
                    .map((issue) => (
                      <IssueLine key={issue.kind + issue.message} issue={issue} />
                    ))}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function PointsChip({ points, empty }: { points: number; empty: boolean }) {
  if (empty) return <span className="text-caption-1-regular text-text-tertiary">empty</span>;
  const color =
    points > TERM_POINTS.approvalThreshold
      ? "yellow"
      : points < TERM_POINTS.fullTimeMinimum
        ? "yellow"
        : "soft";
  return (
    <Chip variant="caption" color={color}>
      {points} pts
    </Chip>
  );
}

function PlannedCourse({
  graph,
  courseId,
  termKey,
  issues,
  onRemove,
}: {
  graph: ProgressionGraph;
  courseId: string;
  termKey: string;
  issues: PlanIssue[];
  onRemove: (courseId: string, termKey: string) => void;
}) {
  const course = graph.courses.get(courseId);
  const worst = worstSeverity(issues);

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, courseId);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={cx(
        "group flex cursor-grab flex-col gap-1 rounded-md border px-2 py-1.5 active:cursor-grabbing",
        worst === "error"
          ? "border-status-rose-text/40 bg-status-rose-background"
          : worst === "warning"
            ? "border-status-yellow-text/40 bg-status-yellow-background"
            : "border-border-table bg-background-secondary-default",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-caption-1-medium shrink-0 text-text-primary">
          {courseLabel(graph, courseId)}
        </span>
        <span className="text-caption-1-regular min-w-0 flex-1 truncate text-text-secondary">
          {course?.title ?? "Unknown course"}
        </span>
        <button
          type="button"
          onClick={() => onRemove(courseId, termKey)}
          aria-label={`Remove ${courseLabel(graph, courseId)} from this term`}
          className="shrink-0 rounded-sm p-0.5 text-text-tertiary opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 hover:text-text-primary focus-visible:opacity-100"
        >
          <RiCloseLine className="size-3.5" aria-hidden />
        </button>
      </div>

      {issues.map((issue) => (
        <IssueLine key={issue.kind + issue.message} issue={issue} />
      ))}
    </li>
  );
}

const SEVERITY_ICON = {
  error: RiErrorWarningLine,
  warning: RiAlertLine,
  info: RiInformationLine,
};

const SEVERITY_TEXT: Record<PlanIssueSeverity, string> = {
  error: "text-status-rose-text",
  warning: "text-status-yellow-text",
  info: "text-text-tertiary",
};

function IssueLine({ issue }: { issue: PlanIssue }) {
  const Icon = SEVERITY_ICON[issue.severity];
  return (
    <p className={cx("text-caption-1-regular flex items-start gap-1.5", SEVERITY_TEXT[issue.severity])}>
      <Icon className="mt-px size-3 shrink-0" aria-hidden />
      <span className="min-w-0">{issue.message}</span>
    </p>
  );
}

function worstSeverity(issues: PlanIssue[]): PlanIssueSeverity | null {
  if (issues.some((issue) => issue.severity === "error")) return "error";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return issues.length > 0 ? "info" : null;
}

function groupByAcademicYear(plan: FourYearPlan): [number, FourYearPlan["terms"]][] {
  const byYear = new Map<number, FourYearPlan["terms"]>();
  for (const term of plan.terms) {
    const bucket = byYear.get(term.academicYear);
    if (bucket) bucket.push(term);
    else byYear.set(term.academicYear, [term]);
  }
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]);
}

export { DRAG_TYPE };
