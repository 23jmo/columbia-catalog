/**
 * Bridge native calendar `Date`s (timezone-naive, local wall clock) and
 * BoardUI's `@internationalized/date` `CalendarDate` used by DatePicker.
 */

import { CalendarDate } from "@internationalized/date";

export function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function fromCalendarDate(value: CalendarDate): Date {
  return new Date(value.year, value.month - 1, value.day);
}
