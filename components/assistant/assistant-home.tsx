"use client";

import { useCallback, useMemo, useState } from "react";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { RiChat1Line, RiErrorWarningLine, RiLockLine } from "@remixicon/react";

import { describeFailure, planSubmission, type Gate } from "@/lib/agent/gate";
import { Composer } from "@/components/assistant/composer";
import { Conversation } from "@/components/assistant/conversation";
import { SignInPrompt } from "@/components/home/sign-in-prompt";
import { cx } from "@/utils/cx";

/**
 * The assistant, which is the home page.
 *
 * ── The shape is BoardUI's, and the empty space is the point ───────────────
 *
 * The template's conversation column is mostly nothing: a breadcrumb at the
 * top, a wide blank field, and the box sitting on the bottom edge with the
 * thread growing upward out of it. Everything else on that screen — the
 * repository list, the diff pane — lives in the rails, so the middle stays a
 * single column of prose.
 *
 * Filling that space with cards was the mistake this rewrite undoes. A student
 * arriving at a box with four suggested questions and a feed under it has to
 * read the page before they can use it, which is the exact failure mode the
 * assistant exists to fix. So the field is empty and the box is where the eye
 * lands.
 *
 * Structurally: a column with a definite `min-h`, a `flex-1` message region
 * with `justify-end` so the thread stacks upward off the composer, and the
 * composer sticky at the bottom. No inner scroll container — the page scrolls
 * as one, and the box stays pinned once the thread outgrows the viewport.
 *
 * ── The signed-out rule is structural, not a response code ─────────────────
 *
 * The spec says a signed-out student causes **zero** LLM calls: the box accepts
 * what they type, submitting shows the sign-in wall, the model is never
 * invoked. `/api/agent` enforces that with a 401 before the agent is even
 * constructed — but a 401 is a call that was made and refused, and the rule is
 * about calls not being made.
 *
 * So this component knows, from the server, whether there is a session, and
 * when there is not `sendMessage` is never reached. The typing still works and
 * the question is still there when they come back; what they get instead of an
 * answer is the door. The route's 401 remains the real enforcement — this is
 * the part that makes it never fire in the first place.
 *
 * ── Why a fetch interceptor, and not `onError` ─────────────────────────────
 *
 * The transport turns any non-OK response into `new Error(await res.text())`,
 * so a 429 arrives at `onError` as a JSON string in an error message. Parsing
 * that back out would work and would break the first time the SDK reworded its
 * throw. The interceptor sits where the response still IS a response: it reads
 * the budget headers on the way past, lifts the structured body off the
 * failures, and lets the error propagate normally afterwards.
 *
 * That is also the only place the prompt counter can come from. The route
 * spends the budget server-side and reports it in `x-agent-prompts-used`; a
 * client-side increment would be a guess that drifts the moment the student has
 * two tabs open.
 */

export interface AssistantHomeProps {
  isSignedIn: boolean;
  /** `"Fall 2026"`. Printed in the box so the answer's term is never implied. */
  termLabel: string;
  promptsUsed: number;
  promptsLimit: number;
}

export function AssistantHome({
  isSignedIn,
  termLabel,
  promptsUsed: initialPromptsUsed,
  promptsLimit,
}: AssistantHomeProps) {
  const [input, setInput] = useState("");
  const [gate, setGate] = useState<Gate | null>(null);
  const [promptsUsed, setPromptsUsed] = useState(initialPromptsUsed);
  const [limit, setLimit] = useState(promptsLimit);

  /*
   * The thread id.
   *
   * The route mints one on the first message and returns it in a header; every
   * later message carries it back so the turns land in one conversation.
   *
   * State rather than a ref, despite nothing rendering it. A ref would be read
   * and written from inside the transport, which is constructed during render,
   * and the React Compiler will not memoize a render-phase closure that reaches
   * a ref — transitively, so hiding it behind a callback does not help. The
   * cost of state here is one re-render per conversation, on the turn that
   * creates it. That is cheaper than opting this component out of compilation.
   */
  const [conversationId, setConversationId] = useState<string | null>(null);

  /*
   * Everything the route reports back out-of-band.
   *
   * Its own callback rather than inline in the transport below: the transport
   * is constructed during render, and a closure built there that touches a ref
   * is exactly what the React Compiler refuses to memoize — correctly, since it
   * cannot see that the closure only ever runs from a fetch. Lifting it out
   * keeps the render phase free of ref access and leaves the rule intact.
   */
  const readResponse = useCallback(async (response: Response) => {
    const used = response.headers.get("x-agent-prompts-used");
    const reportedLimit = response.headers.get("x-agent-prompts-limit");
    const thread = response.headers.get("x-agent-conversation-id");
    if (used) setPromptsUsed(Number(used));
    if (reportedLimit) setLimit(Number(reportedLimit));
    if (thread) setConversationId(thread);

    if (response.ok) return;

    /*
     * Read a clone. The transport reads the body itself to build its error, and
     * a body can only be consumed once — draining it here would replace a
     * described failure with "body already read".
     */
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    setGate(describeFailure(response.status, body));
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        async fetch(input, init) {
          const response = await fetch(input as RequestInfo, init);
          await readResponse(response);
          return response;
        },
      }),
    [readResponse],
  );

  const { messages, sendMessage, status, stop, setMessages, error, clearError } = useChat({
    transport,
    onError() {
      /*
       * The interceptor has usually already described this precisely. Only fill
       * in when it has not — a transport-level failure (offline, aborted DNS)
       * never produced a response for it to read.
       */
      setGate((current) =>
        current ?? {
          kind: "failed",
          message: "The answer didn't come through. Check your connection and try again.",
        },
      );
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  const ask = useCallback(
    (text: string) => {
      /*
       * The decision is made in `lib/agent/gate.ts`, under test. Nothing that
       * touches the network happens outside the `send` branch, which is what
       * makes "a signed-out student causes zero LLM calls" a property of the
       * code rather than a promise about the server.
       */
      const plan = planSubmission({ text, isSignedIn, isBusy });

      if (plan.action === "ignore") return;

      if (plan.action === "gate") {
        setInput(plan.keepInBox);
        setGate(plan.gate);
        return;
      }

      setGate(null);
      clearError();
      setInput("");
      void sendMessage(
        { text: plan.text },
        conversationId ? { body: { conversationId } } : undefined,
      );
    },
    [clearError, conversationId, isBusy, isSignedIn, sendMessage],
  );

  const startNewThread = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setGate(null);
    clearError();
    setInput("");
  }, [clearError, setMessages]);

  const hasThread = messages.length > 0;

  return (
    /*
     * The column fills the viewport so the sticky composer lands on its bottom
     * edge rather than floating mid-screen on an empty thread. The two figures
     * are `<main>`'s own vertical padding at each breakpoint — 96px under `lg`,
     * where the mobile tab bar's reserve is included, and 56px at and above it.
     */
    <div className="flex min-h-[calc(100dvh-6rem)] w-full min-w-0 flex-col lg:min-h-[calc(100dvh-3.5rem)]">
      <Breadcrumb messages={messages} />

      <div className="flex flex-1 flex-col justify-end pt-8">
        {hasThread ? <Conversation messages={messages} status={status} onAsk={ask} /> : null}
      </div>

      {gate ? <GateNotice gate={gate} onDismiss={() => setGate(null)} /> : null}
      {error && !gate ? (
        <GateNotice
          gate={{ kind: "failed", message: error.message }}
          onDismiss={() => clearError()}
        />
      ) : null}

      {/*
        Sticky, clearing the mobile tab bar. `<main>` already reserves that
        bar's height as bottom padding, so at `lg` — where the bar is gone — the
        offset goes with it.
      */}
      <div
        className={cx(
          "sticky z-10 -mx-1 bg-background-full px-1 pb-1 pt-4",
          "bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-0",
        )}
      >
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => ask(input)}
          onStop={stop}
          onNewThread={startNewThread}
          status={status}
          canStartNewThread={hasThread || input.length > 0}
          promptsUsed={promptsUsed}
          promptsLimit={limit}
          termLabel={termLabel}
        />
      </div>
    </div>
  );
}

/**
 * `Assistant › <this thread>` — the template's header line.
 *
 * It names the thread after the question that started it, which is the only
 * name a conversation can honestly have before it has an answer in it.
 */
function Breadcrumb({ messages }: { messages: readonly { role: string; parts: unknown[] }[] }) {
  const first = messages.find((message) => message.role === "user");
  const title = first
    ? firstLine(
        (first.parts as { type?: string; text?: string }[])
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join(" "),
      )
    : "New question";

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 px-1">
      <RiChat1Line aria-hidden className="size-4 shrink-0 text-foreground-icon-quaternary" />
      <span className="shrink-0 text-body-medium text-text-secondary">Assistant</span>
      <span aria-hidden className="shrink-0 text-foreground-icon-quaternary">
        ›
      </span>
      <span className="min-w-0 flex-1 truncate text-body-medium text-text-secondary">{title}</span>
    </nav>
  );
}

function firstLine(text: string): string {
  const trimmed = text.trim().split("\n")[0] ?? "";
  return trimmed.length > 64 ? `${trimmed.slice(0, 63)}…` : trimmed || "New question";
}

/**
 * The four ways a question does not get answered, each said plainly.
 *
 * A single "something went wrong" would collapse a sign-in wall, an exhausted
 * budget, an unconfigured deployment, and a dropped connection into one
 * message, and only one of those is something the student can act on. They are
 * kept apart because the action differs every time.
 */
function GateNotice({ gate, onDismiss }: { gate: Gate; onDismiss: () => void }) {
  const isWall = gate.kind === "signed-out";

  return (
    <div
      role="status"
      className={cx(
        "mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3",
        isWall
          ? "border-border-table bg-background-primary-default shadow-xs"
          : "border-border-error-default bg-background-tertiary-error",
      )}
    >
      {isWall ? (
        <RiLockLine aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground-icon-tertiary" />
      ) : (
        <RiErrorWarningLine
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-foreground-icon-error"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-caption-1-regular text-text-secondary">
          {gate.kind === "signed-out"
            ? "Sign in to ask. Your question is still in the box — it hasn't been sent anywhere."
            : gate.message}
        </p>

        {gate.kind === "config" && gate.detail ? (
          <p className="text-caption-2-regular text-text-tertiary">{gate.detail}</p>
        ) : null}

        {gate.kind === "budget" && gate.resetsAt ? (
          <p className="text-caption-2-regular text-text-tertiary">
            More questions at {formatTime(gate.resetsAt)}.
          </p>
        ) : null}

        {isWall ? <SignInPrompt label="Sign in to ask" /> : null}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className={cx(
          "shrink-0 rounded-md px-1 text-caption-2-medium text-text-tertiary",
          "transition-colors hover:text-text-secondary",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        Dismiss
      </button>
    </div>
  );
}

/**
 * A wall-clock time, in the reader's own zone.
 *
 * The route sends an ISO instant; "more questions at 4:20 PM" is actionable and
 * "more questions at 2026-08-24T20:20:11.000Z" is not. An unparseable value
 * drops the line rather than printing `Invalid Date`.
 */
function formatTime(isoTimestamp: string): string {
  const when = new Date(isoTimestamp);
  if (Number.isNaN(when.getTime())) return "later today";
  return when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
