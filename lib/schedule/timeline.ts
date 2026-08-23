/**
 * Schedule lane — timeline primitives.
 *
 * Everything on a week is reduced to a `TimedItem`: one meeting of one section,
 * or one non-course commitment. Conflict detection, commute analysis and the
 * week grid all read this single shape, so a custom block is never a second
 * class citizen — spec §8.
 *
 * Pure. No React, no browser APIs, no network. Safe to import from the MCP
 * server.
 */

import type { CustomBlock, Section, Weekday } from "../types";
import { ALL_WEEKDAYS } from "../constants";

export type TimedItemKind = "section" | "block";

export interface TimedItem {
  /** `sectionId` for a section meeting, `blockId` for a custom block. */
  id: string;
  kind: TimedItemKind;
  /** Human label, e.g. "COMS 4118 · 001" or "Work". */
  label: string;
  /** Present only for sections. Used for duplicate-course detection. */
  courseId: string | null;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  buildingName: string | null;
  room: string | null;
}

const WEEKDAY_ORDER: Record<Weekday, number> = Object.fromEntries(
  ALL_WEEKDAYS.map((day, index) => [day, index]),
) as Record<Weekday, number>;

/** "COMS4118W" → "COMS 4118". The trailing qualifier letter is noise on screen. */
export function courseLabel(courseId: string): string {
  const parsed = /^([A-Za-z]+)(\d+)([A-Za-z]*)$/.exec(courseId);
  if (!parsed) return courseId;
  return `${parsed[1]} ${parsed[2]}`;
}

/** "COMS 4118 · 001" — what a block on the grid is titled. */
export function sectionLabel(section: Section): string {
  return `${courseLabel(section.courseId)} · ${section.sectionCode}`;
}

/** Flattens sections and custom blocks into one comparable stream. */
export function toTimedItems(
  sections: readonly Section[],
  blocks: readonly CustomBlock[],
): TimedItem[] {
  const items: TimedItem[] = [];

  for (const section of sections) {
    for (const meeting of section.meetings) {
      // A meeting with no usable window cannot conflict with anything and
      // cannot be drawn. Drop it rather than emitting a zero-height artifact.
      if (meeting.endMinute <= meeting.startMinute) continue;
      items.push({
        id: section.sectionId,
        kind: "section",
        label: sectionLabel(section),
        courseId: section.courseId,
        weekday: meeting.weekday,
        startMinute: meeting.startMinute,
        endMinute: meeting.endMinute,
        buildingName: meeting.buildingName,
        room: meeting.room,
      });
    }
  }

  for (const block of blocks) {
    if (block.endMinute <= block.startMinute) continue;
    items.push({
      id: block.blockId,
      kind: "block",
      label: block.label,
      courseId: null,
      weekday: block.weekday,
      startMinute: block.startMinute,
      endMinute: block.endMinute,
      buildingName: null,
      room: null,
    });
  }

  return items.sort(compareTimedItems);
}

export function compareTimedItems(a: TimedItem, b: TimedItem): number {
  const byDay = WEEKDAY_ORDER[a.weekday] - WEEKDAY_ORDER[b.weekday];
  if (byDay !== 0) return byDay;
  if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
  if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute;
  return a.id.localeCompare(b.id);
}

/** Items grouped by weekday, each list sorted by start time. */
export function groupByWeekday(items: readonly TimedItem[]): Map<Weekday, TimedItem[]> {
  const byDay = new Map<Weekday, TimedItem[]>();
  for (const item of items) {
    const list = byDay.get(item.weekday);
    if (list) list.push(item);
    else byDay.set(item.weekday, [item]);
  }
  for (const list of byDay.values()) list.sort(compareTimedItems);
  return byDay;
}

/** Half-open intervals: a class ending at 2:25 does not clash with one starting at 2:25. */
export function overlaps(a: TimedItem, b: TimedItem): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/** Minutes of overlap between two items on the same day. Zero when disjoint. */
export function overlapMinutes(a: TimedItem, b: TimedItem): number {
  return Math.max(0, Math.min(a.endMinute, b.endMinute) - Math.max(a.startMinute, b.startMinute));
}
