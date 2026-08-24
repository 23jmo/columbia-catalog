/**
 * Expand weekday-only week-grid blocks into the Nuxt `CalendarEvent` shape.
 *
 * A section that meets Mon/Wed becomes two events per week, clipped to the
 * term's first and last day of instruction so we never invent a class in
 * August or after finals. Color is stable per owner so COMS 4118 is always
 * the same chip across the month.
 */

import { ownerIdOf } from "./to-blocks";
import type { CalendarColor, CalendarEvent, CalendarLayers, SourcedBlock } from "./calendar-types";
import { addDays, eachDay, fromISODate, isoDate, weekdayOf } from "./calendar-date";
import { toLocalISO } from "./calendar-time";
import type { Weekday } from "@/lib/types";

export const CALENDAR_COLORS: CalendarColor[] = ["blue", "purple", "lime", "emerald", "pink"];

/** Deterministic palette slot so the same course never changes colour. */
export function colorFor(ownerId: string): CalendarColor {
  let hash = 0;
  for (let i = 0; i < ownerId.length; i += 1) {
    hash = (hash * 31 + ownerId.charCodeAt(i)) >>> 0;
  }
  return CALENDAR_COLORS[hash % CALENDAR_COLORS.length];
}

/** Local `Date` at `minute` past midnight on `day`. */
function atMinute(day: Date, minute: number): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minute / 60),
    minute % 60,
    0,
  );
}

/** First calendar day on or after `anchor` that falls on `weekday`. */
export function firstWeekdayOnOrAfter(anchor: Date, weekday: Weekday): Date {
  let day = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  for (let index = 0; index < 7; index += 1) {
    if (weekdayOf(day) === weekday) return day;
    day = addDays(day, 1);
  }
  return anchor;
}

function eventFromBlock(
  block: SourcedBlock["block"],
  layer: SourcedBlock["layer"],
  day: Date,
): CalendarEvent {
  const ownerId = ownerIdOf(block.blockId);
  return {
    id: `${block.blockId}@${isoDate(day)}`,
    calendarId: ownerId,
    title: block.label,
    description: block.sublabel ?? undefined,
    start: toLocalISO(atMinute(day, block.startMinute)),
    end: toLocalISO(atMinute(day, block.endMinute)),
    color: layer === "historical" ? "purple" : colorFor(ownerId),
    layer,
    tone: block.tone,
  };
}

/**
 * One preview occurrence per block — the first in-term day matching its weekday.
 *
 * `expandEvents` walks a calendar range and clips days before instruction
 * starts. Fall often begins on a Wednesday, so mapping Tu/Th onto the week
 * *containing* term start puts Tuesday before `startsOn` and drops it. A
 * section preview only needs one representative day per weekday, so we anchor
 * each block on the first matching day on or after term start instead.
 */
export function previewEventsFromBlocks(
  sourced: readonly SourcedBlock[],
  termStart: string,
  termEnd: string,
): CalendarEvent[] {
  const start = fromISODate(termStart);
  const end = fromISODate(termEnd);
  const events: CalendarEvent[] = [];

  for (const { block, layer } of sourced) {
    if (block.endMinute <= block.startMinute) continue;
    const day = firstWeekdayOnOrAfter(start, block.weekday);
    if (day.getTime() > end.getTime()) continue;
    events.push(eventFromBlock(block, layer, day));
  }

  return events;
}

/**
 * One event per (block × matching weekday) inside `[rangeStart, rangeEnd]`,
 * further clipped to the term so a visible August grid stays empty until
 * instruction actually starts.
 */
export function expandEvents(
  sourced: readonly SourcedBlock[],
  rangeStart: Date,
  rangeEnd: Date,
  termStart: string,
  termEnd: string,
): CalendarEvent[] {
  const start = maxDate(rangeStart, fromISODate(termStart));
  const end = minDate(rangeEnd, fromISODate(termEnd));
  if (start.getTime() > end.getTime()) return [];

  const events: CalendarEvent[] = [];
  for (const day of eachDay(start, end)) {
    const weekday = weekdayOf(day);
    for (const { block, layer } of sourced) {
      if (block.weekday !== weekday) continue;
      if (block.endMinute <= block.startMinute) continue;
      const ownerId = ownerIdOf(block.blockId);
      events.push({
        id: `${block.blockId}@${isoDate(day)}`,
        calendarId: ownerId,
        title: block.label,
        description: block.sublabel ?? undefined,
        start: toLocalISO(atMinute(day, block.startMinute)),
        end: toLocalISO(atMinute(day, block.endMinute)),
        color: layer === "historical" ? "purple" : colorFor(ownerId),
        layer,
        tone: block.tone,
      });
    }
  }
  return events;
}

export function filterEvents(
  events: readonly CalendarEvent[],
  layers: CalendarLayers,
  query: string,
): CalendarEvent[] {
  const needle = query.trim().toLowerCase();
  return events.filter((event) => {
    if (!layers[event.layer]) return false;
    if (!needle) return true;
    return (
      event.title.toLowerCase().includes(needle) ||
      (event.description ?? "").toLowerCase().includes(needle)
    );
  });
}

export function eventsOnDate(events: readonly CalendarEvent[], date: string): CalendarEvent[] {
  return events
    .filter((event) => isoDate(new Date(event.start)) === date)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

export function datesWithEvents(events: readonly CalendarEvent[]): Set<string> {
  return new Set(events.map((event) => isoDate(new Date(event.start))));
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}
