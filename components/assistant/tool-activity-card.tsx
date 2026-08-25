"use client";

import { useEffect, useState } from "react";
import { RiCheckLine, RiErrorWarningLine, RiLoader4Line } from "@remixicon/react";

import type { ToolActivity } from "@/lib/agent/transcript";
import { cx } from "@/utils/cx";

/**
 * What the assistant did before it answered.
 *
 * ── The template's steps card, pointed at a tool loop ──────────────────────
 *
 * BoardUI puts a narrow bordered card mid-conversation reading "5 steps left",
 * with the step currently running raised into its own sub-card and the rest
 * listed plainly beneath it. It is tempting to read that as decoration for dead
 * air. Here it is load-bearing: the spec's hardest rule is that the assistant
 * may state only facts a tool returned, and a student has no way to hold us to
 * that unless they can see which tools ran. "Reading your coursework · Working
 * out what your degree still needs · Ranking courses for you" is the difference
 * between an answer and a claim.
 *
 * The one change the domain forces: the template's list is a *plan*, so the
 * unrun steps are known in advance. A tool loop's are not — the model decides
 * the next call after seeing the last result. So this card reads backwards.
 * Finished steps list plainly with a check; the one still running is the raised
 * card, and it is the last row rather than the first.
 *
 * It stays on screen after the turn finishes, collapsed to one line. The detail
 * is a `<details>` — no state, no JavaScript, keyboard-operable, and open while
 * the turn runs because that is when the list is telling you something you
 * cannot get anywhere else.
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
  if (activity.length === 0) return null;

  const failed = activity.filter((entry) => entry.state === "failed").length;
  const done = activity.filter((entry) => entry.state === "done").length;

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <details
        /*
         * `open` rather than `defaultOpen`-by-state: while the turn runs the
         * list is the only thing on screen worth reading, and once it finishes
         * the summary line carries the count. React re-renders this element as
         * the stream advances, so a controlled `open` would fight a student who
         * closed it mid-turn — but it is also the only way the card can open
         * itself when work starts. Running turns win; finished ones stay shut.
         */
        open={isRunning}
        className={cx(
          "w-full max-w-[360px] rounded-2xl border border-border-table",
          "bg-background-secondary-default p-1.5",
        )}
      >
        <summary
          className={cx(
            "flex cursor-pointer list-none items-center gap-2 px-2 py-1.5",
            "marker:hidden [&::-webkit-details-marker]:hidden",
          )}
        >
          <StepGlyph state={isRunning ? "running" : failed > 0 ? "failed" : "done"} />
          <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-secondary">
            {summarise(activity.length, done, failed, isRunning)}
          </span>
        </summary>

        <ul className="flex flex-col gap-0.5">
          {activity.map((entry) => {
            const isCurrent = entry.state === "running";

            return (
              <li
                key={entry.toolCallId}
                /*
                 * The raised sub-card is the template's way of saying "this is
                 * the one happening now", and it only ever applies to a step
                 * that is genuinely in flight — a finished list has no raised
                 * row, which is correct, because nothing in it is current.
                 */
                className={cx(
                  "flex items-start gap-2 px-2 py-1.5",
                  isCurrent &&
                    "rounded-xl border border-border-table bg-background-primary-default shadow-xs",
                )}
              >
                <StepGlyph state={entry.state} />

                <span className="min-w-0 flex-1">
                  <span
                    className={cx(
                      "text-caption-1-regular",
                      entry.state === "failed"
                        ? "text-text-error-primary"
                        : isCurrent
                          ? "text-text-primary"
                          : "text-text-tertiary",
                    )}
                  >
                    {entry.label}
                  </span>

                  {/*
                    A failed tool says so in its own words. The alternative — a
                    silent omission — leaves the answer looking like it rested
                    on one more source than it did.
                  */}
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
      </details>

      {/* The template prints its clock below the card, not inside it. */}
      {isRunning ? <Elapsed /> : null}
    </div>
  );
}

function summarise(total: number, done: number, failed: number, isRunning: boolean): string {
  if (isRunning) {
    const left = total - done - failed;
    return left > 0 ? `${left} ${left === 1 ? "step" : "steps"} running` : "Working";
  }
  const checked = `${done} ${done === 1 ? "step" : "steps"}`;
  return failed === 0 ? checked : `${checked} · ${failed} couldn't be read`;
}

/**
 * The circle at the head of a step.
 *
 * Three states, three shapes — a spinner, a tick, a warning — rather than three
 * colours of the same dot, so the list is readable without colour vision and in
 * a screenshot.
 */
function StepGlyph({ state }: { state: ToolActivity["state"] }) {
  if (state === "running") {
    return (
      <RiLoader4Line
        aria-hidden
        className={cx(
          "mt-0.5 size-3.5 shrink-0 animate-spin text-foreground-icon-secondary",
          "motion-reduce:animate-none",
        )}
      />
    );
  }
  if (state === "failed") {
    return (
      <RiErrorWarningLine
        aria-hidden
        className="mt-0.5 size-3.5 shrink-0 text-foreground-icon-error"
      />
    );
  }
  return (
    <RiCheckLine aria-hidden className="mt-0.5 size-3.5 shrink-0 text-foreground-icon-quaternary" />
  );
}

/**
 * "Thinking 3.2s" — the template's own line, and it earns its keep.
 *
 * A tool loop over eighteen tools can genuinely take fifteen seconds, and a
 * spinner with no number is indistinguishable from a hang. A counting number is
 * the cheapest possible proof that something is still happening.
 *
 * Tenths, updated ten times a second, and only while this component is mounted
 * — the parent unmounts it the moment the turn stops running, so there is no
 * interval to leak and no final time to freeze.
 */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    /*
     * The clock starts in the effect, not in a ref initialiser.
     * `performance.now()` during render is impure — a re-render that React
     * discards would move the start time — and the effect is also the honest
     * moment to start counting, since it is when the line reaches the screen.
     */
    const started = performance.now();
    const timer = window.setInterval(() => {
      setSeconds((performance.now() - started) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="px-1 text-caption-1-regular text-text-tertiary">
      Thinking {seconds.toFixed(1)}s
    </p>
  );
}
