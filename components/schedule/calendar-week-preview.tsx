"use client";

/**
 * Read-only week canvas for embedded previews (section drawer, course detail).
 *
 * Reuses the same Nuxt `DayColumn` / `EventBlock` drawing as `CalendarWeek`
 * on the schedule tab. Scrolls to the fitted time window so a 6pm class is
 * not buried under a full-day canvas.
 */

import { useEffect, useMemo, useRef } from "react";

import type { WeekGridBlock } from "@/components/course/contracts";
import { buildTerm } from "@/lib/constants";
import type { TermCode, Weekday } from "@/lib/types";
import { termBounds } from "@/lib/schedule";
import { cx } from "@/utils/cx";

import { AgendaList } from "./agenda-list";
import { DayColumn } from "./calendar-day-column";
import {
  formatHour,
  formatWeekday,
  fromISODate,
  isoDate,
} from "./calendar-date";
import { eventsOnDate, previewEventsFromBlocks, firstWeekdayOnOrAfter } from "./calendar-events";
import "./calendar-glass.css";
import { HOUR_HEIGHT, layoutDay } from "./calendar-layout";
import type { SourcedBlock } from "./calendar-types";
import { fitGridBounds, gridWeekdays, ownerIdOf } from "./to-blocks";

const HOURS = Array.from({ length: 23 }, (_, index) => index + 1);
const GUTTER = "3.5rem";
const HEADER_HEIGHT = 41;
const MAX_VIEWPORT_HEIGHT = 420;

export interface CalendarWeekPreviewProps {
  blocks: WeekGridBlock[];
  weekdays?: Weekday[];
  termCode: TermCode;
  commitmentIds?: ReadonlySet<string>;
  compact?: boolean;
  className?: string;
}

function blocksToSourced(
  blocks: WeekGridBlock[],
  commitmentIds: ReadonlySet<string>,
): SourcedBlock[] {
  return blocks.map((block) => ({
    block,
    layer: commitmentIds.has(ownerIdOf(block.blockId)) ? "commitment" : "class",
  }));
}

export function CalendarWeekPreview({
  blocks,
  weekdays,
  termCode,
  commitmentIds = new Set(),
  compact = false,
  className,
}: CalendarWeekPreviewProps) {
  const bounds = fitGridBounds(blocks);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { days, events } = useMemo(() => {
    const term = buildTerm(termCode);
    const { startsOn, endsOn } = termBounds(termCode, term);
    const termStart = fromISODate(startsOn);
    const order = gridWeekdays(blocks, weekdays);
    const sourced = blocksToSourced(blocks, commitmentIds);
    return {
      days: order.map((weekday) => firstWeekdayOnOrAfter(termStart, weekday)),
      events: previewEventsFromBlocks(sourced, startsOn, endsOn),
    };
  }, [blocks, weekdays, termCode, commitmentIds]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const top = Math.max(0, bounds.startMinute * (HOUR_HEIGHT / 60) - HOUR_HEIGHT);
    node.scrollTo({ top });
  }, [bounds.startMinute, days.length]);

  if (compact) return <AgendaList blocks={blocks} className={className} />;

  if (blocks.length === 0) {
    return (
      <div
        className={cx(
          "w-full rounded-2lg border border-dashed border-border-button-default bg-background-secondary-default p-8 text-center",
          className,
        )}
      >
        <p className="text-body-medium text-text-primary">Nothing on these days yet</p>
        <p className="mt-1 text-caption-1-regular text-text-secondary">
          Add sections to your plan and they appear here alongside this preview.
        </p>
      </div>
    );
  }

  const columns = days.length;
  const gridStyle = { gridTemplateColumns: `${GUTTER} repeat(${columns}, minmax(0, 1fr))` };
  const bodyHeight = 24 * HOUR_HEIGHT;
  const visibleHours = (bounds.endMinute - bounds.startMinute) / 60 + 1;
  const viewportHeight = Math.min(visibleHours * HOUR_HEIGHT, MAX_VIEWPORT_HEIGHT - HEADER_HEIGHT);

  const timed = days.map((day) =>
    layoutDay(eventsOnDate(events, isoDate(day)).filter((event) => !event.allDay), day),
  );

  return (
    <div
      className={cx(
        "calendar-root relative w-full overflow-hidden rounded-2lg border border-border-table bg-background-primary-default",
        className,
      )}
    >
      <div className="calendar-glass border-b border-border-table bg-(--glass-bg)">
        <div className="grid" style={gridStyle}>
          <div aria-hidden />
          {days.map((day) => (
            <div
              key={day.getTime()}
              className="flex items-center justify-center gap-1 border-s border-border-table py-2 text-body-regular"
            >
              <span className="text-text-tertiary">{formatWeekday(day)}</span>
              <span className="flex size-6 items-center justify-center rounded-full text-body-semibold text-text-primary">
                {day.getDate()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight: viewportHeight }}
      >
        <div className="grid" style={{ ...gridStyle, height: bodyHeight }}>
          <div aria-hidden className="relative" style={{ height: bodyHeight }}>
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute end-2 -translate-y-1/2 text-caption-2-regular tabular-nums text-text-tertiary"
                style={{ top: `${hour * HOUR_HEIGHT}px` }}
              >
                {formatHour(hour)}
              </span>
            ))}
          </div>

          {days.map((day, index) => (
            <DayColumn key={day.getTime()} day={day} events={timed[index]!} />
          ))}
        </div>
      </div>
    </div>
  );
}
