/**
 * When an edge swipe on the mobile rail counts as open or closed.
 *
 * Same idea as the feed's swipe verdict: a slow drag is gated on distance,
 * a flick is gated on velocity. Direction of a flick always wins, so a
 * student who means "close" is not held open by a half-travel release.
 */

/** Parked rail width. Keep in lockstep with `w-[260px]` in mobile-nav. */
export const RAIL_PX = 260;

/** Past this fraction of the rail, a slow drag settles open. */
export const RAIL_OPEN_RATIO = 0.45;

/** px/s. A flick this fast commits even if the drag was short. */
export const RAIL_FLICK_PX_S = 500;

/**
 * `true` means settle open. Velocity is px/s, positive = toward open.
 */
export function railSnap(offsetX: number, velocityX: number): boolean {
  if (velocityX >= RAIL_FLICK_PX_S) return true;
  if (velocityX <= -RAIL_FLICK_PX_S) return false;
  return offsetX >= RAIL_PX * RAIL_OPEN_RATIO;
}

export function clampRail(offsetX: number): number {
  if (offsetX < 0) return 0;
  if (offsetX > RAIL_PX) return RAIL_PX;
  return offsetX;
}
