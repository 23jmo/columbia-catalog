"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { FocusEvent, PointerEvent } from "react";

/**
 * The open/close machine behind a hover card.
 *
 * Extracted from `EnrollmentChip`, which invented it for the seat history and
 * got a surprising number of small things right. `InstructorChip` needs the
 * identical behaviour — the instructor card was specified as "a hover card like
 * the seat chart" — and a second copy of a machine this fiddly would be a
 * standing invitation for the two to drift apart on the exact edges that took
 * work to get right the first time.
 *
 * ── Why a popover and not a tooltip ────────────────────────────────────────
 *
 * A react-aria tooltip surface is `pointer-events-none` by design: moving the
 * cursor toward it dismisses it. That is correct for a sentence of help text
 * and wrong for a 200px chart or a table of ratings, where the natural next
 * move after the card appears is to move onto it and read it.
 *
 * So the caller renders a non-modal `Popover` and drives it with this: entering
 * the trigger OR the surface opens it, leaving either one schedules a close a
 * beat later, and re-entering cancels that close. The delay is what carries the
 * cursor across the gap between the two. It also picks up two things a tooltip
 * could not do — click toggles, so a touch device gets the card instead of
 * nothing, and the card can hold selectable text and links.
 */

/**
 * Long enough to cross the gap between the trigger and the card without the
 * cursor having to be quick about it, short enough that a card left behind on
 * the way past does not linger. Also covers the diagonal path — leaving the
 * trigger sideways before arriving at the card's top edge.
 */
const CLOSE_GRACE_MS = 220;

export interface HoverCardOptions {
  /**
   * Fired every time the card opens, for callers that fetch their contents
   * lazily. Callers are expected to be idempotent — this is deliberately not
   * a "first open only" hook, because "have I loaded yet" is a question the
   * caller's own state already answers and duplicating it here would create
   * two versions of the truth.
   */
  onOpen?: () => void;
}

export interface HoverCard {
  isOpen: boolean;
  /** For `<Popover onOpenChange>` — Escape and outside clicks arrive here. */
  setIsOpen: (open: boolean) => void;
  /** Spread onto the trigger. */
  triggerProps: {
    "aria-expanded": boolean;
    onPointerEnter: (event: PointerEvent) => void;
    onPointerLeave: (event: PointerEvent) => void;
    onClick: () => void;
    onFocus: (event: FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
  /** Spread onto an element wrapping the popover's contents. */
  surfaceProps: {
    onPointerEnter: (event: PointerEvent) => void;
    onPointerLeave: (event: PointerEvent) => void;
  };
  /**
   * Full-screen tap target on coarse pointers. Hover-to-open on a mouse must
   * not hit a layer between the chip and the card, so this is `hidden` except
   * on touch, where tap-outside is the only way to put the chart away.
   */
  dismissLayer: ReactNode;
}

export function useHoverCard({ onOpen }: HoverCardOptions = {}): HoverCard {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // A pending close must not fire after unmount — the drawer can be dismissed
  // with the card open, and `setIsOpen` on a gone component is a leak.
  useEffect(() => cancelClose, [cancelClose]);

  const open = useCallback(() => {
    cancelClose();
    setIsOpen(true);
    onOpen?.();
  }, [cancelClose, onOpen]);

  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setIsOpen(false), CLOSE_GRACE_MS);
  }, [cancelClose]);

  /*
   * Hover opens only for a real pointing device. On touch, `pointerenter` fires
   * on tap immediately before `click`, so honouring it here would open the card
   * and then have the click toggle it straight back shut.
   */
  const onPointerEnter = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      open();
    },
    [open],
  );

  const onPointerLeave = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      closeSoon();
    },
    [closeSoon],
  );

  /*
   * Focus opens the card ONLY for keyboard focus.
   *
   * A bare `onFocus` looks right and is a reopen loop: react-aria's popover
   * restores focus to its trigger when it closes, that restore fires `focus` on
   * the trigger, and the handler opens the card the mouse just left. It closes,
   * restores, reopens, forever.
   *
   * `:focus-visible` is exactly the distinction that fixes it — the browser
   * already tracks whether focus arrived by keyboard or by a pointer or
   * programmatic restore, so asking it is both the smallest fix and the correct
   * semantic: the `onFocus` path exists for tab users, and a mouse user
   * restoring focus is not asking for anything.
   */
  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      try {
        if (!event.target.matches(":focus-visible")) return;
      } catch {
        return; // Environments without :focus-visible support (jsdom) opt out.
      }
      open();
    },
    [open],
  );

  const onClick = useCallback(() => {
    if (isOpen) {
      cancelClose();
      setIsOpen(false);
      return;
    }
    open();
  }, [cancelClose, isOpen, open]);

  return {
    isOpen,
    setIsOpen,
    triggerProps: {
      "aria-expanded": isOpen,
      onPointerEnter,
      onPointerLeave,
      onClick,
      // Keyboard reaches the same card: focus opens it, moving focus away or
      // Escape closes it.
      onFocus,
      onBlur: closeSoon,
    },
    surfaceProps: { onPointerEnter, onPointerLeave },
    dismissLayer: isOpen ? (
      <div
        aria-hidden
        className="pointer-coarse:block fixed inset-0 z-40 hidden"
        onPointerDown={(event) => {
          event.preventDefault();
          cancelClose();
          setIsOpen(false);
        }}
      />
    ) : null,
  };
}

/**
 * The card surface itself, so every hover card in the drawer is the same
 * object: same radius, same shadow, same blur-and-scale as the tooltip family.
 */
export const HOVER_CARD_SURFACE = [
  "z-50 rounded-2lg border border-border-button-default p-3",
  "bg-background-primary-default text-text-primary shadow-dropdown",
  "transition duration-200 ease-out",
  /*
   * Reduced motion drops the movement, not the feedback. `transition-none`
   * here used to kill the scale, the opacity AND the blur at once, so the card
   * popped in at full contrast. Suppressing only the scale and blur leaves the
   * fade, which is the part that aids comprehension rather than decorating.
   */
  "motion-reduce:data-[entering]:scale-100 motion-reduce:data-[exiting]:scale-100",
  "motion-reduce:data-[entering]:blur-none motion-reduce:data-[exiting]:blur-none",
  /*
   * Grow out of the trigger, not out of the card's own middle. React Aria
   * stamps `data-placement` with the resolved side, so the origin follows the
   * card when it flips to avoid a viewport edge.
   *
   * Edge origins rather than corners because `data-placement` carries only the
   * base side -- the `start` / `end` alignment never reaches the attribute, so
   * `origin-top-left` would be right for the instructor chip (`bottom start`)
   * and wrong for the seat chip (`bottom end`). Same shape as the dropdown
   * family at components/base/dropdown/menu-styles.ts.
   */
  "data-[placement=bottom]:origin-top data-[placement=top]:origin-bottom",
  "data-[placement=left]:origin-right data-[placement=right]:origin-left",
  "data-[entering]:scale-95 data-[entering]:opacity-0 data-[entering]:blur-[4px]",
  "data-[exiting]:scale-95 data-[exiting]:opacity-0 data-[exiting]:blur-[4px]",
].join(" ");
