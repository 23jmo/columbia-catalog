"use client";

import { useEffect, useState } from "react";

import { onboardingFeedPreviewAction } from "@/app/onboarding/actions";
import {
  feedPreviewCacheKey,
  loadFeedPreviewCached,
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
 * How long the working screen stays up once it has been shown at all.
 *
 * Not a fake progress bar — it only applies when there was real work to wait
 * for, and it is shorter than the thing it protects. `TypewriterQuestion`
 * stamps a word every 88ms, so "Building your first feed." takes about 350ms
 * to finish typing; a prefetch that lands at 200ms would yank the headline
 * mid-word and read as a glitch rather than as a step. 600ms lets the sentence
 * finish and be read once.
 *
 * The common cases are both untouched by it: a warm cache never shows this
 * screen, and a cold rank takes seconds.
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
   * Latched the first time we render with nothing to show, and never cleared.
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
  if (enabled && !waited && cards === null) setWaited(true);

  const [heldLongEnough, setHeldLongEnough] = useState(false);

  useEffect(() => {
    if (!waited || heldLongEnough) return;
    const timer = window.setTimeout(() => setHeldLongEnough(true), MINIMUM_WORKING_MS);
    return () => window.clearTimeout(timer);
  }, [waited, heldLongEnough]);

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
