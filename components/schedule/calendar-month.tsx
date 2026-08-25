/**
 * Ported from Nuxt Calendar Template (MIT)
 * `app/components/calendar/MonthView.vue` — the SSR fallback grid.
 *
 * Their live view virtualizes ±5 years of week rows. We paint the six weeks
 * the route fetch covers (plus the weekday glass bar) so the month reads
 * the same without their `UScrollArea` virtualizer.
 */

import { addDays, addWeeks, startOfMonth, startOfWeek } from "date-fns";
import { formatWeekday } from "./calendar-date";
import { CalendarMonthWeek } from "./calendar-month-week";
import type { CalendarEvent } from "./calendar-types";

const WEEKDAY_HEIGHT = 40;
const HEADER_PADDING = 8;
const HEADER_HEIGHT = 64;
const CHROME_HEIGHT = HEADER_PADDING + HEADER_HEIGHT + WEEKDAY_HEIGHT;
const MONTH_WEEKS = 6;

export function CalendarMonth({
  cursor,
  events,
  onSelectDay,
  onEditCommitment,
  onClassClick,
}: {
  cursor: Date;
  events: readonly CalendarEvent[];
  onSelectDay: (date: Date) => void;
  onEditCommitment?: (eventId: string, anchor: { top: number; left: number }) => void;
  onClassClick?: (event: CalendarEvent, anchor: { top: number; left: number }) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const weeks = Array.from({ length: MONTH_WEEKS }, (_, index) => addWeeks(start, index));
  const weekdays = Array.from({ length: 7 }, (_, index) => formatWeekday(addDays(start, index)));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto" style={{ paddingTop: `${CHROME_HEIGHT}px` }}>
        {weeks.map((week) => (
          <CalendarMonthWeek
            key={week.getTime()}
            weekStart={week}
            events={events}
            onSelectDay={onSelectDay}
            onEditCommitment={onEditCommitment}
            onClassClick={onClassClick}
          />
        ))}
      </div>

      <div
        className="calendar-glass absolute inset-x-0 z-30 grid h-10 grid-cols-7 border-b border-border-table bg-(--glass-bg)"
        style={{ top: "calc(var(--ui-header-height) + 0.5rem)" }}
      >
        {weekdays.map((weekday, index) => (
          <span
            key={weekday}
            className={`flex items-center justify-end pe-2 text-body-regular text-text-tertiary ${index !== 0 ? "border-s border-border-table" : ""}`}
          >
            {weekday}
          </span>
        ))}
      </div>
    </div>
  );
}
