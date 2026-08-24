"use client";

import { useState } from "react";

import type { InstructorPageData } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";
import { countLabel, durationLabel, shortDateLabel } from "./format";

/**
 * Clone of the template's "Agents" card: a headline figure, a month stepper
 * pinned top-right, a bar chart, and a from/to caption under it.
 *
 * The bars are days. Height is scheduled class minutes on that day, so the
 * shape of a term is legible at a glance — the Tue/Thu ridge of a lecture
 * course, the flat stretch of a reading week, the day a lab meets.
 *
 * A day with no class is drawn as the template draws an empty bar: a 4px stub
 * in `bg-chart-track`. A zero-height bar would read as a rendering gap rather
 * than a deliberate "nothing here".
 */

/** Plot height, matching the template's 206px bar area. */
const PLOT_HEIGHT = 206;
/** The stub height the template uses for an empty bucket. */
const EMPTY_BAR_HEIGHT = 4;

function StepButton({
  direction,
  onPress,
  disabled,
}: {
  direction: "previous" | "next";
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={direction === "previous" ? "Previous month" : "Next month"}
      onClick={onPress}
      disabled={disabled}
      className={cx(
        "flex size-4 shrink-0 items-center justify-center rounded-[3px] text-text-secondary",
        "outline-none transition-colors duration-150 ease focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer hover:bg-background-secondary-hover",
      )}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d={
            direction === "previous"
              ? "M9 4L5.70711 7.29289C5.31658 7.68342 5.31658 8.31658 5.70711 8.70711L9 12"
              : "M7 4L10.2929 7.29289C10.6834 7.68342 10.6834 8.31658 10.2929 8.70711L7 12"
          }
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export interface TeachingRhythmCardProps {
  months: InstructorPageData["months"];
  className?: string;
}

export function TeachingRhythmCard({ months, className }: TeachingRhythmCardProps) {
  // Open on the busiest month — the first thing a reader wants is the shape of
  // a working month, not whichever half-month the term happens to start in.
  const [index, setIndex] = useState(() => {
    let best = 0;
    let bestMinutes = -1;
    months.forEach((month, at) => {
      const minutes = month.days.reduce((sum, day) => sum + day.minutes, 0);
      if (minutes > bestMinutes) {
        bestMinutes = minutes;
        best = at;
      }
    });
    return best;
  });

  if (months.length === 0) return null;

  const month = months[Math.min(index, months.length - 1)];
  const peak = month.days.reduce((max, day) => Math.max(max, day.minutes), 0);
  const totalMinutes = month.days.reduce((sum, day) => sum + day.minutes, 0);
  const meetings = month.days.reduce((sum, day) => sum + day.sections, 0);

  return (
    <section
      className={cx(
        "relative flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
    >
      <div className="flex w-full px-1.5 pt-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="w-full text-body-medium text-text-secondary">Teaching rhythm</p>
          <p
            key={month.key}
            className="animate-number-fade text-title-2-medium whitespace-nowrap tabular-nums text-text-primary"
          >
            {countLabel(meetings)} class {meetings === 1 ? "meeting" : "meetings"}
          </p>
        </div>
      </div>

      <div className="absolute top-4 right-4 flex h-8 w-[150px] shrink-0 items-center justify-between gap-1 rounded-2lg border border-border-button-default bg-background-primary-default px-1 py-1 shadow-xs">
        <StepButton
          direction="previous"
          disabled={index === 0}
          onPress={() => setIndex((current) => Math.max(0, current - 1))}
        />
        <span className="relative flex-1 overflow-hidden text-center text-body-medium whitespace-nowrap text-text-primary">
          <span className="invisible">{month.label}</span>
          <span className="absolute inset-0 flex items-center justify-center">{month.label}</span>
        </span>
        <StepButton
          direction="next"
          disabled={index >= months.length - 1}
          onPress={() => setIndex((current) => Math.min(months.length - 1, current + 1))}
        />
      </div>

      <div
        className="flex w-full items-end gap-[3px]"
        style={{ height: PLOT_HEIGHT }}
        role="img"
        aria-label={`${month.label}: ${durationLabel(totalMinutes)} of class across ${meetings} meetings`}
      >
        {month.days.map((day, at) => {
          const teaching = day.minutes > 0;
          const height = teaching
            ? Math.max(
                8,
                Math.round((day.minutes / Math.max(1, peak)) * (PLOT_HEIGHT - 12)),
              )
            : EMPTY_BAR_HEIGHT;
          return (
            <div key={day.date} className="flex h-full min-w-0 flex-1 items-end rounded-sm">
              <div
                title={
                  teaching
                    ? `${shortDateLabel(day.date)} · ${durationLabel(day.minutes)} across ${day.sections} section${day.sections === 1 ? "" : "s"}`
                    : `${shortDateLabel(day.date)} · no class`
                }
                className={cx(
                  "animate-bar-rise w-full rounded-sm transition-[height,background-color] duration-300 ease",
                  teaching ? "bg-chart-agents-bar" : "bg-chart-track",
                )}
                style={{ height, animationDelay: `${at * 22}ms` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex w-full items-start justify-between px-1.5 text-[11px] leading-[15px] font-medium tracking-[0.2px] whitespace-nowrap text-text-tertiary">
        <p>{shortDateLabel(month.days[0].date)}</p>
        <p className="tabular-nums">{durationLabel(totalMinutes)} total</p>
        <p>{shortDateLabel(month.days[month.days.length - 1].date)}</p>
      </div>
    </section>
  );
}
