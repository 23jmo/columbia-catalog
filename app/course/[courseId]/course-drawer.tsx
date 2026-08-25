"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
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
 * The panel used to animate on mount, so it replayed on every remount:
 * `loading.tsx` rendered a drawer, and when the data arrived React unmounted
 * that whole subtree and mounted the page's drawer in its place. Two React
 * elements in two different Suspense slots are two components, however
 * identical their props — so the panel appeared, vanished, and appeared again.
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
 * microtask after. Same shape as `hooks/use-plans.ts`.
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

      // The page already follows `--drawer-push-duration`. Keep it at 0ms so
      // a drag cannot inherit a leftover duration from anything else.
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

      document.documentElement.style.setProperty("--drawer-push-duration", "0ms");
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
 * Above `sm` the panel is not a sheet.
 *
 * It arrives from the right edge on `translate-x`, and a vertical throw there
 * would be a gesture against the grain of the shape — you would be flinging a
 * side panel downwards into an edge it has no relationship with. Read at event
 * time rather than subscribed to, for the same reason the scroll lock and the
 * Tab trap read `matchMedia` inline: it keeps the breakpoint out of the mount
 * effect's dependencies, where it would restart the entrance on every resize.
 */
const SHEET_QUERY = "(min-width: 40rem)";

/**
 * How far down is far enough.
 *
 * A quarter of the sheet — about 185px of an 88dvh panel on a 390×844 phone.
 * The number has to sit in a fairly narrow band: much less and the sheet
 * leaves while you are still deciding, which is worse than it sticking, because
 * an accidental dismissal costs a navigation and a scroll position. Much more
 * and the gesture stops being a flick and becomes a haul, at which point the
 * close button was quicker and the drag is decoration.
 *
 * A fraction rather than a pixel count because the sheet's height is `88dvh`
 * and a fixed threshold would mean something different on a 667px phone than
 * on a 932px one. The gesture should read the same on both.
 */
const SHEET_DISMISS_FRACTION = 0.25;

/**
 * ...or fast enough.
 *
 * Distance alone gets the slow, deliberate drag right and the flick wrong: a
 * quick downward throw is unambiguously "get rid of this", and requiring it to
 * also cover a quarter of the screen makes the reader repeat themselves. So
 * velocity is a second, independent way to pass.
 *
 * Both a speed and a floor, because velocity on its own is dangerous. The
 * fastest pointer samples in any gesture are the first few, so a 6px twitch at
 * the start of a tap can clear a pure speed test on its own. The floor says the
 * flick has to have actually gone somewhere.
 */
const SHEET_FLICK_PX_PER_MS = 0.5;
const SHEET_FLICK_MIN_PX = 32;

/**
 * Upward: resistance, not travel.
 *
 * There is nothing above the sheet to reveal — it is already capped at 88dvh
 * with the results deliberately visible behind the gap — so an upward drag
 * cannot be given what it is asking for. The two honest answers are to ignore
 * it or to resist it, and ignoring it makes the sheet feel broken: a finger
 * moves and nothing does, which reads as a dropped gesture rather than as a
 * limit.
 *
 * So it moves, and pulls back harder the further it goes, asymptotically
 * approaching this bound. `(d * limit) / (d + limit)` is the cheap form of
 * that curve: at `d = limit` it is exactly half, and it never reaches the
 * limit however hard you pull. The sheet is against a stop and says so.
 *
 * Deliberately NOT a promote-to-full-page gesture. Expanding is already a
 * verb here — the title link — and it ends in a document navigation. Attaching
 * that to an upward flick would put an irreversible page load on the far side
 * of a gesture people make by accident while scrolling.
 */
const SHEET_OVERDRAG_PX = 96;

/**
 * Nothing moves until the pointer has travelled this far.
 *
 * The slop is what keeps a tap a tap. Every link, chip and button in the sheet
 * sits inside the drag surface, so without a dead zone the panel would lurch a
 * pixel under every press and a shaky thumb would start a gesture instead of
 * following a link. Below the slop the drag has not begun, so the click lands
 * normally and React never re-renders.
 */
const SHEET_SLOP_PX = 6;

/**
 * The window velocity is measured over.
 *
 * One frame's delta is far too noisy to threshold on — a 16ms sample that
 * happens to straddle a stall reads as a dead stop mid-flick. A tail of
 * roughly two frames smooths that out while still being recent enough to
 * describe the release rather than the whole gesture: a drag that crawled down
 * and then stopped must not dismiss on the strength of how it started.
 */
const SHEET_VELOCITY_WINDOW_MS = 120;

/**
 * How much of the dim the drag can take away.
 *
 * The scrim lifting as the sheet comes down is what makes the gesture read as
 * reversible — the page behind is coming back, and it is coming back in
 * proportion to how far you have pulled, so the halfway point looks like
 * halfway rather than like a decision already made. Not all the way to zero:
 * some dim has to remain or the sheet stops looking like it is in front of
 * anything, and the moment it lands back home would be a flash of the scrim
 * returning.
 */
const SHEET_SCRIM_TRAVEL = 0.7;

/**
 * Scrolling into the section grows the sheet to the full screen.
 *
 * The peek height exists to answer "what is behind this?" — the strip of
 * results above the sheet is what makes it a sheet rather than a page, and it
 * is worth real estate for exactly as long as the reader is still deciding
 * whether they opened the right thing. Once they start scrolling they have
 * decided, and the strip stops being orientation and becomes 12% of a phone
 * screen spent on a list they are no longer reading.
 *
 * So the height follows the intent: peek while you are glancing, full while
 * you are reading, and back to peek the moment you return to the top. That
 * last part is what keeps it reversible without a control — no button is
 * needed to get the results back, because the gesture that got you here
 * reverses.
 *
 * Two different numbers so the sheet cannot flap. Expanding takes a deliberate
 * 12px of scroll; collapsing takes an actual return to the top. A single
 * threshold would put the sheet's height on a knife edge at exactly the scroll
 * offset a finger rests at.
 */
const SHEET_EXPAND_SCROLL_PX = 12;

/**
 * How long the panel takes to arrive, and how long it takes to leave.
 *
 * Asymmetric on purpose. The entrance is the panel explaining where it came
 * from — it slides up out of the row you tapped, and that story needs long
 * enough to be read. The exit is a panel you have already finished with, and
 * every millisecond of it is latency between clicking close and having the
 * list back, so it is the shortest slide that still reads as a slide rather
 * than a disappearance.
 *
 * The exit number is load-bearing in a second way: `close` holds `router.back()`
 * for exactly this long, so raising it directly raises the delay on a dismiss.
 * Treat it as a latency budget that happens to be spent on motion.
 */
const DRAWER_ENTER_MS = 300;
const DRAWER_EXIT_MS = 200;

/** The asymptotic curve described in `SHEET_OVERDRAG_PX`. */
function overdrag(distance: number): number {
  return (distance * SHEET_OVERDRAG_PX) / (distance + SHEET_OVERDRAG_PX);
}

/**
 * The scroll container the gesture started inside, if any.
 *
 * This is the whole difference between a sheet that can be read and a sheet
 * that can only be thrown away. `DrawerFrame` is the entire body of the panel,
 * so almost every pointer that lands on the sheet lands inside a scroller, and
 * a drag handler that did not ask this question would dismiss the drawer every
 * time someone tried to scroll it.
 *
 * `scrollHeight > clientHeight` first because it is free, and the computed
 * style read — which is not — only happens for elements that could actually be
 * scrolling. Stops at the panel: the page behind is scroll-locked and is not
 * ours to consult.
 */
function scrollerUnder(target: EventTarget | null, panel: HTMLElement): HTMLElement | null {
  let node = target instanceof Element ? target : null;
  while (node && node !== panel) {
    if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Drag the sheet down to dismiss it.
 *
 * ── Why the offset is written to the DOM, not to state ─────────────────────
 *
 * The same reason `useRailResize` does it: a pointer crossing a phone screen
 * produces a sample per frame, and re-rendering a panel full of course content
 * sixty times a second to move it would drop the frames the gesture is made
 * of. So the live offset is one `translate` write per move, and the only React
 * state is `isDragging`, which changes twice per gesture because it has to
 * reach `className`.
 *
 * ── Why `translate` and not `transform` ────────────────────────────────────
 *
 * Tailwind v4 compiles `translate-y-*` to the standalone `translate` property,
 * not to `transform`. The live drag writes that same property, so clearing the
 * inline value on a cancelled gesture hands the panel back to its resting
 * class with nothing left to interpolate.
 *
 * ── Keyboard, and WCAG 2.5.7 ───────────────────────────────────────────────
 *
 * There is deliberately no keyboard equivalent of the drag, because there does
 * not need to be one. 2.5.7 asks that anything achievable by dragging also be
 * achievable with a single pointer, and dismissal already is, three ways over:
 * the close button, the scrim, and Escape. The gesture is a faster route to a
 * destination that was never gated behind it, which is the one shape of
 * drag-only interaction the rule permits.
 */
function useSheetDrag({
  panelRef,
  scrimRef,
  close,
  collapse,
  isFull,
  isBusy,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  scrimRef: React.RefObject<HTMLButtonElement | null>;
  close: () => void;
  /** Step back to the peek height instead of leaving. See `onPointerUp`. */
  collapse: () => void;
  isFull: boolean;
  isBusy: boolean;
}) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    /** Null when the gesture began on the grab handle rather than in content. */
    scroller: HTMLElement | null;
    captured: boolean;
    offset: number;
    height: number;
    samples: { y: number; t: number }[];
  } | null>(null);
  const [isDragging, setDragging] = useState(false);

  /**
   * Publish one frame of the gesture. `null` hands the panel back to CSS.
   *
   * The height is passed in rather than measured because measuring here would
   * force a layout on every pointer move to read a number that cannot change
   * mid-gesture — the sheet is a fixed `88dvh` and the viewport is not
   * resizing under a finger.
   */
  const paint = useCallback(
    (offset: number | null, height: number) => {
      const panel = panelRef.current;
      if (panel) {
        if (offset === null) {
          /*
           * Order matters, and it is the whole reason this is two writes
           * rather than one.
           *
           * The panel's resting class carries a `translate` transition for the
           * entrance. During the gesture that transition has to be off — the
           * finger is the clock, and 300ms of easing between the pointer and
           * the sheet is exactly the lag the direct-write channel exists to
           * avoid. But a cancelled gesture has to ease home, so the transition
           * must be back in the computed style BEFORE `translate` changes.
           *
           * Both writes land in one style recalc, and the spec starts
           * transitions from the after-change style, so restoring first is
           * what makes the release animate instead of snapping. Suppressing
           * via a React class instead would not work: `paint` runs
           * synchronously inside the pointer handler while the class change
           * waits for a re-render, so the offset would always be cleared while
           * `transition-none` was still applied.
           */
          panel.style.removeProperty("transition-property");
          panel.style.removeProperty("translate");
        } else {
          panel.style.transitionProperty = "none";
          panel.style.translate = `0 ${offset}px`;
        }
      }
      const scrim = scrimRef.current;
      if (!scrim) return;
      // Only the downward half dims: pulling up against the stop is the sheet
      // refusing to move, and the room should not brighten to acknowledge it.
      if (offset === null || offset <= 0) {
        // Same ordering rule as the panel, for the same reason.
        scrim.style.removeProperty("transition-property");
        scrim.style.removeProperty("opacity");
        return;
      }
      scrim.style.transitionProperty = "none";
      const progress = Math.min(1, offset / height);
      scrim.style.opacity = String(1 - SHEET_SCRIM_TRAVEL * progress);
    },
    [panelRef, scrimRef],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const panel = panelRef.current;
      if (!panel || isBusy || dragRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (window.matchMedia(SHEET_QUERY).matches) return;

      const scroller = scrollerUnder(event.target, panel);
      /*
       * Scrolled away from the top, so the reader is reading. Pulling the sheet
       * from here would mean the content could never be scrolled back up: every
       * upward-then-downward correction inside a long section would start
       * dismissing the thing being read.
       */
      if (scroller && scroller.scrollTop > 0) return;

      /*
       * Recorded, not started. Nothing is captured and nothing is prevented
       * until the pointer proves it is a downward drag — see `onPointerMove`.
       * Committing here is what turns every tap on a link into a dropped click.
       */
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scroller,
        captured: false,
        offset: 0,
        height: panel.getBoundingClientRect().height,
        samples: [{ y: event.clientY, t: event.timeStamp }],
      };
    },
    [isBusy, panelRef],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const dy = event.clientY - drag.startY;
      const dx = event.clientX - drag.startX;

      if (!drag.captured) {
        if (Math.abs(dy) < SHEET_SLOP_PX && Math.abs(dx) < SHEET_SLOP_PX) return;
        /*
         * Two ways to be handed back rather than taken. A gesture that is
         * mostly horizontal was never ours — the sheet has no lateral axis.
         * And an upward gesture that began in the content is a scroll: the
         * scroller is at the top, so the reader is starting to read, and this
         * is the exact moment a greedy handler would eat the first flick of
         * every session.
         */
        if (Math.abs(dx) > Math.abs(dy) || (drag.scroller !== null && dy < 0)) {
          dragRef.current = null;
          return;
        }
        drag.captured = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }

      drag.samples.push({ y: event.clientY, t: event.timeStamp });
      while (
        drag.samples.length > 2 &&
        event.timeStamp - drag.samples[0].t > SHEET_VELOCITY_WINDOW_MS
      ) {
        drag.samples.shift();
      }

      drag.offset = dy >= 0 ? dy : -overdrag(-dy);
      paint(drag.offset, drag.height);
    },
    [paint],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      // Never captured: a tap, or a scroll we declined. Nothing was moved and
      // nothing needs restoring — and crucially, no click was swallowed.
      if (!drag.captured) return;

      /*
       * `pointercancel` reaches here too, and by then the capture is already
       * gone. Releasing a pointer that is no longer captured throws, so ask
       * first rather than letting a cancelled gesture take the panel down with
       * it.
       */
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDragging(false);

      const first = drag.samples[0];
      const last = drag.samples[drag.samples.length - 1];
      const elapsed = last.t - first.t;
      const velocity = elapsed > 0 ? (last.y - first.y) / elapsed : 0;

      const isFarEnough = drag.offset >= drag.height * SHEET_DISMISS_FRACTION;
      const isFastEnough =
        velocity >= SHEET_FLICK_PX_PER_MS && drag.offset >= SHEET_FLICK_MIN_PX;
      if (!isFarEnough && !isFastEnough) {
        // Cancelled: drop the inline offset so the sheet sits at rest again.
        paint(null, drag.height);
        return;
      }

      /*
       * A full-height sheet steps back before it leaves.
       *
       * The reader scrolled to get here, which is a stronger signal of intent
       * than any single drag: they are reading this section. Throwing that away
       * on one gesture makes a long section feel precarious, and the cost of
       * being wrong is asymmetric — landing back at the peek height costs a
       * flick to undo, while dismissing costs a navigation, a lost scroll
       * position, and finding the row again.
       *
       * So the pull down is read as "give me less of this", and the answer to
       * that is less of it. Repeat the gesture and the second one closes, which
       * is the detent behaviour every phone sheet has taught people to expect.
       */
      if (isFull) {
        paint(null, drag.height);
        collapse();
        return;
      }

      /*
       * Finish the throw on the same channel that started it.
       *
       * `close` runs a class-driven exit, but a class cannot move a panel that
       * still has an inline `translate` on it from the drag — the inline value
       * wins, and the sheet would hang at the offset the finger left it at for
       * the whole exit and then blink out. So the gesture carries it the rest
       * of the way itself: keep the direct write, but hand the transition back
       * so the last stretch eases instead of jumping.
       *
       * Deliberately not `paint(null, ...)` — that returns the sheet home, and
       * home is the one place a dismissal must not go.
       */
      const panel = panelRef.current;
      if (panel) {
        panel.style.transitionProperty = "translate";
        panel.style.translate = `0 ${drag.height}px`;
      }
      const scrim = scrimRef.current;
      if (scrim) {
        scrim.style.transitionProperty = "opacity";
        scrim.style.opacity = "0";
      }
      close();
    },
    [close, collapse, isFull, paint, panelRef, scrimRef],
  );

  /**
   * Stop the browser from scrolling with a gesture we have taken.
   *
   * `DrawerFrame` is a scroll container, so on a touch screen the browser
   * decides at the start of the gesture whether the vertical movement belongs
   * to it. At the top of the scroll it will still claim a downward drag —
   * there is nowhere to scroll to, but the claim is made from `touch-action`,
   * not from the scroll position — and a claimed gesture arrives as
   * `pointercancel` a frame later. The sheet would follow the finger for one
   * frame and then let go, which is worse than not dragging at all.
   *
   * `preventDefault` on a non-passive `touchmove` is the only thing that takes
   * it back, and React attaches its own touch listeners as passive, so this has
   * to be a native one. It fires only once a drag is actually captured, so a
   * scroll we declined is never interfered with.
   *
   * Capture phase, on the panel: `children` remount as the section's Suspense
   * boundary resolves, and a listener bound to the scroller itself would be
   * pointing at a detached node by the time the content arrived.
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const keepTheGesture = (event: TouchEvent) => {
      if (dragRef.current?.captured && event.cancelable) event.preventDefault();
    };
    panel.addEventListener("touchmove", keepTheGesture, { passive: false, capture: true });
    return () => panel.removeEventListener("touchmove", keepTheGesture, { capture: true });
  }, [panelRef]);

  return { isDragging, onPointerDown, onPointerMove, onPointerUp };
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
 * `router.back()` in that case: the X still closes.
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
  // The drag lifts the dim in step with the sheet, so it needs to reach the
  // scrim's opacity directly — the same one-write-per-frame channel the panel
  // uses, for the same reason.
  const scrimRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  /*
   * Closing is tracked twice on purpose. The ref is the re-entry guard and has
   * to be correct synchronously -- two dismisses in one tick would both read a
   * state value that has not updated yet, and each would pop a history entry.
   * The state is what the render reads, because a ref mutation does not
   * schedule a re-render and the class below would silently never apply.
   */
  const isClosingRef = useRef(false);
  const [isClosing, setClosing] = useState(false);
  /*
   * False for exactly one frame, so the panel has an off-screen position to
   * transition FROM. Mounting straight into the resting classes gives the
   * browser no previous value to interpolate and the sheet simply appears --
   * which is not a subtle difference, it is the entire animation.
   */
  const [isVisible, setVisible] = useState(false);
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
  /*
   * The sheet's second height. Not the same thing as expand-to-page, which
   * leaves the overlay. See `SHEET_EXPAND_SCROLL_PX`.
   */
  const [isSheetFull, setSheetFull] = useState(false);

  /**
   * Dismiss: play the exit, then pop the history entry.
   *
   * The drawer is a URL, so `router.back()` is the close — and `back()`
   * unmounts the panel on the spot, which is why it has to be held rather than
   * called alongside the exit. There is no `transitionend` to wait on: a
   * transition on an element that is about to be removed is not guaranteed to
   * fire one, and a dismiss that depends on an event that may never arrive is a
   * drawer that never closes. A timer of the same length cannot get stuck.
   *
   * `DRAWER_EXIT_MS` is deliberately short. This is latency the reader pays on
   * every dismiss, so it buys the smallest slide that still reads as one.
   */
  const close = useCallback(() => {
    // Escape during the exit, a second click on the X, the backdrop under a
    // panel already on its way out — all reach here. Without the guard each
    // would queue another `back()` and pop further through the reader's
    // history than they asked for.
    if (isClosingRef.current) return;
    // Expand started first, so it keeps the click rather than racing a back().
    if (isExpandingRef.current) return;
    isClosingRef.current = true;
    setClosing(true);
    setVisible(false);

    /*
     * Nothing is animating under reduced motion, so there is nothing to wait
     * for; waiting anyway would just be a dead click for the reader least able
     * to interpret one.
     */
    const skipsMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (skipsMotion) {
      router.back();
      return;
    }
    exitTimer.current = setTimeout(() => router.back(), DRAWER_EXIT_MS);
  }, [router]);

  /**
   * Promote the rail to the whole page.
   *
   * ── Why a document navigation ──────────────────────────────────────────────
   *
   * The URL is already `/course/X?section=Y`; the rail is that route
   * intercepted. `router.push` to the same address is a no-op that leaves the
   * intercept standing. A document navigation is the way out of an intercepted
   * route -- the same mechanism the footer's "Full course page" link has always
   * used -- and it lands on the real page with the drawer gone.
   */
  const expand = useCallback((href: string) => {
    if (isExpandingRef.current || isClosingRef.current) return;
    isExpandingRef.current = true;
    window.location.href = href;
  }, []);

  /**
   * Back to the peek height, and back to the top of the section with it.
   *
   * The scroll position has to come too. Height follows scroll — that is the
   * whole rule — so returning the sheet to peek while the content stayed 400px
   * down would put the two in contradiction, and the listener below would
   * immediately grow it again on the next scroll event. Returning both makes
   * the collapse a real return to the state the sheet opened in.
   */
  const collapse = useCallback(() => {
    setSheetFull(false);
    panelRef.current
      ?.querySelector<HTMLElement>("[data-drawer-scroller]")
      ?.scrollTo({ top: 0 });
  }, []);

  /**
   * Let the off-screen position paint, then arrive.
   *
   * The flag has to flip in a later frame than the mount. Flipping it during
   * the same one lets the browser coalesce both positions into a single style
   * recalc, and a transition between two values the compositor never saw
   * separately is not a transition at all.
   *
   * The timer is not belt-and-braces. `requestAnimationFrame` only fires in a
   * document the browser is actually painting, so a drawer that mounts in a
   * hidden tab — restored on launch, opened in the background, woken out of
   * bfcache — would sit off-screen indefinitely and then be handed to a reader
   * who switched to it and found nothing but a scrim. Whichever lands first
   * wins; the second `setVisible(true)` is a no-op.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const fallback = setTimeout(() => setVisible(true), 80);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, []);

  /*
   * A held `back()` must not outlive the panel that scheduled it. Leaving the
   * page some other way during the exit — a link inside the drawer, the browser
   * back button — would otherwise fire a second navigation a moment later and
   * pop the reader one entry further than they asked for.
   */
  useEffect(() => {
    const pending = exitTimer;
    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
  }, []);

  /**
   * Height follows the scroll.
   *
   * Bound to the panel in the capture phase rather than to the scroller itself,
   * for two reasons. `scroll` does not bubble, so capture is the only way a
   * parent hears it at all. And the scroller is inside `children`, which React
   * unmounts and replaces when the section's Suspense boundary resolves — a
   * listener attached to the element directly would be holding a detached node
   * from the moment the real content arrived, which is roughly the moment the
   * reader starts scrolling.
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onScroll = (event: Event) => {
      const scroller = event.target;
      if (!(scroller instanceof HTMLElement)) return;
      /*
       * The sheet's own scroller, and nothing else inside it.
       *
       * Capture catches every descendant's scroll, and the section detail
       * contains at least one other: the week calendar scrolls itself to the
       * class's meeting hour the moment it mounts, which is a scroll to ~1024
       * arriving unprompted a few hundred milliseconds after the drawer opens.
       * Without this the sheet read that as "the reader is reading" and sprang
       * to full height before anyone had touched it — it never showed the peek
       * state at all.
       */
      if (!scroller.hasAttribute("data-drawer-scroller")) return;
      // Only the sheet has two heights. Above `sm` the panel is already full
      // height and there is nothing for a scroll to grow it into.
      if (window.matchMedia(SHEET_QUERY).matches) return;
      setSheetFull((full) => (full ? scroller.scrollTop > 0 : scroller.scrollTop > SHEET_EXPAND_SCROLL_PX));
    };
    panel.addEventListener("scroll", onScroll, true);
    return () => panel.removeEventListener("scroll", onScroll, true);
  }, []);

  /*
   * Both directions the panel can already be leaving in. A sheet that is
   * mid-exit or mid-expand is not a thing to grab: the first would race two
   * dismissals into the history stack, and the second is a panel on its way to
   * becoming a page, which has no bottom edge left to throw.
   */
  const {
    isDragging,
    onPointerDown: onSheetPointerDown,
    onPointerMove: onSheetPointerMove,
    onPointerUp: onSheetPointerUp,
  } = useSheetDrag({
    panelRef,
    scrimRef,
    close,
    collapse,
    isFull: isSheetFull,
    isBusy: isClosing,
  });

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
   * The page rides the drawer's own clock. The rail and the panel are one
   * movement — the drawer arrives into space the shell gives up for it — so
   * the two settling at different times reads as the layout catching up with
   * itself rather than as one gesture.
   */
  useEffect(() => {
    /*
     * Same handshake, second signal. `--drawer-rail` tells the page how much
     * width to give up; this tells the nav rail to stop being 260px wide while
     * that is happening, because the width has to come from somewhere and the
     * results are the thing being read against this panel.
     *
     * An attribute rather than another custom property: the sidebar swaps
     * structure, not just a length. See `useDrawerPush`.
     *
     * Stay reserved until unmount. Retracting on `isClosing` would snap the
     * page wider while the panel was still painted for one frame of navigation.
     */
    document.documentElement.toggleAttribute("data-drawer-push", isPushRail);

    if (!isPushRail) return;
    const root = document.documentElement.style;
    root.setProperty(
      "--drawer-rail",
      // The reader's width if they have set one, the opening bid otherwise.
      // Everything downstream — shell padding, results floor, nav collapse —
      // is computed from this one line.
      `calc(var(${RAIL_WIDTH_PROPERTY}, ${RAIL_WIDTH}) + ${RAIL_GAP} * 2)`,
    );
    root.setProperty("--drawer-push-duration", `${DRAWER_ENTER_MS}ms`);
  }, [isPushRail]);

  /*
   * Unmount-only, deliberately separate from the effect above: a cleanup that
   * ran on every rail-mode change would clear the property and re-set it in
   * the same tick, which is a frame of the page snapping back to full width.
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
     * Scroll-lock the page only when the panel is covering it.
     *
     * As a rail the panel sits beside the results, and the entire point is
     * that the list stays usable — freezing the thing the reader is comparing
     * against would give back the overlay's worst property while keeping none
     * of its reasons.
     *
     * Read from `matchMedia` here rather than from `isPushRail` so this stays
     * out of the effect's dependencies. Adding it would re-run the whole mount
     * effect on a resize: refocusing the panel in the middle of someone
     * dragging their window.
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
             * On the way out the drawer is a picture of itself. Leaving it
             * clickable while `router.back()` is in flight means a link inside
             * a panel that is already being dismissed can still be followed.
             */
            isClosing && "pointer-events-none",
          )}
          role="presentation"
        >
          <button
            ref={scrimRef}
            type="button"
            aria-label="Close section details"
            onClick={close}
            className={cx(
              "absolute inset-0 cursor-default bg-black/30 backdrop-blur-sm",
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
               * Linear, and slower in than out. The dim is not an object with
               * momentum, it is a light going down; easing it makes it read as
               * a thing that moved. It also outlasts the panel's own slide on
               * the way in, so the room is already dark by the time the sheet
               * lands rather than brightening underneath it.
               *
               * The drag writes `opacity` on this element directly and
               * suppresses this transition while it does — see `paint`.
               */
              "transition-opacity ease-linear motion-reduce:transition-none",
              isVisible && !isClosing ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDuration: `${isClosing ? DRAWER_EXIT_MS : DRAWER_ENTER_MS}ms` }}
          />

          <div
            ref={panelRef}
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerUp}
            onPointerCancel={onSheetPointerUp}
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
              /*
               * The second detent. Once the reader is scrolling, the 12% of
               * screen the peek was spending on the results behind is worth
               * more as section, so the sheet takes it — growing upward,
               * because the container is `items-end` and the content is
               * anchored to the top of its scroller, so the words being read do
               * not move while the sheet does.
               *
               * The corners square off with it. A rounded top edge against the
               * very top of the screen leaves two notches of scrim in the
               * corners, which reads as a rendering fault rather than as a
               * sheet — the radius is there to say "there is something behind
               * this", and at full height that is no longer the claim.
               *
               * `cx` is tailwind-merge, so these genuinely replace the peek
               * values above rather than racing them on specificity.
               *
               * The top inset only matters here. At the peek height the sheet
               * starts 12% down the screen and cannot reach a notch; at full
               * height its first 47px on a modern iPhone are behind the status
               * bar, which is exactly where the grab handle would land. Worth
               * nothing today — the viewport is not `viewport-fit=cover`, so
               * `env()` resolves to the fallback — and worth everything the day
               * it is, which is the argument for writing it now rather than
               * discovering it on a device.
               */
              isSheetFull &&
                "h-dvh rounded-t-none border-t-transparent pt-[env(safe-area-inset-top,0px)]",
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
               * `translate`, not `transform`.
               *
               * Tailwind v4 compiles `translate-y-*` to the standalone
               * `translate` property — the same one the drag writes, as the
               * note on `useSheetDrag` explains. An arbitrary list naming
               * `transform` compiles without complaint and then silently does
               * nothing, which is exactly how this entrance was lost once
               * already. If you touch this list, check the built CSS, not the
               * source.
               *
               * The other four are the detents: the sheet growing to full
               * height squares its corners off, and the desktop rail's width
               * is dragged by its edge handle.
               */
              "transition-[translate,height,border-radius,width,max-width]",
              /*
               * The axis switches with the shape. At `sm` and up `translate-y`
               * is pinned to 0 so `translate-x` alone drives the slide; below
               * `sm` no x-translate is set, so y alone drives it. One
               * transition, whichever axis is live.
               */
              isVisible && !isClosing
                ? "translate-y-0 sm:translate-x-0"
                : "translate-y-full sm:translate-y-0 sm:translate-x-full",
              // A width being dragged by a finger has no business easing.
              isResizing && "transition-none",
              "motion-reduce:transition-none",
            )}
            style={{
              /*
               * Inline rather than `duration-*`/`ease-*` classes because both
               * values differ between arriving and leaving, and a conditional
               * pair of utilities for each would be four classes racing
               * tailwind-merge to say what two numbers say plainly.
               *
               * Decelerate in, accelerate out: the panel settles into place
               * when it arrives and gets out of the way when it leaves.
               */
              transitionDuration: `${isClosing ? DRAWER_EXIT_MS : DRAWER_ENTER_MS}ms`,
              transitionTimingFunction: isClosing
                ? "cubic-bezier(0.4, 0, 1, 1)"
                : "var(--ease-out)",
            }}
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
              is announced with its current width and takes arrow keys.
            */}
            {isPushRail && !isClosing ? (
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
                    "transition-opacity duration-150",
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

          It is now also the thing it has always claimed to be. The strip is the
          one piece of chrome in the panel that is not inside a scroller —
          `DrawerFrame` is the entire body — so it is the only surface where a
          downward drag can never be ambiguous with reading. Content drags work
          too, but only from the top of the scroll; this always works.

          Hence the height. The pill stays 4px because that is the convention
          and a fatter one reads as a divider, but the strip around it is 26px
          of grabbable margin rather than the 20 it had, which is the difference
          between a target and a suggestion. `touch-none` so the browser does
          not claim the gesture as a scroll before the handler sees it.

          Still `aria-hidden`, and deliberately. Exposing it would announce a
          control that a screen reader cannot operate and that offers nothing
          Escape and the close button do not already do — see `useSheetDrag` on
          WCAG 2.5.7. A drag is a shortcut here, never the only door.
        */}
            <div
              aria-hidden
              className="flex shrink-0 cursor-grab touch-none justify-center pt-3 pb-2.5 active:cursor-grabbing sm:hidden"
            >
              <span
                className={cx(
                  "h-1 w-9 rounded-full transition-colors duration-150",
                  // Confirm the grab. Without it the only feedback that the
                  // sheet has been caught is the sheet moving, which is no help
                  // at the start of the gesture — the moment you most want to
                  // know whether you are dragging the panel or scrolling it.
                  isDragging ? "bg-text-tertiary" : "bg-border-table",
                )}
              />
            </div>

            {children}
          </div>
        </div>
      </DrawerExpandContext.Provider>
    </DrawerCloseContext.Provider>
  );
}

/**
 * Scroll area for drawer slot content. Close lives in the section header below.
 *
 * The `data-drawer-scroller` marker is how `CourseDrawer` finds this element to
 * return it to the top when the sheet collapses. An attribute rather than a ref
 * because the panel is mounted a layout above whatever renders this, and this
 * component is re-created whenever the section's Suspense boundary resolves —
 * the panel needs to be able to ask "where is the scroller now?" rather than to
 * have been handed one that may since have been thrown away.
 */
export function DrawerFrame({ children }: { children: ReactNode }) {
  return (
    <div
      data-drawer-scroller
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5"
    >
      {children}
    </div>
  );
}

/**
 * Dismiss, from wherever the close affordance is drawn.
 *
 * Prefers the panel's own `close` — which guards against a double `back()` —
 * and falls back to popping the history entry directly when no panel is above
 * us, as on the standalone page.
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
 * only so the intercepted route can leave via a document navigation -- if the
 * JS never loads, the link still goes to the right page.
 *
 * Modified clicks fall through untouched: hijacking a Cmd-click would navigate
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
 * Goes through `useDrawerClose` rather than `router.back()` so a second click
 * during navigation cannot pop further through history than the reader asked.
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
