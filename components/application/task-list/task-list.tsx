"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import {
  LogRow,
  SOFT_EASE,
  ShimmerText,
  UNIT_ANIMATE,
  UNIT_INITIAL,
  UNIT_TRANSITION,
  useLogMotion,
  useRevealMask,
  useRevealTicker,
} from "@/components/application/agent-log/agent-log";
import { ChevronDownSmall } from "@/components/foundations/icons/chevrons";
import { cx } from "@/utils/cx";

/**
 * Task List — a streaming log of what the agent actually did.
 *
 * Tasks reveal one unit at a time, each animating its own height alongside a
 * short blur and lift, so the thread grows the way the work does instead of
 * jumping. A task shimmers its running title until every step has landed,
 * then settles.
 *
 * ── Why this file exists at all ────────────────────────────────────────────
 *
 * BoardUI ships a `task-list` component, and it is Pro: `npx boardui add
 * task-list` refuses without a license key, exactly as the charts do. AGENTS.md
 * already sets the house answer for that case — "Charts are BoardUI Pro and are
 * NOT installed. Build chart components on `recharts` directly, styled with the
 * BoardUI chart tokens" — and this is the same move one tier up.
 *
 * The primitive here is BoardUI's own `agent-log`, which is free, and which the
 * registry describes as "the shared streaming-log machinery: the reveal ticker,
 * the blur-in with its soft clipping edge, and the curved tree guide that draws
 * itself. Behind Task List and Web Search." So the hard parts — the pacing, the
 * mask that keeps a growing row from being sheared by its own `overflow-hidden`,
 * the two-piece guide that hands the stroke from one row to the next — are
 * first-party and unmodified. What is written here is the task-shaped layer on
 * top: headers, collapse, and resource chips.
 *
 * The public API below is deliberately the one BoardUI documents, prop for
 * prop, so if a Pro seat is ever bought this file can be deleted and the real
 * component dropped in its place with no call-site changes. Do not add a prop
 * that BoardUI does not have without noting it here.
 *
 * ── Units, not steps ───────────────────────────────────────────────────────
 *
 * Every task contributes one unit for its header plus one per step. That is
 * what `revealed` counts, and it is the only counting that makes a controlled
 * log line up with an uncontrolled one: a header is a thing that arrives on
 * screen and takes a tick, so pretending the list is a flat run of steps would
 * make the timer and the event stream disagree by one per task.
 */

/**
 * Something hanging off a step — a file, a course, a note about why it failed.
 * `icon` is a node, not a component, so a caller can colour it per chip.
 */
export interface TaskListChip {
  label: string;
  icon?: ReactNode;
}

export interface TaskListStep {
  label: string;
  chips?: TaskListChip[];
}

export interface TaskListTask {
  /** Shown once the task's steps have all landed. Past tense reads best. */
  title: string;
  /** Shimmered while the task is still running. Falls back to `title`. */
  runningTitle?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  steps: TaskListStep[];
}

export interface TaskListProps {
  tasks: TaskListTask[];
  /** Fires once the last unit lands. */
  onComplete?: () => void;
  /** Delay before the first unit. */
  startDelay?: number;
  /** Delay between every unit after the first. */
  stepInterval?: number;
  /**
   * `true` folds each task away as soon as its own steps land; `"all"` keeps
   * every task open until the whole run lands, then closes them together.
   * Either way a reader can still open any task by clicking its header.
   */
  collapseOnComplete?: boolean | "all";
  /**
   * Drive the reveal from real events instead of the internal timer. Counts
   * units — one per task header, one per step.
   */
  revealed?: number;
  className?: string;
}

/** Running index of each task's header unit, plus the total at the end. */
function unitOffsets(tasks: TaskListTask[]): number[] {
  const offsets: number[] = [];
  let unit = 0;
  for (const task of tasks) {
    offsets.push(unit);
    unit += 1 + task.steps.length;
  }
  offsets.push(unit);
  return offsets;
}

export function TaskList({
  tasks,
  onComplete,
  startDelay,
  stepInterval,
  collapseOnComplete = false,
  revealed: controlled,
  className,
}: TaskListProps) {
  const reduce = useLogMotion();
  const offsets = unitOffsets(tasks);
  const total = offsets[offsets.length - 1] ?? 0;

  const revealed = useRevealTicker({
    total,
    startDelay,
    stepInterval,
    revealed: controlled,
    onComplete,
  });

  /*
    A click always beats the auto-collapse, and only for the task clicked.

    The alternative — one piece of state that the timer writes and the reader
    also writes — loses the reader's intent the moment the next unit lands and
    the timer recomputes. Keeping the override sparse means a task nobody has
    touched still folds itself, which is the behaviour the prop is for.
  */
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const runComplete = total > 0 && revealed >= total;

  return (
    <ol className={cx("flex flex-col", className)}>
      {tasks.map((task, index) => {
        const headerUnit = offsets[index];
        if (revealed <= headerUnit) return null;

        const stepsShown = Math.max(0, Math.min(task.steps.length, revealed - headerUnit - 1));
        const taskComplete = stepsShown === task.steps.length;
        const folded =
          collapseOnComplete === "all"
            ? runComplete
            : collapseOnComplete
              ? taskComplete
              : false;
        const open = overrides[index] ?? !folded;

        return (
          <TaskRow
            key={index}
            task={task}
            reduce={reduce}
            open={open}
            complete={taskComplete}
            stepsShown={stepsShown}
            onToggle={() => setOverrides((current) => ({ ...current, [index]: !open }))}
          />
        );
      })}
    </ol>
  );
}

function TaskRow({
  task,
  reduce,
  open,
  complete,
  stepsShown,
  onToggle,
}: {
  task: TaskListTask;
  reduce: boolean;
  open: boolean;
  complete: boolean;
  stepsShown: number;
  onToggle: () => void;
}) {
  const mask = useRevealMask(reduce);
  const Icon = task.icon;
  const label = complete ? task.title : (task.runningTitle ?? task.title);

  return (
    <motion.li
      initial={reduce ? false : UNIT_INITIAL}
      animate={UNIT_ANIMATE}
      transition={UNIT_TRANSITION}
      {...mask}
      className="overflow-hidden"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cx(
          "flex w-full cursor-pointer items-center gap-2 rounded-lg py-1 text-left",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        {Icon ? (
          <Icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        ) : null}
        {/*
          The shimmer is the running state, so it replaces the title rather
          than decorating it. `ShimmerText` labels itself for screen readers;
          the settled title is plain text and needs no help.
        */}
        <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-secondary">
          {complete ? label : <ShimmerText>{label}</ShimmerText>}
        </span>
        <ChevronDownSmall
          className={cx(
            "size-4 shrink-0 text-foreground-icon-tertiary",
            "transition-transform duration-200 ease-out motion-reduce:transition-none",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {/*
        Folding removes the steps rather than hiding them.

        A collapsed task whose rows are still in the tree keeps the guide's
        trunk drawing through empty space, and leaves the reveal mask mounted
        on rows nobody can see. Unmounting is also what makes reopening replay
        the draw, which is the right reading: the tree is a record of work, and
        opening it is asking to watch that record again.
      */}
      {/*
        Folding animates its height rather than cutting.

        `AnimatePresence` is what makes the closing direction exist at all:
        React unmounts the list the moment `open` flips, and a `motion.ul` with
        an `exit` it never gets to run is just a hard cut with extra steps.
        `initial={false}` on the boundary keeps a task that mounts already open
        — a reopened thread, a remount after navigation — from replaying the
        whole fold as an entrance.
      */}
      <AnimatePresence initial={false}>
        {open && stepsShown > 0 ? (
          <motion.ul
            key="steps"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: SOFT_EASE }}
            className="flex flex-col overflow-hidden"
          >
            {task.steps.slice(0, stepsShown).map((step, index) => (
              <LogRow
                key={index}
                first={index === 0}
                /*
                  `last` tracks what is REVEALED, not what exists. The row at
                  the bottom right now has no trunk below it; when the next
                  step lands, this row's tail draws down through the space that
                  step just opened, and only then does the new branch pick the
                  stroke up. That handoff is the whole reason the guide reads as
                  one pen — see `RowConnector` in agent-log.
                */
                last={index === stepsShown - 1}
                reduce={reduce}
              >
                <StepBody step={step} />
              </LogRow>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

function StepBody({ step }: { step: TaskListStep }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-1 text-caption-1-regular text-text-secondary">
      <span className="min-w-0">{step.label}</span>
      {step.chips?.map((chip, index) => (
        <span
          key={index}
          className={cx(
            "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5",
            "border border-border-button-default bg-background-secondary-default",
            "text-caption-2-medium text-text-secondary",
          )}
        >
          {chip.icon}
          <span className="truncate">{chip.label}</span>
        </span>
      ))}
    </span>
  );
}
