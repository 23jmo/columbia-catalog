"use client";

/**
 * Enrollment over time, as a compact area card.
 *
 * This is the hover surface behind the section drawer's enrollment chip, and
 * it is deliberately NOT `SeatHistoryChart`. That component is the full course
 * page's instrument: one line per section, prior-term ghost lines, registration
 * milestones, a legend, a cartesian grid. Every one of those is right on a
 * panel someone scrolled to and wrong in a 340px card that appears under a
 * cursor — the reader hovering the chip is asking one question ("is this
 * filling up, and how fast?"), and a legend for a single series is furniture.
 *
 * ── What is borrowed from the full chart, because it is correctness ────────
 *
 * Interpolation stays `stepAfter`. Each row is a look, including unchanged
 * counts. A smooth curve between two observations would draw seats draining
 * at a steady rate they never drained at — it would invent the shape of the
 * fill. The steps are the honest silhouette, and the area under them is still
 * an area. One look is enough: a flat hold is the answer when the count has
 * not moved. We only empty when there are no readings at all.
 *
 * ── Colour carries the current state, not a fixed brand green ──────────────
 *
 * The line takes the same tone as the number on the chip it hangs off, so a
 * full section's history is drawn in the rose it is already labelled with.
 * A single hard-coded accent would have "seats filling up" reading as good
 * news in green on every section in the catalog.
 */

import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { RiLineChartLine } from "@remixicon/react";

import { cx } from "@/utils/cx";

import {
  buildEnrollmentAreaModel,
  type EnrollmentPoint,
} from "./enrollment-area-model";

export type { EnrollmentPoint };
export type EnrollmentTone = "open" | "tight" | "full" | "waitlist" | "unknown";

/** Same tone → chart colour mapping the seat meter uses, so the surfaces agree. */
const TONE_STROKE: Record<EnrollmentTone, string> = {
  open: "var(--color-chart-2)",
  tight: "var(--color-chart-8)",
  full: "var(--color-chart-3)",
  waitlist: "var(--color-chart-5)",
  unknown: "var(--color-chart-neutral)",
};

export interface EnrollmentAreaChartProps {
  points: EnrollmentPoint[];
  capacity: number | null;
  tone: EnrollmentTone;
  /** Shown above the number, e.g. "Enrolled · Fall 2026". */
  label: string;
  /**
   * Feed-card hover. The full chart is a 320×280 instrument; a 22rem rail
   * card cannot host that without covering the card it is explaining.
   */
  compact?: boolean;
  className?: string;
}

function Empty({ reason, compact = false }: { reason: string; compact?: boolean }) {
  if (compact) {
    return (
      <p className="max-w-56 px-0.5 py-1 text-caption-1-regular text-text-secondary">
        {reason}
      </p>
    );
  }

  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-1.5 px-4 py-6 text-center">
      <RiLineChartLine aria-hidden className="size-5 text-foreground-icon-tertiary" />
      <p className="text-caption-1-medium text-text-primary">No seat history yet</p>
      <p className="text-caption-2-regular text-text-secondary">{reason}</p>
    </div>
  );
}

export function EnrollmentAreaChart({
  points,
  capacity,
  tone,
  label,
  compact = false,
  className,
}: EnrollmentAreaChartProps) {
  const stroke = TONE_STROKE[tone];
  // One gradient id per tone is enough — two charts of the same tone can share
  // a def, and a random id would break SSR/hydration agreement.
  const gradientId = `enrollment-fill-${tone}`;

  const model = useMemo(
    () => buildEnrollmentAreaModel(points, capacity),
    [points, capacity],
  );

  if (!model) {
    return (
      <div className={className}>
        <Empty compact={compact} reason="We have not recorded a reading for this section yet." />
      </div>
    );
  }

  const tickFormat: Intl.DateTimeFormatOptions = model.sameDay
    ? { hour: "numeric" }
    : model.spanDays <= 120
      ? { month: "short", day: "numeric" }
      : { month: "short" };

  const formatTick = (value: number) =>
    new Date(value).toLocaleString(undefined, tickFormat);

  return (
    <figure className={cx("flex flex-col", compact ? "w-60 gap-2" : "gap-3", className)}>
      {/* ---------------------------------------------------------------- */}
      {/* The headline: what it is now, and how far it has moved            */}
      {/* ---------------------------------------------------------------- */}
      <figcaption className="flex flex-col gap-1">
        <span className="text-caption-2-medium tracking-[0.04em] text-text-tertiary uppercase">
          {label}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={cx(
              "tabular-nums text-text-primary",
              compact ? "text-headline-semibold" : "text-title-2-semibold",
            )}
          >
            {model.last.enrolled}
            {capacity != null ? (
              <span className="text-headline-regular text-text-tertiary"> / {capacity}</span>
            ) : null}
          </span>
          {/*
            Neutral, not green-for-up. Enrolment rising is bad news for the
            person reading this, and a lime "+6" chip would congratulate them
            on losing six seats.
          */}
          {model.delta !== 0 ? (
            <span className="rounded-md bg-background-secondary-default px-1.5 py-0.5 text-caption-1-medium tabular-nums text-text-secondary">
              {model.delta > 0 ? "+" : ""}
              {model.delta} since {formatTick(model.first.t)}
            </span>
          ) : (
            <span className="rounded-md bg-background-secondary-default px-1.5 py-0.5 text-caption-1-medium text-text-secondary">
              Flat since {formatTick(model.first.t)}
            </span>
          )}
        </span>
      </figcaption>

      <div className={cx("w-full", compact ? "h-28" : "h-40")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={model.drawn}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            /*
             * Recharts' accessibility layer makes the chart wrapper a tab stop
             * with its own arrow-key navigation. That is worth having on the
             * full course page's interactive chart and is only harm here: this
             * chart has no hover tooltip and no active dot to navigate to, so
             * the layer contributes a focusable element inside a hover card and
             * nothing else — and a stray focus target inside a popover that
             * restores focus on close is how the card ends up reopening itself.
             * The figcaption above carries the numbers for a screen reader.
             */
            accessibilityLayer={false}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                {/*
                  The gradient is mapped over the whole plot box, not over the
                  area under the line, so a series sitting two-thirds up the
                  scale picks up the already-faded middle of the ramp. Starting
                  at 0.42 is what makes the fill legible at that height; at 0.28
                  a rose line on white had essentially no fill at all.
                */}
                <stop offset="0%" stopColor={stroke} stopOpacity={0.42} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              /*
               * With only a handful of readings, label the readings themselves
               * rather than letting recharts space ticks evenly across the
               * domain — an evenly spaced tick lands on a moment nobody
               * observed, and on a two-point series it would also put a label
               * under the synthetic hold-tail above.
               */
              ticks={
                model.sorted.length <= 5 ? model.sorted.map((p) => p.t) : undefined
              }
              tickFormatter={formatTick}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              minTickGap={24}
              tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
            />
            <YAxis
              domain={[0, model.yMax]}
              width={30}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
              tickCount={3}
              allowDecimals={false}
            />

            {/*
              The ceiling the line is racing toward — the only rule on the plot.
              Labelled on the LEFT: enrollment only ever climbs, so the right end
              of the plot is where the line is, and a right-aligned label lands
              on top of the very step it exists to give meaning to (and clips
              against the plot edge on a section that overfilled).
            */}
            {capacity != null && capacity > 0 ? (
              <ReferenceLine
                y={capacity}
                stroke="var(--color-border-table)"
                strokeDasharray="4 4"
                label={{
                  value: `cap ${capacity}`,
                  position: "insideTopLeft",
                  fill: "var(--color-text-tertiary)",
                  fontSize: 10,
                }}
              />
            ) : null}

            <Area
              // Every look, including unchanged counts: hold flat, then step.
              type="stepAfter"
              dataKey="enrolled"
              stroke={stroke}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              // Animation off keeps this honest inside a tooltip that can be
              // opened and closed faster than an animation runs.
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default EnrollmentAreaChart;
