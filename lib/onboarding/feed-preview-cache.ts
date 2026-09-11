import type { FeedCard } from "@/lib/recommend/feed";

import { declaredProgramIds } from "./program-ids";
import type { GuestOnboardingState } from "./state";

/**
 * The onboarding feed, remembered across a full page load.
 *
 * The in-memory cache is enough while the student is still in the tab. Google
 * SSO is not: it leaves the origin, comes back to `/onboarding`, and every
 * module-level `let` is gone. Without a `localStorage` copy we would rank
 * again, flash "Building your feed…", and show a different ten cards than
 * the ones they just signed in to keep.
 */

export const FEED_PREVIEW_STORAGE_KEY = "columbia-catalog:onboarding-feed:v2";

export interface FeedPreviewFetcherResult {
  ok: boolean;
  cards?: FeedCard[];
  error?: string;
}

export type FeedPreviewFetcher = (state: GuestOnboardingState) => Promise<FeedPreviewFetcherResult>;

/** Inputs that change what `loadOnboardingFeedPreview` returns. */
export function feedPreviewCacheKey(state: GuestOnboardingState): string {
  return JSON.stringify({
    school: state.school,
    classYear: state.classYear,
    programIds: [...declaredProgramIds(state.programIds)].sort(),
    courses: state.courses
      .map((course) => ({ id: course.courseId, liked: course.liked }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    interestTags: [...state.interestTags].sort(),
  });
}

/**
 * Whether the student has already watched their feed being built.
 *
 * ── Why the reveal needs a latch of its own ─────────────────────────────────
 *
 * The flow prefetches the ranking as soon as the answers can support one, so by
 * the time a student reaches the last step the cards are usually already in the
 * cache and the working screen resolves in the same frame. That is a real
 * speed-up and it deleted the moment the whole flow builds toward: the last
 * question simply appeared, fully formed, with no beat between "answer this"
 * and "here is your feed".
 *
 * So the working screen is no longer conditional on the cards being slow. It is
 * shown once per set of answers, and this is what remembers that it has been.
 *
 * `sessionStorage`, not memory: Google SSO leaves the origin and comes back to
 * `/onboarding` with every module-level `let` gone, and a student returning
 * from sign-in should land on their feed rather than watch it be built a second
 * time. It is keyed by `feedPreviewCacheKey`, so going back and changing an
 * answer earns the beat again — the feed really is being rebuilt then.
 */
const REVEALED_STORAGE_KEY = "columbia-catalog:onboarding-feed-revealed:v1";

export function hasRevealedFeedPreview(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(REVEALED_STORAGE_KEY) === key;
  } catch {
    // Private mode, or storage disabled. Showing the beat is the safe failure:
    // it costs 600ms once, where suppressing it wrongly costs the reveal.
    return false;
  }
}

export function markFeedPreviewRevealed(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(REVEALED_STORAGE_KEY, key);
  } catch {
    // Nothing to do — the beat simply plays again on a return trip.
  }
}

let cached: { key: string; cards: FeedCard[] } | null = null;
let inflight: { key: string; promise: Promise<FeedPreviewFetcherResult> } | null = null;

function remember(key: string, cards: FeedCard[]): void {
  cached = { key, cards };
  writeStored({ key, cards });
}

export function peekCachedFeedPreview(state: GuestOnboardingState): FeedCard[] | null {
  const key = feedPreviewCacheKey(state);
  if (cached?.key === key) return cached.cards;

  const stored = readStored();
  if (stored?.key === key) {
    cached = stored;
    return stored.cards;
  }
  return null;
}

/** True once degree setup is far enough for meaningful recommendations. */
export function canPrefetchFeedPreview(
  state: GuestOnboardingState,
  majorsRequired: boolean,
  hasMajor: boolean,
): boolean {
  if (!state.school) return false;
  const pastClassYear = state.classYear !== null || state.programIds.length > 0;
  if (!pastClassYear) return false;
  if (majorsRequired && !hasMajor) return false;
  return true;
}

/** Fire-and-forget warm-up while the student finishes coursework or interests. */
export function prefetchFeedPreview(state: GuestOnboardingState, fetch: FeedPreviewFetcher): void {
  const key = feedPreviewCacheKey(state);
  if (cached?.key === key || inflight?.key === key) return;
  if (peekCachedFeedPreview(state)) return;

  const promise = fetch(state)
    .then((result) => {
      if (inflight?.key !== key) return result;
      inflight = null;
      if (result.ok && result.cards) remember(key, result.cards);
      return result;
    })
    .catch((cause) => {
      if (inflight?.key === key) inflight = null;
      throw cause;
    });

  void promise.catch(() => {
    /* Prefetch is best-effort; the feed step retries on its own. */
  });

  inflight = { key, promise };
}

export async function loadFeedPreviewCached(
  state: GuestOnboardingState,
  fetch: FeedPreviewFetcher,
): Promise<FeedPreviewFetcherResult> {
  const key = feedPreviewCacheKey(state);
  const hit = peekCachedFeedPreview(state);
  if (hit) return { ok: true, cards: hit };
  if (inflight?.key === key) return inflight.promise;

  const promise = fetch(state).then((result) => {
    inflight = null;
    if (result.ok && result.cards) remember(key, result.cards);
    return result;
  });

  inflight = { key, promise };
  return promise;
}

/**
 * Drop the remembered preview. Redo-onboarding must not reopen on last week's
 * ten cards.
 */
export function clearFeedPreviewCache(): void {
  cached = null;
  inflight = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FEED_PREVIEW_STORAGE_KEY);
  } catch {
    /* Private mode can throw; forgetting a cache is the safe direction. */
  }
}

function readStored(): { key: string; cards: FeedCard[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FEED_PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { key?: unknown; cards?: unknown };
    if (typeof record.key !== "string" || !Array.isArray(record.cards)) return null;
    const cards = record.cards.filter(isStoredFeedCard);
    if (cards.length === 0) return null;
    return { key: record.key, cards };
  } catch {
    return null;
  }
}

function writeStored(entry: { key: string; cards: FeedCard[] }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FEED_PREVIEW_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* Quota / private mode: keep the in-memory copy and move on. */
  }
}

/**
 * The same shallow guard the chat uses: a card we cannot open in Vergil is
 * not a card worth restoring.
 */
function isStoredFeedCard(row: unknown): row is FeedCard {
  if (!row || typeof row !== "object") return false;
  const record = row as Record<string, unknown>;
  if (typeof record.courseId !== "string" || typeof record.code !== "string") return false;
  const best = record.best;
  if (!best || typeof best !== "object") return false;
  const section = best as Record<string, unknown>;
  return typeof section.sectionId === "string" && typeof section.vergilUrl === "string";
}
