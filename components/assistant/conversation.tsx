"use client";

import { useEffect, useRef } from "react";
import type { ChatStatus, UIMessage } from "ai";
import { RiShieldCheckLine } from "@remixicon/react";

import {
  citedCourses,
  feedCards,
  proseOf,
  suggestedFollowUps,
  toolActivity,
} from "@/lib/agent/transcript";
import { FeedCardView } from "@/components/feed";
import { SourceList } from "@/components/assistant/source-list";
import { ToolActivityCard } from "@/components/assistant/tool-activity-card";
import { cx } from "@/utils/cx";

/**
 * The thread.
 *
 * ── Two shapes, deliberately unequal ───────────────────────────────────────
 *
 * The student's message is a card; the assistant's is bare text on the page.
 * That asymmetry is the template's, and it is right for a reason worth stating:
 * a bubble reads as something *said*, and the assistant's turn is not a remark
 * — it is a short report with its sources attached. Giving both sides the same
 * container invites the reader to weigh them the same way.
 *
 * ── The evidence is a card in the flow, not a rail ─────────────────────────
 *
 * The template's answers carry one attachment: the artifact the agent produced,
 * in a bordered card directly under the prose, with a label strip naming what
 * it is. Ours is the list of courses the tools actually returned. Same position,
 * same chrome, and it earns the position better than a side rail did — the
 * claim and the thing it rests on are read in one movement of the eye, and it
 * does not vanish on a narrow screen, which is exactly where a student is least
 * able to go check.
 */

export function Conversation({
  messages,
  status,
  onAsk,
  className,
}: {
  messages: readonly UIMessage[];
  status: ChatStatus;
  onAsk: (text: string) => void;
  className?: string;
}) {
  const foot = useRef<HTMLDivElement | null>(null);

  /*
   * Follow the stream, but only to the bottom of the newest turn.
   *
   * `block: "end"` on a sentinel after the last message rather than scrolling a
   * container to its own scrollHeight: the composer is sticky and the page
   * scrolls as a whole, so there is no container with a scrollHeight to use.
   */
  useEffect(() => {
    if (messages.length === 0) return;
    foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  return (
    <div className={cx("flex flex-col gap-7", className)}>
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;

        if (message.role === "user") {
          return (
            <div key={message.id} className="flex justify-end">
              <p
                className={cx(
                  "max-w-[min(34rem,85%)] whitespace-pre-wrap rounded-2xl",
                  "border border-border-table bg-background-primary-default shadow-xs",
                  "px-4 py-3 text-body-regular text-text-primary",
                )}
              >
                {proseOf(message)}
              </p>
            </div>
          );
        }

        return (
          <AssistantTurn
            key={message.id}
            message={message}
            isRunning={isLast && (status === "submitted" || status === "streaming")}
            showFollowUps={isLast && status === "ready"}
            onAsk={onAsk}
          />
        );
      })}

      <div ref={foot} aria-hidden />
    </div>
  );
}

function AssistantTurn({
  message,
  isRunning,
  showFollowUps,
  onAsk,
}: {
  message: UIMessage;
  isRunning: boolean;
  showFollowUps: boolean;
  onAsk: (text: string) => void;
}) {
  const activity = toolActivity(message);
  const cards = feedCards(message);
  const prose = proseOf(message);
  const followUps = showFollowUps ? suggestedFollowUps(message) : [];

  /*
   * Evidence for everything the cards do not already cover.
   *
   * A card IS the evidence for its own course — it carries the instructor, the
   * seat count with its provenance stamp, and the link to the registrar's own
   * page. Listing that course a second time in the thin source list underneath
   * would be the same fact twice. What the list is still for is the courses the
   * answer leaned on that never became cards: a `search_courses` result, a
   * `get_course` lookup, a course the prerequisite filter withheld.
   */
  const carded = new Set(cards.map((card) => card.courseId));
  const courses = citedCourses(message).filter((course) => !carded.has(course.courseId));

  return (
    <div className="flex flex-col gap-3.5">
      {activity.length > 0 ? (
        <ToolActivityCard activity={activity} isRunning={isRunning} />
      ) : null}

      {prose ? (
        /*
         * `whitespace-pre-wrap` rather than a markdown renderer. The system
         * prompt asks for short prose and the structure lives in the card
         * beneath it, so a parser here would buy formatting the answer is not
         * supposed to need — and would be one more place a model could put
         * markup the surface then has to trust.
         */
        <p className="max-w-[88ch] whitespace-pre-wrap text-body-regular text-text-primary">
          {prose}
        </p>
      ) : null}

      {/*
        The classes themselves — the same card the home feed renders, section
        and all. This is the point of the surface: a course code is not
        something a student can register for, and the decision is the section,
        so what lands under the prose is the instructor, the meeting pattern,
        the seat count with its provenance stamp, and the button that opens that
        exact call number in Vergil.
      */}
      {cards.length > 0 ? (
        /*
          A grid, not a stack. The card is sized for the home page's rail —
          about 22rem — and stretching one across the full width of a thread
          leaves a seat meter a metre long above two buttons floating in space.
          Two or three to a row keeps the card the shape it was designed as, and
          lets a three-card answer be taken in at a glance instead of scrolled.
        */
        <ul
          role="list"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {cards.map((card) => (
            <li key={card.courseId} className="flex">
              <FeedCardView card={card} className="w-full" />
            </li>
          ))}
        </ul>
      ) : null}

      {courses.length > 0 ? (
        <section
          className={cx(
            "overflow-hidden rounded-2xl border border-border-table",
            "bg-background-primary-default",
          )}
        >
          <header
            className={cx(
              "flex items-center gap-2 border-b border-border-table",
              "bg-background-secondary-default px-3 py-2",
            )}
          >
            <RiShieldCheckLine
              aria-hidden
              className="size-3.5 shrink-0 text-foreground-icon-quaternary"
            />
            <h3 className="min-w-0 flex-1 truncate text-caption-1-medium text-text-secondary">
              What this answer is based on
            </h3>
            <span className="shrink-0 text-caption-2-regular tabular-nums text-text-tertiary">
              {courses.length} {courses.length === 1 ? "course" : "courses"}
            </span>
          </header>

          <SourceList courses={courses} />
        </section>
      ) : null}

      {followUps.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {followUps.map((question) => (
            <li key={question}>
              <button
                type="button"
                onClick={() => onAsk(question)}
                className={cx(
                  "rounded-full border border-border-table bg-background-primary-default",
                  "px-3 py-1.5 text-caption-1-regular text-text-secondary",
                  "transition-colors hover:bg-background-primary-hover hover:text-text-primary",
                  "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                )}
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
