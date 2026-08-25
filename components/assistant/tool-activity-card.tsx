"use client";

import { useEffect, useState } from "react";
import { RiCheckboxCircleFill, RiErrorWarningLine } from "@remixicon/react";

import type { ToolActivity } from "@/lib/agent/transcript";
import { Collapse, CollapseMark } from "@/components/assistant/collapse";
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

/** Enter: opacity + 8px, 200ms ease-out. Never scale(0). */
const ENTER = cx(
  "translate-y-0 opacity-100",
  "transition-[opacity,transform] duration-200 ease-out",
  "starting:translate-y-2 starting:opacity-0",
  "motion-reduce:translate-y-0 motion-reduce:transition-opacity motion-reduce:starting:translate-y-0",
);

export function ToolActivityCard({
  activity,
  isRunning,
  className,
}: {
  activity: readonly ToolActivity[];
  isRunning: boolean;
  className?: string;
}) {
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
      <div
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
      </div>

      {isRunning ? <Elapsed /> : null}
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
}: {
  label: string;
  className?: string;
}) {
  return (
    <p
      className={cx(
        ENTER,
        "flex items-center gap-2 text-caption-1-regular text-text-secondary",
        className,
      )}
    >
      <OrnamentAvatar size={18} mood="thinking" className="shrink-0" />
      {label}
    </p>
  );
}

function Elapsed() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      setSeconds((performance.now() - started) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  return <ThinkingLine label={`Thinking ${seconds.toFixed(1)}s`} />;
}
