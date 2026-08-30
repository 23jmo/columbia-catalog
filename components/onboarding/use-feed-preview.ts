"use client";

import { useEffect, useState } from "react";

import { onboardingFeedPreviewAction } from "@/app/onboarding/actions";
import {
  feedPreviewCacheKey,
  hasRevealedFeedPreview,
  loadFeedPreviewCached,
  markFeedPreviewRevealed,
  peekCachedFeedPreview,
} from "@/lib/onboarding/feed-preview-cache";
import type { GuestOnboardingState } from "@/lib/onboarding/state";
import type { FeedCard } from "@/lib/recommend/feed";

/**
 * The last onboarding screen's cards, and whether they have arrived yet.
 *
 * ── Why this is a hook in the flow rather than an effect in the gate ───────
 *
 * The gate used to load its own cards, which meant the only thing that knew
 * the feed was still being ranked was a component nested two levels under the
 * headline. So the headline said "Here's your first feed." over four pulsing
 * placeholders — the app announcing a thing it did not have yet, which is the
 * one claim onboarding cannot afford to get wrong. It is also a waste of the
 * only genuinely earned moment in the flow: the reveal lands under a headline
 * that has already been sitting there for two seconds.
 *
 * Lifting the load here lets `OnboardingFlow` ask one question while the work
 * happens and a different one when it is done, and `OnboardingScreen` already
 * animates between two questions — that transition IS the reveal, and it did
 * not have to be built.
 *
 * ── What the caller gets ──────────────────────────────────────────────────
 *
 * `status` is the whole interface. `loading` means show the working screen;
 * anything else means show the feed, including `failed` — a student who cannot
 * be given recommendations still needs the sign-in card, and the gate renders
 * the error alongside it.
 */

export type FeedPreviewStatus = "loading" | "ready" | "failed";

export interface FeedPreview {
  status: FeedPreviewStatus;
  cards: FeedCard[];
  error: string | null;
  /**
   * True when the student watched this load happen — the cards were not in
   * the cache when they arrived at the last step.
   *
   * The gate uses it to decide whether to animate the cards in. A round trip
   * through Google returns to warm storage and repaints the same ten in the
   * same frame as the screen itself; animating those would be two entrances
   * stacked on one mount.
   */
  watched: boolean;
}

/**
 * How long the working screen stays up.
 *
 * Sized to the sentence it protects rather than to the work. `TypewriterQuestion`
 * stamps a word every 88ms, so "Building your first feed." takes about 350ms to
 * finish typing; anything shorter yanks the headline mid-word and reads as a
 * glitch rather than as a step. 600ms lets the sentence finish and be read once.
 */
const MINIMUM_WORKING_MS = 600;

export function useFeedPreview(
  state: GuestOnboardingState,
  /** False everywhere but the last step, so no earlier screen fires the rank. */
  enabled: boolean,
): FeedPreview {
  /*
   * Read through to the cache on every render rather than seeding state once.
   *
   * This hook mounts with the flow, several screens before it is enabled, so a
   * lazy initialiser would capture "empty" and hold it — and then a student
   * arriving with a warm prefetch would be shown the working screen for one
   * tick before it resolved. `peekCachedFeedPreview` short-circuits on a
   * module-level identity check, so the repeat reads are cheap and the value
   * is always current.
   */
  const cached = enabled ? peekCachedFeedPreview(state) : null;
  const [loaded, setLoaded] = useState<FeedCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cards = loaded ?? cached;

  const cacheKey = feedPreviewCacheKey(state);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      const result = await loadFeedPreviewCached(state, onboardingFeedPreviewAction);
      if (cancelled) return;
      if (!result.ok || !result.cards) {
        setError(result.error ?? "We could not load recommendations right now.");
        // An empty array, not null: it is an answer, and the screen has to
        // stop waiting on one.
        setLoaded((current) => current ?? []);
        return;
      }
      setLoaded(result.cards);
    })();

    return () => {
      cancelled = true;
    };
    /*
     * Keyed on the cache key rather than on `state`, which is a fresh object
     * on every keystroke the store records. The fetcher reads the latest
     * `state` when it runs; what decides whether to run again is whether the
     * answers that change the ranking changed.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cacheKey]);

  /*
   * Latched on arrival at the last step, and never cleared.
   *
   * Two things put the working screen up. The cards not being ready yet is the
   * obvious one. The other is that this student has not seen their feed built
   * for these answers before — which is nearly always true and nearly always
   * fast, because the flow prefetches the ranking several screens earlier.
   *
   * That second condition is the point. Without it the prefetch quietly ate the
   * reveal: the cards resolved in the same frame the step mounted, so the final
   * headline appeared with no transition into it, and the one moment the whole
   * flow is building toward went by unmarked. `hasRevealedFeedPreview` is what
   * keeps it from becoming a tax — it plays once per set of answers, and a
   * student coming back from Google SSO lands straight on their feed.
   *
   * This is React's documented adjust-state-during-render pattern rather than
   * an effect, and deliberately: an effect runs after the browser has painted,
   * so the flag would arrive a frame late and the floor below would start a
   * frame after the screen it is meant to hold. Setting it here re-renders
   * before anything is committed to the screen. The value is a boolean and the
   * guard makes it one-way, so the render stays pure — there is no clock read
   * and no second write.
   */
  const [waited, setWaited] = useState(false);
  if (enabled && !waited && (cards === null || !hasRevealedFeedPreview(cacheKey))) {
    setWaited(true);
  }

  const [heldLongEnough, setHeldLongEnough] = useState(false);

  useEffect(() => {
    if (!waited || heldLongEnough) return;
    const timer = window.setTimeout(() => {
      setHeldLongEnough(true);
      // Recorded when the beat has actually been served, not when it started,
      // so a student who navigates away mid-build gets it again on return.
      markFeedPreviewRevealed(cacheKey);
    }, MINIMUM_WORKING_MS);
    return () => window.clearTimeout(timer);
  }, [waited, heldLongEnough, cacheKey]);

  /*
   * An error settles the screen as surely as an answer does. A student the
   * recommender could not serve still needs the sign-in card, and the gate
   * renders the message next to it — leaving them on the working screen would
   * be a spinner that never ends.
   */
  const answered = cards !== null || error !== null;
  const settled = answered && (!waited || heldLongEnough);

  return {
    status: !enabled || !settled ? "loading" : error ? "failed" : "ready",
    cards: cards ?? [],
    error,
    watched: waited,
  };
}
