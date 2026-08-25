"use client";

import { useEffect, useRef } from "react";
import type { ChatStatus, UIMessage } from "ai";
import { RiSparkling2Line } from "@remixicon/react";

import { citedCourses, proseOf, suggestedFollowUps, toolActivity } from "@/lib/agent/transcript";
import { SourceList } from "@/components/assistant/source-list";
import { ToolActivityCard } from "@/components/assistant/tool-activity-card";
import { cx } from "@/utils/cx";

/**
 * The thread.
 *
 * ── Two shapes, deliberately unequal ───────────────────────────────────────
 *
 * The student's message is a bubble; the assistant's is not. That asymmetry is
 * the template's, and it is right for a reason worth stating: a bubble reads as
 * something said, and the assistant's turn is not a remark — it is a short
 * report with sources attached. Giving both sides the same container invites
 * the reader to weigh them the same way.
 *
 * ── Sources render here below `xl`, and in the rail above it ───────────────
 *
 * One component, two positions, chosen by CSS rather than by branching. The
 * rail does not exist on a phone, and dropping the sources with it would leave
 * exactly the readers who cannot check a claim unable to check it. Only one
 * copy is ever displayed, so only one is in the accessibility tree.
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
   * `block: "end"` on a sentinel after the last message rather than scrolling
   * the container to its own scrollHeight: the composer is sticky and the page
   * scrolls as a whole, so there is no container with a scrollHeight to use.
   */
  useEffect(() => {
    if (messages.length === 0) return;
    foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  return (
    <div className={cx("flex flex-col gap-6", className)}>
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;

        if (message.role === "user") {
          return (
            <div key={message.id} className="flex justify-end">
              <p
                className={cx(
                  "max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md",
                  "bg-background-secondary-default px-4 py-2.5",
                  "text-body-2-regular text-text-primary",
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
  const courses = citedCourses(message);
  const prose = proseOf(message);
  const followUps = showFollowUps ? suggestedFollowUps(message) : [];

  return (
    <div className="flex flex-col gap-3">
      {activity.length > 0 ? (
        <ToolActivityCard activity={activity} isRunning={isRunning} />
      ) : null}

      {prose ? (
        <div className="flex gap-2.5">
          <RiSparkling2Line
            aria-hidden
            className="mt-1 hidden size-4 shrink-0 text-foreground-icon-tertiary sm:block"
          />
          {/*
            `whitespace-pre-wrap` rather than a markdown renderer. The system
            prompt asks for short prose and the structure lives in the cards
            beside it, so a parser here would buy formatting the answer is not
            supposed to need — and would be one more place a model could put
            markup the surface then has to trust.
          */}
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-body-2-regular text-text-primary">
            {prose}
          </p>
        </div>
      ) : null}

      {/* Below `xl` there is no rail, so the evidence rides with the answer. */}
      {courses.length > 0 ? (
        <div className="xl:hidden">
          <p className="mb-1.5 text-caption-2-medium text-text-tertiary">
            What this is based on
          </p>
          <SourceList courses={courses} />
        </div>
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
