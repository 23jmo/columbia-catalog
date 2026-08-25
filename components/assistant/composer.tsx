"use client";

import { useEffect, useRef } from "react";
import type { ChatStatus } from "ai";
import { RiAddLine, RiArrowUpLine, RiStopFill } from "@remixicon/react";

import { cx } from "@/utils/cx";

/**
 * The box, and the two facts printed under it.
 *
 * ── What the template's status bar is for ──────────────────────────────────
 *
 * BoardUI runs a thin strip under the composer carrying the branch, the
 * project, the agent, and a progress ring. It reads as chrome until you notice
 * what it has in common: every item is a thing the next message will be sent
 * *against*, shown before you send it rather than after it goes wrong.
 *
 * Ours carries the same kind of fact. The term the answer will be about, the
 * promise that it will be drawn from the catalog rather than recalled, and how
 * many questions are left in the window — because a twenty-per-six-hours limit
 * a student meets for the first time as a refusal is a worse limit than the
 * same one counted down in front of them.
 *
 * ── Enter sends ────────────────────────────────────────────────────────────
 *
 * Shift+Enter is the newline. This is the convention every chat surface uses
 * and the one a student will try first, and the textarea grows to fit either
 * way — no scrollbar until eight lines, which is past the length of any real
 * question about a schedule.
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
   * Reset to `auto` first: `scrollHeight` is the height of the content *or*
   * the element, whichever is larger, so measuring without clearing the last
   * explicit height means the box can only ever grow — delete three lines and
   * it keeps the space.
   */
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 192)}px`;
  }, [value]);

  const remaining = Math.max(0, promptsLimit - promptsUsed);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cx(
          "flex items-end gap-2 rounded-[22px] border border-border-table",
          "bg-background-primary-default px-2.5 py-2",
          "shadow-sm transition-colors focus-within:border-border-button-active",
        )}
      >
        <button
          type="button"
          onClick={onNewThread}
          disabled={!canStartNewThread}
          aria-label="Start a new question"
          title="Start a new question"
          className={cx(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            "bg-ai-chat-composer-add-background text-foreground-icon-secondary",
            "transition-colors hover:bg-ai-chat-composer-add-hover-background",
            "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            "disabled:cursor-not-allowed disabled:text-foreground-icon-disabled",
          )}
        >
          <RiAddLine aria-hidden className="size-4" />
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
          placeholder="Ask about your degree, your term, or a course"
          aria-label="Ask the assistant a question"
          className={cx(
            "min-w-0 flex-1 resize-none bg-transparent py-1.5",
            "text-body-2-regular text-text-primary placeholder:text-text-placeholder",
            "outline-none",
          )}
        />

        {/*
          The template's model chip sits here. A model name is not a fact a
          student can use; how many questions they have left is, and it belongs
          beside the button that spends one.
        */}
        <span className="hidden shrink-0 self-center px-1 text-caption-2-medium text-text-tertiary sm:inline">
          {remaining} left
        </span>

        <button
          type="button"
          onClick={isBusy ? onStop : onSubmit}
          disabled={!isBusy && value.trim().length === 0}
          aria-label={isBusy ? "Stop answering" : "Send question"}
          className={cx(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            "text-text-white transition-colors",
            "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring",
            isBusy
              ? "bg-accent-600 hover:bg-accent-700"
              : "bg-accent-600 hover:bg-accent-700 disabled:bg-background-tertiary-default disabled:text-foreground-icon-disabled",
          )}
        >
          {isBusy ? (
            <RiStopFill aria-hidden className="size-3.5" />
          ) : (
            <RiArrowUpLine aria-hidden className="size-4" />
          )}
        </button>
      </div>

      <StatusBar termLabel={termLabel} used={promptsUsed} limit={promptsLimit} />
    </div>
  );
}

/**
 * The strip under the box: what this answer will be about, and what it costs.
 */
function StatusBar({
  termLabel,
  used,
  limit,
}: {
  termLabel: string;
  used: number;
  limit: number;
}) {
  return (
    <div className="flex items-center gap-3 px-2 text-caption-2-regular text-text-tertiary">
      <span className="shrink-0">{termLabel}</span>
      <span aria-hidden className="text-foreground-icon-quaternary">
        ·
      </span>
      {/*
        Not a slogan. The agent is forbidden from stating a Columbia fact no
        tool returned, the rule is enforced in `lib/agent/grounding.ts`, and
        saying so under the box is what lets a student read a surprising answer
        as surprising rather than as invented.
      */}
      <span className="min-w-0 truncate">Answers come from the catalog, never from memory</span>

      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <PromptRing used={used} limit={limit} />
        <span className="tabular-nums">
          {used}/{limit}
        </span>
      </span>
    </div>
  );
}

/**
 * The template's 57% ring, counting the one budget this product actually has.
 *
 * Drawn rather than animated: it changes once per question, and a transition
 * on a value that moves five percent an hour is motion for its own sake.
 * `aria-hidden` because the number is already printed beside it in text — a
 * screen reader should hear "3/20", not a description of a circle.
 */
function PromptRing({ used, limit }: { used: number; limit: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const fraction = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;

  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 -rotate-90">
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="2"
        className="stroke-chart-track"
      />
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
