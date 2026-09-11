/**
 * The onboarding state, held in a module-level store rather than component state.
 *
 * ── Why this is not `useState` in the wizard ────────────────────────────────
 *
 * The state has to come out of `localStorage`, and `localStorage` does not
 * exist on the server. The obvious shape — `useState(emptyGuestState)` plus an
 * effect that reads storage and calls `setState` — renders the empty state,
 * commits it, and only then swaps in the student's answers. React's
 * `react-hooks/set-state-in-effect` rule refuses that on purpose: it is a
 * guaranteed second render pass on the first screen a student ever sees, and
 * on a slow phone it is visible as a flash of "let's start with your degree"
 * over the step they had actually reached.
 *
 * `useSyncExternalStore` is the primitive built for exactly this. React reads
 * `getServerSnapshot` for the server render and the hydration pass, then reads
 * `getSnapshot` immediately afterwards and re-renders if they differ — the same
 * two passes, but as one atomic hydration rather than a state update chasing a
 * commit. `lib/watchlist/store.ts` and `lib/bookmarks/store.ts` are the same
 * shape for the same reason; this follows them so there is one pattern in the
 * codebase and not three.
 *
 * ── Persistence lives here, not in an effect ────────────────────────────────
 *
 * Every mutation goes through `updateOnboardingState`, so writing to storage on
 * the way out is one line in one place and cannot be forgotten by a new caller.
 * It also removes the ordering hazard the effect version had: a persistence
 * effect that fires before the hydration effect overwrites a returning
 * student's answers with an empty state, and the only thing preventing that was
 * an `isHydrated` flag that had to be remembered.
 */

import {
  clearGuestState,
  clearOnboardingCompleteCookie,
  emptyGuestState,
  readGuestState,
  writeGuestState,
  type GuestOnboardingState,
} from "./state";
import { clearFeedPreviewCache } from "./feed-preview-cache";
import { clearGuessDeckCache } from "./guess-cache";
import { clearOnboardingHandoff } from "./handoff";

export interface OnboardingSnapshot {
  state: GuestOnboardingState;
  /**
   * False until storage has been consulted. The wizard uses it to hold the
   * sign-in migration back — flushing before hydration would flush an empty
   * state over a student's real one.
   */
  isHydrated: boolean;
}

/**
 * One frozen object returned to every server render and to the hydration pass.
 * `useSyncExternalStore` compares snapshots by identity, so building a fresh
 * one per call would re-render forever.
 */
const SERVER_SNAPSHOT: OnboardingSnapshot = Object.freeze({
  state: emptyGuestState(),
  isHydrated: false,
});

let snapshot: OnboardingSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

/**
 * Set once the guest state has been written to the database. After that point
 * the local copy is a duplicate of server-side truth, and rewriting it on every
 * subsequent keystroke would resurrect the key `clearGuestState` just removed —
 * which the next visit would then migrate a second time.
 */
let hasMigrated = false;

function emit(next: OnboardingSnapshot): void {
  snapshot = next;
  if (!hasMigrated && next.isHydrated) writeGuestState(next.state);
  for (const listener of listeners) listener();
}

export function subscribeOnboarding(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOnboardingSnapshot(): OnboardingSnapshot {
  /*
   * Hydrate on the client snapshot read, not in an effect.
   *
   * Google SSO is a full document load back onto `/onboarding`. An effect
   * runs after paint, so the server snapshot ("which school?") is what the
   * student sees for a frame. `useSyncExternalStore` already gives us a
   * server snapshot for hydration and this function immediately after — reading
   * storage here is the whole point of the primitive. Mutate without `emit`:
   * notifying subscribers during `getSnapshot` is a render-phase update.
   */
  if (typeof window !== "undefined" && !snapshot.isHydrated) {
    const stored = readGuestState();
    snapshot = { state: stored ?? emptyGuestState(), isHydrated: true };
  }
  return snapshot;
}

export function getOnboardingServerSnapshot(): OnboardingSnapshot {
  return SERVER_SNAPSHOT;
}

/**
 * Reads storage once per page load. Idempotent, so every mounted consumer can
 * call it from its own effect without racing.
 *
 * A missing or unrecognised stored value is not a failure — `deserialize`
 * returns null for anything it does not recognise (see the versioned-key note
 * in `state.ts`) and onboarding simply starts at step one.
 */
export function ensureOnboardingHydrated(): void {
  if (snapshot.isHydrated) return;
  const stored = readGuestState();
  emit({ state: stored ?? emptyGuestState(), isHydrated: true });
}

/** The only way to change the state. Persists as a side effect of the write. */
export function updateOnboardingState(
  updater: (current: GuestOnboardingState) => GuestOnboardingState,
): void {
  const next = updater(snapshot.state);
  if (next === snapshot.state) return;
  emit({ state: next, isHydrated: snapshot.isHydrated });
}

/**
 * Called only after the server has confirmed the flush. Drops the browser copy
 * and stops persisting; the state object itself stays on screen, because the
 * student is still looking at the summary built from it.
 */
export function markOnboardingMigrated(): void {
  hasMigrated = true;
  clearGuestState();
}

/**
 * Start the wizard from scratch.
 *
 * The profile's "Redo onboarding" control calls this before routing to
 * `/onboarding`. A signed-in student who already finished once has
 * `hasMigrated` set in this tab, which would silently drop every new answer
 * — the store stops writing to `localStorage` after a flush. Resetting that
 * flag, and the in-memory + stored state, is what makes a second pass a real
 * second pass rather than a walk through a wizard that cannot remember
 * anything.
 *
 * Does not touch the database. Completing the wizard again upserts; existing
 * courses stay unless the student erases them from the profile.
 */
export function restartOnboarding(): void {
  hasMigrated = false;
  // A prior completion left `cc_onboarded=1`. Clear it or the next Google
  // round-trip treats them as finished and skips the first feed.
  clearOnboardingCompleteCookie();
  clearFeedPreviewCache();
  // The deck is keyed by the degree it was built for, so a restarted student
  // would never match it — but the module-level cache outlives the wizard, and
  // leaving a stale one resident is how a second pass ends up warm with the
  // first pass's answers if that key is ever loosened.
  clearGuessDeckCache();
  clearOnboardingHandoff();
  emit({ state: emptyGuestState(), isHydrated: true });
}
