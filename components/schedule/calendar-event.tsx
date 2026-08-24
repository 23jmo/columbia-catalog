/**
 * Ported from Nuxt Calendar Template (MIT)
 * `app/components/calendar/EventChip.vue` and `EventBlock.vue`.
 *
 * Class times stay read-only toward Columbia. Commitment blocks open the
 * inline editor on click; drag/resize are not ported yet.
 */

import { cx } from "@/utils/cx";
import { calendarDotClasses, eventBlockClasses, eventChipCompactClasses } from "./calendar-colors";
import { formatTime } from "./calendar-date";
import { eventBlockStyle, type PositionedEvent } from "./calendar-layout";
import type { CalendarEvent } from "./calendar-types";

export { colorDotClass } from "./calendar-colors";

export function EventChip({
  event,
  showTime = false,
  className,
  style,
  onCommitmentClick,
  onClassClick,
}: {
  event: CalendarEvent;
  showTime?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onCommitmentClick?: (anchor: { top: number; left: number }) => void;
  onClassClick?: (event: CalendarEvent, anchor: { top: number; left: number }) => void;
}) {
  const color = event.color;
  const commitment = event.layer === "commitment" && onCommitmentClick;
  const classEvent =
    (event.layer === "class" || event.layer === "historical") && onClassClick;
  const clickable = commitment || classEvent;
  return (
    <button
      type="button"
      data-event
      style={style}
      onClick={
        commitment
          ? (click) => {
              click.stopPropagation();
              onCommitmentClick({ top: click.clientY, left: click.clientX });
            }
          : classEvent
            ? (click) => {
                click.stopPropagation();
                onClassClick(event, { top: click.clientY, left: click.clientX });
              }
            : undefined
      }
      className={cx(
        "flex min-w-0 select-none items-center gap-1.5 rounded-full px-1.5 py-0.5 text-start text-xs transition-colors",
        "focus-visible:outline-3",
        clickable && "cursor-pointer",
        event.allDay
          ? eventBlockClasses[color]
          : ["text-text-primary hover:bg-(--control-bg)", eventChipCompactClasses[color]],
        className,
      )}
      aria-label={event.allDay ? event.title : `${event.title}, ${formatTime(new Date(event.start))}`}
    >
      {event.allDay ? null : (
        <span className={cx("size-2 max-lg:hidden shrink-0 rounded-full", calendarDotClasses[color])} />
      )}
      <span className="truncate font-medium">{event.title}</span>
      {showTime && !event.allDay ? (
        <span data-time className="ms-auto shrink-0 text-[11px] text-text-tertiary tabular-nums">
          {formatTime(new Date(event.start))}
        </span>
      ) : null}
    </button>
  );
}

export function EventBlock({
  positioned,
  onCommitmentClick,
  onClassClick,
}: {
  positioned: PositionedEvent;
  onCommitmentClick?: (anchor: { top: number; left: number }) => void;
  onClassClick?: (event: CalendarEvent, anchor: { top: number; left: number }) => void;
}) {
  const event = positioned.event;
  const compact = positioned.height < 40;
  const times = `${formatTime(new Date(event.start))} – ${formatTime(new Date(event.end))}`;
  const commitment = event.layer === "commitment" && onCommitmentClick;
  const classEvent =
    (event.layer === "class" || event.layer === "historical") && onClassClick;

  return (
    <button
      type="button"
      data-event
      onClick={
        commitment
          ? (click) => {
              click.stopPropagation();
              onCommitmentClick({ top: click.clientY, left: click.clientX });
            }
          : classEvent
            ? (click) => {
                click.stopPropagation();
                onClassClick(event, { top: click.clientY, left: click.clientX });
              }
            : undefined
      }
      className={cx(
        "absolute z-5 flex flex-col items-start overflow-hidden rounded-xs px-3 py-1 text-start text-xs select-none",
        "transition-colors focus-visible:outline-3",
        (commitment || classEvent) && "cursor-pointer hover:brightness-[1.03]",
        surfaceForEvent(event),
      )}
      style={eventBlockStyle(positioned)}
      aria-label={`${event.title}, ${times}`}
    >
      <span
        className={cx("absolute inset-s-1 inset-y-1 w-1 rounded-full", dotForEvent(event))}
      />
      <span className="w-full truncate font-medium">{event.title}</span>
      {compact ? null : <span className="w-full truncate tabular-nums opacity-80">{times}</span>}
    </button>
  );
}

const CONFLICT_HATCH =
  "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 7px)";

function surfaceForEvent(event: CalendarEvent): string {
  if (event.tone === "conflict") {
    return "border-2 border-border-error-default bg-status-rose-background text-status-rose-text";
  }
  if (event.tone === "candidate") {
    return "border-2 border-dashed border-calendar-event-purple-title bg-calendar-event-purple-background/70 text-calendar-event-purple-title";
  }
  return eventBlockClasses[event.color];
}

function dotForEvent(event: CalendarEvent): string {
  if (event.tone === "conflict") return "bg-status-rose-text";
  if (event.tone === "candidate") return "bg-calendar-event-purple-title";
  return calendarDotClasses[event.color];
}

/**
 * Read-only event block for embedded week previews. Same Nuxt drawing as
 * `EventBlock`, but no click handlers and tone-aware styling for candidates
 * and conflicts.
 */
export function PreviewEventBlock({ positioned }: { positioned: PositionedEvent }) {
  const event = positioned.event;
  const compact = positioned.height < 40;
  const times = `${formatTime(new Date(event.start))} – ${formatTime(new Date(event.end))}`;

  return (
    <div
      data-event
      className={cx(
        "absolute z-5 flex flex-col items-start overflow-hidden rounded-xs px-3 py-1 text-start text-xs select-none",
        surfaceForEvent(event),
      )}
      style={eventBlockStyle(positioned)}
      aria-label={`${event.title}, ${times}${event.description ? `, ${event.description}` : ""}`}
    >
      {event.tone === "conflict" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{ backgroundImage: CONFLICT_HATCH }}
        />
      ) : null}
      <span
        className={cx("absolute inset-s-1 inset-y-1 w-1 rounded-full", dotForEvent(event))}
      />
      <span className="relative w-full truncate font-medium">{event.title}</span>
      {compact ? null : (
        <>
          <span className="relative w-full truncate tabular-nums opacity-80">{times}</span>
          {event.description ? (
            <span className="relative w-full truncate opacity-80">{event.description}</span>
          ) : null}
        </>
      )}
    </div>
  );
}
