/**
 * The toast queue.
 *
 * Built as shared infrastructure rather than as part of the bookmark feature,
 * because the app already had two places that fail silently and should not:
 * a refused plan write (`PlanWriteDeniedError`) and a rolled-back watch. Saved
 * classes is the first caller; those two are the second and third.
 *
 * ── Why the timer lives here and not in the card ───────────────────────────
 *
 * A toast that carries an action has to survive being interacted with. Hover
 * pauses it, focus pauses it, and opening the folder picker pins it open
 * indefinitely — none of which a `setTimeout` inside a presentational
 * component can express, because the thing that pauses it (a popover three
 * levels down) is not its parent.
 *
 * So dismissal is state, not a side effect: `remainingMs` counts down only
 * while a toast is neither hovered, focused, nor pinned. A card reports those
 * three conditions; it does not decide anything.
 *
 * ── Why replacement rather than a second card ──────────────────────────────
 *
 * Saving the same section twice in a row should update one toast, not stack
 * two identical ones. Callers pass a `dedupeKey`; a matching toast is replaced
 * in place and its timer restarts, which reads as "yes, still saved" instead
 * of as a pile.
 */

import type { ReactNode } from "react";

export type ToastStatus = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onPress?: () => void;
  /**
   * An action that owns its own UI — the folder picker. It is handed `pin` so
   * it can hold the toast open while it is on screen, and `close` so it can
   * dismiss the toast once it is finished.
   */
  render?: (controls: { pin: (pinned: boolean) => void; close: () => void }) => ReactNode;
}

export interface ToastInput {
  title: string;
  description?: string;
  status?: ToastStatus;
  action?: ToastAction;
  secondaryAction?: ToastAction;
  /** Milliseconds. `null` never auto-dismisses. */
  duration?: number | null;
  /** Replaces an existing toast with the same key instead of stacking. */
  dedupeKey?: string;
}

export interface Toast extends ToastInput {
  id: string;
  status: ToastStatus;
  duration: number | null;
  createdAt: number;
}

/** Long enough to read a course code and reach for the action. */
export const DEFAULT_TOAST_DURATION = 5000;

/**
 * Three is the point where a stack stops being a stack and starts being a
 * wall. Older toasts drop off the bottom.
 */
const MAX_VISIBLE = 3;

interface ToastState {
  toasts: readonly Toast[];
}

const EMPTY: readonly Toast[] = [];
const SERVER_SNAPSHOT: ToastState = { toasts: EMPTY };

let state: ToastState = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

/**
 * Per-toast timers, held outside the snapshot so a tick does not produce a new
 * snapshot object and re-render the whole stack sixty times a second.
 */
interface Timer {
  remaining: number;
  startedAt: number | null;
  handle: ReturnType<typeof setTimeout> | null;
  holds: Set<string>;
}

const timers = new Map<string, Timer>();

/**
 * Per-toast subscribers to *hold* changes only.
 *
 * Kept separate from the main snapshot for the same reason the timers are:
 * a card needs to know whether its countdown is paused so it can show that,
 * and that must not re-render the other two cards in the stack. This fires
 * on hover/focus/pin transitions — a handful of times per toast, not sixty
 * times a second.
 */
const holdListeners = new Map<string, Set<() => void>>();

function emitHold(id: string): void {
  const set = holdListeners.get(id);
  if (!set) return;
  for (const listener of set) listener();
}

let nextId = 0;

function emit(next: readonly Toast[]): void {
  state = { toasts: next };
  for (const listener of listeners) listener();
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastSnapshot(): ToastState {
  return state;
}

export function getToastServerSnapshot(): ToastState {
  return SERVER_SNAPSHOT;
}

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

function startTimer(id: string): void {
  const timer = timers.get(id);
  if (!timer || timer.holds.size > 0 || timer.handle !== null) return;
  if (timer.remaining <= 0) return;

  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => {
    timers.delete(id);
    dismiss(id);
  }, timer.remaining);
}

function stopTimer(id: string): void {
  const timer = timers.get(id);
  if (!timer || timer.handle === null) return;

  clearTimeout(timer.handle);
  timer.handle = null;
  if (timer.startedAt !== null) {
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
    timer.startedAt = null;
  }
}

/**
 * Holds a toast open.
 *
 * Reference-counted by reason, because a toast can be hovered AND have its
 * picker open at once, and the picker closing must not resume a timer the
 * pointer is still sitting on. `"pin"` outlives both: an action that took over
 * the toast releases it explicitly.
 */
export function holdToast(id: string, reason: "hover" | "focus" | "pin", held: boolean): void {
  const timer = timers.get(id);
  if (!timer) return;

  const wasHeld = timer.holds.size > 0;

  if (held) {
    timer.holds.add(reason);
    stopTimer(id);
  } else {
    timer.holds.delete(reason);
    if (timer.holds.size === 0) startTimer(id);
  }

  if (wasHeld !== (timer.holds.size > 0)) emitHold(id);
}

/**
 * Subscribes to whether a toast's countdown is currently paused.
 *
 * Exists so the card can render a countdown that visibly stops under the
 * pointer. Without it the store's pause behaviour is real but invisible, and
 * a reader who hovers to read the description has no way to know they bought
 * themselves the time.
 */
export function subscribeToastHold(id: string, listener: () => void): () => void {
  let set = holdListeners.get(id);
  if (!set) {
    set = new Set();
    holdListeners.set(id, set);
  }
  set.add(listener);

  return () => {
    set.delete(listener);
    if (set.size === 0) holdListeners.delete(id);
  };
}

export function isToastHeld(id: string): boolean {
  return (timers.get(id)?.holds.size ?? 0) > 0;
}

/** Never paused on the server — there is no pointer there. */
export function isToastHeldServerSnapshot(): boolean {
  return false;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function showToast(input: ToastInput): string {
  const duration = input.duration === undefined ? DEFAULT_TOAST_DURATION : input.duration;
  const toast: Toast = {
    ...input,
    id: `toast-${++nextId}`,
    status: input.status ?? "info",
    duration,
    createdAt: Date.now(),
  };

  // Replace rather than stack when the caller says these are the same event.
  const existing = input.dedupeKey
    ? state.toasts.find((t) => t.dedupeKey === input.dedupeKey)
    : undefined;

  if (existing) {
    // The card stays mounted, so whatever was holding it open — a pointer
    // resting on it, the folder picker — is still true. Restarting the timer
    // without carrying those over would run the countdown out from under a
    // reader who never moved.
    const holds = timers.get(existing.id)?.holds;
    clearTimer(existing.id);
    emit(state.toasts.map((t) => (t.id === existing.id ? { ...toast, id: existing.id } : t)));
    installTimer(existing.id, duration, holds);
    return existing.id;
  }

  // Newest first: the stack renders top-down and the thing that just happened
  // belongs where the eye already is.
  const next = [toast, ...state.toasts];
  const dropped = next.slice(MAX_VISIBLE);
  for (const stale of dropped) clearTimer(stale.id);

  emit(next.slice(0, MAX_VISIBLE));
  installTimer(toast.id, duration);
  return toast.id;
}

function installTimer(
  id: string,
  duration: number | null,
  holds: Set<string> = new Set(),
): void {
  if (duration === null) return;
  timers.set(id, { remaining: duration, startedAt: null, handle: null, holds });
  // `startTimer` is a no-op while anything is holding, which is what we want.
  startTimer(id);
}

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
  // Deliberately not clearing `holdListeners`: the card unmounts on its own
  // and removes its listener then. Dropping it here would leave a mounted
  // card subscribed to a set nobody writes to.
}

export function dismiss(id: string): void {
  clearTimer(id);
  emit(state.toasts.filter((t) => t.id !== id));
}

export function dismissAll(): void {
  for (const toast of state.toasts) clearTimer(toast.id);
  emit(EMPTY);
}

// ---------------------------------------------------------------------------
// The caller-facing API
// ---------------------------------------------------------------------------

export const toast = {
  success: (input: Omit<ToastInput, "status">) => showToast({ ...input, status: "success" }),
  /**
   * Errors do not auto-dismiss by default. A confirmation you missed costs
   * nothing; a refusal you missed leaves you believing something was saved.
   */
  error: (input: Omit<ToastInput, "status">) =>
    showToast({ duration: null, ...input, status: "error" }),
  info: (input: Omit<ToastInput, "status">) => showToast({ ...input, status: "info" }),
  dismiss,
  dismissAll,
};
