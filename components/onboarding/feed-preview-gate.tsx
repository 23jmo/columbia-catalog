"use client";

import { useEffect, useState, type ReactNode } from "react";

import { onboardingFeedPreviewAction } from "@/app/onboarding/actions";
import { Button } from "@/components/base/buttons/button";
import { FeedCardView } from "@/components/feed/feed-card";
import { loadFeedPreviewCached, peekCachedFeedPreview } from "@/lib/onboarding/feed-preview-cache";
import type { FeedCard } from "@/lib/recommend/feed";
import type { GuestOnboardingState } from "@/lib/onboarding/state";
import { haptic } from "@/lib/haptics";
import { cx } from "@/utils/cx";

import { FeedSignInPanel } from "./feed-sign-in-panel";
import { FeedPreviewCardSkeleton } from "./feed-teaser-cards";

type MigrationState = {
  status: "idle" | "running" | "done" | "failed";
  message?: string;
};

export interface FeedPreviewGateProps {
  state: GuestOnboardingState;
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
 *
 * The tuck wash is a short band over the first card only. Stretching it
 * through the panel (`bottom-0` at 80% secondary) painted a page-coloured
 * veil the height of the Columbia card — a dead gap between card 1 and 2.
 * Signed-in students get one even stack; the first/rest split exists only
 * to park the gate between cards.
 */
export function FeedPreviewGate({
  state,
  signedIn,
  migration,
  onSignIn,
  onFinish,
  signInDisabled,
  signInError,
}: FeedPreviewGateProps) {
  const [previewCards, setPreviewCards] = useState<FeedCard[] | null>(() =>
    peekCachedFeedPreview(state),
  );
  const [previewError, setPreviewError] = useState<string | null>(null);

  const loadingPreview = previewCards === null && !previewError;
  const gated = !signedIn;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadFeedPreviewCached(state, onboardingFeedPreviewAction);
      if (cancelled) return;
      if (!result.ok || !result.cards) {
        setPreviewError(result.error ?? "We could not load recommendations right now.");
        setPreviewCards((current) => current ?? []);
        return;
      }
      setPreviewCards(result.cards);
    })();

    return () => {
      cancelled = true;
    };
  }, [state]);

  const displayCards = previewCards ?? [];

  const cardItems =
    loadingPreview || (displayCards.length === 0 && !previewError)
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
      {/*
        Signed-in: one even stack. The first/rest split exists only so the
        Columbia panel can sit between cards while the feed is gated.
      */}
      {!gated ? (
        <div className="flex min-w-0 flex-col gap-3.5">
          {cardItems.map((item, index) => (
            <PreviewCardSlot key={item.key} item={item} index={index} gated={false} />
          ))}
        </div>
      ) : (
        <>
          {firstCard ? <PreviewCardSlot item={firstCard} index={0} gated /> : null}

          <div className="relative z-10 -mt-6 flex min-w-0 shrink-0 flex-col items-center gap-4 px-0 sm:-mt-8 sm:px-1">
            {/*
              Dissolve only the tuck into the first card. A full-box wash
              (`bottom-0` to 80% secondary) used to paint over the Columbia
              panel itself — same height, page-coloured, faint border — which
              read as a dead gap between card 1 and card 2.
            */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-16 z-0 h-24 bg-linear-to-b from-transparent from-0% via-background-secondary-default/25 via-55% to-background-secondary-default/70 to-100%"
            />

            <FeedGateOverlay
              feedError={previewError}
              onSignIn={onSignIn}
              signInDisabled={signInDisabled}
              signInError={signInError}
            />
          </div>

          {restCards.length > 0 ? (
            <div
              className="mt-3.5 flex min-w-0 flex-col gap-3.5 pointer-events-none select-none transition-[filter,opacity] duration-300 ease-out"
              aria-hidden
            >
              {restCards.map((item, index) => (
                <PreviewCardSlot key={item.key} item={item} index={index + 1} gated />
              ))}
            </div>
          ) : null}
        </>
      )}

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
          <Button
            variant="secondary"
            onClick={() => {
              haptic("success");
              onFinish(displayCards);
            }}
          >
            Take me to the catalog
          </Button>
        </div>
      )}
    </div>
  );
}

/** Progressive blur on the first few cards; a cheaper wash on the rest. */
function PreviewCardSlot({
  item,
  index,
  gated,
}: {
  item: { key: string; node: ReactNode };
  index: number;
  gated: boolean;
}) {
  return (
    <div
      className={cx(
        "relative min-w-0 transition-opacity duration-300 ease-out",
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
    // `z-10` keeps the card above the tuck wash; without it a full-height
    // dissolve sibling could paint over this and leave a panel-sized blank.
    <div className="relative z-10 flex w-full min-w-0 max-w-md flex-col items-center gap-4">
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
