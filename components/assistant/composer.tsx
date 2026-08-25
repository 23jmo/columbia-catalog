"use client";

import { useEffect, useRef, useId, useState } from "react";
import type { ChatStatus } from "ai";
import { Calligraph } from "calligraph";
import { useReducedMotion, motion } from "motion/react";
import {
  RiAddLine,
  RiArrowUpLine,
  RiCalendarLine,
  RiHistoryLine,
  RiShieldCheckLine,
  RiStopFill,
} from "@remixicon/react";

import { cx } from "@/utils/cx";

/**
 * The box.
 *
 * ── A field, not a pill ────────────────────────────────────────────────────
 *
 * It was a 52px pill with everything on one row: new-thread button, input,
 * term, send. That shape says "type a line" — it is a search box — and what
 * this box is for is a paragraph about your degree. Gemini's is the reference
 * the owner named, and the thing it gets right is that the writing surface owns
 * the whole width and the controls sit underneath it, so a three-line question
 * looks expected rather than like something that overflowed.
 *
 * The one place a pill survives is a phone at rest, and it is not a reversal:
 * it folds to a single row only while empty and unfocused, and becomes the full
 * field the moment it is tapped. On a 700px-tall screen the 7rem box plus its
 * status line was eating a fifth of the thread to say "you may type here" — the
 * pill says the same thing in 44px and hands the rest back to the conversation.
 * Everything above still holds for the state you actually write in.
 *
 * So: 7rem tall at rest, corners at 24px instead of a full round, the textarea
 * across the top, and one control row beneath it. The box grows from there to
 * a 200px cap, at which point it scrolls.
 *
 * ── Kept from the template, including the part that is invisible ───────────
 *
 * The detail that makes it is a multi-stop gradient chasing its own outline —
 * which
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
  /** Opens the full chat list. The rail only holds five; this is the rest. */
  onOpenHistory?: () => void;
  status: ChatStatus;
  canStartNewThread: boolean;
  promptsUsed: number;
  promptsLimit: number;
  termLabel: string;
}

/** Example questions — the placeholder cycles through these when the box is empty. */
const COMPOSER_EXAMPLE_PROMPTS = [
  "What are some easy global cores that still have open seats?",
  "What major related classes would I find interesting?",
  "Are there any humanities classes taught by highly rated professors that would satisfy some of my requirements?",
  "Which open sections fit my plan next semester?",
  "What should I take to clear my last science requirement?",
] as const;

const PLACEHOLDER_ROTATE_MS = 7200;

/** Shared type for the writing surface and its Calligraph overlay. */
const COMPOSER_TEXT = "text-headline-regular";

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  onNewThread,
  onOpenHistory,
  status,
  canStartNewThread,
  promptsUsed,
  promptsLimit,
  termLabel,
}: ComposerProps) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const isBusy = status === "submitted" || status === "streaming";
  const reduceMotion = useReducedMotion();
  const placeholder = useRotatingPlaceholder(
    COMPOSER_EXAMPLE_PROMPTS,
    value.trim().length === 0,
    reduceMotion,
  );
  const showPlaceholder = value.trim().length === 0;

  /*
   * Phone-only collapse. See the note at the top of the file: the box is a
   * field, not a pill, and that is still true — this only governs what it looks
   * like while nobody is using it.
   *
   * `isBusy` holds it open on purpose. Collapsing mid-stream would hide the
   * stop button and the running light, which are the two things a reader wants
   * while the answer is arriving. Non-empty text holds it open for the same
   * reason: a half-typed question must not fold away because a thumb landed
   * somewhere else.
   */
  const [isFocused, setIsFocused] = useState(false);
  const isExpanded = isFocused || isBusy || value.trim().length > 0;
  const isCollapsed = !isExpanded;

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
    // Collapsed, the pill's own single-row height governs. Writing an explicit
    // pixel height here would win over it and the pill would stay field-tall.
    if (isCollapsed) return;
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [value, isCollapsed]);

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

          The rim stays on while the agent is working. The running light is a
          dash covering about a third of the perimeter, not a replacement
          stroke — hiding the hairline then is what made the box look like it
          had lost its border.
        */}
        <span
          aria-hidden
          className={cx(
            "absolute inset-0 border border-border-table",
            "bg-background-primary-default shadow-xs",
            "transition-[border-radius] duration-200 ease-out motion-reduce:transition-none",
            "sm:rounded-3xl",
            isCollapsed ? "rounded-full" : "rounded-3xl",
          )}
        />

        <RunningLight active={isBusy} />

        {/*
          Two shapes, and only below `sm` is there a second one. The `sm:`
          utilities are emitted inside a media query and therefore win above
          640px regardless of what the collapsed branch says, so the desktop box
          is untouched by any of this.
        */}
        <div
          className={cx(
            "relative flex gap-2",
            "transition-[border-radius,padding] duration-200 ease-out motion-reduce:transition-none",
            "sm:min-h-[7rem] sm:flex-col sm:rounded-3xl sm:p-3",
            isCollapsed
              ? "min-h-0 flex-row items-center rounded-full p-2"
              : "min-h-[7rem] flex-col rounded-3xl p-3",
          )}
        >
          {/*
            The writing surface first, at full width. `min-h` on the textarea
            rather than only on the box, so an empty composer still reads as
            somewhere to write a paragraph instead of a tall box with one line
            floating at the top of it.
          */}
          <div
            className={cx(
              "relative w-full min-w-0 flex-1",
              "sm:min-h-14",
              isCollapsed ? "min-h-0" : "min-h-14",
            )}
          >
            <textarea
              ref={box}
              rows={isCollapsed ? 1 : 2}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder=""
              aria-label="Ask the assistant a question"
              className={cx(
                "w-full resize-none bg-transparent px-2",
                "sm:min-h-14 sm:pt-1",
                isCollapsed ? "min-h-0 py-0 leading-9" : "min-h-14 pt-1",
                COMPOSER_TEXT,
                "text-text-primary caret-accent-500 outline-none",
              )}
            />

            {showPlaceholder ? (
              <ComposerPlaceholder
                text={placeholder}
                reduceMotion={reduceMotion}
                compact={isCollapsed}
              />
            ) : null}
          </div>

          {/*
            `contents` when folded, so the send button becomes a flex item of
            the pill itself and sits on the same row as the text rather than
            under it. The two buttons that have nowhere to go in a single row
            are dropped — the phone top bar carries new-thread while a thread is
            open, and history is a tap away once the box is expanded.
          */}
          <div
            className={cx(
              "flex shrink-0 items-center gap-2",
              isCollapsed && "max-sm:contents",
            )}
          >
            <button
              type="button"
              onClick={onNewThread}
              // Keep focus on the textarea. Without this the mousedown blurs it,
              // the box folds, and this button moves out from under the tap
              // before the click resolves.
              onMouseDown={(event) => event.preventDefault()}
              disabled={!canStartNewThread}
              aria-label="Start a new question"
              title="Start a new question"
              className={cx(
                isCollapsed && "max-sm:hidden",
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                "border border-border-table text-foreground-icon-secondary transition-colors",
                "hover:bg-background-primary-hover hover:text-text-primary",
                "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                "disabled:pointer-events-none disabled:border-transparent",
                "disabled:text-foreground-icon-disabled",
              )}
            >
              <RiAddLine aria-hidden className="size-5" />
            </button>

            {onOpenHistory ? (
              <button
                type="button"
                onClick={onOpenHistory}
                onMouseDown={(event) => event.preventDefault()}
                aria-label="Find a past chat"
                title="Find a past chat"
                className={cx(
                  isCollapsed && "max-sm:hidden",
                  "flex size-9 shrink-0 items-center justify-center rounded-full xl:hidden",
                  "border border-border-table text-foreground-icon-secondary transition-colors",
                  "hover:bg-background-primary-hover hover:text-text-primary",
                  "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                )}
              >
                <RiHistoryLine aria-hidden className="size-5" />
              </button>
            ) : null}

            <span className="ml-auto hidden shrink-0 items-center gap-1.5 px-1 sm:flex">
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
                "flex size-9 shrink-0 items-center justify-center rounded-full max-sm:ml-auto",
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
      </div>

      {/*
        Hidden under the folded pill. It is a footnote about a rate limit, and a
        footnote hanging off a floating control reads as an error message.
      */}
      <div className={cx(isCollapsed && "max-sm:hidden")}>
        <StatusBar used={promptsUsed} limit={promptsLimit} />
      </div>
    </div>
  );
}

/** Cycles example prompts in the empty textarea; stops while the student is typing. */
function useRotatingPlaceholder(
  prompts: readonly string[],
  enabled: boolean,
  reduceMotion: boolean | null,
): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!enabled || reduceMotion || prompts.length <= 1) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % prompts.length);
    }, PLACEHOLDER_ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [enabled, prompts.length, reduceMotion]);

  return prompts[index] ?? prompts[0] ?? "";
}

/**
 * Animated placeholder — native `placeholder` cannot morph, so Calligraph sits
 * over the empty textarea and disappears once the student starts typing.
 *
 * Calligraph already blurs individual glyphs on enter/exit; a light whole-line
 * blur during the swap keeps long example prompts from feeling like a hard cut.
 */
function ComposerPlaceholder({
  text,
  reduceMotion,
  compact = false,
}: {
  text: string;
  reduceMotion: boolean | null;
  /** Folded pill: one line, vertically centred on the single row. */
  compact?: boolean;
}) {
  const firstPrompt = useRef(true);
  const [soft, setSoft] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    if (firstPrompt.current) {
      firstPrompt.current = false;
      return;
    }
    setSoft(true);
    const id = window.setTimeout(() => setSoft(false), 380);
    return () => window.clearTimeout(id);
  }, [text, reduceMotion]);

  return (
    <div
      aria-hidden
      className={cx(
        "pointer-events-none absolute inset-x-2 text-text-tertiary",
        compact
          ? "top-0 bottom-0 flex items-center truncate"
          : "top-1 line-clamp-2",
        COMPOSER_TEXT,
      )}
    >
      {reduceMotion ? (
        text
      ) : (
        <motion.span
          className="inline-block text-pretty"
          animate={{
            filter: soft ? "blur(2.5px)" : "blur(0px)",
            opacity: soft ? 0.88 : 1,
          }}
          transition={{ duration: 0.36, ease: [0.19, 1, 0.22, 1] }}
        >
          <Calligraph
            animation="default"
            autoSize={false}
            drift={{ x: 0, y: 0 }}
            stagger={0}
          >
            {text}
          </Calligraph>
        </motion.span>
      )}
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
        "pointer-events-none absolute inset-0 overflow-hidden rounded-3xl [contain:paint]",
        "transition-opacity duration-[450ms]",
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
        viewBox="0 0 1028 112"
        preserveAspectRatio="none"
        style={{ opacity: 0.7 }}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-accent-200)" />
            <stop offset="30%" stopColor="var(--color-accent-400)" />
            <stop offset="50%" stopColor="var(--color-accent-500)" />
            <stop offset="70%" stopColor="var(--color-accent-600)" />
            <stop offset="100%" stopColor="var(--color-accent-300)" />
          </linearGradient>
          {/*
            Filter regions sized to roughly 3x each blur's deviation rather than
            the default 200% square. The blur is recomputed every frame while the
            dash travels, and the region is what decides how many pixels that
            costs -- a 4x area buys nothing here because the blur cannot reach
            that far.

            There is no `-fine` filter: a stdDeviation of 0.5 on a viewBox this
            stretched is below the threshold of visibility, and it was still
            forcing a full filter pass per frame.
          */}
          <filter id={`${gradient}-wide`} x="-8%" y="-40%" width="116%" height="180%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id={`${gradient}-mid`} x="-4%" y="-20%" width="108%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {LIGHT_STROKES.map((stroke) => (
          <rect
            key={stroke.key}
            x="0"
            y="0"
            width="1028"
            height="112"
            rx="24"
            pathLength={100}
            fill="none"
            stroke={`url(#${gradient})`}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeDasharray={`${stroke.dash} ${100 - stroke.dash}`}
            filter={stroke.key === "fine" ? undefined : `url(#${gradient}-${stroke.key})`}
            style={{
              opacity: stroke.opacity,
              animation: `composer-loader-dash 4.5s linear ${stroke.delay} infinite`,
              /*
               * Paused rather than unmounted while idle. The comment above this
               * component explains why the rects stay drawn -- unmounting them
               * makes the light snap in on submit instead of coming up. But
               * leaving three infinite blurred animations running behind a
               * transparent element costs the same per frame as running them
               * visibly, so the clock stops instead of the element leaving.
               */
              animationPlayState: active ? "running" : "paused",
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
