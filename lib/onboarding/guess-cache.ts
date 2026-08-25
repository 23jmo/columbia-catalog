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

export async function loadGuessDeckCached(
  state: GuestOnboardingState,
  fetch: GuessDeckFetcher,
): Promise<GuessDeckFetcherResult> {
  const key = guessDeckCacheKey(state);
  if (cached?.key === key) return { ok: true, deck: cached.deck };
  if (inflight?.key === key) return inflight.promise;

  const promise = fetch(state).then((result) => {
    inflight = null;
    if (result.ok && result.deck) cached = { key, deck: result.deck };
    return result;
  });

  inflight = { key, promise };
  return promise;
}
