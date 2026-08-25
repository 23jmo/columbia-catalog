/**
 * Ported from Nuxt Calendar Template (MIT)
 * `app/components/calendar/MonthWeek.vue`
 *
 * A week is one grid: the day numbers, then a fixed stack of slots each day
 * fills on its own. All-day bars span columns; timed chips fill the slots
 * the day's bars leave free. The last free slot becomes "+N more".
 */

import { Fragment } from "react";
import { addDays, isToday } from "date-fns";
import { cx } from "@/utils/cx";
import { formatShortMonth, isoDate } from "./calendar-date";
import { EventChip } from "./calendar-event";
import { eventsOnDate } from "./calendar-events";
import { layoutAllDay } from "./calendar-layout";
import type { CalendarEvent } from "./calendar-types";

const SLOT_HEIGHT = 22;
const MAX_SLOTS = 4;
const MAX_LANES = MAX_SLOTS - 1;

const GRID_ROWS = [
  "auto",
  ...Array.from({ length: MAX_LANES }, () => `${SLOT_HEIGHT}px`),
  `minmax(${SLOT_HEIGHT}px, 1fr)`,
].join(" ");

export function CalendarMonthWeek({
  weekStart,
  events,
  onSelectDay,
  onEditCommitment,
  onClassClick,
}: {
  weekStart: Date;
  events: readonly CalendarEvent[];
  onSelectDay: (date: Date) => void;
  onEditCommitment?: (eventId: string, anchor: { top: number; left: number }) => void;
  onClassClick?: (event: CalendarEvent, anchor: { top: number; left: number }) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekEnd = addDays(weekStart, 7);
  const bars = layoutAllDay(
    events.filter((event) => event.allDay),
    days,
  ).filter((bar) => bar.lane < MAX_LANES);

  return (
    <div
      className="grid min-w-0 grid-cols-7 border-b border-border-table"
      style={{ height: 140, gridTemplateRows: GRID_ROWS }}
    >
      {days.map((day, index) => (
        <div
          key={`day-${day.getTime()}`}
          data-date={isoDate(day)}
          className={cx("row-span-full border-border-table", index !== 0 && "border-s")}
          style={{ gridColumn: index + 1 }}
        />
      ))}

      {days.map((day, index) => (
        <button
          key={`number-${day.getTime()}`}
          type="button"
          onClick={() => onSelectDay(day)}
          className={cx(
            "row-start-1 m-0.5 inline-flex h-6 min-w-6 justify-self-end rounded-full px-1 py-1 text-caption-1-semibold",
            "items-center justify-center select-none transition-colors focus-visible:outline-3",
            isToday(day)
              ? "bg-accent-500 text-white"
              : "text-text-primary hover:bg-(--control-bg)",
          )}
          style={{ gridColumn: index + 1 }}
        >
          {day.getDate() === 1 ? `${formatShortMonth(day)} 1` : day.getDate()}
        </button>
      ))}

      {bars.map(({ event, colStart, colSpan, lane }) => (
        <EventChip
          key={event.id}
          event={event}
          onCommitmentClick={
            event.layer === "commitment" && onEditCommitment
              ? (anchor) => onEditCommitment(event.id, anchor)
              : undefined
          }
          onClassClick={onClassClick}
          className={cx(
            "mx-0.5 self-start",
            new Date(event.start) < weekStart && "rounded-s-none",
            new Date(event.end) > weekEnd && "rounded-e-none",
          )}
          style={{ gridColumn: `${colStart + 1} / span ${colSpan}`, gridRow: lane + 2 }}
        />
      ))}

      {days.map((day, index) => {
        const occupied = new Set(bars.filter((bar) => index >= bar.colStart && index < bar.colStart + bar.colSpan).map((bar) => bar.lane));
        const free = Array.from({ length: MAX_SLOTS }, (_, slot) => slot).filter((slot) => !occupied.has(slot));
        const timed = eventsOnDate(events, isoDate(day)).filter((event) => !event.allDay);
        const overflows = timed.length > free.length;
        const visible = timed.slice(0, overflows ? Math.max(free.length - 1, 0) : free.length);
        const moreSlot = free[visible.length];
        const hidden = timed.length - visible.length;

        return (
          <Fragment key={`events-${day.getTime()}`}>
            {visible.map((event, position) => (
              <EventChip
                key={event.id}
                event={event}
                showTime
                onCommitmentClick={
                  event.layer === "commitment" && onEditCommitment
                    ? (anchor) => onEditCommitment(event.id, anchor)
                    : undefined
                }
                onClassClick={onClassClick}
                className="mx-0.5 self-start max-lg:**:data-time:hidden"
                style={{ gridColumn: index + 1, gridRow: (free[position] ?? 0) + 2 }}
              />
            ))}
            {overflows && moreSlot !== undefined ? (
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className="mx-0.5 self-start px-1.5 py-0.5 text-start text-caption-1-regular text-text-tertiary"
                style={{ gridColumn: index + 1, gridRow: moreSlot + 2 }}
              >
                <span className="lg:hidden">+{hidden}</span>
                <span className="hidden lg:inline">+{hidden} more</span>
              </button>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
