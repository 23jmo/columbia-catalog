"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import {
  RiChat1Line,
  RiErrorWarningLine,
  RiLockLine,
  RiQuillPenLine,
} from "@remixicon/react";

import { describeFailure, planSubmission, type Gate } from "@/lib/agent/gate";
import {
  announceHistoryChanged,
  fetchConversation,
  CHAT_PATH,
  threadHref,
} from "@/lib/agent/history";
import { Composer } from "@/components/assistant/composer";
import { Conversation } from "@/components/assistant/conversation";
import { SignInFlair } from "@/components/assistant/sign-in-flair";
import { OrnamentAvatar } from "@/components/ornament/ornament-avatar";
import { ChatHistoryModal } from "@/components/shell/chat-history-modal";
import { MobileHeaderPortal } from "@/components/shell/mobile-header-slot";
import { ProgressiveBlur } from "@/components/shell/progressive-blur";
import { SignInPrompt } from "@/components/home/sign-in-prompt";
import { seedOnboardingMessages, takeOnboardingHandoff } from "@/lib/onboarding/handoff";
import { haptic } from "@/lib/haptics";
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
  /**
   * The student's first name, or `null` when we do not honestly have one.
   *
   * `toSessionAccount` falls back through `full_name` → `name` → the local part
   * of the email → the literal `"Signed in"`, and only the first two of those
   * are a name. The page decides which it has; this component only decides
   * whether to greet, because "Welcome back, 2023johnathanmo" is worse than no
   * greeting at all.
   */
  greetingName?: string | null;
  /**
   * Thread to reopen, from `/chat?c=`. Null on a fresh visit. Changing this
   * (sidebar click) loads that thread; minting a new id writes the same param
   * back so the rail can highlight it.
   */
  initialConversationId?: string | null;
}

export function AssistantHome({
  isSignedIn,
  termLabel,
  promptsUsed: initialPromptsUsed,
  promptsLimit,
  greetingName,
  initialConversationId = null,
}: AssistantHomeProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [gate, setGate] = useState<Gate | null>(null);
  const [promptsUsed, setPromptsUsed] = useState(initialPromptsUsed);
  const [limit, setLimit] = useState(promptsLimit);
  const [findOpen, setFindOpen] = useState(false);

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
   * Ids we already have in memory. After the route mints a thread we write
   * `/?c=` so the rail can highlight it — that prop change must not refetch
   * the same thread mid-stream, or the in-flight answer gets replaced by
   * whatever has been persisted so far (usually just the question).
   */
  const skipFetchId = useRef<string | null>(null);

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
    if (thread) {
      skipFetchId.current = thread;
      setConversationId(thread);
      router.replace(threadHref(thread), { scroll: false });
    }
    if (response.ok) {
      announceHistoryChanged();
      return;
    }

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
  }, [router]);

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

  /*
   * Onboarding lands here with the cards already chosen. Seed the thread
   * once, from sessionStorage, without calling the model — restating those
   * four sections would spend a prompt on work we just did.
   */
  useEffect(() => {
    // A reopened thread wins over the onboarding handoff. Seeding on top
    // would replace a saved conversation with the four cards from last week.
    if (initialConversationId) return;
    const cards = takeOnboardingHandoff();
    if (!cards?.length) return;
    setMessages(seedOnboardingMessages(cards));
  }, [initialConversationId, setMessages]);

  useEffect(() => {
    if (!isSignedIn || !initialConversationId) return;
    if (initialConversationId === skipFetchId.current) return;

    let cancelled = false;
    void fetchConversation(initialConversationId).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        skipFetchId.current = null;
        router.replace(CHAT_PATH, { scroll: false });
        return;
      }
      skipFetchId.current = loaded.conversationId;
      setConversationId(loaded.conversationId);
      setMessages(loaded.messages);
    });
    return () => {
      cancelled = true;
    };
  }, [initialConversationId, isSignedIn, router, setMessages]);

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
    skipFetchId.current = null;
    setConversationId(null);
    setMessages([]);
    setGate(null);
    clearError();
    setInput("");
    router.replace(CHAT_PATH, { scroll: false });
  }, [clearError, router, setMessages]);

  const hasThread = messages.length > 0;

  /*
   * Clicking Chat while already reading a thread starts a new one.
   *
   * `/chat` is already the current route, so the nav item and the hamburger
   * Chat row are soft navigations onto the page they are already on. React
   * reconciles the same tree, this component never unmounts, and the thread
   * would sit there unchanged while the student's click did visibly nothing.
   * That is the worst kind of dead control: it looks like the app ignored them.
   *
   * This used to watch for `/` for the same reason, back when the assistant
   * WAS the home page. It follows the box: Home is now a different route, so
   * clicking it is a real navigation that unmounts this component and no
   * listener is needed to clear anything.
   *
   * A delegated listener rather than a signal threaded through the shell. The
   * alternative is making `ShellNav`, `CatalogSidebar` and `MobileShell` — all
   * three of which render the Chat link, and two of which are server components
   * today — aware that one page has state worth clearing. That is a lot of
   * shared surface bent around one screen. This asks a narrower and more honest
   * question instead: did the student just click something that means "take me
   * back to an empty box"? Anything that answers yes gets one, including links
   * this component has never heard of.
   */
  useEffect(() => {
    if (!hasThread) return;

    function onDocumentClick(event: MouseEvent) {
      // Modified clicks open a new tab; the thread here should survive that.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank") return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      const destination = new URL(href, window.location.href);
      const isBareChat =
        destination.origin === window.location.origin &&
        destination.pathname === CHAT_PATH &&
        destination.search === "";
      if (isBareChat) startNewThread();
    }

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [hasThread, startNewThread]);

  return (
    /*
     * The column fills the viewport so the sticky composer lands on its bottom
     * edge rather than floating mid-screen on an empty thread. The subtracted
     * height is the slim hamburger bar (3.5rem) plus `<main>`'s `py-5` (2.5rem)
     * below `lg`, and `py-7` (3.5rem) at desktop where the bar is gone.
     */
    <div className="flex min-h-[calc(100dvh-6rem-env(safe-area-inset-top,0px))] w-full min-w-0 flex-col xl:min-h-[calc(100dvh-3.5rem)]">
      {/*
        One header, two homes, exactly one of them visible at any width.

        On a phone it goes into the shell's top bar, beside the hamburger,
        because that bar is already the place a reader looks to find out where
        they are — and while a thread is open the answer is the thread, not
        "Home". Above `xl` that bar is display:none and the desktop rail takes
        over, so the header renders inline instead and sticks to the top of the
        scroller on its own.
      */}
      {hasThread ? (
        <>
          <MobileHeaderPortal>
            <ThreadHeader variant="bar" messages={messages} onNewThread={startNewThread} />
          </MobileHeaderPortal>

          <div
            className={cx(
              "sticky top-0 z-20 -mx-1 hidden px-1 pt-1 pb-3 xl:block",
            )}
          >
            <span
              aria-hidden
              className="absolute inset-0 -z-10 bg-linear-to-b from-background-full via-background-full/75 to-transparent"
            />
            <ProgressiveBlur side="top" className="-z-10" />
            <ThreadHeader variant="inline" messages={messages} onNewThread={startNewThread} />
          </div>
        </>
      ) : null}

      {/*
        Two states, one column, and now one rule: content hangs off the bottom.

        With a thread that has always been true — `justify-end` puts the newest
        turn against the composer so the conversation grows upward out of it.

        Without one it used to be the opposite: the greeting started at the top
        and the empty space fell below it. That was right while the feed rail
        sat under the greeting and filled the column. The feed is its own page
        now, and pinning a two-line greeting to the top of an otherwise empty
        `flex-1` left most of a phone screen blank between it and the box —
        roughly 500px of nothing on a 390×844 viewport.

        So the greeting hangs off the bottom too, landing directly above the
        composer. Same rule in both states, and the thing the student is meant
        to act on is next to the thing they act with.
      */}
      <div className={cx("flex flex-1 flex-col justify-end", hasThread ? "pt-8" : "pt-6 sm:pt-10")}>
        {hasThread ? (
          <Conversation messages={messages} status={status} onAsk={ask} />
        ) : (
          <Hero name={greetingName ?? null} />
        )}
      </div>

      {gate ? <GateNotice gate={gate} onDismiss={() => setGate(null)} /> : null}
      {error && !gate ? (
        <GateNotice
          gate={{ kind: "failed", message: error.message }}
          onDismiss={() => clearError()}
        />
      ) : null}

      {/*
        Sticky to the viewport bottom. The hamburger bar is at the top now, so
        this no longer has to clear a tab bar.

        ── Why there is no fill here any more ──────────────────────────────
        It used to be an opaque slab the width of the column, which gave the
        composer a hard horizontal cut to sit on: the last card in the thread
        did not fade under the box, it was guillotined by it. The box already
        carries its own rim, fill and shadow, so it reads as a floating object
        without help — what it needed was for the thing behind it to stop being
        a rectangle.

        A ramped blur does that. Content softens as it approaches the box and is
        untouched a couple of centimetres up, so there is no edge to notice. The
        tint rides on top of it at low opacity purely for legibility of the
        controls; it is a wash, not a background.
      */}
      <div
        data-assistant-dock
        className={cx(
          "sticky bottom-0 z-10 -mx-1 px-1 pt-6",
          "pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]",
        )}
      >
        <span
          aria-hidden
          className="absolute inset-0 -z-10 bg-linear-to-t from-background-full via-background-full/70 to-transparent"
        />
        <ProgressiveBlur side="bottom" className="-z-10" />

        {/*
          The sign-in bar sits inside the sticky wrapper, above the box, so it
          is the same width as the box and travels with it. It is a label for
          the control underneath rather than a banner on the page.
        */}
        {isSignedIn ? null : <SignInFlair className="mb-2" />}

        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => ask(input)}
          onStop={stop}
          onNewThread={startNewThread}
          onOpenHistory={isSignedIn ? () => setFindOpen(true) : undefined}
          status={status}
          canStartNewThread={hasThread || input.length > 0}
          promptsUsed={promptsUsed}
          promptsLimit={limit}
          termLabel={termLabel}
        />
      </div>

      <ChatHistoryModal isOpen={findOpen} onClose={() => setFindOpen(false)} />
    </div>
  );
}

/**
 * The opening: a greeting, then the question the box answers.
 *
 * ── Two lines, and the second one is the point ─────────────────────────────
 *
 * The shape is Gemini's, at the owner's request, and the reason it works is
 * that the two lines do different jobs. The first is address — it proves the
 * page knows who is here, which is the fastest available evidence that the feed
 * underneath was computed for this account and not just the catalog's greatest
 * hits. The second is instruction, written as the question the student is
 * already asking, so the empty field below reads as an invitation rather than
 * as a search box they have to think of a query for.
 *
 * Both at the same size, the second in grey and one weight lighter. Matching
 * the sizes is what makes them one sentence in two parts — shrinking the second
 * would turn it into a subtitle, and subtitles get skipped. Grey and 500 carry
 * the hierarchy instead, which is enough: at 40px, semibold grey was the
 * heaviest thing on the page and it competed with the line above it.
 *
 * ── The leading is overridden, and it had to be ────────────────────────────
 *
 * `styles/typography.css` gives the whole display ramp paragraph leading —
 * display-3 is 2.5rem of type on 3.375rem of line, a ratio of 1.35. That is
 * right for a display line sitting alone in a layout and wrong for two stacked
 * lines meant to read as one block: 54px of leading under 40px letters that are
 * themselves tracked in by 0.8px reads as slack, and it is what made this look
 * off next to the settings modal, which is set in the body ramp at normal
 * ratios.
 *
 * 1.1 is the display figure. It is set here rather than fixed in the theme
 * because `styles/**` is shared and frozen (AGENTS.md rule 1) — and because the
 * ramp is not wrong, it is tuned for one line at a time, which is how the rest
 * of the app uses it.
 *
 * ── The gradient is on the line that is about a person ─────────────────────
 *
 * Only the greeting is tinted, and it stops at the accent ramp plus one warm
 * end, so it re-tints with the theme instead of being a fixed brand smear. The
 * grey line stays flat — a page where everything is gradient has emphasised
 * nothing.
 *
 * ── Signed out still gets a hero ───────────────────────────────────────────
 *
 * `toSessionAccount` falls back through `full_name` → `name` → the local part
 * of the email → the literal `"Signed in"`, and only the first two of those are
 * a name; `/` passes `null` for the rest, because "Welcome back,
 * 2023johnathanmo" is worse than no greeting. But no name is not a reason to
 * open on nothing. A visitor gets the thesis in the greeting's place — the
 * sentence the whole product exists to answer — and the same instruction under
 * it, so the page has a subject either way.
 */
/** Display leading. See the note above — the type ramp ships 1.35. */
const HERO_LEADING = "leading-[1.1]";

function Hero({ name }: { name: string | null }) {
  return (
    <header className="flex flex-col px-1">
      {/*
        The medallion from onboarding, with its face on — the same component
        the onboarding screens open with, not a second mark drawn to match, so
        it can only ever drift in one place.

        Resting, not tracking. On the home page the student is reading the
        feed, and a face whose eyes follow the pointer across a row of cards
        pulls attention off the cards. It blinks and swivels on its own, which
        is enough to read as awake.
      */}
      <OrnamentAvatar size={56} mood="resting" />

      <h1
        className={cx(
          // `w-fit` is load-bearing: `bg-clip-text` clips a gradient painted
          // across the ELEMENT's box, and a block-level h1 is as wide as the
          // column. At full width the words covered only the first 40% of the
          // ramp and the whole line rendered as one flat blue.
          "mt-3 w-fit text-balance bg-linear-to-r bg-clip-text text-transparent",
          "from-accent-700 via-accent-500 to-rose-500",
          "dark:from-accent-400 dark:via-accent-300 dark:to-rose-300",
          "text-display-4-semibold -tracking-[0.02em] sm:text-display-3-semibold",
          HERO_LEADING,
        )}
      >
        {name ? `Welcome back, ${name}` : "What should you take?"}
      </h1>

      {/*
        `aria-hidden` is wrong here and `<p>` is right: this is read after the
        heading and it is the sentence that tells a screen reader user what the
        field further down is for.
      */}
      <p
        className={cx(
          "text-balance text-text-tertiary",
          "text-display-4-medium -tracking-[0.02em] sm:text-display-3-medium",
          HERO_LEADING,
        )}
      >
        {name ? "What should you take next semester?" : "Ask below, or start from what is on offer."}
      </p>
    </header>
  );
}

/**
 * `Assistant › <this thread>` — the template's header line, plus the way back.
 *
 * It names the thread after the question that started it, which is the only
 * name a conversation can honestly have before it has an answer in it.
 *
 * ── Why the exit is here as well as in the composer ────────────────────────
 *
 * The composer's `+` already clears the thread, and on a desktop screen so does
 * the sidebar's Home. Neither reads as an exit on a phone: the `+` is an
 * unlabelled icon that sits where "attach a file" lives in every other chat
 * surface, and the sidebar is behind a hamburger. So the way out is also
 * stated in words, at the top, next to the name of the thing it closes — the
 * one place a reader is already looking to find out where they are.
 */
function ThreadHeader({
  variant,
  messages,
  onNewThread,
}: {
  /**
   * `bar` is portalled into the phone shell's top bar and has to live beside
   * the hamburger in 3.5rem; `inline` is the desktop row that sticks to the top
   * of its own scroller. Same content, different budget.
   */
  variant: "bar" | "inline";
  messages: readonly { role: string; parts: unknown[] }[];
  onNewThread: () => void;
}) {
  const first = messages.find((message) => message.role === "user");
  const title = first
    ? firstLine(
        (first.parts as { type?: string; text?: string }[])
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join(" "),
      )
    : "New question";

  const isBar = variant === "bar";

  /*
   * "Assistant ›" is the trail, and a trail of one is not worth a phone's
   * width — the title is the part that answers "where am I". So the prefix is
   * dropped below `sm` in the bar and always present inline. The title also
   * carries more weight in the bar, because there it is replacing the page
   * name rather than sitting under one.
   */
  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5">
      <RiChat1Line aria-hidden className="size-4 shrink-0 text-foreground-icon-quaternary" />
      <span
        className={cx(
          "shrink-0 text-body-medium text-text-secondary",
          isBar && "max-sm:hidden",
        )}
      >
        Assistant
      </span>
      <span
        aria-hidden
        className={cx("shrink-0 text-foreground-icon-quaternary", isBar && "max-sm:hidden")}
      >
        ›
      </span>
      <span
        className={cx(
          "min-w-0 flex-1 truncate",
          isBar
            ? "text-body-semibold text-text-primary"
            : "text-body-medium text-text-secondary",
        )}
      >
        {title}
      </span>
    </nav>
  );

  if (isBar) {
    return (
      <>
        {breadcrumb}
        {/*
          Deliberately the hamburger's exact costume — same size, rim, fill and
          press. They are the only two controls in the bar and they bracket the
          title, so anything less than identical reads as a mistake rather than
          a pair.
        */}
        <button
          type="button"
          onClick={() => {
            haptic("selection");
            onNewThread();
          }}
          aria-label="Start a new question"
          title="Start a new question"
          className={cx(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            "border border-border-button-default bg-background-primary-default shadow-xs",
            "text-foreground-icon-secondary",
            "transition-[color,background-color,border-color,box-shadow,transform,scale] duration-150 ease-out",
            "hover:bg-background-primary-hover hover:border-border-button-hover",
            "active:scale-[0.97] active:duration-[160ms]",
            "motion-reduce:transition-none motion-reduce:active:scale-100",
            "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          )}
        >
          <RiQuillPenLine className="size-5" aria-hidden />
        </button>
      </>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3 px-1">
      {breadcrumb}

      <button
        type="button"
        onClick={onNewThread}
        className={cx(
          "flex shrink-0 items-center gap-1.5 rounded-full",
          "border border-border-table bg-background-primary-default px-2.5 py-1",
          "text-caption-1-medium text-text-secondary",
          "transition-colors hover:bg-background-primary-hover hover:text-text-primary",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        <RiQuillPenLine aria-hidden className="size-3.5 shrink-0" />
        New chat
      </button>
    </div>
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
