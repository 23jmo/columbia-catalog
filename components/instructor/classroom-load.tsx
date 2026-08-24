"use client";

/**
 * Clone of the template's "Tokens" card: a headline figure with a delta chip
 * floated over a full-bleed area chart, and a from/to caption underneath.
 *
 * The series is **concurrent classroom load** — at each ten-minute sample
 * across the teaching week, how many enrolled students are sitting in one of
 * this instructor's rooms. It is the one honest time series we can build from
 * registrar data: enrolment counts are a snapshot with no history, but crossing
 * them with published meeting times gives a real curve rather than a trend we
 * would have to invent.
 *
 * Read it as a workload shape. Five humps means five teaching days; one tall
 * narrow spike means everything rides on a single large lecture.
 *
 * Built on Recharts directly — BoardUI's chart cards are Pro and not installed
 * — and coloured only with `var(--color-…)` tokens so it flips with the theme.
 */

import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from "recharts";

import { minutesToLabel, WEEKDAY_LABEL, WEEKDAYS } from "@/lib/constants";
import type { InstructorPageData, LoadSample } from "@/lib/data/instructors";
import type { Weekday } from "@/lib/types";
import { cx } from "@/utils/cx";
import { countLabel } from "./format";

const LINE_COLOR = "var(--color-chart-agents-bar-active)";

function LoadTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: LoadSample }[];
}) {
  const sample = active ? payload?.[0]?.payload : undefined;
  if (!sample) return null;
  return (
    <div className="rounded-lg border border-border-table bg-background-primary-default px-2.5 py-1.5 shadow-md">
      <p className="text-caption-1-medium text-text-primary">
        {WEEKDAY_LABEL[sample.weekday]} {minutesToLabel(sample.minute)}
      </p>
      <p className="text-caption-2-regular tabular-nums text-text-secondary">
        {sample.students === 0
          ? "No class in session"
          : `${countLabel(sample.students)} students in class`}
      </p>
    </div>
  );
}

export interface ClassroomLoadCardProps {
  data: InstructorPageData;
  className?: string;
}

export function ClassroomLoadCard({ data, className }: ClassroomLoadCardProps) {
  const samples = data.weekLoad;

  /** First sample index of each weekday — where to draw the day dividers. */
  const dayBoundaries = useMemo(() => {
    const seen = new Map<Weekday, number>();
    for (const sample of samples) {
      if (!seen.has(sample.weekday)) seen.set(sample.weekday, sample.t);
    }
    return WEEKDAYS.map((weekday) => ({ weekday, t: seen.get(weekday) })).filter(
      (entry): entry is { weekday: Weekday; t: number } => entry.t != null,
    );
  }, [samples]);

  const peak = data.peakLoad;
  const hasSignal = samples.some((sample) => sample.students > 0);

  return (
    <section
      className={cx(
        "flex w-full flex-col rounded-[20px] bg-background-secondary-default py-3",
        className,
      )}
    >
      <div className="relative z-10 -mb-8 flex w-full px-4 pt-1">
        <div className="flex flex-col gap-0.5">
          <p className="text-body-medium whitespace-nowrap text-text-secondary">
            Classroom load
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="animate-number-fade text-title-2-medium whitespace-nowrap tabular-nums text-text-primary">
              {peak ? `${countLabel(peak.students)} at peak` : "No meeting times published"}
            </p>
            {peak ? (
              <span className="inline-flex items-center justify-center rounded-md bg-status-purple-background px-1.5 py-0.5 text-body-medium whitespace-nowrap text-status-purple-text">
                {WEEKDAY_LABEL[peak.weekday].slice(0, 3)} {minutesToLabel(peak.minute)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {hasSignal ? (
        <div className="animate-chart-reveal h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={samples} margin={{ top: 44, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="instructor-load-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>

              {/* Day dividers. The reader needs to know the five humps are
                  Monday to Friday and not five weeks. */}
              {dayBoundaries.slice(1).map((entry) => (
                <ReferenceLine
                  key={entry.weekday}
                  x={entry.t}
                  stroke="var(--color-chart-track)"
                  strokeWidth={1}
                />
              ))}

              <YAxis hide domain={[0, (max: number) => Math.max(1, max * 1.15)]} />
              <Tooltip
                content={<LoadTooltip />}
                cursor={{ stroke: "var(--color-chart-cursor)", strokeWidth: 1 }}
              />
              {/*
                `stepAfter`, not `monotone`.

                A classroom either has 164 people in it or it does not — the
                room fills at 1:10 and empties at 2:25, and nothing in between
                is a ramp. A curved interpolation would draw a ten-minute
                swell on either side of every class, which is a shape the data
                never had. Square edges are both the truthful reading of a
                step function and the one that looks deliberate.
              */}
              <Area
                type="stepAfter"
                dataKey="students"
                stroke={LINE_COLOR}
                strokeWidth={2}
                fill="url(#instructor-load-fill)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: LINE_COLOR }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[200px] w-full items-end px-4 pb-6">
          <p className="text-body-regular text-pretty text-text-secondary">
            The directory has not published meeting times for these sections, so there
            is no week to plot yet.
          </p>
        </div>
      )}

      <div className="mt-2 grid w-full grid-cols-5 px-4 text-[11px] leading-[15px] font-medium tracking-[0.2px] whitespace-nowrap text-text-tertiary">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="text-center first:text-left last:text-right">
            {WEEKDAY_LABEL[weekday].slice(0, 3)}
          </span>
        ))}
      </div>
    </section>
  );
}
