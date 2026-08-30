"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { animate, useMotionValue, useReducedMotion } from "motion/react";

import { haptic } from "@/lib/haptics";

import { RAIL_PX, clampRail, railSnap } from "./rail-swipe";

const LOCK_PX = 10;
const EASE = [0.32, 0.72, 0, 1] as const;

const DESKTOP_MQ = "(min-width: 1280px)";

function isDesktop(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_MQ).matches;
}

function isSwipeCard(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-swipe-card]") != null;
}

/**
 * Edge-swipe the mobile page card over the parked rail.
 *
 * Closed: only the left-edge strip starts a drag, so a feed swipe in the
 * middle of the page never opens the rail. Open: the card (and the rail
 * itself) can be dragged shut, except on a feed card that already owns x.
 */
export function useRailSwipe() {
  const [isOpen, setIsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);

  const origin = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const lastX = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const locked = useRef(false);
  const active = useRef(false);

  const settle = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      setDragging(false);
      void animate(x, open ? RAIL_PX : 0, {
        duration: reduceMotion ? 0 : 0.4,
        ease: EASE,
      });
    },
    [reduceMotion, x],
  );

  const setOpen = useCallback(
    (open: boolean) => {
      haptic("selection");
      settle(open);
    },
    [settle],
  );

  const toggle = useCallback(() => {
    setOpen(!isOpen);
  }, [isOpen, setOpen]);

  // Nav dest already ticked on the press. Just park the rail.
  const close = useCallback(() => settle(false), [settle]);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MQ);
    const onChange = () => {
      if (media.matches) settle(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settle]);

  const finish = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    if (!locked.current) {
      setDragging(false);
      return;
    }
    const open = railSnap(x.get(), velocity.current);
    haptic("selection");
    settle(open);
    // Swallow the click that would otherwise fire on the finger-up target.
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, true), 400);
  }, [settle, x]);

  const begin = useCallback(
    (event: ReactPointerEvent, from: number) => {
      if (isDesktop()) return;
      active.current = true;
      locked.current = false;
      origin.current = from;
      startX.current = event.clientX;
      startY.current = event.clientY;
      lastX.current = event.clientX;
      lastT.current = event.timeStamp;
      velocity.current = 0;

      const onMove = (move: PointerEvent) => {
        if (!active.current) return;
        const dx = move.clientX - startX.current;
        const dy = move.clientY - startY.current;
        const now = move.timeStamp;
        const dt = Math.max(now - lastT.current, 1);
        velocity.current = ((move.clientX - lastX.current) / dt) * 1000;
        lastX.current = move.clientX;
        lastT.current = now;

        if (!locked.current) {
          if (Math.hypot(dx, dy) < LOCK_PX) return;
          // Vertical travel is a page scroll. Leave it alone.
          if (Math.abs(dy) > Math.abs(dx)) {
            active.current = false;
            return;
          }
          // Closed rail only opens to the right.
          if (from === 0 && dx < 0) {
            active.current = false;
            return;
          }
          locked.current = true;
          setDragging(true);
          haptic("selection");
        }
        x.set(clampRail(origin.current + dx));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        finish();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [finish, x],
  );

  const onEdgeDown = useCallback(
    (event: ReactPointerEvent) => {
      if (isOpen) return;
      begin(event, 0);
    },
    [begin, isOpen],
  );

  const onCardDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!isOpen) return;
      if (isSwipeCard(event.target)) return;
      begin(event, RAIL_PX);
    },
    [begin, isOpen],
  );

  const onRailDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!isOpen) return;
      begin(event, RAIL_PX);
    },
    [begin, isOpen],
  );

  return { x, isOpen, dragging, setOpen, toggle, close, onEdgeDown, onCardDown, onRailDown };
}
