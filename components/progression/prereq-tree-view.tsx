"use client";

import { Fragment } from "react";
import { RiCheckLine, RiQuestionLine, RiSubtractLine } from "@remixicon/react";
import type { PrereqNode } from "@/lib/prereqs/types";
import type { ProgressionGraph } from "@/lib/prereqs/graph";
import { evaluatePrereqTree } from "@/lib/prereqs/graph";
import { courseLabel } from "@/lib/progression/catalog";
import { cx } from "@/utils/cx";

/**
 * A prerequisite expression, rendered as the sentence it is.
 *
 * The instinct is a tree widget with disclosure arrows. That is the wrong
 * shape: "(W3134 or W3136 or W3137) and (W3157 or W4118 or CSEE W4119)" is one
 * sentence a student reads left to right, and breaking it into rows destroys
 * the grouping that makes it readable. So groups render inline with real
 * parentheses, and only the *outermost* AND breaks onto separate lines —
 * because at that level the parts genuinely are separate requirements.
 *
 * Each course carries its own satisfied/missing state, so the reader can see
 * which branch of an alternation they have already met rather than being told
 * the whole clause failed.
 */

export interface PrereqTreeViewProps {
  node: PrereqNode | null;
  graph: ProgressionGraph;
  completed: ReadonlySet<string>;
  onSelectCourse?: (courseId: string) => void;
  /** Top level only: an AND at the root reads better stacked. */
  stackRoot?: boolean;
}

export function PrereqTreeView({
  node,
  graph,
  completed,
  onSelectCourse,
  stackRoot = true,
}: PrereqTreeViewProps) {
  if (!node) return null;

  if (stackRoot && node.kind === "all") {
    return (
      <ul className="flex flex-col gap-1.5">
        {node.children.map((child, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="text-caption-1-regular mt-1 w-10 shrink-0 text-right text-text-tertiary">
              {index === 0 ? "needs" : "and"}
            </span>
            <span className="flex flex-wrap items-center gap-1">
              <Expression node={child} graph={graph} completed={completed} onSelect={onSelectCourse} />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-caption-1-regular mr-1 text-text-tertiary">needs</span>
      <Expression node={node} graph={graph} completed={completed} onSelect={onSelectCourse} />
    </div>
  );
}

interface ExpressionProps {
  node: PrereqNode;
  graph: ProgressionGraph;
  completed: ReadonlySet<string>;
  onSelect?: (courseId: string) => void;
  /** Parentheses are only drawn where they change the reading. */
  parenthesise?: boolean;
}

function Expression({ node, graph, completed, onSelect, parenthesise }: ExpressionProps) {
  if (node.kind === "course") {
    return <CourseToken courseId={node.courseId} graph={graph} completed={completed} onSelect={onSelect} />;
  }

  if (node.kind === "advisory") {
    return (
      <span className="text-caption-1-regular inline-flex items-center gap-1 rounded-md border border-dashed border-border-button-default px-1.5 py-0.5 text-text-tertiary">
        <RiQuestionLine className="size-3 shrink-0" aria-hidden />
        {node.text}
      </span>
    );
  }

  const connector = node.kind === "all" ? "and" : "or";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {parenthesise && <span className="text-caption-1-regular text-text-tertiary">(</span>}
      {node.children.map((child, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span className="text-caption-1-regular text-text-tertiary">{connector}</span>
          )}
          <Expression
            node={child}
            graph={graph}
            completed={completed}
            onSelect={onSelect}
            // A nested group needs parentheses; a leaf never does.
            parenthesise={child.kind === "all" || child.kind === "any"}
          />
        </Fragment>
      ))}
      {parenthesise && <span className="text-caption-1-regular text-text-tertiary">)</span>}
    </span>
  );
}

function CourseToken({
  courseId,
  graph,
  completed,
  onSelect,
}: {
  courseId: string;
  graph: ProgressionGraph;
  completed: ReadonlySet<string>;
  onSelect?: (courseId: string) => void;
}) {
  const status = evaluatePrereqTree(
    { kind: "course", courseId, label: courseId },
    completed,
    graph.equivalence,
  ).status;
  const known = graph.courses.has(courseId);
  const Icon = status === "met" ? RiCheckLine : RiSubtractLine;

  return (
    <button
      type="button"
      disabled={!known || !onSelect}
      onClick={() => onSelect?.(courseId)}
      title={graph.courses.get(courseId)?.title}
      className={cx(
        "text-caption-1-medium inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition-colors duration-150",
        "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        status === "met"
          ? "border-status-lime-background bg-status-lime-background text-status-lime-text"
          : "border-border-table bg-background-secondary-default text-text-secondary",
        known && onSelect && "hover:border-accent-500 cursor-pointer",
        !known && "border-dashed",
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {courseLabel(graph, courseId)}
    </button>
  );
}
