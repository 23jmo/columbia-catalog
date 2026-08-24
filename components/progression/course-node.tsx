"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { RiExternalLinkLine, RiLockUnlockLine } from "@remixicon/react";
import { cx } from "@/utils/cx";

/**
 * One course on the prerequisite map.
 *
 * The card has to answer three questions at a glance, in this order: what
 * course is this, can I take it, and is it worth taking. So the code leads at
 * the largest size, eligibility is carried by the left rule rather than a
 * badge (a badge on every card is noise; a colored edge on every card is a
 * legend), and the unlock count only appears when it is greater than zero —
 * "unlocks 0 courses" is a fact nobody needs printed.
 */

export type CourseNodeStatus = "met" | "unmet" | "unknown" | "completed" | "external";

export interface CourseNodeData extends Record<string, unknown> {
  code: string;
  title: string;
  points: number | null;
  status: CourseNodeStatus;
  /** Courses this one directly leads to. Hidden when zero. */
  unlockCount: number;
  isFocus: boolean;
  /** External courses are named by a prerequisite but not described anywhere. */
  isExternal: boolean;
}

export type CourseFlowNode = Node<CourseNodeData, "course">;

/**
 * The left rule, not a fill: a saturated card background at this density turns
 * the map into a heat map, and the reader loses the graph in the color.
 */
const STATUS_RULE: Record<CourseNodeStatus, string> = {
  completed: "before:bg-accent-500",
  met: "before:bg-status-lime-text",
  unknown: "before:bg-status-yellow-text",
  unmet: "before:bg-border-table",
  external: "before:bg-border-table",
};

export const CourseNode = memo(function CourseNode({ data, selected }: NodeProps<CourseFlowNode>) {
  return (
    <div
      className={cx(
        "relative flex w-[208px] flex-col gap-1 overflow-hidden rounded-2lg border py-2 pr-3 pl-3.5",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        "transition-[box-shadow,border-color] duration-150 ease",
        STATUS_RULE[data.status],
        data.isExternal
          ? "border-dashed border-border-button-default bg-background-secondary-default"
          : "border-border-table bg-background-primary-default",
        data.isFocus && "border-accent-500 shadow-nav-selected",
        selected && !data.isFocus && "border-border-focus-ring",
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border-table" />

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-medium truncate text-text-primary">{data.code}</span>
        {data.points !== null && (
          <span className="text-caption-1-regular shrink-0 text-text-tertiary">
            {data.points} pt{data.points === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <span className="text-caption-1-regular line-clamp-2 text-text-secondary">
        {data.isExternal ? (
          <span className="inline-flex items-center gap-1">
            <RiExternalLinkLine className="size-3 shrink-0" aria-hidden />
            Outside this department
          </span>
        ) : (
          data.title
        )}
      </span>

      {data.unlockCount > 0 && (
        <span className="text-caption-1-medium inline-flex items-center gap-1 text-text-tertiary">
          <RiLockUnlockLine className="size-3 shrink-0" aria-hidden />
          unlocks {data.unlockCount}
        </span>
      )}

      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border-table" />
    </div>
  );
});
