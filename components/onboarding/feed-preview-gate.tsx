"use client";

import { useEffect, useState } from "react";

import { onboardingFeedPreviewAction } from "@/app/onboarding/actions";
import { Button } from "@/components/base/buttons/button";
import { FeedCardView } from "@/components/feed/feed-card";
import { loadFeedPreviewCached, peekCachedFeedPreview } from "@/lib/onboarding/feed-preview-cache";
import type { FeedCard } from "@/lib/recommend/feed";
import type { GuestOnboardingState } from "@/lib/onboarding/state";
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
 * unlocks. The stack is clipped until then — scrolling the extra cards is
 * the thing the gate is keeping.
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
          // Four placeholders is enough — the gated viewport clips the rest.
          key: `skeleton-${index}`,
          node: <FeedPreviewCardSkeleton />,
        }))
      : displayCards.map((card) => ({
          key: card.courseId,
          node: <FeedCardView card={card} className="w-full" />,
        }));

  return (
    <div className={cx("relative w-full pt-2", gated && "h-full overflow-hidden")}>
      <div
        className={cx(
          "flex flex-col gap-3.5 transition-[filter,opacity] duration-300 ease-out",
          gated && "pointer-events-none select-none",
        )}
        aria-hidden={gated}
      >
        {cardItems.map((item, index) => (
          <div
            key={item.key}
            className={cx(
              "relative transition-opacity duration-300 ease-out",
              // Contain the card's own stacking (instructor links are
              // `relative z-[1]` so they beat a stretched-link overlay).
              // Without isolation those names paint above this blur.
              gated && "isolate",
            )}
          >
            {item.node}
            {gated && index < 4 ? (
              // Only the cards that can peek above the gate need the blur
              // stack. Ten cards × 16 backdrop layers would be a jank tax
              // on pixels the guest cannot scroll to.
              <ProgressiveCardBlur index={index} total={4} />
            ) : null}
          </div>
        ))}
      </div>

      {gated ? (
        <div className="absolute inset-x-0 top-44 z-10 flex flex-col items-center gap-4 px-1 sm:top-48">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-20 bottom-0 bg-linear-to-b from-transparent from-0% via-background-secondary-default/20 via-45% to-background-secondary-default/80 to-100%"
          />

          <FeedGateOverlay
            feedError={previewError}
            onSignIn={onSignIn}
            signInDisabled={signInDisabled}
            signInError={signInError}
            onFinish={() => onFinish(displayCards)}
          />
        </div>
      ) : (
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
          <Button variant="secondary" onClick={() => onFinish(displayCards)}>
            Take me to the catalog
          </Button>
        </div>
      )}
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
  onFinish,
}: {
  feedError: string | null;
  onSignIn: () => void | Promise<void>;
  signInDisabled?: boolean;
  signInError?: string | null;
  onFinish: () => void;
}) {
  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-4">
      <FeedSignInPanel
        onSignIn={() => void onSignIn()}
        disabled={signInDisabled}
        error={signInError ?? feedError}
      />
      {!signInDisabled ? null : (
        <p className="text-center text-caption-1-regular text-text-tertiary">
          Accounts are not configured on this deployment.
        </p>
      )}
      <button
        type="button"
        onClick={onFinish}
        className="text-caption-1-medium text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline"
      >
        Browse without saving
      </button>
    </div>
  );
}
