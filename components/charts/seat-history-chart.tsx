"use client";

/**
 * Seat history — "seats taken over time, with registration milestones
 * annotated" (spec §13).
 *
 * BoardUI's chart cards are Pro-tier and not installed, so this is built on
 * Recharts directly and styled entirely with BoardUI semantic tokens. Colours
 * are passed as `var(--color-…)` references so the theme flips them under
 * `.dark` with no `dark:` variants and no hex anywhere in this file.
 *
 * Two decisions carry all the correctness:
 *
 *   1. Interpolation is `stepAfter`. A straight segment between two looks
 *      would draw a slow ramp where the data says "flat, then a cliff".
 *      See `./series` for the expansion.
 *   2. Ghost lines are emitted before live lines (SVG paints in order) and
 *      slid onto the live term's registration clock, with the slide disclosed.
 *
 * Safe to lazy-load: no module-level browser access, animations off, and a
 * default export so `next/dynamic(() => import(...))` works without a `.then`.
 */

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RiLineChartLine } from "@remixicon/react";

import { cx } from "@/utils/cx";
import type { EnrollmentSnapshot, RegistrationMilestoneKind } from "@/lib/types";
import type { SeatHistoryChartProps } from "@/components/course/contracts";

import {
  anchorTermCodes,
  buildSeatChartModel,
  milestonesInWindow,
  orderForPainting,
  shiftInDays,
  tickGranularity,
  yAxisMax,
  type SeatFrame,
  type SeatPlot,
  type TickGranularity,
} from "./series";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const TICK_FORMAT: Record<TickGranularity, Intl.DateTimeFormatOptions> = {
  hour: { hour: "numeric", minute: "2-digit" },
  day: { month: "short", day: "numeric" },
  month: { month: "short", year: "numeric" },
};

const INSTANT_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

function formatInstant(t: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(t).toLocaleString(undefined, options);
}

/**
 * Milestone kinds are distinguished by colour AND by their printed label, never
 * by colour alone (spec §18 accessibility).
 */
const MILESTONE_COLOR_VAR: Record<RegistrationMilestoneKind, string> = {
  registration_open: "var(--color-chart-4)",
  appointment_window: "var(--color-chart-5)",
  add_drop_deadline: "var(--color-chart-3)",
  term_start: "var(--color-chart-neutral)",
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

/**
 * A chart with no rows must not render an axis at all: an empty grid reads as
 * "enrollment is zero" rather than "we have not watched this yet".
 */
function NoHistory({ className, reason }: { className?: string; reason: string }) {
  return (
    <div
      className={cx(
        "flex min-h-40 flex-col items-center justify-center gap-2 rounded-2lg border border-dashed border-border-table bg-background-secondary-default px-6 py-8 text-center",
        className,
      )}
    >
      <RiLineChartLine className="size-5 text-foreground-icon-secondary" aria-hidden />
      <p className="text-body-regular text-text-primary">No seat history yet</p>
      <p className="max-w-xs text-caption-1-regular text-text-secondary">{reason}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function SeriesSwatch({ plot }: { plot: SeatPlot }) {
  return (
    <svg className="size-3 shrink-0" viewBox="0 0 12 12" aria-hidden focusable="false">
      <line
        x1="0"
        y1="6"
        x2="12"
        y2="6"
        stroke={plot.colorVar}
        strokeWidth={plot.isGhost ? 1.5 : 2.5}
        strokeDasharray={plot.isGhost ? "3 2" : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Dots
// ---------------------------------------------------------------------------

/** The subset of Recharts' dot props this renderer needs. */
interface DotRenderProps {
  cx?: number;
  cy?: number;
  payload?: unknown;
}

/**
 * Every frame row carries a vertex for every series, but most of those values
 * were carried forward from an earlier instant. Dotting all of them would
 * claim we sampled this section at another section's timestamps, so only the
 * instants a series genuinely reported at get a marker.
 */
function observationDot(plot: SeatPlot, observed: Map<number, EnrollmentSnapshot> | undefined) {
  return function ObservationDot({ cx: centerX, cy: centerY, payload }: DotRenderProps) {
    const t = (payload as SeatFrame | undefined)?.t;
    if (t == null || !observed?.has(t)) return null;
    if (typeof centerX !== "number" || typeof centerY !== "number") return null;
    return <circle cx={centerX} cy={centerY} r={2.5} fill={plot.colorVar} />;
  };
}

function ChartLegend({ plots }: { plots: SeatPlot[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {plots.map((plot) => {
        const days = shiftInDays(plot.shiftMs);
        return (
          <li
            key={plot.series.seriesId}
            className={cx(
              "flex items-center gap-1.5 text-caption-1-regular",
              plot.isGhost ? "text-text-tertiary" : "text-text-secondary",
            )}
          >
            <SeriesSwatch plot={plot} />
            <span>{plot.series.label}</span>
            {plot.isGhost ? (
              <span className="text-caption-2-regular text-text-tertiary">
                {days === 0
                  ? "· prior term"
                  : `· prior term, shifted ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} to line up with registration`}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

export function SeatHistoryChart({ series, milestones, capacity, className }: SeatHistoryChartProps) {
  const model = useMemo(() => buildSeatChartModel(series, milestones), [series, milestones]);
  const annotations = useMemo(
    () => milestonesInWindow(milestones, model.domain, anchorTermCodes(series)),
    [milestones, model.domain, series],
  );
  // Hover fires per frame; a map keeps the tooltip lookup off the hot path.
  const framesByInstant = useMemo(
    () => new Map(model.frames.map((frame) => [frame.t, frame])),
    [model.frames],
  );

  if (series.length === 0) {
    return (
      <NoHistory
        className={className}
        reason="No offering of this course has been observed long enough to draw a line."
      />
    );
  }
  if (!model.hasData || !model.domain) {
    return (
      <NoHistory
        className={className}
        reason="We are watching this section, but its seat count has not moved since we started."
      />
    );
  }

  const [domainStart, domainEnd] = model.domain;
  const granularity = tickGranularity(model.domain);
  const painted = orderForPainting(model.plots);
  const ceiling = yAxisMax(model.maxSeats, capacity);

  /**
   * The tooltip is driven off the frame instant rather than Recharts' payload
   * so it can show the exact reported snapshot (waitlist, status) instead of
   * the carried-forward number, and so ghosts can be pushed into a secondary
   * block instead of competing with the live reading.
   */
  const renderTooltip = ({ active, label }: { active?: boolean; label?: string | number }) => {
    if (!active || typeof label !== "number") return null;
    const frame = framesByInstant.get(label);
    if (!frame) return null;

    const rows = model.plots.map((plot) => ({
      plot,
      value: frame[plot.frameKey] ?? null,
      observed: model.observationIndex.get(plot.frameKey)?.get(label) ?? null,
    }));
    const live = rows.filter((row) => !row.plot.isGhost && row.value != null);
    const ghosts = rows.filter((row) => row.plot.isGhost && row.value != null);

    return (
      <div className="min-w-44 rounded-lg border border-border-table bg-background-primary-default px-3 py-2 shadow-card">
        <p className="text-caption-2-medium text-text-secondary">
          {formatInstant(label, INSTANT_FORMAT)}
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {live.map((row) => (
            <li key={row.plot.frameKey} className="flex items-center gap-2">
              <SeriesSwatch plot={row.plot} />
              <span className="min-w-0 flex-1 truncate text-caption-1-regular text-text-secondary">
                {row.plot.series.label}
              </span>
              <span className="text-caption-1-medium tabular-nums text-text-primary">
                {row.value}
                {capacity != null ? ` / ${capacity}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {live.some((row) => row.observed) ? (
          <p className="mt-1 text-caption-2-regular text-text-tertiary">
            {live
              .filter((row) => row.observed)
              .map((row) =>
                row.observed?.waitlistCount != null
                  ? `${row.observed.waitlistCount} waiting`
                  : row.observed?.status ?? "",
              )
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {ghosts.length > 0 ? (
          <div className="mt-2 border-t border-border-table pt-1.5">
            {ghosts.map((row) => (
              <p
                key={row.plot.frameKey}
                className="flex items-center gap-2 text-caption-2-regular text-text-tertiary"
              >
                <span className="min-w-0 flex-1 truncate">{row.plot.series.label}</span>
                <span className="tabular-nums">{row.value}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  /**
   * Screen readers get the shape as prose. Colour and position alone never
   * carry the reading (spec §18).
   */
  const spokenSummary = model.plots
    .map((plot) => {
      const points = plot.series.points;
      if (points.length === 0) return `${plot.series.label}: no observations.`;
      const first = points[0];
      const last = points[points.length - 1];
      return `${plot.series.label}${plot.isGhost ? " (prior term)" : ""}: ${first.enrollmentCount} seats taken at the start of the window, ${last.enrollmentCount} at the end, across ${points.length} recorded ${points.length === 1 ? "change" : "changes"}.`;
    })
    .join(" ");

  return (
    <figure className={cx("flex flex-col gap-3", className)}>
      <div
        className="h-64 w-full"
        role="img"
        aria-label={`Seats taken over time. ${spokenSummary}${
          capacity != null ? ` Capacity is ${capacity} seats.` : ""
        }`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={model.frames} margin={{ top: 16, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid
              stroke="var(--color-border-table)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[domainStart, domainEnd]}
              tickFormatter={(value: number) => formatInstant(value, TICK_FORMAT[granularity])}
              tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-table)" }}
              minTickGap={32}
            />
            <YAxis
              type="number"
              domain={[0, ceiling]}
              allowDecimals={false}
              width={48}
              tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={renderTooltip}
              cursor={{ stroke: "var(--color-chart-cursor)", strokeWidth: 1 }}
              isAnimationActive={false}
            />

            {/* Ceiling first: it belongs under every line. */}
            {capacity != null ? (
              <ReferenceLine
                y={capacity}
                stroke="var(--color-chart-3)"
                strokeDasharray="6 4"
                strokeOpacity={0.7}
                label={{
                  value: `Capacity ${capacity}`,
                  position: "insideTopRight",
                  fill: "var(--color-text-tertiary)",
                  fontSize: 10,
                }}
              />
            ) : null}

            {annotations.map((annotation) => (
              <ReferenceLine
                key={annotation.key}
                x={annotation.t}
                stroke={MILESTONE_COLOR_VAR[annotation.milestone.kind]}
                strokeDasharray="4 3"
                strokeOpacity={0.8}
                label={{
                  value: annotation.milestone.label,
                  position: "insideTopLeft",
                  fill: "var(--color-text-tertiary)",
                  fontSize: 10,
                  angle: -90,
                  offset: 8,
                }}
              />
            ))}

            {painted.map((plot) => (
              <Line
                key={plot.frameKey}
                // Change-only data: hold the last value, never ramp toward the next.
                type="stepAfter"
                dataKey={plot.frameKey}
                name={plot.series.label}
                stroke={plot.colorVar}
                strokeWidth={plot.isGhost ? 1.5 : 2}
                strokeDasharray={plot.isGhost ? "5 3" : undefined}
                strokeOpacity={plot.isGhost ? 0.55 : 1}
                // Ghosts stay bare; live lines mark the instants they really reported.
                dot={
                  plot.isGhost
                    ? false
                    : observationDot(plot, model.observationIndex.get(plot.frameKey))
                }
                // A gap means "we had not started watching", not "zero seats".
                connectNulls={false}
                // Ghosts are context, not the reading — they take no hover focus.
                activeDot={plot.isGhost ? false : { r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="flex flex-col gap-2">
        <ChartLegend plots={model.plots} />
        {annotations.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {annotations.map((annotation) => (
              <li
                key={annotation.key}
                className="flex items-center gap-1.5 text-caption-2-regular text-text-tertiary"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: MILESTONE_COLOR_VAR[annotation.milestone.kind] }}
                  aria-hidden
                />
                {annotation.milestone.label}
                <span className="text-text-tertiary">
                  · {formatInstant(annotation.t, TICK_FORMAT[granularity])}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </figcaption>
    </figure>
  );
}

export default SeatHistoryChart;
