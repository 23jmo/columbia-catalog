/**
 * Mobile haptic feedback via the Vibration API.
 *
 * Android Chrome and most Chromium mobile browsers honour this. iOS Safari
 * does not expose `navigator.vibrate` — every call no-ops there. That is
 * fine: the same interactions keep their visual feedback, and a silent
 * no-op is cheaper than a platform fork.
 *
 * Honour `prefers-reduced-motion`. Haptics are not visual motion, but people
 * who ask for less sensory intensity usually mean it across channels.
 */

export type HapticKind =
  | "selection"
  | "impact"
  | "success"
  | "warning"
  | "error";

/**
 * Durations in milliseconds. Patterns are vibrate/pause/vibrate…
 * Keep them short — registration-week thrashing must not feel like a drum.
 */
const PATTERNS: Record<HapticKind, number | number[]> = {
  // Nav flips, menu open, un-save — felt, not announced.
  selection: 8,
  // Generic button confirm.
  impact: 12,
  // Completed save / add / copy.
  success: [10, 40, 18],
  warning: [18, 36, 18],
  error: [40, 50, 40],
};

function prefersReducedMotion(): boolean {
  // Prefer `globalThis` so Node tests (and any non-window runtime) can stub
  // `matchMedia` the same way browsers expose it on `window`.
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

/** True when the browser can vibrate and reduced-motion is off. */
export function canHaptic(): boolean {
  return vibrateFn() !== null && !prefersReducedMotion();
}

/**
 * Fire a haptic pulse. Returns whether the browser accepted the request.
 * Safe during SSR and on unsupported browsers — always a no-op there.
 */
export function haptic(kind: HapticKind = "impact"): boolean {
  if (prefersReducedMotion()) return false;
  const vibrate = vibrateFn();
  if (!vibrate) return false;
  try {
    return Boolean(vibrate(PATTERNS[kind]));
  } catch {
    // Some WebViews throw rather than returning false.
    return false;
  }
}
