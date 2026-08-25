"use client";

import { useMemo, useState } from "react";
import type { Key } from "react-aria-components";

import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";
import { WEEKDAY_LABEL } from "@/lib/constants";
import type { TeachingDay } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";
import { durationLabel, stableHash, tierFor, type HeatmapAccent } from "./format";

/**
 * The contributions heatmap from the BoardUI ai-profile template, carrying the
 * term's teaching calendar instead of commits.
 *
 * The template's `Weekly / Monthly / Yearly` switch changes the *period*. That
 * would be a lie here: we hold exactly one published term, so a "Yearly" view
 * would either repeat the same data or imply an absence we cannot vouch for.
 * The switch therefore changes the **metric** instead — three genuinely
 * different readings of the same days:
 *
 *   Class time  minutes of scheduled instruction
 *   Students    how many enrolled students are in a room that day
 *   Sections    how many distinct sections meet
 *
 * They are not redundant: a Tuesday with one 500-person lecture and a Thursday
 * with three 30-person seminars are opposites on two of the three.
 *
 * Markup, class names, tiering and the pop animation are the template's; the
 * per-cell animation delay is derived from the date rather than randomised, so
 * the server and client agree and the grid does not flash on hydration.
 */

export type ActivityMetric = "minutes" | "students" | "sections";

const METRIC_LABEL: Record<ActivityMetric, string> = {
  minutes: "Class time",
  students: "Students",
  sections: "Sections",
};

const METRIC_ORDER: ActivityMetric[] = ["minutes", "students", "sections"];

function valueOf(day: TeachingDay, metric: ActivityMetric): number {
  if (metric === "minutes") return day.minutes;
  if (metric === "students") return day.students;
  return day.sections;
}

function describe(day: TeachingDay, metric: ActivityMetric): string {
  const [year, month, date] = day.date.split("-").map(Number);
  const when = new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const value = valueOf(day, metric);
  if (value <= 0) return `No class on ${when}`;
  if (metric === "minutes") return `${durationLabel(value)} of class on ${when}`;
  if (metric === "students") return `${value.toLocaleString("en-US")} students in class on ${when}`;
  return `${value} section${value === 1 ? "" : "s"} meeting on ${when}`;
}

export interface ActivityHeatmapProps {
  days: TeachingDay[];
  accent: HeatmapAccent;
  /** Caption under the switch, e.g. "Fall 2026 · Sep 2 – Dec 12". */
  scopeLabel: string;
  className?: string;
}

export function ActivityHeatmap({ days, accent, scopeLabel, className }: ActivityHeatmapProps) {
  const [metric, setMetric] = useState<ActivityMetric>("minutes");

  const max = useMemo(
    () => days.reduce((peak, day) => Math.max(peak, valueOf(day, metric)), 0),
    [days, metric],
  );

  const teachingDayCount = useMemo(
    () => days.filter((day) => day.sections > 0).length,
    [days],
  );

  return (
    <>
      <div className={cx("flex w-full items-center justify-between pt-1.5 pl-0.5", className)}>
        <p className="text-body-2-medium text-text-secondary">Activity</p>
        <SegmentedControl
          variant="plain"
          aria-label="Activity metric"
          selectedKeys={new Set<Key>([metric])}
          onSelectionChange={(keys) => {
            const [first] = keys;
            if (typeof first === "string") setMetric(first as ActivityMetric);
          }}
        >
          {METRIC_ORDER.map((key) => (
            // Three adjacent 28px segments — the metric switch for the whole
            // heatmap below it. Same treatment as the other segmented controls.
            <SegmentedControlItem key={key} id={key} className="pointer-coarse:py-2.5">
              {METRIC_LABEL[key]}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>

      <div className="flex w-full overflow-x-auto sm:overflow-visible">
        <div
          data-accent={accent}
          role="img"
          aria-label={`${METRIC_LABEL[metric]} across ${scopeLabel}: ${teachingDayCount} teaching days`}
          className="contributions-grid grid w-max gap-1 grid-cols-[repeat(38,13px)] sm:w-full sm:grid-cols-[repeat(38,minmax(0,1fr))]"
        >
          {days.map((day) => {
            const value = valueOf(day, metric);
            const tier = tierFor(value, max);
            return (
              <span
                key={day.date}
                data-tier={tier}
                title={describe(day, metric)}
                className={cx(
                  "contribution-cell aspect-square w-full rounded-[3px]",
                  tier > 0 && "animate-cell-pop",
                )}
                // Deterministic per-cell stagger — the template randomises this,
                // but a random delay differs between the server and the client
                // and hydrates as a visible re-shuffle.
                style={tier > 0 ? { animationDelay: `${stableHash(day.date) % 780}ms` } : undefined}
              />
            );
          })}
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-0.5">
        <p className="text-caption-2-regular text-text-tertiary">
          {scopeLabel} · {teachingDayCount} teaching {teachingDayCount === 1 ? "day" : "days"}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-caption-2-regular text-text-tertiary">Less</span>
          <div data-accent={accent} className="contributions-grid flex items-center gap-1">
            {[0, 1, 2, 3, 4, 5].map((tier) => (
              <span
                key={tier}
                data-tier={tier}
                aria-hidden
                className="contribution-cell size-[9px] rounded-[2px]"
              />
            ))}
          </div>
          <span className="text-caption-2-regular text-text-tertiary">More</span>
        </div>
      </div>
    </>
  );
}

/** Exported for the page's screen-reader summary of the same data. */
export function heatmapSummary(days: TeachingDay[]): string {
  const active = days.filter((day) => day.sections > 0);
  if (active.length === 0) return "No published meeting days this term.";
  const byWeekday = new Map<string, number>();
  for (const day of active) {
    byWeekday.set(day.weekday, (byWeekday.get(day.weekday) ?? 0) + 1);
  }
  const busiest = [...byWeekday.entries()].sort((a, b) => b[1] - a[1])[0];
  return `${active.length} teaching days, most often ${WEEKDAY_LABEL[busiest[0] as keyof typeof WEEKDAY_LABEL]}.`;
}
