/**
 * Haptic feedback for phone presses.
 *
 * Android Chrome: `navigator.vibrate`.
 * iOS Safari 17.4+: Taptic Engine via the checkbox-switch side effect
 * (see `./ios.ts`). Desktop and reduced-motion: silent no-op.
 */

import { installIosOverlays, iosTick, isIos, overlayJustTicked } from "./ios";

export type HapticKind =
  | "selection"
  | "impact"
  | "success"
  | "warning"
  | "error";

/**
 * Android vibrate/pause/vibrate… in milliseconds.
 * 8–12 ms used to be here; most motors never spin up that fast, so the
 * press felt like nothing even when the API accepted the call.
 */
const PATTERNS: Record<HapticKind, number | number[]> = {
  selection: 20,
  impact: 32,
  success: [24, 40, 32],
  warning: [28, 40, 28],
  error: [48, 50, 48],
};

/** Extra Taptic ticks after the first, for patterns that should feel like more than a tap. */
const EXTRA_IOS_TICKS: Record<HapticKind, number> = {
  selection: 0,
  impact: 0,
  success: 1,
  warning: 1,
  error: 2,
};

function prefersReducedMotion(): boolean {
  const media =
    typeof globalThis.matchMedia === "function"
      ? globalThis.matchMedia.bind(globalThis)
      : null;
  if (!media) return false;
  return media("(prefers-reduced-motion: reduce)").matches;
}

function vibrateFn(): ((pattern: number | number[]) => boolean) | null {
  if (typeof navigator === "undefined") return null;
  const vibrate = navigator.vibrate?.bind(navigator);
  return typeof vibrate === "function" ? vibrate : null;
}

function canIosHaptic(): boolean {
  return isIos() && typeof document !== "undefined";
}

/** True when this device can produce a haptic and reduced-motion is off. */
export function canHaptic(): boolean {
  return (vibrateFn() !== null || canIosHaptic()) && !prefersReducedMotion();
}

function tickIos(kind: HapticKind): boolean {
  // Overlay already fired the first tick on this press. Only add the rest.
  let fired = overlayJustTicked();
  if (!fired) fired = iosTick();
  const extra = EXTRA_IOS_TICKS[kind];
  for (let i = 0; i < extra; i += 1) {
    globalThis.setTimeout(() => {
      iosTick();
    }, (i + 1) * 70);
    fired = true;
  }
  return fired;
}

/**
 * Fire a haptic pulse. Returns whether a backend accepted the request.
 * Safe during SSR and on unsupported browsers — always a no-op there.
 */
export function haptic(kind: HapticKind = "impact"): boolean {
  if (prefersReducedMotion()) return false;

  const vibrate = vibrateFn();
  if (vibrate) {
    try {
      return Boolean(vibrate(PATTERNS[kind]));
    } catch {
      return false;
    }
  }

  if (!canIosHaptic()) return false;
  try {
    return tickIos(kind);
  } catch {
    return false;
  }
}

/**
 * Start the iOS overlay installer. Client components that import this
 * module also kick it off below, so most call sites do not need this.
 */
export function installWebHaptics(): () => void {
  if (!isIos()) return () => {};
  return installIosOverlays();
}

// Client bundles that import `@/lib/haptics` install overlays before the
// first tap. Server evaluation sees no `window` and skips.
if (typeof window !== "undefined" && isIos()) {
  const start = () => {
    installIosOverlays();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    queueMicrotask(start);
  }
}
