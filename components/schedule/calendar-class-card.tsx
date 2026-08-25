"use client";

import Link from "next/link";
import { RiCloseLine, RiExternalLinkLine, RiRoadMapLine, RiWalkLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { CampusCard } from "@/components/campus/campus-card";
import type { PlanAnalysisDetail } from "@/lib/schedule";
import type { Course, CustomBlock, Section } from "@/lib/types";
import { WEEKDAY_LABEL } from "@/lib/constants";
import { cx } from "@/utils/cx";
import { formatTime } from "./calendar-date";
import type { CalendarEvent } from "./calendar-types";
import {
  commuteLegsForDay,
  resolveSection,
  routeStopsForDay,
  sectionIdFromEvent,
  timedItemsForDay,
  weekdayFromEvent,
} from "./calendar-class-resolve";

/**
 * Popover when a class (or historical guess) is clicked on the calendar.
 * Shows section details, that day's commute legs, and a 3D route map.
 */
export function ClassEventCard({
  event,
  sections,
  courses,
  customBlocks,
  analysis,
  onClose,
  className,
}: {
  event: CalendarEvent;
  sections: readonly Section[];
  courses: readonly Course[];
  customBlocks: readonly CustomBlock[];
  analysis: PlanAnalysisDetail | null;
  onClose: () => void;
  className?: string;
}) {
  const sectionId = sectionIdFromEvent(event);
  const section = resolveSection(sectionId, sections);
  const course = section ? courses.find((item) => item.courseId === section.courseId) : undefined;
  const weekday = weekdayFromEvent(event);
  const start = new Date(event.start);
  const end = new Date(event.end);
  const timeLabel = `${formatTime(start)} – ${formatTime(end)}`;

  const meeting = section?.meetings.find(
    (item) =>
      item.weekday === weekday &&
      item.startMinute === start.getHours() * 60 + start.getMinutes(),
  );
  const buildingName = meeting?.buildingName ?? null;
  const room = meeting?.room ?? null;

  const highlightId = sectionId ?? event.calendarId;
  const dayStops = timedItemsForDay(weekday, sections, customBlocks);
  const routeStops = highlightId
    ? routeStopsForDay(weekday, sections, customBlocks, highlightId)
    : [];
  const legs = highlightId ? commuteLegsForDay(weekday, highlightId, analysis) : [];

  const courseHref =
    section && course
      ? `/course/${course.courseId}?section=${encodeURIComponent(section.sectionCode)}`
      : null;

  return (
    <div
      role="dialog"
      aria-label={event.title}
      className={cx(
        "flex w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(32rem,calc(100vh-2rem))] flex-col overflow-hidden rounded-2xl border border-border-table bg-background-primary-default shadow-lg",
        className,
      )}
    >
      <header className="flex items-start gap-2 border-b border-border-table p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-title-3-semibold text-text-primary">
            {course?.title ?? event.title}
          </p>
          <p className="text-body-regular text-text-secondary">
            {section ? `${section.courseId} · ${section.sectionCode}` : event.title}
          </p>
          <p className="mt-1 text-body-regular text-text-tertiary">
            {WEEKDAY_LABEL[weekday]} · {timeLabel}
          </p>
          {event.description ? (
            <p className="mt-0.5 text-body-regular text-text-tertiary">{event.description}</p>
          ) : null}
          {event.layer === "historical" ? (
            <Chip variant="caption" color="purple" className="mt-2">
              Usual time — not published this term
            </Chip>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg p-1 text-foreground-icon-tertiary hover:bg-background-secondary-hover"
        >
          <RiCloseLine className="size-4" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {routeStops.length > 0 ? (
          <CampusCard
            buildingNames={buildingName ? [buildingName] : []}
            roomLabel={room}
            label={event.title}
            meta={`${WEEKDAY_LABEL[weekday]} ${timeLabel}`}
            routeStops={routeStops}
            className="mb-3"
          />
        ) : null}

        {dayStops.length > 1 ? (
          <section className="mb-3">
            <h3 className="mb-2 text-caption-1-semibold text-text-tertiary uppercase tracking-wide">
              {WEEKDAY_LABEL[weekday]} route
            </h3>
            <ol className="flex flex-col gap-1.5">
              {dayStops.map((stop) => (
                <li
                  key={`${stop.id}-${stop.startMinute}`}
                  className={cx(
                    "rounded-xl px-2.5 py-2 text-body-regular",
                    stop.id === highlightId
                      ? "bg-accent-500/10 ring-1 ring-accent-500/30"
                      : "bg-background-secondary-default",
                  )}
                >
                  <span className="text-body-medium text-text-primary">{stop.label}</span>
                  <span className="ms-2 tabular-nums text-text-tertiary">
                    {formatTimeFromMinutes(stop.startMinute)}–{formatTimeFromMinutes(stop.endMinute)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {legs.length > 0 ? (
          <section>
            <h3 className="mb-2 text-caption-1-semibold text-text-tertiary uppercase tracking-wide">
              Commute
            </h3>
            <ul className="flex flex-col gap-1.5">
              {legs.map((leg, index) => (
                <li
                  key={`${leg.fromId}-${leg.toId}-${index}`}
                  className={cx(
                    "flex items-start gap-2 rounded-xl p-2.5 text-body-regular",
                    leg.feasible ? "bg-background-secondary-default" : "bg-status-rose-background",
                  )}
                >
                  {leg.feasible ? (
                    <RiWalkLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
                  ) : (
                    <RiRoadMapLine className="mt-0.5 size-4 shrink-0 text-status-rose-text" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="text-text-primary">
                      {leg.fromLabel} → {leg.toLabel}
                    </p>
                    <p className="text-caption-1-regular text-text-tertiary">
                      ~{leg.walkMinutes} min walk · {leg.gapMinutes} min between
                      {!leg.feasible ? " · won't fit" : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {courseHref ? (
        <footer className="border-t border-border-table p-3">
          <Link href={courseHref} onClick={onClose} className="block">
            <Button size="small" variant="secondary" leadingIcon={RiExternalLinkLine} className="w-full">
              Open section
            </Button>
          </Link>
        </footer>
      ) : null}
    </div>
  );
}

function formatTimeFromMinutes(minute: number): string {
  const hours = Math.floor(minute / 60);
  const mins = minute % 60;
  const date = new Date(2000, 0, 1, hours, mins);
  return formatTime(date);
}

export type ClassEventDraft = {
  event: CalendarEvent;
  anchor: { top: number; left: number };
};
