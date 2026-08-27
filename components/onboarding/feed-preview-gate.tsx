"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";

import { FeedCardView } from "@/components/feed/feed-card";
import type { FeedCard } from "@/lib/recommend/feed";
import { cx } from "@/utils/cx";

import { FeedFinishControl } from "./feed-finish-control";
import { FeedSignInPanel } from "./feed-sign-in-panel";
import { FeedPreviewCardSkeleton } from "./feed-teaser-cards";
import type { FeedPreview } from "./use-feed-preview";

type MigrationState = {
  status: "idle" | "running" | "done" | "failed";
  message?: string;
};

export interface FeedPreviewGateProps {
  /**
   * The cards and how they got here. Loaded by `useFeedPreview` up in
   * `OnboardingFlow`, because the headline above this component has to be able
   * to say whether they have arrived — see that hook for why.
   */
  preview: FeedPreview;
  signedIn: boolean;
  migration: MigrationState;
  onSignIn: () => void | Promise<void>;
  onFinish: (cards: FeedCard[]) => void;
  signInDisabled?: boolean;
  signInError?: string | null;
}

/**
 * Last onboarding beat — real section cards behind a sign-in gate.
 *
 * The cards are the same `FeedCard` the home feed and the agent render. They
 * are cached in `localStorage`, so a round-trip through Google paints these
 * ten again instead of ranking a new set. Sign-in does not generate; it
 * unlocks. There is no guest bypass: unsigned visitors stay on this screen
 * until they have an account, which is what makes onboarding the default
 * rather than an optional tour.
 *
 * ── Layout ────────────────────────────────────────────────────────────────
 *
 * First card, then the Columbia panel, then the rest of the feed. Guests can
 * scroll the blurred stack; they cannot open a card. A `max-h` peek used to
 * keep those extra rows in the tree and clip them, which on a phone looked
 * like a one-card feed with a wall under the sign-in box.
 *
 * The panel stays in document flow, not `absolute top-44`. A fixed top on a
 * locked viewport assumed one card plus the panel always fit under the
 * ornament, and on a phone they do not.
 */
export function FeedPreviewGate({
  preview,
  signedIn,
  migration,
  onSignIn,
  onFinish,
  signInDisabled,
  signInError,
}: FeedPreviewGateProps) {
  const previewError = preview.error;
  const gated = !signedIn;

  /*
   * ── Which arrivals get the reveal ────────────────────────────────────────
   *
   * Only the ones the student watched happen, which `useFeedPreview` is what
   * decides. The path back from Google returns to warm `localStorage` and
   * repaints the same ten cards in the same frame as the screen itself, which
   * `OnboardingScreen` is already fading and sliding in — animating those
   * would be two entrances stacked on one mount, and the second would start
   * after the first had finished.
   */
  const revealOnArrival = preview.watched;
  const shouldReduceMotion = useReducedMotion();

  const displayCards = preview.cards;

  /*
   * Placeholders are now the empty case only.
   *
   * While the ranking is in flight this component is not on screen at all —
   * `OnboardingFlow` shows the working screen instead — so the skeletons are
   * left for the one case that survives: a student the recommender had nothing
   * to say about. A gate with no cards in it has no shape, and the sign-in
   * panel would float on an empty ground.
   */
  const cardItems =
    displayCards.length === 0
      ? Array.from({ length: 4 }, (_, index) => ({
          // Four placeholders fill the first screen and peek the next card.
          key: `skeleton-${index}`,
          node: <FeedPreviewCardSkeleton />,
        }))
      : displayCards.map((card) => ({
          key: card.courseId,
          node: <FeedCardView card={card} className="w-full" />,
        }));

  const [firstCard, ...restCards] = cardItems;

  return (
    /*
     * `min-w-0` is load-bearing on a phone. Without it, a feed card's
     * intrinsic min-content (week strip + nowrap seat chip + icons) can blow
     * this column wider than the viewport. The gate then stretches to that
     * width and the right edge of the sign-in card shears off.
     */
    <div className="relative w-full min-w-0 max-w-full pt-2">
      {firstCard ? (
        <PreviewCardSlot
          item={firstCard}
          index={0}
          gated={gated}
          reveal={revealOnArrival}
          flat={shouldReduceMotion ?? false}
        />
      ) : null}

      {gated ? (
        <div className="relative z-10 -mt-6 flex min-w-0 shrink-0 flex-col items-center gap-4 px-0 sm:-mt-8 sm:px-1">
          {/*
            In the document flow, not `absolute top-44`. The panel keeps its
            natural height so the Columbia button cannot be clipped. Negative
            margin tucks it into the first card so that card dissolves into
            the gate; cards below stay in flow and scroll with the page.
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 bg-linear-to-b from-transparent from-0% via-background-secondary-default/20 via-45% to-background-secondary-default/80 to-100%"
          />

          <FeedGateOverlay
            feedError={previewError}
            onSignIn={onSignIn}
            signInDisabled={signInDisabled}
            signInError={signInError}
          />
        </div>
      ) : null}

      {restCards.length > 0 ? (
        <div
          className={cx(
            "mt-3.5 flex min-w-0 flex-col gap-3.5 transition-[filter,opacity] duration-300 ease-out",
            gated && "pointer-events-none select-none",
          )}
          aria-hidden={gated}
        >
          {restCards.map((item, index) => (
            <PreviewCardSlot
              key={item.key}
              item={item}
              index={index + 1}
              gated={gated}
              reveal={revealOnArrival}
              flat={shouldReduceMotion ?? false}
            />
          ))}
        </div>
      ) : null}

      {gated ? null : (
        <div className="mt-8 flex flex-col items-center gap-3">
          {migration.status === "running" ? (
            <p className="text-center text-caption-1-regular text-text-secondary">
              Saving your answers…
            </p>
          ) : null}
          {migration.status === "failed" ? (
            <p className="text-center text-caption-1-regular text-text-error-primary">
              {migration.message ?? "We could not save yet. Nothing you entered is lost."}
            </p>
          ) : null}
          {migration.status === "done" && migration.message ? (
            <p className="text-center text-caption-1-regular text-text-secondary">
              {migration.message}
            </p>
          ) : null}
          {previewError ? (
            <p className="text-center text-caption-1-regular text-text-error-primary">{previewError}</p>
          ) : null}
          <FeedFinishControl
            onFinish={() => onFinish(displayCards)}
            failed={migration.status === "failed"}
          />
        </div>
      )}
    </div>
  );
}

/**
 * How long one card takes to arrive, and how far apart they arrive.
 *
 * 260ms is at the slow end of the UI range because these are the largest
 * elements on the screen and a big surface crossing a short distance reads as
 * abrupt at 150. 45ms of stagger is enough to see the cards resolve one after
 * another rather than as one block, and short enough that it never becomes a
 * queue the student is waiting in.
 *
 * The stagger stops counting at the fifth card. Past that the cards are below
 * the fold, and an uncapped ramp would have card ten still sliding 400ms after
 * a student who flicked down had already arrived at it — motion happening in
 * the corner of an eye that has moved on. Everything from index four down
 * arrives together.
 */
const REVEAL_DURATION_MS = 260;
const REVEAL_STAGGER_MS = 45;
const REVEAL_STAGGER_CAP = 4;
const REVEAL_RISE_PX = 8;

/**
 * The same curve as `STEP_TRANSITION` in `screen.tsx`, and for the same
 * reason: it is the `--ease-out` token from `styles/theme.css`, written out
 * because neither a WAAPI options object nor a `motion` JS config can read a
 * CSS custom property. Retune the token and both literals need updating.
 */
const REVEAL_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/** Progressive blur on the first few cards; a cheaper wash on the rest. */
function PreviewCardSlot({
  item,
  index,
  gated,
  reveal,
  flat,
}: {
  item: { key: string; node: ReactNode };
  index: number;
  gated: boolean;
  /** This card replaced a skeleton the student was watching. */
  reveal: boolean;
  /** `prefers-reduced-motion` — fade, but do not travel. */
  flat: boolean;
}) {
  /*
   * ── Why the cards arrive one at a time ─────────────────────────────────
   *
   * Four pulsing placeholders are replaced by ten real cards of unrelated
   * heights, in one frame. Everything below the swap jumps, and the moment
   * the whole flow has been building to — this is the first time the student
   * sees anything the app actually ranked for them — lands as a flicker.
   *
   * A stagger is the fix for both halves. It bridges the swap so the change
   * is watched rather than blinked past, and it spends the delight budget
   * where onboarding is allowed to: on something seen exactly once.
   *
   * `transform` and `opacity` only, so this stays off the layout and paint
   * path — the cards are arriving at the precise moment React has just
   * committed ten of them and the browser is resolving their links.
   *
   * ── Why WAAPI and not `motion`, which this folder otherwise uses ────────
   *
   * Because `motion` cannot do it here. `OnboardingScreen` wraps every step
   * in `<AnimatePresence mode="wait" initial={false}>` so the first question
   * does not animate in on page load. That `initial={false}` is published on
   * `PresenceContext`, and every `motion` component that mounts anywhere
   * beneath it reads that context and skips its own `initial` — including one
   * mounting seconds later, for reasons that have nothing to do with the step
   * transition. Built with `motion.div` this animation silently did not run:
   * the cards were written straight to their end state, no error, nothing in
   * the console. It was measurable only by recording computed opacity per
   * frame and finding it never left 1.
   *
   * `element.animate()` has no such context to inherit. It is also the right
   * primitive on the merits — off the main thread like a CSS animation, but
   * with the per-card delay computed in JS, which is the one thing a static
   * stylesheet cannot express. And `styles/**` is frozen, so a `@keyframes`
   * was never available anyway.
   */
  const revealRef = useRef<HTMLDivElement>(null);
  const delay = Math.min(index, REVEAL_STAGGER_CAP) * REVEAL_STAGGER_MS;

  useEffect(() => {
    if (!reveal) return;
    const node = revealRef.current;
    if (!node?.animate) return;

    const animation = node.animate(
      [
        { opacity: 0, transform: `translateY(${flat ? 0 : REVEAL_RISE_PX}px)` },
        { opacity: 1, transform: "translateY(0px)" },
      ],
      {
        duration: REVEAL_DURATION_MS,
        easing: REVEAL_EASE,
        delay,
        // `backwards` is what makes the stagger a stagger. Without it a card
        // waiting out its delay sits at its natural opacity, so all ten paint
        // at once and then take turns fading in from already-visible.
        fill: "backwards",
      },
    );
    return () => animation.cancel();
  }, [reveal, flat, delay]);

  return (
    <div
      ref={revealRef}
      className={cx(
        // No `transition-opacity` here. It was vestigial — nothing on this
        // element ever changed opacity by class — and a CSS transition on a
        // property `motion` is writing frame by frame makes every frame chase
        // the last one, which shows up as a card that lags its own entrance.
        "relative min-w-0",
        // Contain the card's own stacking (instructor links are
        // `relative z-[1]` so they beat a stretched-link overlay).
        // Without isolation those names paint above this blur.
        gated && "isolate pointer-events-none select-none",
      )}
      aria-hidden={gated}
    >
      {item.node}
      {gated && index < 4 ? <ProgressiveCardBlur index={index} total={4} /> : null}
      {gated && index >= 4 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[2] rounded-2xl bg-background-secondary-default/35 backdrop-blur-sm"
        />
      ) : null}
    </div>
  );
}

/** Max blur at the bottom of the last card — card 0 ends at half of this. */
const MAX_BLUR_PX = 6;
const BLUR_STEPS = 16;

/**
 * Per-card blur band. Card 0 ramps 0 → 50%; cards below split the remaining 50%.
 */
function blurBand(index: number, total: number): { startPx: number; endPx: number } {
  if (index === 0) {
    return { startPx: 0, endPx: MAX_BLUR_PX * 0.5 };
  }

  const tail = MAX_BLUR_PX * 0.5;
  const slots = Math.max(1, total - 1);
  const step = tail / slots;

  return {
    startPx: MAX_BLUR_PX * 0.5 + step * (index - 1),
    endPx: Math.min(MAX_BLUR_PX, MAX_BLUR_PX * 0.5 + step * index),
  };
}

/**
 * True progressive blur: stacked backdrop layers, each masked to a thin horizontal
 * slice. Spans the full card height so there is no hard top edge.
 *
 * `z-[2]` is the whole reason instructor names were sharp. `InstructorLink`
 * is `relative z-[1]` so a stretched-link row cannot cover it; `backdrop-filter`
 * only blurs what is *behind* this overlay, so a name at z-1 sat in front of
 * a z-auto layer and never got filtered. This paints above that link and
 * still below the sign-in card (`z-10` on the gate).
 */
function ProgressiveCardBlur({ index, total }: { index: number; total: number }) {
  const { startPx, endPx } = blurBand(index, total);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[2] overflow-hidden rounded-2xl"
    >
      {Array.from({ length: BLUR_STEPS }, (_, step) => {
        const sliceStart = step / BLUR_STEPS;
        const sliceEnd = (step + 1) / BLUR_STEPS;
        const blurPx = startPx + (endPx - startPx) * ((sliceStart + sliceEnd) / 2);
        if (blurPx < 0.08) return null;

        const mask = `linear-gradient(to bottom, transparent ${sliceStart * 100}%, black ${sliceEnd * 100}%)`;

        return (
          <div
            key={step}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${blurPx.toFixed(2)}px)`,
              WebkitBackdropFilter: `blur(${blurPx.toFixed(2)}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}

      <div
        className={cx(
          "absolute inset-0 bg-linear-to-b from-transparent",
          index === 0 && "via-transparent via-40% to-background-secondary-default/28",
          index === 1 && "via-background-secondary-default/5 via-35% to-background-secondary-default/40",
          index === 2 && "via-background-secondary-default/8 via-32% to-background-secondary-default/50",
          index >= 3 && "via-background-secondary-default/12 via-30% to-background-secondary-default/58",
        )}
      />
    </div>
  );
}

function FeedGateOverlay({
  feedError,
  onSignIn,
  signInDisabled,
  signInError,
}: {
  feedError: string | null;
  onSignIn: () => void | Promise<void>;
  signInDisabled?: boolean;
  signInError?: string | null;
}) {
  return (
    /*
     * As wide as the cards it sits between, and `max-w-md` is why it was not.
     *
     * The panel is in document flow (see the note above `-mt-6`), so it pushes
     * the rest of the feed down by its own height — about 220px. Capped at
     * 448px inside a 720px column, it only covered the middle of the band it
     * created, and the 136px of empty background down each flank read as a
     * hole punched between two cards.
     *
     * A phone never showed it: below 448px the cap is not reached and the
     * panel already spanned the column. The bug lived entirely at the widths
     * `max-w-[760px]` on the feed step was added for.
     *
     * The panel's own internals scale — the text column is held off the
     * ornament with `pr-[38%]` rather than a fixed inset — so matching the
     * cards costs nothing and makes the gate read as one more full-width card
     * in the stack, which is what it is.
     */
    <div className="relative flex w-full min-w-0 flex-col items-center gap-4">
      <FeedSignInPanel
        onSignIn={() => void onSignIn()}
        disabled={signInDisabled}
        error={signInError ?? feedError}
      />
      {signInDisabled ? (
        <p className="text-center text-caption-1-regular text-pretty text-text-tertiary">
          Accounts are not configured on this deployment.
        </p>
      ) : null}
    </div>
  );
}
