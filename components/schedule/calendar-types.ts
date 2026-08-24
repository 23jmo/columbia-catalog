/**
 * Shared calendar contract from the Nuxt Calendar Template
 * (`shared/types/index.d.ts`), plus the Columbia layers we hang off it.
 *
 * Their events are floating local datetimes (`start` / `end`), not weekday
 * minutes. Expansion from our week-grid blocks lives in `calendar-events.ts`.
 */

import type { WeekGridBlock } from "@/components/course/contracts";

/** The three canvases the toolbar switches. */
export type CalendarView = "day" | "week" | "month";

/**
 * Visibility layers in the left rail. A student can hide historical guesses
 * without dropping the classes they actually registered for.
 */
export type CalendarLayer = "class" | "commitment" | "historical";

/** BoardUI calendar-event token families, used like their `Calendar.color`. */
export type CalendarColor = "blue" | "pink" | "purple" | "lime" | "emerald";

/** Half-open `[start, end)` — the same range shape their `dates.ts` uses. */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * One occurrence. `start` / `end` are floating local ISO (`yyyy-MM-ddTHH:mm:00`),
 * the same strings their `toLocalISO` writes so `new Date()` stays on the
 * viewer's clock.
 */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay?: boolean;
  color: CalendarColor;
  layer: CalendarLayer;
  tone: WeekGridBlock["tone"];
}

/** A week-grid rectangle plus the layer it belongs to. */
export interface SourcedBlock {
  block: WeekGridBlock;
  layer: CalendarLayer;
}

export interface CalendarLayers {
  class: boolean;
  commitment: boolean;
  historical: boolean;
}
