"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { CloseButton } from "@/components/base/buttons/close-button";
import { cx } from "@/utils/cx";

/**
 * The overlay shell for an intercepted `/course/[courseId]`.
 *
 * Only the chrome lives here — the content is the same `SectionDetail` the
 * standalone page renders, passed in as `children` so it stays a server
 * subtree.
 *
 * ── Why this is mounted from a LAYOUT, not from the page ───────────────────
 *
 * The enter transition is driven by state (`isVisible` flips on the frame after
 * mount), so it replays on every mount. That used to happen twice per open:
 * `loading.tsx` rendered a drawer, and when the data arrived React unmounted
 * that whole subtree and mounted the page's drawer in its place. Two React
 * elements in two different Suspense slots are two components, however
 * identical their props — so the panel slid up, vanished, and slid up again.
 *
 * Hoisting the panel into `app/@drawer/(.)course/[courseId]/layout.tsx` puts it
 * ABOVE the Suspense boundary, where nothing the page does can unmount it. The
 * skeleton and the real content are now just different `children` inside one
 * panel that mounted once. The same structure makes moving between sections
 * (`?section=D01` → `?section=D02`) a content swap rather than a fresh drawer.
 *
 * Everything that must not restart mid-open lives here for the same reason:
 * the scroll lock, the focus trap, the Escape handler, and the record of what
 * to restore focus to.
 *
 * WHY EVERY DISMISS PATH CALLS `router.back()`:
 * the drawer is not UI state, it is a URL. Opening one pushed a history entry;
 * closing it must pop that entry, or the address bar starts describing a
 * screen that is no longer on top and the browser's own back button becomes a
 * trap ("back" would re-open the thing you just closed). Escape, the backdrop
 * and the close button therefore all do exactly what the back gesture does.
 *
 * Accessibility: `role="dialog"` + `aria-modal`, focus moves into the panel on
 * open and returns to whatever opened it on close, Tab cycles inside, and the
 * page behind is scroll-locked so a wheel over the backdrop does not silently
 * move the results underneath.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/*
 * Motion timings.
 *
 * Fast, and asymmetric. An entrance is doing work -- it tells the reader where
 * this panel came from and that their results are still behind it -- so it
 * gets enough time to read as movement. An exit tells them nothing they have
 * not already decided; every millisecond of it is latency between clicking
 * close and having their list back. So the way out is quicker than the way in,
 * and both are short enough to feel like the panel is already there rather
 * than like something being played at you.
 *
 * The values live in CSS custom properties so the dev-only motion dial can
 * drive them live without a rebuild (`components/dev/drawer-motion-dial.tsx`).
 * The constants below are the fallbacks baked into the `var()` calls, so the
 * drawer is fully specified with no dial mounted -- which is what production
 * ships.
 */
const DEFAULT_ENTER_MS = 90;
const DEFAULT_EXIT_MS = 60;

/*
 * The dim runs on its own clock -- see `scrimStyle` for why it is not the
 * panel's. Up like weather, out like a light.
 */
const DEFAULT_SCRIM_ENTER_MS = 220;
const DEFAULT_SCRIM_EXIT_MS = 110;

/**
 * A little overshoot on the way in.
 *
 * The panel travels past its resting edge by a hair and settles back, which is
 * what a thing with mass does when it stops. The previous curve decelerated
 * into place perfectly smoothly and read as correct but inert.
 *
 * Kept small on purpose. Overshoot is a cost paid in legibility -- the text
 * inside is moving while you are already trying to read it -- and at this
 * duration a large bounce stops reading as weight and starts reading as a
 * wobble. This is roughly a 3% overrun, enough to feel and not enough to
 * chase. The dial's "snap" preset goes further if you want to compare.
 */
const DEFAULT_EASE_ENTER = "cubic-bezier(0.34, 1.35, 0.64, 1)";

/* -------------------------------------------------------------------------- */
/*  Push rail vs overlay                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Where there is room to put the panel BESIDE the results instead of on top.
 *
 * ── Why the drawer stopped being an overlay ────────────────────────────────
 *
 * Choosing a class is a comparison, and an overlay makes comparing expensive:
 * every look back at the list costs a dismiss, and the thing you were
 * comparing against is gone by the time you get there. The panel covered the
 * exact content it existed to be read against.
 *
 * Beside it, the list stays lit, scrollable and clickable. Moving between
 * sections becomes one click instead of close-then-click, and the scrim and
 * its blur disappear entirely -- not softened, just gone, because there is no
 * longer anything to dim.
 *
 * ── Why `lg` and not `sm` ──────────────────────────────────────────────────
 *
 * Pushing only helps if what is left over is still usable. The rail wants
 * ~30rem; at the `sm` breakpoint (40rem) that leaves ten characters of result
 * row, which is worse than an overlay in every way. `lg` is also exactly where
 * the nav rail appears, so the two agree about when this viewport is "wide"
 * instead of disagreeing by a breakpoint.
 *
 * Below `lg` nothing changes: the bottom sheet and the scrim are still the
 * right answer when there is nowhere to push to.
 */
const PUSH_QUERY = "(min-width: 64rem)";

/** The panel's own width when it is a rail, before the reader has an opinion. */
const RAIL_WIDTH = "min(30rem, 42vw)";

/** Matches the nav rail's `p-3`, so the two sit on the same margin. */
const RAIL_GAP = "0.75rem";

/**
 * ── Dragging the rail wider ────────────────────────────────────────────────
 *
 * How much of the screen belongs to the section you are reading and how much
 * to the list you are reading it against is a judgement about *this* course at
 * *this* moment — a syllabus-length description wants room, a one-line seat
 * check does not. `RAIL_WIDTH` is a reasonable opening bid, not an answer, so
 * the edge between the two is draggable.
 *
 * The width is a custom property rather than React state on purpose. Everything
 * downstream already keys off `--drawer-rail`, which is computed from it: the
 * shell's padding, the results column's floor, and — through that floor — the
 * nav rail's collapse. Moving one number therefore moves all four surfaces with
 * no new wiring, and it moves them in CSS, so a drag does not re-render the
 * React tree sixty times a second.
 *
 * The bounds are the two failure modes, not taste:
 *
 *   min  A panel narrower than this stops being a section view — the meeting
 *        pattern wraps and the seat meter and its provenance stamp collide.
 *
 *   max  Whatever leaves the page intact: the collapsed nav rail (84px) plus
 *        the results column at its own 480px floor and gutters (34rem), plus
 *        the gap. Past that the reader would be dragging the results out of
 *        sight, which is the thing every other decision here exists to stop.
 *        Floored at `min` so the arithmetic still yields a usable range on a
 *        narrow laptop, where it collapses to a single width.
 */
const RAIL_MIN_PX = 360;
const RAIL_PAGE_RESERVE_PX = 84 + 544 + 24;
const RAIL_STEP_PX = 16;
const RAIL_WIDTH_PROPERTY = "--drawer-panel-width";
const RAIL_WIDTH_KEY = "columbia-catalog.drawer-width.v1";

function railMaxPx(): number {
  return Math.max(RAIL_MIN_PX, window.innerWidth - RAIL_PAGE_RESERVE_PX);
}

function clampRailPx(px: number): number {
  return Math.min(Math.max(Math.round(px), RAIL_MIN_PX), railMaxPx());
}

/**
 * Storage, not just memory: expanding the drawer to the full page is a real
 * document navigation, so a width held only in the tab would be forgotten by
 * the exact gesture most likely to follow a reader deciding they want more room.
 * Reads are clamped on the way out — a width stored on a wide monitor must not
 * come back and swallow a laptop.
 */
function readStoredRailPx(): number | null {
  try {
    const raw = window.localStorage.getItem(RAIL_WIDTH_KEY);
    if (!raw) return null;
    const px = Number.parseFloat(raw);
    return Number.isFinite(px) ? clampRailPx(px) : null;
  } catch {
    // Private-mode Safari throws on access rather than returning null.
    return null;
  }
}

function writeStoredRailPx(px: number): void {
  try {
    window.localStorage.setItem(RAIL_WIDTH_KEY, String(px));
  } catch {
    // A width that does not survive the tab is still better than a crash.
  }
}

/*
 * A module-level store rather than state seeded in an effect.
 *
 * `matchMedia` does not exist on the server, so the first client render has to
 * agree with the server render or the attributes below hydrate mismatched --
 * `aria-modal` in particular. Reporting `false` until something subscribes
 * makes the first paint identical on both sides; the real value arrives in the
 * microtask after, well before the panel has finished sliding. Same shape as
 * `hooks/use-plans.ts` and the motion dial.
 */
let pushMatches = false;
let pushHydrated = false;
const pushListeners = new Set<() => void>();

function emitPush() {
  for (const listener of pushListeners) listener();
}

function subscribePush(onChange: () => void) {
  pushListeners.add(onChange);
  if (!pushHydrated) {
    pushHydrated = true;
    const query = window.matchMedia(PUSH_QUERY);
    pushMatches = query.matches;
    // Never removed: one listener for the life of the tab, shared by every
    // panel that ever mounts. Removing it with the last subscriber would just
    // mean re-reading the query on the next open.
    query.addEventListener("change", (event) => {
      pushMatches = event.matches;
      emitPush();
    });
    queueMicrotask(emitPush); // after the commit that subscribed, not during
  }
  return () => {
    pushListeners.delete(onChange);
  };
}

function useIsPushRail(): boolean {
  return useSyncExternalStore(
    subscribePush,
    () => pushMatches,
    () => false,
  );
}

/**
 * The drag itself.
 *
 * Deliberately almost stateless. The live width lives in a ref and is published
 * straight to `<html>`, so a pointer moving across the screen writes one custom
 * property per frame instead of re-rendering a panel full of course content —
 * and the `aria-value*` attributes are written to the handle the same way, for
 * the same reason. The only React state is `isResizing`, because that has to
 * reach `className`, and it changes twice per gesture rather than sixty times a
 * second.
 *
 * Writing to the DOM rather than to state also keeps the restore effect honest:
 * it synchronises an external system, which is what effects are for, instead of
 * setting state and cascading a render.
 */
function useRailResize(isPushRail: boolean, panelRef: React.RefObject<HTMLDivElement | null>) {
  const handleRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerX: number; width: number } | null>(null);
  /*
   * The last width we set, as an exact integer. Keyboard steps read from here
   * rather than re-measuring, because `getBoundingClientRect` returns the
   * laid-out width -- 359.99 for a 360px box -- and rounding that on every
   * press loses a pixel every few steps. The rect is still the right source
   * when this is null, which is the case until someone has moved the edge.
   */
  const widthRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const applyRailPx = useCallback((px: number) => {
    widthRef.current = px;
    document.documentElement.style.setProperty(RAIL_WIDTH_PROPERTY, `${px}px`);
    const handle = handleRef.current;
    if (!handle) return;
    handle.setAttribute("aria-valuenow", String(px));
    handle.setAttribute("aria-valuemax", String(railMaxPx()));
  }, []);

  /*
   * Restore on mount, and re-clamp whenever the viewport changes: a width
   * chosen on an external monitor is still in storage when the lid closes on
   * the train, and unclamped it would push the results off a 1280px screen.
   */
  useEffect(() => {
    if (!isPushRail) return;
    const settle = () => {
      const stored = readStoredRailPx();
      if (stored !== null) {
        applyRailPx(stored);
        return;
      }
      /*
       * No stored width, so there is nothing to apply — but the separator is
       * focusable and must still announce where it currently sits, or the
       * first thing a screen reader hears is a slider with no value. The panel
       * is the only one who knows what `min(30rem, 42vw)` resolved to.
       */
      const panel = panelRef.current;
      const handle = handleRef.current;
      if (!panel || !handle) return;
      handle.setAttribute("aria-valuenow", String(Math.round(panel.getBoundingClientRect().width)));
      handle.setAttribute("aria-valuemax", String(railMaxPx()));
    };
    settle();
    window.addEventListener("resize", settle);
    return () => window.removeEventListener("resize", settle);
  }, [isPushRail, applyRailPx, panelRef]);

  const commit = useCallback((px: number) => {
    applyRailPx(px);
    writeStoredRailPx(px);
  }, [applyRailPx]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const panel = panelRef.current;
      if (!isPushRail || event.button !== 0 || !panel) return;
      event.preventDefault();

      // Measure rather than trust the ref: on the first ever drag the width is
      // still whatever `min(30rem, 42vw)` resolved to, which only the box knows.
      dragRef.current = { pointerX: event.clientX, width: panel.getBoundingClientRect().width };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsResizing(true);

      /*
       * The shell's padding and the nav rail both ease on
       * `--drawer-push-duration`. At the panel's 90ms that reads as lag while
       * a pointer is dragging — the edge under your finger moves and the page
       * catches up after. Zero for the gesture, restored on release so the
       * next open still animates.
       */
      document.documentElement.style.setProperty("--drawer-push-duration", "0ms");
      // Otherwise the drag selects the course text it is dragging over.
      document.body.style.userSelect = "none";
    },
    [isPushRail, panelRef],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      // The panel is anchored right, so leftward pointer movement widens it.
      applyRailPx(clampRailPx(drag.width + (drag.pointerX - event.clientX)));
    },
    [applyRailPx],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      setIsResizing(false);

      document.documentElement.style.setProperty(
        "--drawer-push-duration",
        `var(--drawer-enter, ${DEFAULT_ENTER_MS}ms)`,
      );
      document.body.style.removeProperty("user-select");

      const panel = panelRef.current;
      if (panel) commit(clampRailPx(panel.getBoundingClientRect().width));
    },
    [commit, panelRef],
  );

  /*
   * A splitter you can only reach with a mouse is a splitter half the readers
   * cannot use. Arrows step, Home/End jump to the bounds — the pattern a
   * `separator` with `tabindex` is expected to implement. Left widens because
   * the panel is on the right: the key moves the edge, not the panel.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const panel = panelRef.current;
      if (!panel) return;
      const current = widthRef.current ?? panel.getBoundingClientRect().width;
      const next =
        event.key === "ArrowLeft"
          ? current + RAIL_STEP_PX
          : event.key === "ArrowRight"
            ? current - RAIL_STEP_PX
            : event.key === "Home"
              ? railMaxPx()
              : event.key === "End"
                ? RAIL_MIN_PX
                : null;
      if (next === null) return;
      event.preventDefault();
      commit(clampRailPx(next));
    },
    [commit, panelRef],
  );

  return { handleRef, isResizing, onPointerDown, onPointerMove, onPointerUp, onKeyDown };
}

/**
 * How long to hold the navigation open so the exit can play.
 *
 * Read from the live custom property rather than hardcoded, so the JS delay
 * and the CSS transition cannot drift apart -- including while the dial is
 * being dragged. If they drift, the drawer either jumps away mid-slide or
 * sits finished and idle before it leaves.
 */
function durationMs(property: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return raw.endsWith("ms") ? value : value * 1000;
}

function exitDurationMs(): number {
  return durationMs("--drawer-exit", DEFAULT_EXIT_MS);
}

/** The expand rides the entrance's clock: it is an arrival, not a dismissal. */
function enterDurationMs(): number {
  return durationMs("--drawer-enter", DEFAULT_ENTER_MS);
}

/**
 * Duration and easing for whichever direction is currently playing.
 *
 * Inline rather than Tailwind `duration-*`/`ease-*` classes because the values
 * come from custom properties the dial rewrites at runtime, and a utility
 * class compiles to a fixed literal. The `var()` fallbacks are the real
 * defaults -- nothing has to set these properties for the drawer to work.
 *
 * Decelerating in, accelerating out: arriving settles into place, leaving gets
 * out of the way. The pair is what makes the panel read as an object with
 * weight rather than a div whose transform changed.
 */
function motionStyle(isClosing: boolean): CSSProperties {
  return isClosing
    ? {
        transitionDuration: `var(--drawer-exit, ${DEFAULT_EXIT_MS}ms)`,
        transitionTimingFunction: "var(--drawer-ease-exit, cubic-bezier(0.4, 0, 1, 1))",
      }
    : {
        transitionDuration: `var(--drawer-enter, ${DEFAULT_ENTER_MS}ms)`,
        transitionTimingFunction: `var(--drawer-ease-enter, ${DEFAULT_EASE_ENTER})`,
      };
}

/**
 * Duration and easing for the dim behind the panel.
 *
 * ── Why this is not `motionStyle` ──────────────────────────────────────────
 *
 * It used to be. The scrim ran on the panel's timing on the theory that the
 * dim must not outlive the thing it dims -- true, but it does not follow that
 * the two should arrive together. The panel is the object being tracked and
 * wants to be quick and decisive. The dim is atmosphere, and atmosphere that
 * lands as fast as an object does not read as atmosphere; it reads as a flash.
 * At the panel's old 200ms nobody noticed. At 90ms the blur snaps.
 *
 * So the scrim gets its own, longer ramp: slow enough to feel like the room
 * dimming, still comfortably shorter than a click-to-click round trip.
 *
 * Leaving is the exception -- it stays brisk, because a dim that lingers after
 * the panel has gone is the failure the original rule was guarding against.
 * The asymmetry is the point: fade up like weather, cut out like a light.
 *
 * Linear, not eased. The eye reads the rate of a brightness change far more
 * directly than the rate of a movement, so an eased fade reads as a lurch even
 * when the identical curve on a transform reads as grace.
 */
function scrimStyle(isClosing: boolean): CSSProperties {
  return isClosing
    ? {
        transitionDuration: `var(--drawer-scrim-exit, ${DEFAULT_SCRIM_EXIT_MS}ms)`,
        transitionTimingFunction: "linear",
      }
    : {
        transitionDuration: `var(--drawer-scrim-enter, ${DEFAULT_SCRIM_ENTER_MS}ms)`,
        transitionTimingFunction: "linear",
      };
}

/**
 * The dismiss function, shared with whatever renders a close affordance.
 *
 * `DrawerFrame` draws the X but the exit is the panel's to run, and the two
 * are in different components — `DrawerFrame` re-renders as the slot's content
 * changes while the panel is deliberately never unmounted. A context rather
 * than a prop because the layout that mounts the panel does not render the
 * frame; the page below it does, a Suspense boundary away.
 *
 * `null` means no panel is above us. `DrawerFrame` falls back to a plain
 * `router.back()` in that case: no animation, but the X still closes, which is
 * the failure worth having.
 */
const DrawerCloseContext = createContext<(() => void) | null>(null);

/**
 * Grow the rail into the full page, then go there.
 *
 * Separate from the close context because they are opposite gestures and a
 * consumer wants exactly one of them: the X dismisses, the title promotes. A
 * single context carrying both would let a caller reach for the wrong verb.
 *
 * `null` when no panel is above — on the standalone page there is nothing to
 * expand, and the title renders as plain text rather than as a link pointing
 * at the page you are already reading.
 */
const DrawerExpandContext = createContext<((href: string) => void) | null>(null);

/**
 * The id of the heading inside `children`, for `aria-labelledby`.
 *
 * A constant rather than a prop because the panel is now mounted a layout above
 * whatever renders the heading. Every state the slot can be in — the skeleton,
 * a section, the chooser, not-found — puts this id on its own heading, so the
 * reference always resolves. An `aria-labelledby` pointing at an element that
 * does not exist yet is worse than no label at all.
 */
export const DRAWER_TITLE_ID = "drawer-section-title";

export function CourseDrawer({ children }: { children: ReactNode }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const [isVisible, setVisible] = useState(false);
  /*
   * Closing is tracked twice on purpose. The ref is the re-entry guard and has
   * to be correct synchronously -- two dismisses in one tick would both read a
   * state value that has not updated yet, and each would pop a history entry.
   * The state is what the render reads, because a ref mutation does not
   * schedule a re-render and the class below would silently never apply.
   */
  const isClosingRef = useRef(false);
  const [isClosing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPushRail = useIsPushRail();
  const {
    handleRef: resizeHandleRef,
    isResizing,
    onPointerDown: onResizePointerDown,
    onPointerMove: onResizePointerMove,
    onPointerUp: onResizePointerUp,
    onKeyDown: onResizeKeyDown,
  } = useRailResize(isPushRail, panelRef);
  const isExpandingRef = useRef(false);
  const [isExpanding, setExpanding] = useState(false);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Dismiss: play the exit, then navigate.
   *
   * A route-driven drawer cannot animate out on its own, because the
   * navigation IS the unmount — `router.back()` pops the history entry, the
   * slot empties, and the panel is gone from the DOM in the same tick, with
   * nothing left to transition. Every dismiss path used to call it directly,
   * which is why the drawer arrived by sliding and left by blinking out.
   *
   * So the order inverts: flip to hidden first, which runs the same transform
   * transition backwards, and hold the navigation until it has played. The
   * drawer leaves the way it came, and only then does the URL catch up.
   *
   * A timer rather than `transitionend`, for the same reason the entrance does
   * not trust `requestAnimationFrame`: a transition that is never painted
   * never fires its event, and a missed event here does not mean a missing
   * animation — it means a drawer that never closes at all. The timer always
   * fires. Motion is allowed to be skipped; the dismiss is not.
   */
  const close = useCallback(() => {
    // Escape during the exit, a second click on the X, the backdrop under a
    // panel already on its way out — all reach here. Without the guard each
    // would queue another `back()` and pop further through the reader's
    // history than they asked for.
    if (isClosingRef.current) return;
    /*
     * Escape during an expand, or the X caught on the way past as the panel
     * grows. The two gestures move the drawer in opposite directions and both
     * end in a navigation; letting them overlap means `router.back()` at 60ms
     * racing `location.href` at 90ms, and which one wins decides whether the
     * reader lands on the full page or back in the results. The expand started
     * first, so it keeps the click.
     */
    if (isExpandingRef.current) return;
    isClosingRef.current = true;
    setClosing(true);
    setVisible(false);

    // Nothing is animating, so there is nothing to wait for; waiting anyway
    // would just be 300ms of a dead click for the reader least able to
    // interpret one.
    const skipsMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    if (skipsMotion) {
      router.back();
      return;
    }
    exitTimer.current = setTimeout(() => router.back(), exitDurationMs());
  }, [router]);

  /**
   * Promote the rail to the whole page.
   *
   * The panel already holds the section; the full page is the same section
   * with room around it. So the transition that says so is the panel widening
   * into the space the results were using, on the entrance's clock and the
   * same overshoot — it arrives at full size the way it arrived at rail size.
   * Sliding this one out and a fresh page in would describe a journey between
   * two places, when this is one thing growing.
   *
   * ── Why a document navigation ──────────────────────────────────────────────
   *
   * The URL is already `/course/X?section=Y`; the rail is that route
   * intercepted. `router.push` to the same address is a no-op that leaves the
   * intercept standing, so the panel would finish expanding and then simply
   * sit there. A document navigation is the way out of an intercepted route --
   * the same mechanism the footer's "Full course page" link has always used --
   * and it lands on the real page with the drawer gone.
   *
   * The cost is a full page load, which is why the animation matters: it
   * covers the request instead of leaving a dead click, and it retracts the
   * rail so the page behind is already at full width when the new document
   * paints. Without that the reader sees the layout jump twice.
   */
  const expand = useCallback((href: string) => {
    if (isExpandingRef.current || isClosingRef.current) return;
    isExpandingRef.current = true;
    setExpanding(true);

    // Give the width back to the page at the same moment, so the panel is
    // growing into space that is genuinely opening up rather than covering it.
    // The nav rail is part of that width, so it comes back at the same time.
    document.documentElement.removeAttribute("data-drawer-push");
    document.documentElement.style.setProperty("--drawer-rail", "0px");
    document.documentElement.style.setProperty(
      "--drawer-push-duration",
      `var(--drawer-enter, ${DEFAULT_ENTER_MS}ms)`,
    );
    document.documentElement.style.setProperty(
      "--drawer-push-ease",
      `var(--drawer-ease-enter, ${DEFAULT_EASE_ENTER})`,
    );

    const skipsMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    if (skipsMotion) {
      window.location.href = href;
      return;
    }
    expandTimer.current = setTimeout(() => {
      window.location.href = href;
    }, enterDurationMs());
  }, []);

  /**
   * Make room for the rail by shrinking the page, not by covering it.
   *
   * The panel lives in the `@drawer` slot, a sibling of `{children}` in the
   * root layout, so it cannot pass a prop down to the shell that has to move.
   * A custom property on `<html>` is the one channel both sides already share:
   * the drawer writes its footprint here, `AppShell` pads itself by whatever
   * it finds, and neither imports the other. With no drawer mounted the
   * property is simply absent and the fallback `0px` applies, so the shell is
   * fully specified on every page that has never opened one.
   *
   * The direction's own duration and easing ride along, so the list moves on
   * exactly the same clock as the panel rather than on a second, hardcoded one
   * that would drift the moment the dial is touched.
   */
  useEffect(() => {
    const isOpening = isVisible && !isClosing;

    /*
     * Same handshake, second signal. `--drawer-rail` tells the page how much
     * width to give up; this tells the nav rail to stop being 260px wide while
     * that is happening, because the width has to come from somewhere and the
     * results are the thing being read against this panel.
     *
     * An attribute rather than another custom property: the sidebar swaps
     * structure, not just a length. See `useDrawerPush`.
     */
    document.documentElement.toggleAttribute("data-drawer-push", isPushRail && isOpening);

    if (!isPushRail) return;
    const root = document.documentElement.style;
    root.setProperty(
      "--drawer-rail",
      // The reader's width if they have set one, the opening bid otherwise.
      // Everything downstream — shell padding, results floor, nav collapse —
      // is computed from this one line.
      isOpening ? `calc(var(${RAIL_WIDTH_PROPERTY}, ${RAIL_WIDTH}) + ${RAIL_GAP} * 2)` : "0px",
    );
    root.setProperty(
      "--drawer-push-duration",
      isOpening
        ? `var(--drawer-enter, ${DEFAULT_ENTER_MS}ms)`
        : `var(--drawer-exit, ${DEFAULT_EXIT_MS}ms)`,
    );
    root.setProperty(
      "--drawer-push-ease",
      isOpening
        ? `var(--drawer-ease-enter, ${DEFAULT_EASE_ENTER})`
        : "var(--drawer-ease-exit, cubic-bezier(0.4, 0, 1, 1))",
    );
  }, [isPushRail, isVisible, isClosing]);

  /*
   * Unmount-only, deliberately separate from the effect above: a cleanup that
   * ran on every visibility change would clear the property and re-set it in
   * the same tick, which is a frame of the page snapping back to full width in
   * the middle of the panel arriving. By the time this runs the exit has
   * already animated the rail to 0px, so removing it changes nothing visible.
   */
  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute("data-drawer-push");
      const root = document.documentElement.style;
      root.removeProperty("--drawer-rail");
      root.removeProperty("--drawer-push-duration");
      root.removeProperty("--drawer-push-ease");
    };
  }, []);

  useEffect(() => {
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    // Focus the panel itself rather than the first control: a screen reader
    // should hear the section title, not "close button".
    panelRef.current?.focus();
    /*
     * The panel renders hidden and flips to visible a frame later, so the
     * browser has painted the off-screen state for the transition to run from.
     *
     * The timer is not belt-and-braces. `requestAnimationFrame` only fires
     * while the compositor is actually painting this surface -- in a
     * background tab, an offscreen or headless pane, or some embedded
     * webviews, the callback simply never runs. Without a fallback `isVisible`
     * stays false forever and the panel sits permanently translated
     * off-screen while STILL trapping focus and scroll-locking the page
     * behind it: a click that freezes the app and shows nothing. An enter
     * animation is allowed to be skipped; it is not allowed to be the thing
     * that decides whether the drawer exists.
     *
     * Whichever lands first wins. The second `setVisible(true)` is a no-op --
     * React bails out when the value is unchanged -- so this cannot double the
     * transition, which is the whole point of the layout above it.
     */
    const show = () => {
      // A dismiss can land before either of these does — a fast Escape, or a
      // reader who clicks straight back out. Re-showing the panel then would
      // strand it on screen after the navigation had already been scheduled.
      if (isClosingRef.current) return;
      setVisible(true);
    };
    const frame = requestAnimationFrame(show);
    const fallback = setTimeout(show, 60);

    /*
     * Scroll-lock the page only when the panel is covering it.
     *
     * As a rail the panel sits beside the results, and the entire point is
     * that the list stays usable — freezing the thing the reader is comparing
     * against would give back the overlay's worst property while keeping none
     * of its reasons.
     *
     * Read from `matchMedia` here rather than from `isPushRail` so this stays
     * out of the effect's dependencies. Adding it would re-run the whole mount
     * effect on a resize: refocusing the panel and restarting the entrance in
     * the middle of someone dragging their window.
     */
    const coversThePage = !window.matchMedia(PUSH_QUERY).matches;
    const previousOverflow = document.body.style.overflow;
    if (coversThePage) document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      /*
       * A rail does not trap. Trapping is how a modal says "the rest of the
       * page is not available"; here it demonstrably is — it is right there,
       * lit and clickable — so holding Tab inside the panel would be the
       * keyboard being told a lie the mouse can plainly disprove. Escape still
       * closes, which is the part that helps either way.
       *
       * Checked at event time for the same reason as the scroll lock above:
       * it keeps `isPushRail` out of the effect's dependencies.
       */
      if (window.matchMedia(PUSH_QUERY).matches) return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      if (expandTimer.current) clearTimeout(expandTimer.current);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Back where they were: the row they clicked, not the top of the page.
      restoreFocusTo.current?.focus?.();
    };
  }, [close]);

  return (
    <DrawerCloseContext.Provider value={close}>
      <DrawerExpandContext.Provider value={expand}>
        <div
          className={cx(
            "fixed inset-0 z-100 flex items-end justify-center sm:items-stretch sm:justify-end",
            /*
             * As a rail the container still spans the viewport — that is what
             * anchors the panel to the right edge — but it must stop swallowing
             * clicks, or an invisible full-screen box would sit over the results
             * it just made room for. The panel takes pointer events back.
             *
             * `lg:p-3` is the same inset the nav rail's wrapper uses, so the
             * panel floats on the identical margin rather than one that merely
             * looks close.
             */
            "lg:p-3 lg:pointer-events-none",
            /*
             * The rail's own margin is part of what makes it a rail. Growing to
             * the full page means giving that back too, or the "full page" would
             * arrive inset by 12px and then jump flush when the real document
             * paints. Animated on the panel's clock so the inset closes with the
             * width rather than a beat behind it.
             */
            "transition-[padding] motion-reduce:transition-none",
            isExpanding && "lg:p-0",
            /*
             * On the way out the drawer is a picture of itself. Leaving it
             * clickable for those 300ms means a link inside a panel that is
             * already halfway off screen can still be followed, landing the
             * reader somewhere they were in the middle of leaving.
             */
            isClosing && "pointer-events-none",
          )}
          style={motionStyle(isClosing)}
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close section details"
            onClick={close}
            className={cx(
              "absolute inset-0 cursor-default bg-black/30 backdrop-blur-sm transition-opacity",
              "motion-reduce:backdrop-blur-none motion-reduce:transition-none",
              /*
               * There is nothing to dim once the panel sits beside the page rather
               * than over it, and a rail that darkened the results would be
               * dimming the exact thing it was moved aside to keep readable.
               *
               * Hidden in CSS rather than by not rendering it: the breakpoint is
               * known to the stylesheet on the very first paint, whereas the store
               * above honestly reports `false` until it has subscribed. One frame
               * of a scrim is not worth the risk when a media query settles it.
               */
              "lg:hidden",
              /*
               * Fade the dim out as the sheet grows over it. Below `lg` the expand
               * is the panel filling the screen, and a scrim held at full strength
               * behind something already opaque is only visible in the sliver of
               * corner that has not been covered yet.
               */
              isVisible && !isExpanding ? "opacity-100" : "opacity-0",
            )}
            style={scrimStyle(isClosing)}
          />

          <div
            ref={panelRef}
            role="dialog"
            /*
             * Only a modal when it actually behaves like one. As a rail the page
             * behind stays scrollable, focusable and clickable, and `aria-modal`
             * would tell a screen reader the opposite — pruning the entire rest of
             * the app from its model of the page while a sighted reader is still
             * clicking around in it. Absent is the honest value.
             */
            aria-modal={isPushRail ? undefined : true}
            aria-labelledby={DRAWER_TITLE_ID}
            tabIndex={-1}
            className={cx(
              "relative flex flex-col outline-none bg-background-full shadow-xl",
              /*
               * Two shapes, one component.
               *
               * On a phone the panel is a bottom sheet: full width, capped short of
               * the top so the list stays visible behind it, and it arrives from the
               * bottom edge. That is the direction a thumb expects and it keeps the
               * controls in the half of the screen a thumb can reach. On a wide
               * screen it is a right-hand sidebar, where a bottom sheet would waste
               * the horizontal room and cover the results it is meant to sit beside.
               */
              "h-[88dvh] w-full rounded-t-2xl border-t border-border-table",
              "sm:h-dvh sm:max-w-2xl sm:rounded-none sm:border-t-0 sm:border-l",
              /*
               * At `lg` it stops being an edge-to-edge overlay and becomes a
               * floating rail: bordered on all four sides, rounded and shadowed
               * the same way `CatalogSidebar` is, sitting on the same `p-3` margin
               * from its container. The catalog then reads as three panels of one
               * family — nav, results, section — rather than a page with something
               * pasted over its right-hand edge.
               *
               * `h-full` rather than the `sm` rule's `h-dvh`: the container now
               * carries padding, and a full-viewport-height child inside it would
               * overhang by exactly that padding at the bottom.
               */
              "lg:pointer-events-auto lg:h-full lg:max-w-none",
              // Same expression as the rail calc above, so the panel and the
              // space reserved for it can never disagree.
              "lg:[width:var(--drawer-panel-width,min(30rem,42vw))]",
              "lg:rounded-3xl lg:border lg:border-border-button-white lg:shadow-sidebar",
              /*
               * The axis has to switch with the shape. At `sm` and up `translate-y`
               * is pinned to 0 so `translate-x` alone drives the slide; below `sm`
               * no x-translate is set, so y alone drives it. One transition,
               * whichever axis is live.
               *
               * Do not keep `will-change-transform` after open — it leaves the
               * panel on a compositor layer and makes body text look slightly soft.
               */
              "transition-[transform,width,max-width,height,border-radius] motion-reduce:transition-none",
              /*
               * The offscreen distance is a variable so the dial can shorten the
               * travel. A panel that starts 100% away has to cover the whole
               * viewport in the duration; starting closer is often what actually
               * makes a fast animation read as fast rather than as a jump.
               */
              isVisible
                ? "translate-y-0 sm:translate-x-0"
                : "translate-y-[var(--drawer-distance,100%)] sm:translate-y-0 sm:translate-x-[var(--drawer-distance,100%)]",
              /*
               * Expanded: every constraint that made this a panel comes off at
               * once -- the width cap, the height cap, the corners, the inset --
               * and the same overshoot the entrance uses carries it there. The
               * document navigation fires as this lands, so the page that paints
               * is the shape the panel just became.
               *
               * `max-w-[100dvw]` rather than `max-w-none`: below `lg` the panel
               * is `w-full` held in by a max-width, and `none` is a keyword, not
               * a length. A transition cannot interpolate to a keyword, so
               * releasing the cap that way snapped the sheet to full width in a
               * single frame while everything around it was still easing. A
               * length the size of the viewport releases it just as completely
               * and does animate.
               */
              isExpanding &&
                "h-dvh rounded-none border-transparent sm:max-w-[100dvw] lg:w-full lg:rounded-none",
              /*
               * A transition on `width` is right for every other way this panel
               * changes size and wrong for exactly one: a drag already supplies
               * a frame per pointer move, so easing on top of that is the edge
               * arriving after the finger. Dropped for the gesture only.
               */
              isResizing && "transition-none",
            )}
            style={motionStyle(isClosing)}
          >
            {/*
              The seam between the list and the section is a control.

              It sits in the 12px gutter between the two panels rather than
              inside either of them, because that is where the boundary visually
              is — putting it inside the panel would make it look like a scroll
              affordance for the content. Invisible until hovered or focused:
              the cursor and a 16px target already say "draggable" to a pointer,
              and a permanent line here would add a third vertical rule to a
              layout whose whole argument is that it has exactly two.

              `separator` with `tabindex` is the window-splitter pattern, so it
              is announced with its current width and takes arrow keys. Hidden
              while expanding — there is nothing to resize once it is becoming a
              page.
            */}
            {isPushRail && !isExpanding && !isClosing ? (
              <div
                ref={resizeHandleRef}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize section panel"
                aria-valuemin={RAIL_MIN_PX}
                tabIndex={0}
                onPointerDown={onResizePointerDown}
                onPointerMove={onResizePointerMove}
                onPointerUp={onResizePointerUp}
                onPointerCancel={onResizePointerUp}
                onKeyDown={onResizeKeyDown}
                className="group absolute top-0 -left-2 z-10 hidden h-full w-4 cursor-col-resize touch-none outline-none lg:block"
              >
                <span
                  aria-hidden
                  className={cx(
                    "pointer-events-none absolute top-1/2 left-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2",
                    "rounded-full bg-border-table opacity-0",
                    "transition-opacity duration-150 motion-reduce:transition-none",
                    "group-hover:opacity-100 group-focus-visible:opacity-100",
                    isResizing && "opacity-100",
                  )}
                />
              </div>
            ) : null}

            {/*
          Grab handle: the standard signal that a sheet is draggable-dismissable
          and, more importantly here, that there is a page behind it. Pointless
          on the desktop sidebar, which has a visible edge instead.
        */}
            <div aria-hidden className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
              <span className="h-1 w-9 rounded-full bg-border-table" />
            </div>

            {children}
          </div>
        </div>
      </DrawerExpandContext.Provider>
    </DrawerCloseContext.Provider>
  );
}

/** Scroll area for drawer slot content. Close lives in the section header below. */
export function DrawerFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
      {children}
    </div>
  );
}

/**
 * Dismiss, from wherever the close affordance is drawn.
 *
 * Prefers the panel's own `close` — which plays the exit before popping the
 * history entry — and falls back to popping it directly when no panel is above
 * us, as on the standalone page where there is nothing to animate away.
 */
export function useDrawerClose(): () => void {
  const close = useContext(DrawerCloseContext);
  const router = useRouter();
  return useCallback(() => {
    if (close) close();
    else router.back();
  }, [close, router]);
}

/**
 * The title, as the way out of the rail and into the whole page.
 *
 * ── Why the heading, and not another button ────────────────────────────────
 *
 * The rail already has a close (retract) and a footer link (leave). What it
 * did not have was "give me more of this" -- and the thing a reader points at
 * when they want more of something is the thing itself. Making the title the
 * affordance also means the gesture has an obvious inverse: the panel grew out
 * of the row you clicked, and clicking its name grows it again.
 *
 * ── Why a real anchor ──────────────────────────────────────────────────────
 *
 * `href` is the whole point of the element, not decoration on a button.
 * Cmd-click, middle-click, "open in new tab", "copy link address" and every
 * assistive technology that enumerates links all work because the destination
 * is genuinely in the markup. Only the plain left click is intercepted, and
 * only to play the growth before the same navigation the browser was going to
 * do anyway -- so if the JS never loads, the link still goes to the right page.
 *
 * Modified clicks fall through untouched: hijacking a Cmd-click would animate
 * this tab while opening another, which is two responses to one gesture.
 *
 * ── Why it degrades to plain text ──────────────────────────────────────────
 *
 * With no drawer above (the standalone page renders the same `SectionDetail`),
 * the destination is the page you are already reading. A link to here from
 * here is a dead end that looks live, so the children render unwrapped.
 */
export function ExpandTitleLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const expand = useContext(DrawerExpandContext);

  if (!expand) return <>{children}</>;

  return (
    <a
      href={href}
      onClick={(event) => {
        if (event.defaultPrevented) return;
        // Let the browser have the ones that mean "somewhere else, not here".
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;
        event.preventDefault();
        expand(href);
      }}
      className={cx(
        /*
         * Underlined only on hover: a permanent rule under a display-size
         * heading reads as a mistake, and the heading is already the most
         * prominent thing on the panel -- it does not need help being noticed,
         * only confirming that it responds. The focus ring is not optional in
         * the same way, because a keyboard reader has no hover to discover it
         * with.
         */
        "rounded-md decoration-border-table underline-offset-[6px] outline-none",
        "transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        className,
      )}
    >
      {children}
    </a>
  );
}

/**
 * Dismisses the overlay.
 *
 * Goes through `useDrawerClose` rather than `router.back()` so the drawer
 * leaves the way it arrived. Popping the history entry directly unmounts the
 * panel in the same tick, and a panel that is gone from the DOM has nothing
 * left to animate — which is how the X used to make the drawer blink out of
 * existence while every other part of it slid.
 */
export function DrawerCloseButton({ className }: { className?: string }) {
  const close = useDrawerClose();

  return (
    <CloseButton
      size="md"
      aria-label="Close section details"
      onClick={close}
      className={className}
    />
  );
}
