/**
 * Local-date maths for the schedule calendar.
 *
 * Every function here is timezone-naive: we build `Date`s from year/month/day
 * so a class that meets on Monday never slides to Sunday because the machine
 * is in UTC-7. The Nuxt template is Monday-first; we match that so the month
 * grid lines up with the screenshot the student is comparing against.
 */

import type { Weekday } from "../../lib/types";
import { minutesToLabel } from "../../lib/constants";

/** Monday-first order used by the Nuxt calendar and by this one. */
export const WEEK_STARTS_MON: Weekday[] = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const FROM_JS: Weekday[] = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Single-letter headers: M T W T F S S. */
export const WEEKDAY_LETTER: Record<Weekday, string> = {
  Mo: "M",
  Tu: "T",
  We: "W",
  Th: "T",
  Fr: "F",
  Sa: "S",
  Su: "S",
};

export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromISODate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Bad calendar date: ${iso}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function weekdayOf(date: Date): Weekday {
  return FROM_JS[date.getDay()];
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b);
}

export function isToday(date: Date, today = new Date()): boolean {
  return isSameDay(date, today);
}

/** Monday of the week that contains `date`. */
export function startOfWeek(date: Date): Date {
  const jsDay = date.getDay();
  const offset = jsDay === 0 ? -6 : 1 - jsDay;
  return addDays(date, offset);
}

export function daysOfWeek(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/**
 * Six Monday-first weeks covering `date`'s month. Always 42 cells so the
 * month canvas never changes height as you page.
 */
export function monthGrid(date: Date): Date[] {
  const start = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * Formatters from the Nuxt template `app/utils/dates.ts`. Constructing a
 * formatter costs far more than formatting with it, and these run once per
 * event chip and per day cell of every rendered week.
 */
const weekdayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long" });
const shortMonthFormat = new Intl.DateTimeFormat("en-US", { month: "short" });
const shortMonthYearFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

export function formatTime(date: Date): string {
  return minutesToLabel(date.getHours() * 60 + date.getMinutes());
}

/** Hour gutter label — on the hour, no minutes: `5pm`, not `17:00`. */
export function formatHour(hour: number): string {
  const ampm = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${ampm}`;
}

export function formatWeekday(date: Date): string {
  return weekdayFormat.format(date);
}

export function formatMonth(date: Date): string {
  return monthFormat.format(date);
}

export function formatShortMonth(date: Date): string {
  return shortMonthFormat.format(date);
}

export function formatMonthYear(date: Date): string {
  return `${formatMonth(date)} ${date.getFullYear()}`;
}

export function formatWeekdayLong(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
}

export function formatWeekdayShort(date: Date): string {
  return weekdayFormat.format(date);
}

/** The day a grid cell stands for, as the `data-date` a gesture reads back. */
export function isoDate(date: Date): string {
  return toISODate(date);
}

export interface RangeTitle {
  months: string;
  year: string;
}

/** Week / day title: one month, or `Sep – Oct` when the range crosses. */
export function formatRangeTitle({ start, end }: { start: Date; end: Date }): RangeTitle {
  const last = addDays(end, -1);
  const year = String(last.getFullYear());
  if (start.getMonth() === last.getMonth()) {
    return { months: monthFormat.format(start), year };
  }
  const startMonth = (
    start.getFullYear() !== last.getFullYear() ? shortMonthYearFormat : shortMonthFormat
  ).format(start);
  return { months: `${startMonth} – ${shortMonthFormat.format(last)}`, year };
}

/**
 * Land on today when it sits inside the term; otherwise the first day of
 * instruction. Opening Fall 2026 in August must not show an empty month.
 */
export function clampToTerm(today: Date, startsOn: string, endsOn: string): Date {
  const start = fromISODate(startsOn);
  const end = fromISODate(endsOn);
  if (today.getTime() < start.getTime() || today.getTime() > end.getTime()) return start;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function inRange(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}
