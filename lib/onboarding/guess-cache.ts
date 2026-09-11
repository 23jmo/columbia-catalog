import type { GuessDeck } from "./guess";
import { declaredProgramIds } from "./program-ids";
import type { GuestOnboardingState } from "./state";

export interface GuessDeckFetcherResult {
  ok: boolean;
  deck?: GuessDeck;
  error?: string;
}

export type GuessDeckFetcher = (state: GuestOnboardingState) => Promise<GuessDeckFetcherResult>;

/** Inputs that change what `loadGuessDeck` returns. */
export function guessDeckCacheKey(state: GuestOnboardingState): string {
  return JSON.stringify({
    school: state.school,
    classYear: state.classYear,
    programIds: [...declaredProgramIds(state.programIds)].sort(),
    courses: state.courses.map((course) => course.courseId).sort(),
    dismissed: [...state.dismissedCourseIds].sort(),
  });
}

let cached: { key: string; deck: GuessDeck } | null = null;
let inflight: { key: string; promise: Promise<GuessDeckFetcherResult> } | null = null;

/**
 * Forget everything. Test isolation, and the redo-onboarding path, which must
 * not hand a restarted student the deck built for the degree they just erased.
 */
export function clearGuessDeckCache(): void {
  cached = null;
  inflight = null;
}

export function peekCachedGuessDeck(state: GuestOnboardingState): GuessDeck | null {
  const key = guessDeckCacheKey(state);
  return cached?.key === key ? cached.deck : null;
}

/** True once school, class year, and major (when offered) are known. */
export function canPrefetchGuessDeck(
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

/** Fire-and-forget warm-up while the student finishes degree questions. */
export function prefetchGuessDeck(state: GuestOnboardingState, fetch: GuessDeckFetcher): void {
  const key = guessDeckCacheKey(state);
  if (cached?.key === key || inflight?.key === key) return;

  const promise = fetch(state)
    .then((result) => {
      if (inflight?.key !== key) return result;
      inflight = null;
      if (result.ok && result.deck) cached = { key, deck: result.deck };
      return result;
    })
    .catch((cause) => {
      if (inflight?.key === key) inflight = null;
      throw cause;
    });

  void promise.catch(() => {
    /* Prefetch is best-effort; the coursework screen retries on its own. */
  });

  inflight = { key, promise };
}

/**
 * The deck for this state, from cache, from a request already in flight, or
 * from a fresh one.
 *
 * ── Why the write is guarded ────────────────────────────────────────────────
 *
 * Two callers race here on every degree change: the flow's prefetch effect,
 * which re-fires whenever school / year / programs move, and the coursework
 * screen, which asks on mount. A student who switches major and walks forward
 * has requests for two different degrees in flight at once, and they can land
 * in either order.
 *
 * An unguarded resolver did two wrong things when the OLDER one landed last.
 * It installed a deck for a degree the student had already left — so the next
 * `peekCachedGuessDeck` missed and the screen paid for a round trip it had
 * already made. And, worse, it cleared `inflight` unconditionally, which is the
 * flag `prefetchGuessDeck` reads to decide whether its own result is still
 * wanted: with the record gone, a prefetch that had completed correctly
 * concluded it was stale and threw its deck away. The coursework screen the
 * prefetch existed to warm then opened on the skeleton.
 *
 * So: only the request that is still current may write. This mirrors the guard
 * `prefetchGuessDeck` has always had, and the two are only correct together —
 * each one reads state the other maintains.
 */
export async function loadGuessDeckCached(
  state: GuestOnboardingState,
  fetch: GuessDeckFetcher,
): Promise<GuessDeckFetcherResult> {
  const key = guessDeckCacheKey(state);
  if (cached?.key === key) return { ok: true, deck: cached.deck };
  if (inflight?.key === key) return inflight.promise;

  const promise = fetch(state).then((result) => {
    // Superseded while we were waiting. The caller still gets its answer — it
    // asked, and returning it is not the same as caching it — but a newer
    // request owns the cache now.
    if (inflight?.key !== key) return result;
    inflight = null;
    if (result.ok && result.deck) cached = { key, deck: result.deck };
    return result;
  });

  inflight = { key, promise };
  return promise;
}
