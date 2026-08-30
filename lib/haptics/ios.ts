/**
 * iOS Safari has no Vibration API. Safari 17.4+ fires the Taptic Engine
 * when an `<input type="checkbox" switch>` is toggled. That is the only
 * web path onto the motor.
 *
 * Two ways to flip the switch:
 *   1. Programmatic `.click()` — works on iOS 17.4–26.4 when called inside
 *      a user gesture. Apple stopped honouring scripted clicks in 26.5.
 *   2. A real finger on an invisible switch over the button — the only
 *      path that still works on 26.5+.
 *
 * We do both. Overlays cover the latest iOS; `iosTick` covers older iOS
 * and gestures that never land on a button (swipes, copy).
 */

export const OVERLAY_ATTR = "data-haptic-overlay";

// Links (sidebar dests, chat FAB) are not buttons. `data-haptic` opts them in.
const HOST_SELECTOR = "button, [role='button'], [data-haptic]";

let overlaysInstalled = false;
let overlayObserver: MutationObserver | null = null;
let lastOverlayTickAt = 0;

/** True when this tap already fired a Taptic tick via an overlay. */
export function overlayJustTicked(): boolean {
  return Date.now() - lastOverlayTickAt < 80;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Macintosh with a touch screen.
  return navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform);
}

/**
 * One Taptic tick via a scripted switch click. Safe to call from anywhere.
 * No-ops on iOS 26.5+ and on any runtime without a document.
 */
export function iosTick(): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  try {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    // Parked, not `display: none`. Hidden switches never fire.
    input.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;margin:0;opacity:0;pointer-events:none;";
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
    return true;
  } catch {
    return false;
  }
}

function ensureContainingBlock(host: HTMLElement): void {
  const pos = getComputedStyle(host).position;
  if (pos === "static" || pos === "") {
    host.style.position = "relative";
  }
}

function attachOverlay(host: HTMLElement): void {
  if (host.querySelector(`[${OVERLAY_ATTR}]`)) return;
  if (host.closest(`[${OVERLAY_ATTR}]`)) return;

  ensureContainingBlock(host);

  const sw = document.createElement("input");
  sw.type = "checkbox";
  sw.setAttribute("switch", "");
  sw.setAttribute(OVERLAY_ATTR, "");
  sw.setAttribute("aria-hidden", "true");
  sw.tabIndex = -1;
  // Opacity 0, still hit-testable. `clip-path` keeps the hit area inside
  // rounded pills so the tap does not leak past the visible corners.
  sw.style.cssText = [
    "position:absolute",
    "inset:0",
    "width:100%",
    "height:100%",
    "margin:0",
    "padding:0",
    "opacity:0",
    "cursor:inherit",
    "pointer-events:inherit",
    "appearance:auto",
    "-webkit-appearance:switch",
    "clip-path:inset(0 round 999px)",
    "touch-action:manipulation",
    "-webkit-tap-highlight-color:transparent",
  ].join(";");

  sw.addEventListener("click", (event) => {
    // The finger landed on the switch, so the Taptic Engine already fired.
    lastOverlayTickAt = Date.now();
    event.stopPropagation();
    if (host instanceof HTMLButtonElement && host.disabled) return;
    // Re-dispatch so the host's onClick still runs. The original target is
    // the switch, and a button must not see that as its own activation.
    host.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  host.appendChild(sw);
}

function attachTree(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches(HOST_SELECTOR)) {
    attachOverlay(root);
  }
  for (const el of root.querySelectorAll<HTMLElement>(HOST_SELECTOR)) {
    attachOverlay(el);
  }
}

/**
 * Cover every button with an invisible switch so a real tap reaches Taptic
 * on iOS 26.5+. Idempotent. Returns a teardown for tests.
 */
export function installIosOverlays(): () => void {
  if (typeof document === "undefined" || typeof MutationObserver !== "function") {
    return () => {};
  }
  if (overlaysInstalled) {
    return uninstallIosOverlays;
  }
  overlaysInstalled = true;
  attachTree(document.body ?? document.documentElement);

  overlayObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) attachTree(node);
      }
    }
  });
  overlayObserver.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
  });

  return uninstallIosOverlays;
}

export function uninstallIosOverlays(): void {
  overlayObserver?.disconnect();
  overlayObserver = null;
  overlaysInstalled = false;
  if (typeof document === "undefined") return;
  const found = document.querySelectorAll?.(`[${OVERLAY_ATTR}]`);
  if (!found) return;
  for (const sw of found) {
    sw.remove();
  }
}
