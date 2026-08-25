"use client";

import type { ChatStatus, UIMessage } from "ai";

import {
  citedCourses,
  feedCards,
  proseOf,
  suggestedFollowUps,
  toolActivity,
  turnBlocks,
  type TurnBlock,
} from "@/lib/agent/transcript";
import { FeedCardView } from "@/components/feed";
import { AssistantMarkdown } from "@/components/assistant/markdown";
import { CampusMapArtifactView, InstructorArtifactView, OnboardingArtifactView, ScheduleArtifactView } from "@/components/assistant/artifacts";
import { JumpToLatest, useStickToBottom } from "@/components/assistant/jump-to-latest";
import { SourceList } from "@/components/assistant/source-list";
import { ThinkingLine, ToolActivityCard } from "@/components/assistant/tool-activity-card";
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
 * ── Cards sit where the tool ran ───────────────────────────────────────────
 *
 * `message.parts` is the order. Text, then a calendar, then more text is how
 * the turn actually happened; concatenating the prose and stacking every
 * artifact under it was throwing that order away.
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
  const last = messages[messages.length - 1];
  /*
   * Tokens, tool rows, and cards all change this. `messages.length` alone
   * misses the stream — status stays "streaming" for the whole answer, and
   * that is exactly when the page has to keep following if the student is
   * already at the bottom.
   */
  const streamKey = last
    ? `${messages.length}:${last.id}:${proseOf(last).length}:${last.parts.length}:${status}`
    : `0:${status}`;
  const { showJump, more, jumpToLatest } = useStickToBottom(
    streamKey,
    last?.role === "user",
  );

  // First mention wins. A later unfiltered recommend reprints the same list;
  // those cards stay hidden so the thread does not stack Computer Vision twice.
  const alreadyShown = new Set<string>();

  return (
    <div data-assistant-thread className={cx("flex flex-col gap-7", className)}>
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;

        if (message.role === "user") {
          return (
            <div key={message.id} data-thread-message className="flex justify-end">
              <p
                className={cx(
                  "max-w-[min(34rem,85%)] whitespace-pre-wrap rounded-2xl",
                  /*
                    A tint instead of a rim. The bubble used to be page-white
                    with a hairline and `shadow-xs`, and neither did any work:
                    the fill was the same colour as what it sat on, and
                    `--shadow-xs` is only overridden for dark, so in light mode
                    the shadow fell back to Tailwind's 5% default. The border
                    was carrying the whole shape on its own.

                    One step of grey separates it in both themes without a
                    line — `secondary-default` is neutral-100 against a white
                    page, and neutral-900 against the neutral-925 dark page, so
                    it reads as slightly-raised in light and slightly-lifted in
                    dark rather than inverting.
                  */
                  "bg-background-secondary-default",
                  "px-4 py-3 text-headline-regular text-text-primary",
                )}
              >
                {proseOf(message)}
              </p>
            </div>
          );
        }

        const allCards = feedCards(message);
        // Snapshot before marking this turn's cards shown. The set is mutated
        // in this loop; if we passed it live, this turn would hide its own
        // cards because React renders after the loop body finished.
        const alreadyShownHere = new Set(alreadyShown);
        for (const card of allCards) alreadyShown.add(card.courseId);
        return (
          <div key={message.id} data-thread-message>
            <AssistantTurn
              message={message}
              alreadyShown={alreadyShownHere}
              isRunning={isLast && (status === "submitted" || status === "streaming")}
              showFollowUps={isLast && status === "ready"}
              onAsk={onAsk}
            />
          </div>
        );
      })}

      {showJump ? <JumpToLatest count={more} onJump={jumpToLatest} /> : null}
    </div>
  );
}

function AssistantTurn({
  message,
  alreadyShown,
  isRunning,
  showFollowUps,
  onAsk,
}: {
  message: UIMessage;
  alreadyShown: ReadonlySet<string>;
  isRunning: boolean;
  showFollowUps: boolean;
  onAsk: (text: string) => void;
}) {
  const activity = toolActivity(message);
  const blocks = turnBlocks(message, alreadyShown);
  const followUps = showFollowUps ? suggestedFollowUps(message) : [];
  const hasBody = blocks.length > 0;

  /*
   * Evidence for everything the cards do not already cover.
   *
   * A card IS the evidence for its own course — it carries the instructor, the
   * seat count with its provenance stamp, and the link to the registrar's own
   * page. Listing that course a second time in the thin source list underneath
   * would be the same fact twice. What the list is still for is the courses the
   * answer leaned on that never became cards: a `search_courses` result, a
   * `get_course` lookup, a course the prerequisite filter withheld.
   *
   * `feedCards(message)` not the filtered blocks: a reprinted set is hidden
   * above but must stay out of the source list too.
   */
  const carded = new Set(feedCards(message).map((card) => card.courseId));
  const courses = citedCourses(message).filter((course) => !carded.has(course.courseId));

  return (
    <div className="flex flex-col gap-3.5">
      {/*
        The face, while there is nothing else to show.

        A turn that has been submitted but has not streamed a token or opened a
        tool is dead air, and dead air is where a student decides the thing is
        broken. The ornament is already the app's mark, so putting it here in
        its thinking state costs no new vocabulary — and unlike a spinner, it
        stops the moment there is real output to read, because the prose and the
        activity card are better evidence of work than any indicator.
      */}
      {isRunning && !hasBody && activity.length === 0 ? (
        <ThinkingLine label="Thinking" />
      ) : null}

      {activity.length > 0 ? (
        <ToolActivityCard activity={activity} isRunning={isRunning} />
      ) : null}

      {blocks.map((block, index) => (
        <TurnBeat key={`${block.kind}-${index}`} block={block} />
      ))}

      {courses.length > 0 ? <SourceList courses={courses} /> : null}

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

function TurnBeat({ block }: { block: TurnBlock }) {
  if (block.kind === "text") {
    return <AssistantMarkdown source={block.text} />;
  }
  if (block.kind === "schedule") {
    return <ScheduleArtifactView artifact={block.artifact} />;
  }
  if (block.kind === "campus_map") {
    return <CampusMapArtifactView artifact={block.artifact} />;
  }
  if (block.kind === "instructor") {
    return <InstructorArtifactView artifact={block.artifact} />;
  }
  if (block.kind === "onboarding") {
    return <OnboardingArtifactView artifact={block.artifact} />;
  }
  /*
   * A grid, not a stack. The card is sized for the home page's rail —
   * about 22rem — and stretching one across the full width of a thread
   * leaves a seat meter a metre long above two buttons floating in space.
   */
  return (
    <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {block.cards.map((card) => (
        <li key={card.courseId} className="flex">
          <FeedCardView card={card} className="w-full" />
        </li>
      ))}
    </ul>
  );
}
