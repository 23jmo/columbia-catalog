/**
 * Seat-history chart math.
 *
 * Deliberately JSX-free so the interesting part — how a snapshot stream
 * becomes a truthful line — is unit-testable without a DOM.
 *
 * THE CENTRAL FACT: each point is a look, not a slope. `[09:00 → 12, 10:00 →
 * 12, 14:00 → 30]` means we saw 12 twice and then 30, not that enrollment
 * crept. A naive line chart draws the crept version and lies about exactly the
 * thing the chart exists to show ("it filled in 90 seconds during senior
 * registration").
 *
 * So every value here is carried FORWARD from the last observation, and the
 * chart draws with step-after interpolation so the pixels agree with the data.
 */

import type { EnrollmentSnapshot, RegistrationMilestone, TermCode } from "@/lib/types";
import type { SeatHistorySeries } from "@/components/course/contracts";

// ---------------------------------------------------------------------------
// Colour tokens
// ---------------------------------------------------------------------------

/**
 * Live lines cycle this palette. Ordered so the first three are maximally
 * distinguishable from each other rather than following the token numbering.
 * Chart tokens flip automatically under `.dark` — never a raw hex.
 */
export const LIVE_SERIES_COLOR_VARS = [
  "var(--color-chart-1)",
  "var(--color-chart-4)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-5)",
  "var(--color-chart-8)",
  "var(--color-chart-3)",
  "var(--color-chart-2)",
] as const;

/**
 * Ghosts use a text token rather than a chart token on purpose: the chart
 * neutral is near-invisible against the dark surface, and the point of a ghost
 * is to be legible-but-recessive in BOTH themes, not to claim a series colour.
 */
export const GHOST_COLOR_VAR = "var(--color-text-tertiary)";

// ---------------------------------------------------------------------------
// Series identity
// ---------------------------------------------------------------------------

/**
 * `SeatHistorySeries.seriesId` is a section id for live series and
 * `${sectionId}@${termCode}` for ghosts (see contracts.ts). A section id is
 * itself `${termCode}${courseId}${sectionCode}`, so the term is the first five
 * characters. Returns null rather than guessing when the id is not shaped that
 * way — an unattributable series simply gets no milestone alignment.
 */
export function termCodeOfSeries(seriesId: string): TermCode | null {
  const at = seriesId.lastIndexOf("@");
  if (at >= 0) {
    const suffix = seriesId.slice(at + 1);
    return /^\d{5}$/.test(suffix) ? suffix : null;
  }
  return /^\d{5}/.test(seriesId) ? seriesId.slice(0, 5) : null;
}

/**
 * Terms whose milestones apply to the chart: the live series' terms, falling
 * back to the ghosts' when a course is only being viewed historically.
 */
export function anchorTermCodes(series: SeatHistorySeries[]): TermCode[] {
  const live = series.filter((one) => !one.isGhost);
  const source = live.length > 0 ? live : series;
  const codes = source.map((one) => termCodeOfSeries(one.seriesId)).filter((code): code is TermCode => code != null);
  return [...new Set(codes)];
}

// ---------------------------------------------------------------------------
// Point normalisation
// ---------------------------------------------------------------------------

/** An observation with its instant already resolved to epoch milliseconds. */
export interface TimedSnapshot {
  t: number;
  snapshot: EnrollmentSnapshot;
}

/**
 * Chronological, de-duplicated, epoch-resolved observations.
 *
 * The contract promises "chronological, oldest first" but the data comes from
 * a crawl queue with jitter and retries, so we sort anyway. Two rows sharing an
 * instant means a re-read landed in the same millisecond; the later row wins
 * because it is the one the ingest wrote last.
 */
export function normalizePoints(points: EnrollmentSnapshot[]): TimedSnapshot[] {
  const byInstant = new Map<number, EnrollmentSnapshot>();
  for (const snapshot of points) {
    const t = Date.parse(snapshot.observedAt);
    if (Number.isNaN(t)) continue;
    if (!Number.isFinite(snapshot.enrollmentCount)) continue;
    byInstant.set(t, snapshot);
  }
  return [...byInstant.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, snapshot]) => ({ t, snapshot }));
}

// ---------------------------------------------------------------------------
// Ghost alignment
// ---------------------------------------------------------------------------

/**
 * Where a term's registration clock starts. Prefers the term's own
 * `registration_open` milestone; falls back to the series' first observation,
 * which is the best proxy we have when the calendar was never ingested.
 */
function anchorMs(
  termCode: TermCode | null,
  milestones: RegistrationMilestone[],
  points: TimedSnapshot[],
): number | null {
  if (termCode) {
    for (const milestone of milestones) {
      if (milestone.termCode !== termCode) continue;
      if (milestone.kind !== "registration_open") continue;
      const t = Date.parse(milestone.occursAt);
      if (!Number.isNaN(t)) return t;
    }
  }
  return points.length > 0 ? points[0].t : null;
}

/**
 * How far to slide each series along the time axis, in milliseconds.
 *
 * A ghost is last year's offering: on an absolute axis it sits a full year off
 * screen and answers nothing. Spec §13 wants it "behind the live one",
 * answering *"is this filling faster than normal"* — which is only a question
 * about elapsed time since registration opened. So ghosts are shifted so their
 * registration-open lines up with the live term's, and the shift is disclosed
 * in the legend and tooltip rather than hidden.
 *
 * Live series are never shifted: their axis is real wall-clock time.
 */
export function alignmentShifts(
  series: SeatHistorySeries[],
  milestones: RegistrationMilestone[],
): Map<string, number> {
  const shifts = new Map<string, number>();
  const normalized = new Map(series.map((one) => [one.seriesId, normalizePoints(one.points)]));

  const liveWithPoints = series.filter(
    (one) => !one.isGhost && (normalized.get(one.seriesId)?.length ?? 0) > 0,
  );
  const liveAnchor =
    liveWithPoints.length > 0
      ? anchorMs(
          termCodeOfSeries(liveWithPoints[0].seriesId),
          milestones,
          normalized.get(liveWithPoints[0].seriesId) ?? [],
        )
      : null;

  for (const one of series) {
    const points = normalized.get(one.seriesId) ?? [];
    if (!one.isGhost || liveAnchor == null || points.length === 0) {
      shifts.set(one.seriesId, 0);
      continue;
    }
    const ghostAnchor = anchorMs(termCodeOfSeries(one.seriesId), milestones, points);
    shifts.set(one.seriesId, ghostAnchor == null ? 0 : liveAnchor - ghostAnchor);
  }
  return shifts;
}

// ---------------------------------------------------------------------------
// The chart model
// ---------------------------------------------------------------------------

/**
 * One row handed to Recharts. `t` is epoch ms on the (possibly ghost-shifted)
 * timeline; every other key is a plot's `frameKey` holding the seats taken,
 * carried forward from that plot's last observation, or null before its first.
 */
export type SeatFrame = { t: number } & Record<string, number | null>;

export interface SeatPlot {
  /**
   * Flat key used in every frame row. Synthetic (`s0`, `s1`, …) rather than the
   * series id because Recharts resolves a string `dataKey` as a property PATH —
   * a dot in a series id would silently read the wrong value.
   */
  frameKey: string;
  series: SeatHistorySeries;
  isGhost: boolean;
  /** Milliseconds added to every observation. Non-zero only for aligned ghosts. */
  shiftMs: number;
  /** CSS custom property reference — resolved by the theme, so dark mode works. */
  colorVar: string;
}

export interface SeatChartModel {
  plots: SeatPlot[];
  frames: SeatFrame[];
  /** [earliest, latest] on the shifted timeline. Null when nothing is plottable. */
  domain: [number, number] | null;
  /** Largest seats-taken value observed, for sizing the y axis. */
  maxSeats: number;
  /** False when every series is empty — the caller renders the empty state. */
  hasData: boolean;
  /** frameKey → instant → the snapshot actually reported there (not carried). */
  observationIndex: Map<string, Map<number, EnrollmentSnapshot>>;
}

/** A single-observation series would collapse the x domain to a point. */
const SINGLE_POINT_PADDING_MS = 30 * 60 * 1000;

export function buildSeatChartModel(
  series: SeatHistorySeries[],
  milestones: RegistrationMilestone[] = [],
): SeatChartModel {
  const shifts = alignmentShifts(series, milestones);

  let liveIndex = 0;
  const plots: SeatPlot[] = series.map((one, index) => {
    const isGhost = one.isGhost === true;
    // Ghosts must not consume a palette slot, or two live lines would share a
    // colour whenever a ghost sits between them.
    const colorVar = isGhost
      ? GHOST_COLOR_VAR
      : LIVE_SERIES_COLOR_VARS[liveIndex++ % LIVE_SERIES_COLOR_VARS.length];
    return {
      frameKey: `s${index}`,
      series: one,
      isGhost,
      shiftMs: shifts.get(one.seriesId) ?? 0,
      colorVar,
    };
  });

  const timelines = new Map<string, TimedSnapshot[]>();
  const observationIndex = new Map<string, Map<number, EnrollmentSnapshot>>();
  const instants = new Set<number>();

  for (const plot of plots) {
    const shifted = normalizePoints(plot.series.points).map(({ t, snapshot }) => ({
      t: t + plot.shiftMs,
      snapshot,
    }));
    timelines.set(plot.frameKey, shifted);
    observationIndex.set(plot.frameKey, new Map(shifted.map((point) => [point.t, point.snapshot])));
    for (const point of shifted) instants.add(point.t);
  }

  const timeline = [...instants].sort((a, b) => a - b);

  // Step-after expansion: walk the union timeline once, advancing each plot's
  // cursor past every observation at or before the current instant and holding
  // whatever it last saw. Holding — not interpolating — is the whole point.
  const cursors = new Map(plots.map((plot) => [plot.frameKey, 0]));
  const carried = new Map<string, number | null>(plots.map((plot) => [plot.frameKey, null]));
  const frames: SeatFrame[] = [];
  let maxSeats = 0;

  for (const t of timeline) {
    const frame: SeatFrame = { t };
    for (const plot of plots) {
      const points = timelines.get(plot.frameKey) ?? [];
      let cursor = cursors.get(plot.frameKey) ?? 0;
      while (cursor < points.length && points[cursor].t <= t) {
        carried.set(plot.frameKey, points[cursor].snapshot.enrollmentCount);
        cursor += 1;
      }
      cursors.set(plot.frameKey, cursor);
      const value = carried.get(plot.frameKey) ?? null;
      frame[plot.frameKey] = value;
      if (value != null && value > maxSeats) maxSeats = value;
    }
    frames.push(frame);
  }

  let domain: [number, number] | null = null;
  if (timeline.length === 1) {
    domain = [timeline[0] - SINGLE_POINT_PADDING_MS, timeline[0] + SINGLE_POINT_PADDING_MS];
  } else if (timeline.length > 1) {
    domain = [timeline[0], timeline[timeline.length - 1]];
  }

  return {
    plots,
    frames,
    domain,
    maxSeats,
    hasData: frames.length > 0,
    observationIndex,
  };
}

/**
 * SVG paints in document order, so "ghosts render behind the live lines"
 * literally means "emit the ghosts first".
 */
export function orderForPainting(plots: SeatPlot[]): SeatPlot[] {
  return [...plots.filter((plot) => plot.isGhost), ...plots.filter((plot) => !plot.isGhost)];
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export interface PlottedMilestone {
  key: string;
  milestone: RegistrationMilestone;
  /** Epoch ms on the chart's timeline. */
  t: number;
}

/**
 * The vertical annotations that actually fit on the chart.
 *
 * Only the anchor terms' milestones are drawn: ghosts have been slid onto the
 * live term's clock precisely so the live term's markers describe them too.
 * Drawing the ghost term's own markers as well would double every line.
 */
export function milestonesInWindow(
  milestones: RegistrationMilestone[],
  domain: [number, number] | null,
  termCodes: TermCode[],
): PlottedMilestone[] {
  if (!domain) return [];
  const [from, to] = domain;
  const allowed = new Set(termCodes);
  const seen = new Set<string>();
  const plotted: PlottedMilestone[] = [];

  for (const milestone of milestones) {
    if (allowed.size > 0 && !allowed.has(milestone.termCode)) continue;
    const t = Date.parse(milestone.occursAt);
    if (Number.isNaN(t) || t < from || t > to) continue;
    const key = `${milestone.kind}-${milestone.label}-${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plotted.push({ key, milestone, t });
  }
  return plotted.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

/**
 * Y ceiling: whichever is larger of the seats we have seen and the published
 * cap, plus enough headroom that the capacity line is never flush with the
 * chart's top edge, rounded to a value that produces readable ticks.
 */
export function yAxisMax(maxSeats: number, capacity: number | null): number {
  const ceiling = Math.max(maxSeats, capacity ?? 0);
  if (!Number.isFinite(ceiling) || ceiling <= 0) return 10;
  const withHeadroom = ceiling * 1.08;
  const magnitude = Math.pow(10, Math.floor(Math.log10(withHeadroom)));
  const step = Math.max(1, Math.round(magnitude / 5));
  return Math.ceil(withHeadroom / step) * step;
}

export type TickGranularity = "hour" | "day" | "month";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Registration windows are watched hour-by-hour; an offering history spans
 * years. One formatter cannot serve both, so the span picks the unit.
 */
export function tickGranularity(domain: [number, number] | null): TickGranularity {
  if (!domain) return "day";
  const span = domain[1] - domain[0];
  if (span <= 36 * HOUR_MS) return "hour";
  if (span <= 120 * DAY_MS) return "day";
  return "month";
}

/** Whole days a ghost was slid by, for the disclosure text. */
export function shiftInDays(shiftMs: number): number {
  return Math.round(shiftMs / DAY_MS);
}
