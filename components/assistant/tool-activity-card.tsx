"use client";

import { useEffect, useState, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RiCheckboxCircleFill, RiErrorWarningLine } from "@remixicon/react";

import type { ToolActivity } from "@/lib/agent/transcript";
import { Collapse, CollapseMark } from "@/components/assistant/collapse";
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
 */

const GLYPH = "size-4 shrink-0";

/*
 * `ThinkingLine`'s entrance used to be a `@starting-style` class right here.
 * It moved to `useTurnMotion` because the line now has to leave as well as
 * arrive, and `@starting-style` has nothing to say about unmounting — React
 * removes the node and the browser has no frame in which to transition it.
 * One mechanism for both directions beats a CSS entrance racing a JS exit.
 *
 * The step rows below keep their `starting:` classes. They only ever arrive,
 * their values are the same 8px/200ms/ease-out, and rewriting working motion
 * to match a neighbour is churn, not consistency.
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
  const [open, setOpen] = useState(isRunning);

  useEffect(() => {
    // Open when work starts; close when it ends. Mid-run and after, the
    // student can still toggle — this effect only fires when `isRunning` flips.
    setOpen(isRunning);
  }, [isRunning]);

  if (activity.length === 0) return null;

  const failed = activity.filter((entry) => entry.state === "failed").length;
  const done = activity.filter((entry) => entry.state === "done").length;

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
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={cx(
            "flex w-full cursor-pointer items-center gap-2 text-left",
            "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          )}
        >
          <StepGlyph state={isRunning ? "running" : failed > 0 ? "failed" : "done"} />
          <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-secondary">
            {summarise(activity.length, done, failed, isRunning)}
          </span>
          <CollapseMark open={open} />
        </button>

        <Collapse open={open}>
          <ul className="mt-3 flex flex-col gap-2">
            {activity.map((entry) => {
              const isCurrent = entry.state === "running";
              const isDone = entry.state === "done";

              return (
                <li
                  key={entry.toolCallId}
                  className={cx(
                    "flex items-center gap-2 rounded-full px-2.5 py-1.5",
                    "translate-y-0 opacity-100 starting:translate-y-2 starting:opacity-0",
                    // Ring, not border+padding — those are layout and would
                    // jump the row when the running step finishes.
                    "ring-1 ring-inset ring-transparent",
                    "transition-[opacity,transform,box-shadow] duration-200 ease-out",
                    "motion-reduce:translate-y-0 motion-reduce:transition-[opacity,box-shadow]",
                    "motion-reduce:starting:translate-y-0",
                    isCurrent && "ring-border-table",
                  )}
                >
                  <StepGlyph state={entry.state} />

                  <span className="min-w-0 flex-1">
                    <span
                      className={cx(
                        "text-caption-1-regular transition-colors duration-200 ease-out",
                        "motion-reduce:transition-none",
                        entry.state === "failed" && "text-text-error-primary",
                        isCurrent && "text-text-secondary",
                        isDone && "text-text-secondary line-through",
                      )}
                    >
                      {entry.label}
                    </span>

                    {entry.errorText ? (
                      <span className="block text-caption-2-regular text-text-tertiary">
                        {entry.errorText}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Collapse>
      </motion.div>

      {/*
        The elapsed counter is REPLACED by the answer, so it dissolves in
        place rather than sliding out — see `turn-motion.ts`. `popLayout`
        is what frees its row the instant the run ends, so the prose below
        does not wait 140ms and then jump upward into the gap.
      */}
      <AnimatePresence mode="popLayout" initial={false}>
        {isRunning ? <Elapsed key="elapsed" /> : null}
      </AnimatePresence>
    </div>
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

function StepGlyph({ state }: { state: ToolActivity["state"] }) {
  if (state === "running") return <ProgressCircle />;
  if (state === "failed") {
    return <RiErrorWarningLine aria-hidden className={cx(GLYPH, "text-foreground-icon-error")} />;
  }
  return (
    <RiCheckboxCircleFill
      aria-hidden
      className={cx(GLYPH, "text-foreground-icon-quaternary")}
    />
  );
}

function ProgressCircle() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cx(GLYPH, "animate-spin text-foreground-icon-secondary motion-reduce:animate-none")}
    >
      <circle
        cx="8"
        cy="8"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="opacity-20"
      />
      <circle
        cx="8"
        cy="8"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="8 26"
      />
    </svg>
  );
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

/** Forwards its ref for the reason `ThinkingLine` does — it is popped too. */
function Elapsed({ ref }: { ref?: Ref<HTMLParagraphElement> }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      setSeconds((performance.now() - started) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  return <ThinkingLine ref={ref} label={`Thinking ${seconds.toFixed(1)}s`} />;
}
