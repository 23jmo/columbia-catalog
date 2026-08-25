"use client";

/**
 * Inline mini month — BoardUI day cells, sized to the rail width.
 *
 * MonthPanel is 296px fixed; this inlines the same grid with a fluid table
 * so nothing clips in the 288px sidebar or on a phone.
 */

import { useContext } from "react";
import {
  Button as RACButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
} from "react-aria-components";
import { getLocalTimeZone } from "@internationalized/date";
import { ChevronLeft16, ChevronRight16, DayCell } from "@/components/base/date-picker/shared";
import { fromCalendarDate, toCalendarDate } from "./calendar-date-bridge";

function MiniMonthHeader() {
  const state = useContext(CalendarStateContext);
  if (!state) return null;

  const title = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    state.visibleRange.start.toDate(getLocalTimeZone()),
  );

  return (
    <div className="flex items-center justify-between gap-1">
      {/*
        28px steppers. They sit at opposite ends of the row with the month
        title between them, so each can take the full 44px on a touch device
        without the two hit areas ever meeting.
      */}
      <RACButton
        slot="previous"
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-background-secondary-hover pointer-coarse:size-11"
      >
        <ChevronLeft16 />
      </RACButton>
      <span className="min-w-0 flex-1 truncate text-center text-body-medium text-text-primary">
        {title}
      </span>
      <RACButton
        slot="next"
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-background-secondary-hover pointer-coarse:size-11"
      >
        <ChevronRight16 />
      </RACButton>
    </div>
  );
}

export function CalendarMiniMonth({
  cursor,
  selected,
  onSelect,
  onMonthChange,
}: {
  cursor: Date;
  selected: Date;
  onSelect: (date: Date) => void;
  onMonthChange: (date: Date) => void;
}) {
  const value = toCalendarDate(selected);
  const focused = toCalendarDate(cursor);

  return (
    <div className="w-full rounded-2xl bg-background-primary-default p-3 shadow-xs">
      <Calendar
        aria-label="Mini calendar"
        className="w-full"
        value={value}
        onChange={(next) => next && onSelect(fromCalendarDate(next))}
        focusedValue={focused}
        onFocusChange={(next) => next && onMonthChange(fromCalendarDate(next))}
        firstDayOfWeek="mon"
      >
        <div className="flex w-full flex-col gap-3">
          <MiniMonthHeader />
          <CalendarGrid
            weekdayStyle="short"
            className="w-full table-fixed border-separate outline-none"
            style={{ borderSpacing: "0 2px" }}
          >
            <CalendarGridHeader>
              {(day) => (
                <CalendarHeaderCell className="pb-1 text-center text-caption-1-medium text-text-secondary">
                  {day.slice(0, 2)}
                </CalendarHeaderCell>
              )}
            </CalendarGridHeader>
            {/*
              `CalendarCell` is the pressable element; `DayCell` inside it is a
              fixed 32px square that draws the pill. Padding on the cell
              therefore grows the target without touching the artwork — 42
              adjacent 49×32 cells is the densest grid of taps in the app, and
              12px of vertical padding takes each to 44 while the 2px
              `borderSpacing` keeps rows from colliding. The month gets ~72px
              taller on a phone, which is the price of hitting the day you meant.
            */}
            <CalendarGridBody>
              {(date) => (
                <CalendarCell date={date} className="p-0 outline-none pointer-coarse:py-1.5">
                  {(cellProps) => <DayCell {...cellProps} isRange={false} />}
                </CalendarCell>
              )}
            </CalendarGridBody>
          </CalendarGrid>
        </div>
      </Calendar>
    </div>
  );
}
