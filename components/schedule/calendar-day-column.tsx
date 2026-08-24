"use client";

/**
 * Ported from Nuxt Calendar Template (MIT)
 * `app/components/calendar/DayColumn.vue`
 *
 * Drag on empty space to draft a custom commitment on the snapped grid.
 * Double-click still opens a one-hour block for quick entry.
 */

import { isToday } from "date-fns";
import { useRef, useState } from "react";
import { isoDate } from "./calendar-date";
import {
  defaultEndMinute,
  minutesAtPointer,
  rangeFromDrag,
} from "./calendar-commitment";
import { EventBlock } from "./calendar-event";
import {
  HOUR_HEIGHT,
  PX_PER_MINUTE,
  eventBlockStyle,
  type PositionedEvent,
} from "./calendar-layout";
import { NowIndicator } from "./calendar-now";
import type { CalendarEvent } from "./calendar-types";
import { cx } from "@/utils/cx";

/** Vertical movement before a press becomes a drag instead of a scroll. */
const DRAG_THRESHOLD_PX = 6;

type DragState = {
  pointerId: number;
  anchorMinute: number;
  currentMinute: number;
};

export function DayColumn({
  day,
  events,
  draft,
  onCreateAtPointer,
  onEditCommitment,
  onClassClick,
}: {
  day: Date;
  events: PositionedEvent[];
  draft?: { startMinute: number; endMinute: number } | null;
  onCreateAtPointer?: (
    day: Date,
    startMinute: number,
    endMinute: number,
    anchor: { top: number; left: number },
  ) => void;
  onEditCommitment?: (eventId: string, anchor: { top: number; left: number }) => void;
  onClassClick?: (event: CalendarEvent, anchor: { top: number; left: number }) => void;
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<{ pointerId: number; startY: number; anchorMinute: number } | null>(
    null,
  );
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const minuteAt = (clientY: number) => {
    const rect = columnRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return minutesAtPointer(clientY, rect.top);
  };

  const clearDrag = () => {
    dragRef.current = null;
    pendingRef.current = null;
    setDrag(null);
  };

  const finishDrag = (clientX: number, clientY: number) => {
    const active = dragRef.current;
    clearDrag();
    if (!active || !onCreateAtPointer) return;
    const { startMinute, endMinute } = rangeFromDrag(
      active.anchorMinute,
      active.currentMinute,
    );
    onCreateAtPointer(day, startMinute, endMinute, { top: clientY, left: clientX });
  };

  const dragDraft = drag ? rangeFromDrag(drag.anchorMinute, drag.currentMinute) : null;
  const visibleDraft = draft ?? dragDraft;

  return (
    <div
      ref={columnRef}
      data-day-column
      data-date={isoDate(day)}
      className={cx(
        "relative snap-start border-s border-border-table",
        onCreateAtPointer && "touch-none select-none",
        drag && "cursor-ns-resize",
      )}
      style={{ height: `${24 * HOUR_HEIGHT}px` }}
      onDoubleClick={(event) => {
        if (!onCreateAtPointer) return;
        const target = event.target as HTMLElement;
        if (target.closest("[data-event]")) return;
        const startMinute = minuteAt(event.clientY);
        onCreateAtPointer(day, startMinute, defaultEndMinute(startMinute), {
          top: event.clientY,
          left: event.clientX,
        });
      }}
      onPointerDown={(event) => {
        if (!onCreateAtPointer || event.button !== 0) return;
        const target = event.target as HTMLElement;
        if (target.closest("[data-event]")) return;
        pendingRef.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          anchorMinute: minuteAt(event.clientY),
        };
      }}
      onPointerMove={(event) => {
        const pending = pendingRef.current;
        if (pending?.pointerId === event.pointerId && !dragRef.current) {
          if (Math.abs(event.clientY - pending.startY) < DRAG_THRESHOLD_PX) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const next: DragState = {
            pointerId: event.pointerId,
            anchorMinute: pending.anchorMinute,
            currentMinute: pending.anchorMinute,
          };
          pendingRef.current = null;
          dragRef.current = next;
          setDrag(next);
          return;
        }

        if (dragRef.current?.pointerId !== event.pointerId) return;
        const currentMinute = minuteAt(event.clientY);
        dragRef.current = { ...dragRef.current, currentMinute };
        setDrag({ ...dragRef.current });
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          finishDrag(event.clientX, event.clientY);
          return;
        }
        pendingRef.current = null;
      }}
      onPointerCancel={(event) => {
        if (
          dragRef.current?.pointerId === event.pointerId &&
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        clearDrag();
      }}
    >
      {Array.from({ length: 23 }, (_, index) => index + 1).map((hour) => (
        <div
          key={hour}
          className="pointer-events-none absolute inset-x-0 snap-start border-t border-border-table"
          style={{ top: `${hour * HOUR_HEIGHT}px` }}
        />
      ))}

      {events.map((positioned) => (
        <EventBlock
          key={positioned.event.id}
          positioned={positioned}
          onCommitmentClick={
            positioned.event.layer === "commitment" && onEditCommitment
              ? (anchor) => onEditCommitment(positioned.event.id, anchor)
              : undefined
          }
          onClassClick={onClassClick}
        />
      ))}

      {visibleDraft ? (
        <div
          aria-hidden
          className={cx(
            "pointer-events-none absolute z-4 rounded-xs border-2 border-dashed border-lime-500/60",
            "bg-lime-500/10",
          )}
          style={eventBlockStyle({
            event: {
              id: "draft",
              calendarId: "",
              title: "",
              start: "",
              end: "",
              color: "lime",
              layer: "commitment",
              tone: "plan",
            },
            top: visibleDraft.startMinute * PX_PER_MINUTE,
            height: (visibleDraft.endMinute - visibleDraft.startMinute) * PX_PER_MINUTE,
            left: 0,
            width: 100,
          })}
        />
      ) : null}

      {isToday(day) ? <NowIndicator /> : null}
    </div>
  );
}
