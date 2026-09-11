/**
 * Haptics for a horizontal card throw.
 *
 * Motion's `onDragStart` runs after direction-lock, often on a later
 * turn than the touch — `navigator.vibrate` and the iOS switch both
 * need the gesture that is still happening. We listen to the touch
 * ourselves and tick on the first horizontal lock.
 */

import { haptic } from "./index";
import { noteTouch } from "./ios";

const LOCK_PX = 10;

export function bindSwipeHaptics(el: HTMLElement): () => void {
  let startX = 0;
  let startY = 0;
  let armed = false;
  let locked = false;

  const down = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    armed = true;
    locked = false;
    startX = touch.clientX;
    startY = touch.clientY;
    noteTouch(touch.clientX, touch.clientY);
  };

  const move = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch || !armed) return;
    noteTouch(touch.clientX, touch.clientY);
    if (locked) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.hypot(dx, dy) < LOCK_PX) return;
    // Vertical travel is a scroll. Do not tick.
    if (Math.abs(dx) <= Math.abs(dy)) {
      armed = false;
      return;
    }
    locked = true;
    haptic("selection");
  };

  const up = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    if (touch) noteTouch(touch.clientX, touch.clientY);
    armed = false;
  };

  el.addEventListener("touchstart", down, { passive: true });
  el.addEventListener("touchmove", move, { passive: true });
  el.addEventListener("touchend", up, { passive: true });
  el.addEventListener("touchcancel", up, { passive: true });

  return () => {
    el.removeEventListener("touchstart", down);
    el.removeEventListener("touchmove", move);
    el.removeEventListener("touchend", up);
    el.removeEventListener("touchcancel", up);
  };
}
