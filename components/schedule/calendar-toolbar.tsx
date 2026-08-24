/**
 * Ported from Nuxt Calendar Template (MIT)
 * `app/pages/[view]/[date].vue` header.
 */

import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";
import { cx } from "@/utils/cx";
import { addDays, addMonths, formatMonth, formatRangeTitle, startOfWeek } from "./calendar-date";
import type { CalendarView } from "./calendar-types";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export function CalendarToolbar({
  cursor,
  view,
  onViewChange,
  onCursorChange,
  onToday,
  trailing,
}: {
  cursor: Date;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onCursorChange: (date: Date) => void;
  onToday: () => void;
  trailing?: React.ReactNode;
}) {
  const rangeStart = view === "week" ? startOfWeek(cursor) : cursor;
  const rangeEnd = addDays(rangeStart, view === "day" ? 1 : 7);
  const title =
    view === "month"
      ? { months: formatMonth(cursor), year: String(cursor.getFullYear()) }
      : formatRangeTitle({ start: rangeStart, end: rangeEnd });

  const step = (direction: -1 | 1) => {
    if (view === "month") onCursorChange(addMonths(cursor, direction));
    else if (view === "week") onCursorChange(addDays(cursor, direction * 7));
    else onCursorChange(addDays(cursor, direction));
  };

  return (
    <header
      className={cx(
        "calendar-glass absolute inset-x-0 top-0 z-10 border-b border-border-table bg-(--glass-bg)",
        "flex flex-wrap items-center gap-x-2 gap-y-2 px-3 pt-2 pb-2 sm:gap-3 sm:px-4",
        "min-h-[calc(var(--ui-header-height)+0.5rem)]",
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-background-primary-default from-40% to-transparent" />

      {/*
        `flex-1` (zero basis) is deliberate: this group is the only thing on the
        line that grows, so it soaks up the leftover instead of forcing a wrap.
        Giving it an `auto` basis instead makes it demand its content width up
        front, which pushes the nav group onto a second row — and since the
        header is `absolute` with a fixed min-height, that second row lands
        underneath the calendar's day headings.

        The title's width therefore comes entirely from what the other two
        leave behind. See the SegmentedControl below for why that is enough.
      */}
      <div className="flex min-w-[8rem] flex-1 items-baseline gap-1.5">
        <h1 className="flex min-w-0 items-baseline gap-1.5 text-lg tracking-tight sm:text-xl lg:text-2xl">
          <span className="truncate font-bold text-text-primary">{title.months}</span>
          {/*
            The year appears only once the line can actually afford it.

            It costs ~63px with its gap, and the calendar column narrows faster
            than the viewport does — at 1150px the toolbar has 514px to spend
            and the title group is left with 139. Showing the year there meant
            "September" clipped to make room for a number that is the same on
            every screen of the app. `xl` is the first width where the month
            name and the year both fit whole.
          */}
          <span className="hidden font-normal text-text-tertiary xl:inline">{title.year}</span>
        </h1>
      </div>

      <SegmentedControl
        selectedKeys={[view]}
        onSelectionChange={(keys) => {
          const next = [...(keys as Set<string>)][0];
          if (next === "day" || next === "week" || next === "month") onViewChange(next);
        }}
        aria-label="Calendar view"
        /*
          `lg:w-44`, down from `w-48`.

          This control is the only fixed-width item on the line, so it is the
          only place the title can get room from. At 1211px the row needed
          546px inside a 543px line, and the title — the one shrinkable item —
          paid the difference by clipping "September" to "Septem…".

          176px still leaves "Day | Week | Month" comfortable (its natural
          content is ~150px); the 16px handed back is what keeps the month name
          whole. `sm:mx-auto` never centres anything while the group on the
          left has flex-grow — grow consumes the free space before auto margins
          are offered any — but it is harmless and correct for the wrapped
          layout below `sm`, where the control is `w-full` on its own row.
        */
        className="order-last w-full sm:order-0 sm:mx-auto sm:w-40 lg:w-44"
      >
        {VIEWS.map((item) => (
          <SegmentedControlItem key={item.id} id={item.id} aria-label={item.label}>
            <span className="sm:hidden">{item.label.charAt(0)}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </SegmentedControlItem>
        ))}
      </SegmentedControl>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Button
          size="small"
          variant="secondary"
          iconOnly
          leadingIcon={RiArrowLeftSLine}
          aria-label="Previous"
          onClick={() => step(-1)}
          className="rounded-full"
        />
        <Button size="small" variant="secondary" onClick={onToday} className="rounded-full">
          Today
        </Button>
        <Button
          size="small"
          variant="secondary"
          iconOnly
          leadingIcon={RiArrowRightSLine}
          aria-label="Next"
          onClick={() => step(1)}
          className="rounded-full"
        />
        <div className={cx("hidden items-center gap-1 @3xl:flex")}>{trailing}</div>
      </div>
    </header>
  );
}
