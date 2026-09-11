"use client";

import { useEffect, useState, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RiCheckboxCircleFill, RiErrorWarningLine } from "@remixicon/react";

import type { ToolActivity } from "@/lib/agent/transcript";
import { TaskList, type TaskListTask } from "@/components/application/task-list/task-list";
import { useTurnMotion } from "@/components/assistant/turn-motion";
import { OrnamentAvatar } from "@/components/ornament/ornament-avatar";
import { cx } from "@/utils/cx";

/**
 * What the assistant did before it answered.
 *
 * Motion lives here because a tool loop is occasional — a handful of rows
 * over a few seconds — not a list someone opens a hundred times a day.
 * Purpose is state indication (running → done) and preventing a jarring
 * change (the list growing, the panel collapsing). Feed cards on the home
 * rail do not enter-animate; that surface is too frequent.
 *
 * ── The rows are a Task List now, not a checklist ──────────────────────────
 *
 * This was a column of pills with a spinner on whichever one was in flight.
 * It is BoardUI's Task List (`components/application/task-list`), which is a
 * different claim about what the reader is looking at: a checklist says these
 * are things to be got through, a log says this is what happened. The second
 * is the true one — the student cannot act on any row, and by the time they
 * read it the work is either done or being done.
 *
 * Three things follow from the swap, and each replaces something that used to
 * be written out longhand here:
 *
 *   - The curved guide is the sequence. The old list said "these happened in
 *     this order" with vertical position alone; the tree draws the order, one
 *     pen down the page, and each row's branch waits for the tail above it.
 *   - The collapse is the Task List's. `collapseOnComplete="all"` folds the
 *     tree the moment the last call lands, which is what the `open`/`isRunning`
 *     effect here used to do by hand, and a click still beats it per task.
 *   - A failure is a chip on its row rather than a second grey line under it.
 *     Same text, but attached to the step that produced it and carrying its own
 *     warning glyph, so it cannot be read as a caption for the whole card.
 *
 * ── The running call is deliberately NOT a row ─────────────────────────────
 *
 * `revealed` stops at the first call still in flight, so the tree only ever
 * contains work that finished. That is agent-log's own doctrine for its
 * `WorkingRow` — "the tree records what the agent *did*, and this is the one
 * line that has not happened yet" — and holding the frontier back is also what
 * makes the header shimmer: a task with an unrevealed step is a running task.
 *
 * The line that has not happened yet is `Elapsed`, below the card, which
 * already existed and already pops out of flow when the answer supersedes it.
 * It now says which tool is running instead of the word "Thinking", so the
 * withheld row costs the reader nothing.
 */

export function ToolActivityCard({
  activity,
  isRunning,
  className,
}: {
  activity: readonly ToolActivity[];
  isRunning: boolean;
  className?: string;
}) {
  const { enter } = useTurnMotion();

  if (activity.length === 0) return null;

  /*
   * The frontier is a prefix, not a count of finished calls.
   *
   * `findIndex` rather than `filter(...).length`: units reveal in order, so a
   * call that finished *after* one still in flight has not landed as far as the
   * log is concerned. The two agree whenever the agent works sequentially,
   * which is almost always — but a parallel pair would otherwise draw a branch
   * for the second call above the gap where the first one is still missing.
   */
  const inFlight = activity.findIndex((entry) => entry.state === "running");
  const landed = inFlight === -1 ? activity.length : inFlight;
  // +1 for the task's own header row, which lands before any of its steps.
  const revealed = 1 + landed;

  return (
    <div className={cx("flex flex-col gap-2.5", className)}>
      {/*
        The panel itself arrives, not just the rows inside it.

        Its steps already animated in on `@starting-style` while the card they
        sit in appeared instantly — so the first thing the reader saw was an
        empty bordered box that then filled. Entering as one object states the
        truth: the assistant started working, and this is the report of it.
      */}
      <motion.div
        {...enter}
        className={cx(
          "w-full max-w-90 rounded-2xl border border-border-table",
          "bg-background-primary-default p-4",
        )}
      >
        <TaskList
          tasks={activityTasks(activity)}
          revealed={revealed}
          collapseOnComplete="all"
        />
      </motion.div>

      {/*
        The elapsed counter is REPLACED by the answer, so it dissolves in
        place rather than sliding out — see `turn-motion.ts`. `popLayout`
        is what frees its row the instant the run ends, so the prose below
        does not wait 140ms and then jump upward into the gap.
      */}
      <AnimatePresence mode="popLayout" initial={false}>
        {isRunning ? (
          <Elapsed key="elapsed" label={activity[inFlight]?.label ?? "Thinking"} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * The turn's tool calls as one task.
 *
 * One task, not one per tool. Grouping by tool name was the obvious reading and
 * it is wrong here: the group's header and every step inside it would carry the
 * same sentence, because `TOOL_LABELS` describes the tool and a `ToolActivity`
 * carries no arguments to tell two calls of it apart. A single task whose steps
 * are the calls keeps every line saying something different, and it is the
 * shape BoardUI's own example uses.
 *
 * The header is the summary the card has always shown. `runningTitle` is the
 * same sentence in its unfinished form, which the Task List shimmers for as
 * long as a step is still being withheld.
 */
export function activityTasks(activity: readonly ToolActivity[]): TaskListTask[] {
  if (activity.length === 0) return [];

  const done = activity.filter((entry) => entry.state === "done").length;
  const failed = activity.filter((entry) => entry.state === "failed").length;
  const landed = done + failed;

  return [
    {
      /*
       * The glyph the pills used to carry, moved to the one row that survives
       * the fold. A settled card is a single line of text and a chevron, and
       * without this the difference between "everything worked" and "one of
       * these could not be read" is a clause the eye has to reach the end of
       * the sentence to find. No glyph while a call is in flight: the header is
       * shimmering then, which already says the same thing louder.
       */
      icon: landed < activity.length ? undefined : failed > 0 ? FailedGlyph : DoneGlyph,
      title: summarise(activity.length, done, failed, false),
      runningTitle: summarise(activity.length, done, failed, true),
      steps: activity.map((entry) => ({
        label: entry.label,
        /*
         * The failure rides on its own step. It was a second line under the
         * label in `text-tertiary`, which put the quietest type on the page on
         * the one row that needs reading — and left it ambiguous whether it
         * described that call or the card. A chip is attached to the row by
         * construction, and its glyph is the only red on the surface.
         */
        ...(entry.errorText
          ? {
              chips: [
                {
                  label: entry.errorText,
                  icon: (
                    <RiErrorWarningLine
                      aria-hidden
                      className="size-3.5 shrink-0 text-foreground-icon-error"
                    />
                  ),
                },
              ],
            }
          : {}),
      })),
    },
  ];
}

/*
 * The Task List paints its icon slot `text-foreground-icon-secondary`, which is
 * right for a neutral glyph and wrong for the only red on the card. These
 * discard the class they are handed rather than trying to override it — a
 * merge would depend on which utility `cx` happens to consider a conflict, and
 * this is a two-line component either way. The quaternary check is the weight
 * the pills used: present, not announced.
 */
function DoneGlyph() {
  return (
    <RiCheckboxCircleFill
      aria-hidden
      className="size-4 shrink-0 text-foreground-icon-quaternary"
    />
  );
}

function FailedGlyph() {
  return (
    <RiErrorWarningLine aria-hidden className="size-4 shrink-0 text-foreground-icon-error" />
  );
}

function summarise(total: number, done: number, failed: number, isRunning: boolean): string {
  if (isRunning) {
    const left = total - done - failed;
    return left > 0 ? `${left} ${left === 1 ? "step" : "steps"} left` : "Working";
  }
  const checked = `${done} ${done === 1 ? "step" : "steps"}`;
  return failed === 0 ? checked : `${checked} · ${failed} couldn't be read`;
}

export function ThinkingLine({
  label,
  className,
  ref,
}: {
  label: string;
  className?: string;
  /*
   * Forwarded, and load-bearing.
   *
   * `AnimatePresence mode="popLayout"` measures the leaving child and pins it
   * out of flow so its siblings can close the gap immediately. To do that it
   * has to get a ref onto the real element — and a plain function component
   * swallows one, which silently degrades popLayout to ordinary `sync`: the
   * indicator fades for 140ms holding its row, and everything below jumps 54px
   * the instant it unmounts. Measured, not assumed; see the note in
   * `turn-motion.ts`.
   *
   * React 19 passes `ref` as an ordinary prop, which is how `Button` in
   * `components/base/buttons/button.tsx` takes one too.
   */
  ref?: Ref<HTMLParagraphElement>;
}) {
  const { swap } = useTurnMotion();
  /*
   * The disc paints a 116px canvas inside a 92px layout box — feather and
   * bevel live in that bleed. At 18px the leftover is two pixels, and anything
   * that clips overflow (the page's `overflow-x-clip` included) shears the
   * rim. 28px in a 40px well leaves room for the bleed and the thinking
   * breath, and the label matches the thread rather than caption.
   */
  return (
    <motion.p
      ref={ref}
      {...swap}
      className={cx(
        "flex items-center gap-2.5 overflow-visible",
        "text-headline-regular",
        className,
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-visible">
        <OrnamentAvatar size={28} mood="thinking" className="shrink-0" />
      </span>
      <span className="agent-progress-loading-text">{label}</span>
    </motion.p>
  );
}

/**
 * The one line that has not happened yet: the call in flight, and how long it
 * has been in flight for.
 *
 * It used to read "Thinking 3.2s" while the tree beside it already said the
 * assistant was thinking. Naming the tool is what makes the timer worth its
 * row — "Reading reviews 3.2s" is a reader deciding whether to wait, and it is
 * the step the log is deliberately withholding, so nothing is lost by holding
 * it back up there.
 *
 * Forwards its ref for the reason `ThinkingLine` does — it is popped too.
 */
function Elapsed({ label, ref }: { label: string; ref?: Ref<HTMLParagraphElement> }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      setSeconds((performance.now() - started) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  return <ThinkingLine ref={ref} label={`${label} ${seconds.toFixed(1)}s`} />;
}
