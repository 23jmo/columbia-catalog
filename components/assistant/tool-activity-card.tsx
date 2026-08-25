"use client";

import { useEffect, useState } from "react";
import { RiCheckLine, RiErrorWarningLine, RiLoader4Line } from "@remixicon/react";

import type { ToolActivity } from "@/lib/agent/transcript";
import { cx } from "@/utils/cx";

/**
 * What the assistant did before it answered.
 *
 * ── This card is the product, not a loading state ──────────────────────────
 *
 * The template puts a thin-bordered "8 steps left" card and a "Thinking 14.0s"
 * line in the middle of the conversation, and it is tempting to read those as
 * decoration for dead air. They are not, and here they are load-bearing: the
 * spec's hardest rule is that the assistant may state only facts a tool
 * returned, and a student has no way to hold us to that unless they can see
 * which tools ran. "Reading your coursework · Working out what your degree
 * still needs · Ranking courses for you" is the difference between an answer
 * and a claim.
 *
 * So it stays on screen after the turn finishes, collapsed to one line. The
 * detail is a `<details>` — no state, no JavaScript, keyboard-operable, and
 * open by default while the turn is still running because that is when the
 * list is telling you something you cannot get anywhere else.
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
    <details
      /*
       * `open` rather than `defaultOpen`-by-state: while the turn runs the list
       * is the only thing on screen worth reading, and once it finishes the
       * summary line carries the count. React re-renders this element as the
       * stream advances, so a controlled `open` would fight a student who
       * closed it mid-turn — but it is also the only way the card can open
       * itself when work starts. Running turns win; finished ones stay shut.
       */
      open={isRunning}
      className={cx(
        "rounded-2xl border border-border-table bg-background-primary-default",
        "px-3.5 py-3 text-body-2-regular",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-text-secondary marker:hidden [&::-webkit-details-marker]:hidden">
        {isRunning ? (
          <RiLoader4Line
            aria-hidden
            className="size-4 shrink-0 animate-spin text-foreground-icon-tertiary motion-reduce:animate-none"
          />
        ) : failed > 0 ? (
          <RiErrorWarningLine aria-hidden className="size-4 shrink-0 text-foreground-icon-error" />
        ) : (
          <RiCheckLine aria-hidden className="size-4 shrink-0 text-foreground-icon-tertiary" />
        )}

        <span className="min-w-0 flex-1 truncate text-caption-1-medium">
          {isRunning ? <Elapsed /> : summarise(done, failed)}
        </span>
      </summary>

      <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-border-table pt-2.5">
        {activity.map((entry) => (
          <li key={entry.toolCallId} className="flex items-start gap-2">
            <StateDot state={entry.state} />
            <span className="min-w-0 flex-1">
              <span
                className={cx(
                  "text-caption-1-regular",
                  entry.state === "failed" ? "text-text-error-primary" : "text-text-secondary",
                )}
              >
                {entry.label}
              </span>
              {/*
                A failed tool says so in its own words. The alternative — a
                silent omission — leaves the answer looking like it rested on
                one more source than it did.
              */}
              {entry.errorText ? (
                <span className="block text-caption-2-regular text-text-tertiary">
                  {entry.errorText}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function summarise(done: number, failed: number): string {
  const checked = `Checked ${done} ${done === 1 ? "thing" : "things"}`;
  if (failed === 0) return checked;
  return `${checked} · ${failed} couldn't be read`;
}

function StateDot({ state }: { state: ToolActivity["state"] }) {
  if (state === "running") {
    return (
      <RiLoader4Line
        aria-hidden
        className="mt-0.5 size-3.5 shrink-0 animate-spin text-foreground-icon-tertiary motion-reduce:animate-none"
      />
    );
  }
  if (state === "failed") {
    return <RiErrorWarningLine aria-hidden className="mt-0.5 size-3.5 shrink-0 text-foreground-icon-error" />;
  }
  return <RiCheckLine aria-hidden className="mt-0.5 size-3.5 shrink-0 text-foreground-icon-tertiary" />;
}

/**
 * "Thinking 3.2s" — the template's own line, and it earns its keep.
 *
 * A tool loop over eighteen tools can genuinely take fifteen seconds, and a
 * spinner with no number is indistinguishable from a hang. A counting number
 * is the cheapest possible proof that something is still happening.
 *
 * Tenths, updated ten times a second, and only while this component is
 * mounted — the parent unmounts it the moment the turn stops running, so there
 * is no interval to leak and no final time to freeze.
 */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    /*
     * The clock starts in the effect, not in a ref initialiser. `performance.now()`
     * during render is impure — a re-render that React discards would move the
     * start time — and the effect is also the honest moment to start counting,
     * since it is when the card first reaches the screen.
     */
    const started = performance.now();
    const timer = window.setInterval(() => {
      setSeconds((performance.now() - started) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  return <>Thinking {seconds.toFixed(1)}s</>;
}
