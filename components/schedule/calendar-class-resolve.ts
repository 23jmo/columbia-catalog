/**
 * Resolve a calendar class/historical event back to plan data for the popover.
 */

import type { CampusRouteStop } from "@/components/campus/contracts";
import type { CommuteLegDetail, PlanAnalysisDetail } from "@/lib/schedule";
import { toTimedItems, type TimedItem } from "@/lib/schedule/timeline";
import type { CustomBlock, Section, Weekday } from "@/lib/types";
import { minutesToLabel } from "@/lib/constants";
import { weekdayOf } from "./calendar-date";
import type { CalendarEvent } from "./calendar-types";

export function sectionIdFromEvent(event: CalendarEvent): string | null {
  if (event.layer === "class") return event.calendarId;
  if (event.layer === "historical") {
    const match = /^typical:(.+):\d+$/.exec(event.calendarId);
    return match?.[1] ?? null;
  }
  return null;
}

export function weekdayFromEvent(event: CalendarEvent): Weekday {
  return weekdayOf(new Date(event.start));
}

export function timedItemsForDay(
  weekday: Weekday,
  sections: readonly Section[],
  blocks: readonly CustomBlock[],
): TimedItem[] {
  return toTimedItems(sections, blocks)
    .filter((item) => item.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
}

export function commuteLegsForDay(
  weekday: Weekday,
  ownerId: string,
  analysis: PlanAnalysisDetail | null,
): CommuteLegDetail[] {
  if (!analysis) return [];
  return analysis.commuteLegs.filter(
    (leg) => leg.weekday === weekday && (leg.fromId === ownerId || leg.toId === ownerId),
  );
}

export function routeStopsForDay(
  weekday: Weekday,
  sections: readonly Section[],
  blocks: readonly CustomBlock[],
  highlightOwnerId: string,
): CampusRouteStop[] {
  return timedItemsForDay(weekday, sections, blocks).map((item) => ({
    buildingNames: item.buildingName ? [item.buildingName] : [],
    label: item.label,
    meta: `${minutesToLabel(item.startMinute)}–${minutesToLabel(item.endMinute)}`,
    highlighted: item.id === highlightOwnerId,
  }));
}

export function resolveSection(
  sectionId: string | null,
  sections: readonly Section[],
): Section | undefined {
  if (!sectionId) return undefined;
  return sections.find((section) => section.sectionId === sectionId);
}
