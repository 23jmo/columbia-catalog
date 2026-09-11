"use client";

import { RiArrowRightLine } from "@remixicon/react";
import Link from "next/link";

import { TaskList } from "@/components/application/task-list/task-list";
import { activityTasks } from "@/components/assistant/tool-activity-card";
import { AssistantMarkdown } from "@/components/assistant/markdown";
import { SourceList } from "@/components/assistant/source-list";

import {
  LANDING_ADVISOR_ACTIVITY,
  LANDING_ADVISOR_ANSWER,
  LANDING_ADVISOR_QUESTION,
  LANDING_ADVISOR_SOURCES,
} from "./landing-fixtures";
import { LionMark } from "./landing-mark";

/**
 * The advisor band: one real turn of `/chat`, not a description of one.
 *
 * ── Why this band replaced the capability grid ─────────────────────────────
 *
 * What stood here was four cards with an icon and two sentences each, and the
 * note on them was "no one cares". That was right. A grid saying "reasons, in
 * writing" is the page asserting a property; a turn that reads the record,
 * checks the degree, ranks, checks the week, and then says *drop Computer
 * Graphics, it is the only Friday and it finishes nothing* is the property.
 *
 * It also had to be the chat rather than a fifth view of the feed. The feed is
 * already the hero and already the first band; what a ranked list cannot do is
 * answer a constraint the ranking never knew about, which is the whole reason
 * `/chat` is a nav item (see the note at the top of `app/chat/page.tsx`).
 *
 * ── These are the real components ──────────────────────────────────────────
 *
 * `TaskList` is BoardUI's, driven by `activityTasks()` — the same function the
 * live thread calls, over `ToolActivity[]` built from `toolLabel()`. So the
 * rows here read "Working out what your degree still needs" because that is
 * the string `lib/agent/transcript.ts` maps `get_unmet_requirements` to, and
 * renaming it there renames it here.
 *
 * `AssistantMarkdown` and `SourceList` are likewise the thread's own. The one
 * thing NOT reused is `Conversation`, which owns the turn loop: it mounts
 * `useStickToBottom`, and a landing page that installs a scroll handler
 * wanting to pin a thread to its bottom is a landing page that fights the
 * reader for the scroll. The user bubble is 8 lines of that component's markup
 * instead, copied with its tint intact.
 *
 * ── `revealed` is the whole list, deliberately ─────────────────────────────
 *
 * `ToolActivityCard` passes `collapseOnComplete="all"`, which folds the tree
 * the moment the last call lands — correct in a thread, where the reader
 * watched it happen and wants the answer. Here nobody watched anything, and a
 * folded card is a band that shows nothing. So this renders `TaskList`
 * directly at the default `collapseOnComplete: false`, with `revealed` set
 * past the last unit so every row is already in.
 *
 * ── Why this file is "use client" ─────────────────────────────────────────
 *
 * Not for state — there is none. `activityTasks` is exported from
 * `tool-activity-card.tsx`, which is a "use client" module, so calling it
 * during a server render throws at request time even though the build is
 * clean. Rebuilding the task by hand would dodge that and give up the
 * guarantee this band is for, so the band crosses the boundary instead.
 *
 * `inert` and `role="img"` for the same reasons as `LandingProductShot`: the
 * source list is a real disclosure button and the chips inside it are real
 * links, and neither should be a tab stop on a page whose only job is the two
 * buttons above it.
 */

const TURN_LABEL =
  "A LionPlan chat answering a student who asks what to drop from four courses to keep " +
  "Fridays free. The assistant reads their coursework, works out what the degree still " +
  "needs, ranks courses and checks the week for clashes, then answers: drop COMS W4160 " +
  "Computer Graphics, the only one that meets on a Friday and a track elective three " +
  "other courses also satisfy.";

export function LandingAdvisor() {
  return (
    <section className="mx-auto flex w-full max-w-[75rem] flex-col items-center gap-12 px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto flex max-w-[44rem] flex-col items-center gap-4 text-center">
        <h2 className="text-balance text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-[1.12] tracking-[-0.03em] text-text-primary">
          Your academic advisor, available anytime
        </h2>
        <p className="max-w-[46ch] text-pretty text-[1.0625rem] leading-[1.5] tracking-[-0.011em] text-text-secondary">
          No appointment, no two-week wait. Ask what to drop, what still
          counts, or how to keep Fridays free. It reads your record and the
          catalog, checks your week, and shows every lookup it made before it
          answers.
        </p>
      </div>

      <figure
        role="img"
        aria-label={TURN_LABEL}
        className="w-full max-w-[46rem]"
      >
        <div
          inert
          className="overflow-hidden rounded-[1.25rem] bg-background-primary-default shadow-[0_2px_10px_rgba(3,34,90,0.10),0_36px_70px_-32px_rgba(3,34,90,0.42)] ring-1 ring-black/[0.07] sm:rounded-[1.75rem]"
        >
          {/* The same window chrome as the hero's frame, so the two read as
              two views of one product rather than two screenshots. */}
          <div className="flex items-center justify-between gap-3 border-b border-border-table px-4 py-3 sm:px-5">
            <span className="flex items-center gap-2">
              <LionMark size={22} />
              <span className="text-body-2-medium text-text-primary">
                Chat
              </span>
            </span>
            <span className="rounded-full bg-background-secondary-default px-2.5 py-1 text-caption-1-medium tabular-nums text-text-secondary">
              Fall 2026
            </span>
          </div>

          <div className="flex flex-col gap-6 p-4 sm:gap-7 sm:p-6">
            {/*
              `conversation.tsx`'s user turn, markup and all: a tint rather
              than a rim, right-aligned, capped so a long question wraps
              instead of running the width of the frame.
            */}
            <div className="flex justify-end">
              <p className="max-w-[min(34rem,85%)] whitespace-pre-wrap rounded-2xl bg-background-secondary-default px-4 py-3 text-headline-regular text-text-primary">
                {LANDING_ADVISOR_QUESTION}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="w-full max-w-90 rounded-2xl border border-border-table bg-background-primary-default p-4">
                <TaskList
                  tasks={activityTasks(LANDING_ADVISOR_ACTIVITY)}
                  revealed={1 + LANDING_ADVISOR_ACTIVITY.length}
                />
              </div>

              <AssistantMarkdown source={LANDING_ADVISOR_ANSWER} />

              <SourceList courses={LANDING_ADVISOR_SOURCES} />
            </div>
          </div>
        </div>
      </figure>

      <Link
        href="/chat"
        className="inline-flex items-center gap-1.5 rounded-lg text-[0.9375rem] font-medium tracking-[-0.01em] text-accent-600 outline-none transition-colors duration-150 hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        Try the chat
        <RiArrowRightLine className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
