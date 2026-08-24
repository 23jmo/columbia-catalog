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

  if (held) {
    timer.holds.add(reason);
    stopTimer(id);
  } else {
    timer.holds.delete(reason);
    if (timer.holds.size === 0) startTimer(id);
  }
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
    clearTimer(existing.id);
    emit(state.toasts.map((t) => (t.id === existing.id ? { ...toast, id: existing.id } : t)));
    installTimer(existing.id, duration);
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

function installTimer(id: string, duration: number | null): void {
  if (duration === null) return;
  timers.set(id, { remaining: duration, startedAt: null, handle: null, holds: new Set() });
  startTimer(id);
}

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
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
