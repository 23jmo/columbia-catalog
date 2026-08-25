"use client";

import { useState } from "react";

import type { InstructorPageData } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";
import { InstructorSection } from "./section-block";
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
        "relative flex size-4 shrink-0 items-center justify-center rounded-[3px] text-text-secondary",
        /*
         * 16×16 is a WCAG 2.5.8 failure outright, and these two are the only
         * way to move through the months. The glyph is right at 16px — a
         * 44px chevron in a 32px pill would be absurd — so the hit area grows
         * on its own, the way the toast close button does. `-inset-3` lands a
         * 40px square; the two buttons sit at opposite ends of a 150px pill,
         * so the areas cannot reach each other, and what they do overlap is
         * the month label, which is not interactive.
         */
        "before:absolute before:-inset-3 before:content-['']",
        "outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
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

  const monthStepper = (
    /* `min-w`, not `w`: at a fixed 150px "September 2026" clipped to
       "September 202(". The label sizes itself through the invisible copy
       inside, so letting the box grow costs nothing and fixes every long
       month at once. */
    <div className="flex h-8 min-w-[150px] shrink-0 items-center justify-between gap-1 rounded-2lg border border-border-button-default bg-background-primary-default px-1 py-1 shadow-xs">
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
  );

  return (
    <div className={cx("w-full", className)}>
      <InstructorSection
        id="instructor-teaching-rhythm"
        title="Teaching rhythm"
        headline={
          <span key={month.key} className="animate-number-fade whitespace-nowrap tabular-nums">
            {countLabel(meetings)} class {meetings === 1 ? "meeting" : "meetings"}
          </span>
        }
        action={monthStepper}
      >
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
                  "animate-bar-rise w-full rounded-sm transition-[height,background-color] duration-300 ease-in-out",
                  teaching ? "bg-chart-agents-bar" : "bg-chart-track",
                )}
                style={{ height, animationDelay: `${at * 22}ms` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex w-full items-start justify-between text-caption-2-medium whitespace-nowrap text-text-tertiary">
        <p>{shortDateLabel(month.days[0].date)}</p>
        <p className="tabular-nums">{durationLabel(totalMinutes)} total</p>
        <p>{shortDateLabel(month.days[month.days.length - 1].date)}</p>
      </div>
      </InstructorSection>
    </div>
  );
}
