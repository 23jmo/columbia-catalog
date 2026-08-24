/**
 * Ported from Nuxt Calendar Template (MIT)
 * https://github.com/nuxt-ui-templates/calendar
 * `app/utils/calendars.ts`
 *
 * Static class maps so Tailwind sees the full class names at build time.
 * Their `primary` / `info` / … tokens are remapped onto BoardUI calendar
 * event tokens — same structure, tokens that flip under `.dark`.
 */

import type { CalendarColor } from "./calendar-types";

export const eventBlockClasses: Record<CalendarColor, string> = {
  blue: "bg-calendar-event-blue-background hover:bg-calendar-event-blue-background/80 data-active:bg-calendar-event-blue-background/80 text-calendar-event-blue-title",
  pink: "bg-calendar-event-pink-background hover:bg-calendar-event-pink-background/80 data-active:bg-calendar-event-pink-background/80 text-calendar-event-pink-title",
  purple:
    "bg-calendar-event-purple-background hover:bg-calendar-event-purple-background/80 data-active:bg-calendar-event-purple-background/80 text-calendar-event-purple-title",
  lime: "bg-calendar-event-lime-background hover:bg-calendar-event-lime-background/80 data-active:bg-calendar-event-lime-background/80 text-calendar-event-lime-title",
  emerald:
    "bg-calendar-event-emerald-background hover:bg-calendar-event-emerald-background/80 data-active:bg-calendar-event-emerald-background/80 text-calendar-event-emerald-title",
};

export const eventChipCompactClasses: Record<CalendarColor, string> = {
  blue: "max-lg:bg-calendar-event-blue-background max-lg:text-calendar-event-blue-title",
  pink: "max-lg:bg-calendar-event-pink-background max-lg:text-calendar-event-pink-title",
  purple: "max-lg:bg-calendar-event-purple-background max-lg:text-calendar-event-purple-title",
  lime: "max-lg:bg-calendar-event-lime-background max-lg:text-calendar-event-lime-title",
  emerald: "max-lg:bg-calendar-event-emerald-background max-lg:text-calendar-event-emerald-title",
};

export const calendarDotClasses: Record<CalendarColor, string> = {
  blue: "bg-calendar-event-blue-title",
  pink: "bg-calendar-event-pink-title",
  purple: "bg-calendar-event-purple-title",
  lime: "bg-calendar-event-lime-title",
  emerald: "bg-calendar-event-emerald-title",
};

export function colorDotClass(color: CalendarColor): string {
  return calendarDotClasses[color];
}
