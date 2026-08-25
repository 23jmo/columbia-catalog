/**
 * Helpers for calendar-native custom blocks (commitments).
 *
 * Events expand to `${blockId}@${isoDate}`; editing recovers the block id
 * from that string. Pointer math lives next to layout constants.
 */

import {
  DAY_MINUTES,
  MIN_EVENT_MINUTES,
  PX_PER_MINUTE,
  SNAP_MINUTES,
} from "./calendar-layout";

/** Recover the recurring block id from an expanded occurrence id. */
export function blockIdFromEventId(eventId: string): string {
  const at = eventId.lastIndexOf("@");
  return at === -1 ? eventId : eventId.slice(0, at);
}

/** Snap a Y coordinate inside a day column to grid minutes. */
export function minutesAtPointer(clientY: number, rectTop: number): number {
  const raw = (clientY - rectTop) / PX_PER_MINUTE;
  const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.min(DAY_MINUTES - MIN_EVENT_MINUTES, Math.max(0, snapped));
}

/** Default one-hour block starting at the snapped minute. */
export function defaultEndMinute(startMinute: number): number {
  return Math.min(startMinute + 60, DAY_MINUTES);
}

/**
 * Normalize a drag selection to a valid commitment range.
 * Dragging up or down both work; shorter drags expand to the painted minimum.
 */
export function rangeFromDrag(startMinute: number, endMinute: number): {
  startMinute: number;
  endMinute: number;
} {
  const start = Math.min(startMinute, endMinute);
  let end = Math.max(startMinute, endMinute);
  if (end - start < MIN_EVENT_MINUTES) {
    end = Math.min(start + MIN_EVENT_MINUTES, DAY_MINUTES);
  }
  return { startMinute: start, endMinute: end };
}

export function parseTimeInput(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatTimeInput(minute: number): string {
  const hours = Math.floor(minute / 60);
  const mins = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** Human duration for the card badge — "1h", "30m", "1h 15m". */
export function formatDuration(startMinute: number, endMinute: number): string {
  const total = Math.max(0, endMinute - startMinute);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

/** Keep a floating card inside the viewport. */
export function clampAnchor(
  top: number,
  left: number,
  width = 320,
  height = 280,
): { top: number; left: number } {
  const pad = 12;
  if (typeof window === "undefined") return { top, left };
  return {
    top: Math.min(Math.max(pad, top), window.innerHeight - height - pad),
    left: Math.min(Math.max(pad, left), window.innerWidth - width - pad),
  };
}

/** Hold duration before touch can start a commitment drag. */
export const LONG_PRESS_MS = 450;

/** Finger movement that cancels a hold before it arms. */
export const HOLD_CANCEL_PX = 12;

export function pointerMovedBeyondHold(
  startX: number,
  startY: number,
  x: number,
  y: number,
  cancelPx = HOLD_CANCEL_PX,
): boolean {
  return Math.hypot(x - startX, y - startY) >= cancelPx;
}
