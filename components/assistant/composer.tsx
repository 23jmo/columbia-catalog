"use client";

import { useEffect, useRef, useId } from "react";
import type { ChatStatus } from "ai";
import {
  RiAddLine,
  RiArrowUpLine,
  RiCalendarLine,
  RiShieldCheckLine,
  RiStopFill,
} from "@remixicon/react";

import { cx } from "@/utils/cx";

/**
 * The box.
 *
 * ── Copied from the template, including the part that is invisible ─────────
 *
 * BoardUI's composer is a white pill floating on the page background, and the
 * detail that makes it is a multi-stop gradient chasing its own outline — which
 * sits at zero opacity until the agent is actually working. It is not trim; it
 * is the loading state, and it is the only one the surface needs, because the
 * pill is the one element a student is already looking at when they are waiting.
 *
 * Three strokes at 32 / 8 / 2.5 with blurs of 14 / 6 / 0.5 share one dash
 * animation. Individually each is a line running around a rectangle; stacked,
 * they read as a glow. `pathLength="100"` normalises the perimeter so a full
 * lap is always exactly -100 no matter how wide the box has grown.
 *
 * ── What sits where the model chip does ────────────────────────────────────
 *
 * The template prints the model name to the left of the send button. A model
 * name is not a fact a student can act on. The term the answer will be about
 * is, so `Fall 2026` takes that slot — same position, same weight, a fact that
 * changes what the answer means.
 *
 * ── Enter sends ────────────────────────────────────────────────────────────
 *
 * Shift+Enter is the newline, which is the convention every chat surface uses
 * and the one a student will try first. The box grows to fit either way.
 */

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  /** Clears the thread. The template's `+`; ours starts a fresh question. */
  onNewThread: () => void;
  status: ChatStatus;
  canStartNewThread: boolean;
  promptsUsed: number;
  promptsLimit: number;
  termLabel: string;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  onNewThread,
  status,
  canStartNewThread,
  promptsUsed,
  promptsLimit,
  termLabel,
}: ComposerProps) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const isBusy = status === "submitted" || status === "streaming";

  /*
   * Grow to the content, capped.
   *
   * Reset to `auto` first: `scrollHeight` is the height of the content *or* the
   * element, whichever is larger, so measuring without clearing the last
   * explicit height means the box can only ever grow — delete three lines and
   * it keeps the space.
   */
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, [value]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        {/*
          The pill itself, painted behind everything so the running light can
          sit between it and the controls.

          It carries a hairline as well as the shadow. The template floats a
          white pill on a white page and leans on `shadow-xs` alone to separate
          them — but `--shadow-xs` is only overridden for dark here, so in light
          mode that resolves to Tailwind's 5%-opacity default and the box
          disappears into the page. The rim is what actually draws it.
        */}
        <span
          aria-hidden
          className={cx(
            "absolute inset-0 rounded-[26px] border border-border-table",
            "bg-background-primary-default shadow-xs",
            "transition-colors duration-[450ms] motion-reduce:transition-none",
            isBusy && "border-transparent",
          )}
        />

        <RunningLight active={isBusy} />

        <div className="relative flex min-h-[52px] items-end gap-2.5 rounded-[26px] p-2">
          <button
            type="button"
            onClick={onNewThread}
            disabled={!canStartNewThread}
            aria-label="Start a new question"
            title="Start a new question"
            className={cx(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              "text-foreground-icon-secondary transition-colors",
              "hover:bg-background-primary-hover hover:text-text-primary",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              "disabled:pointer-events-none disabled:text-foreground-icon-disabled",
            )}
          >
            <RiAddLine aria-hidden className="size-5" />
          </button>

          <textarea
            ref={box}
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Ask me anything"
            aria-label="Ask the assistant a question"
            className={cx(
              "min-w-0 flex-1 resize-none self-center bg-transparent py-2",
              "text-body-regular text-text-primary caret-accent-500",
              "placeholder:text-text-tertiary outline-none",
            )}
          />

          <span className="hidden shrink-0 items-center gap-1.5 self-center px-1 sm:flex">
            <RiCalendarLine aria-hidden className="size-4 text-foreground-icon-quaternary" />
            <span className="whitespace-nowrap text-body-medium text-text-secondary">
              {termLabel}
            </span>
          </span>

          <button
            type="button"
            onClick={isBusy ? onStop : onSubmit}
            disabled={!isBusy && value.trim().length === 0}
            aria-label={isBusy ? "Stop answering" : "Send question"}
            className={cx(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              "bg-accent-600 text-text-white transition-colors hover:bg-accent-700",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              "disabled:bg-background-tertiary-default disabled:text-foreground-icon-disabled",
            )}
          >
            {isBusy ? (
              <RiStopFill aria-hidden className="size-3.5" />
            ) : (
              <RiArrowUpLine aria-hidden className="size-5" />
            )}
          </button>
        </div>
      </div>

      <StatusBar used={promptsUsed} limit={promptsLimit} />
    </div>
  );
}

/**
 * The gradient chasing the pill's outline while the assistant works.
 *
 * `aria-hidden` and pointer-transparent: it is the same information the stop
 * button already carries, said in a way a screen reader cannot use. The three
 * rects are drawn even when idle and faded rather than unmounted, so the light
 * comes up smoothly on submit instead of snapping into existence.
 */
function RunningLight({ active }: { active: boolean }) {
  /*
   * `useId` rather than a constant. Two composers on one page — which is not a
   * thing today and would be a very odd bug to chase tomorrow — would otherwise
   * share a gradient id, and SVG resolves `url(#…)` against the first match in
   * the document.
   */
  const gradient = `composer-light-${useId()}`;

  return (
    <span
      aria-hidden
      className={cx(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]",
        "transition-opacity duration-[450ms] motion-reduce:transition-none",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      {/*
        A fixed viewBox with `preserveAspectRatio="none"`, which is the
        template's own approach: the stroke stretches with the box rather than
        being re-measured, and at these proportions the distortion is invisible.
      */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1028 52"
        preserveAspectRatio="none"
        style={{ opacity: 0.7 }}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="30%" stopColor="#46baec" />
            <stop offset="50%" stopColor="#9677c8" />
            <stop offset="70%" stopColor="#e633a4" />
            <stop offset="100%" stopColor="#00faa7" />
          </linearGradient>
          <filter id={`${gradient}-wide`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id={`${gradient}-mid`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={`${gradient}-fine`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>

        {LIGHT_STROKES.map((stroke) => (
          <rect
            key={stroke.key}
            x="0"
            y="0"
            width="1028"
            height="52"
            rx="26"
            pathLength={100}
            fill="none"
            stroke={`url(#${gradient})`}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeDasharray={`${stroke.dash} ${100 - stroke.dash}`}
            filter={`url(#${gradient}-${stroke.key})`}
            style={{
              opacity: stroke.opacity,
              animation: `composer-loader-dash 4.5s linear ${stroke.delay} infinite`,
            }}
          />
        ))}
      </svg>
    </span>
  );
}

/**
 * The three passes, outermost first.
 *
 * Slightly different dash lengths and start offsets on purpose: identical arcs
 * would stack into one hard-edged band, and the small disagreement between them
 * is what makes the light look like it has depth.
 */
const LIGHT_STROKES = [
  { key: "wide", width: 32, dash: 30, opacity: 0.3, delay: "-0.08s" },
  { key: "mid", width: 8, dash: 31.7, opacity: 0.8, delay: "-0.05s" },
  { key: "fine", width: 2.5, dash: 33.3, opacity: 1, delay: "0s" },
] as const;

/**
 * The strip under the box — the template's, carrying our facts.
 *
 * BoardUI runs a thin line here with the branch, the project, the agent and a
 * progress ring. It reads as chrome until you notice what those items have in
 * common: every one is something the next message will be sent *against*, shown
 * before you send it rather than after it goes wrong.
 *
 * Ours carries the promise that the answer will be read rather than recalled —
 * the spec's hardest rule, enforced in `lib/agent/grounding.ts`, and saying so
 * here is what lets a student read a surprising answer as surprising rather
 * than as invented — and how many questions are left, because a limit met for
 * the first time as a refusal is a worse limit than one counted down in front
 * of you.
 */
function StatusBar({ used, limit }: { used: number; limit: number }) {
  return (
    <div className="flex items-center gap-2 px-3">
      <span className="flex min-w-0 items-center gap-1.5">
        <RiShieldCheckLine
          aria-hidden
          className="size-3.5 shrink-0 text-foreground-icon-quaternary"
        />
        <span className="min-w-0 truncate text-body-2-medium text-text-secondary">
          Read from the catalog, never from memory
        </span>
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <PromptRing used={used} limit={limit} />
        <span className="text-body-2-medium tabular-nums text-text-secondary">
          {used}/{limit}
        </span>
      </span>
    </div>
  );
}

/**
 * The template's 57% ring, counting the one budget this product actually has.
 *
 * Drawn rather than animated: it changes once per question, and a transition on
 * a value that moves five percent an hour is motion for its own sake.
 * `aria-hidden` because the number is printed beside it — a screen reader
 * should hear "3/20", not a description of a circle.
 */
function PromptRing({ used, limit }: { used: number; limit: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const fraction = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;

  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 -rotate-90">
      <circle cx="8" cy="8" r={radius} fill="none" strokeWidth="2" className="stroke-chart-track" />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${circumference * fraction} ${circumference}`}
        className="stroke-agent-progress-ring"
      />
    </svg>
  );
}
