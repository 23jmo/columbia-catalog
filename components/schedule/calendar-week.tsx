/**
 * Ported from Nuxt Calendar Template (MIT)
 * `app/components/calendar/WeekView.vue`
 *
 * Day view is the same grid with one column. The day opens at 7am: a first
 * paint pulls the grid up by that much, then the client swaps the pull for
 * a real scroll so a reload never flashes the small hours.
 */

"use client";

import { differenceInCalendarDays, isToday } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/utils/cx";
import { formatHour, formatWeekday, isoDate } from "./calendar-date";
import { DayColumn } from "./calendar-day-column";
import { EventChip } from "./calendar-event";
import { eventsOnDate } from "./calendar-events";
import { HOUR_HEIGHT, layoutAllDay, layoutDay } from "./calendar-layout";
import type { CalendarEvent } from "./calendar-types";

const DAY_HEADER_HEIGHT = 41;
const ALL_DAY_LANE_HEIGHT = 28;
const ALL_DAY_ROW_BORDER = 1;
const START_OFFSET = 7 * HOUR_HEIGHT;
const HOURS = Array.from({ length: 23 }, (_, index) => index + 1);

export function CalendarWeek({
  days,
  events,
  onSelectDay,
  draftDayKey,
  draftMinutes,
  onCreateAtPointer,
  onEditCommitment,
  onClassClick,
}: {
  days: Date[];
  events: readonly CalendarEvent[];
  onSelectDay: (date: Date) => void;
  draftDayKey?: string | null;
  draftMinutes?: { startMinute: number; endMinute: number } | null;
  onCreateAtPointer?: (day: Date, startMinute: number, endMinute: number, anchor: { top: number; left: number }) => void;
  onEditCommitment?: (eventId: string, anchor: { top: number; left: number }) => void;
  onClassClick?: (event: CalendarEvent, anchor: { top: number; left: number }) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    setMounted(true);
    const node = container.current;
    if (!node) return;
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener("change", sync);
    // Their WeekView waits a tick so the 7am scroll lands in the same flush
    // that drops the SSR pull — otherwise a reload paints midnight first.
    const frame = requestAnimationFrame(() => {
      node.scrollTo({ top: START_OFFSET });
    });
    return () => {
      media.removeEventListener("change", sync);
      cancelAnimationFrame(frame);
    };
  }, []);

  const visible = useMemo(() => {
    if (days.length <= 3 || !mounted || !narrow) return days;
    const anchor = days.find((day) => isToday(day)) ?? days[0];
    const start = Math.min(
      Math.max(differenceInCalendarDays(anchor, days[0]), 0),
      days.length - 3,
    );
    return days.slice(start, start + 3);
  }, [days, mounted, narrow]);

  const gridStyle = { gridTemplateColumns: `3.5rem repeat(${visible.length}, minmax(0, 1fr))` };
  const timed = visible.map((day) =>
    layoutDay(eventsOnDate(events, isoDate(day)).filter((event) => !event.allDay), day),
  );
  const allDay = layoutAllDay(events.filter((event) => event.allDay), visible);
  const allDayLanes = allDay.reduce((lanes, { lane }) => Math.max(lanes, lane + 1), 1);
  const chromeHeight = DAY_HEADER_HEIGHT + allDayLanes * ALL_DAY_LANE_HEIGHT + ALL_DAY_ROW_BORDER;
  const chromeOffset = `calc(var(--ui-header-height) + 0.5rem + ${chromeHeight}px)`;
  const startPull = `calc(-1 * clamp(0px, ${START_OFFSET}px, ${24 * HOUR_HEIGHT}px + ${chromeOffset} - 100svh))`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        style={{ scrollPaddingTop: chromeOffset }}
        className="z-0 min-h-0 flex-1 snap-y snap-proximity overflow-auto"
      >
        <div
          data-week-grid
          className="grid"
          style={{ ...gridStyle, paddingTop: chromeOffset, marginTop: mounted ? undefined : startPull }}
        >
          <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute end-2 -translate-y-1/2 text-[11px] text-text-tertiary tabular-nums"
                style={{ top: `${hour * HOUR_HEIGHT}px` }}
              >
                {formatHour(hour)}
              </span>
            ))}
          </div>
          {visible.map((day, index) => (
            <DayColumn
              key={day.getTime()}
              day={day}
              events={timed[index]!}
              draft={
                draftDayKey === isoDate(day) && draftMinutes ? draftMinutes : null
              }
              onCreateAtPointer={onCreateAtPointer}
              onEditCommitment={onEditCommitment}
              onClassClick={onClassClick}
            />
          ))}
        </div>
      </div>

      <div
        className="calendar-glass absolute inset-x-0 z-30 border-b border-border-table bg-(--glass-bg)"
        style={{ top: "calc(var(--ui-header-height) + 0.5rem)" }}
      >
        <div className="grid" style={gridStyle}>
          <div />
          {visible.map((day) => (
            <button
              key={day.getTime()}
              type="button"
              onClick={() => onSelectDay(day)}
              className="flex items-center justify-center gap-1 border-s border-border-table py-2 text-sm"
            >
              <span className="text-text-tertiary">{formatWeekday(day)}</span>
              <span
                className={cx(
                  "flex size-6 items-center justify-center rounded-full font-semibold",
                  isToday(day) ? "bg-accent-500 text-white" : "text-text-primary",
                )}
              >
                {day.getDate()}
              </span>
            </button>
          ))}
        </div>

        <div
          className="grid border-t border-border-table"
          style={{ ...gridStyle, gridTemplateRows: `repeat(${allDayLanes}, ${ALL_DAY_LANE_HEIGHT}px)` }}
        >
          <span className="row-span-full self-center pe-2 text-end text-[10px] text-text-tertiary">
            all-day
          </span>
          {visible.map((day, index) => (
            <div
              key={`all-day-${day.getTime()}`}
              data-date={isoDate(day)}
              className="row-span-full border-s border-border-table"
              style={{ gridColumn: index + 2 }}
            />
          ))}
          {allDay.map(({ event, colStart, colSpan, lane }) => (
            <EventChip
              key={event.id}
              event={event}
              onCommitmentClick={
                event.layer === "commitment" && onEditCommitment
                  ? (anchor) => onEditCommitment(event.id, anchor)
                  : undefined
              }
              onClassClick={onClassClick}
              className="mx-1 mt-1 h-5"
              style={{ gridColumn: `${colStart + 2} / span ${colSpan}`, gridRow: lane + 1 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
