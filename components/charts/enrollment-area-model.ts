/**
 * Hover-chart math for a single section's enrollment looks.
 *
 * Kept out of the React file so a lone reading, a flat heartbeat run, and an
 * empty history can be asserted without mounting Recharts.
 *
 * Heartbeats are real points. A section that stayed at 42 across three looks
 * still has a history — the line is flat, which is the answer.
 */

export interface EnrollmentPoint {
  /** Epoch ms — a numeric x axis so gaps between readings are drawn to scale. */
  t: number;
  enrolled: number;
}

export interface EnrollmentAreaModel {
  sorted: EnrollmentPoint[];
  drawn: EnrollmentPoint[];
  first: EnrollmentPoint;
  last: EnrollmentPoint;
  delta: number;
  yMax: number;
  sameDay: boolean;
  spanDays: number;
}

/**
 * Floor for a series with no time width (one look, or two looks in the same
 * millisecond). The hold-tail is a fraction of this, so the current level is a
 * segment instead of a point.
 */
const MIN_SPAN_MS = 30 * 60 * 1000;

/**
 * A y-ceiling that produces whole, round ticks.
 *
 * Recharts will happily hand back `0 / 46.5 / 93` for a peak of 86, and three
 * arbitrary numbers up the side of a 160px plot is worse than no axis at all —
 * the reader stops using them as a scale and starts reading them as data.
 * Rounding up to the next power-of-ten multiple gives 0 / 50 / 100 here, and
 * 0 / 250 / 500 for a 400-seat lecture.
 */
export function niceCeiling(value: number): number {
  const safe = Math.max(value, 1);
  const unit = 10 ** Math.floor(Math.log10(safe));
  return Math.ceil(safe / unit) * unit;
}

/**
 * Shape the hover chart from raw looks.
 *
 * One reading is enough to draw: heartbeats record "still this number", so we
 * no longer wait for the count to move. Returns null only when there is
 * nothing to plot.
 */
export function buildEnrollmentAreaModel(
  points: EnrollmentPoint[],
  capacity: number | null,
): EnrollmentAreaModel | null {
  if (points.length === 0) return null;

  const sorted = [...points].sort((a, b) => a.t - b.t);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const peak = Math.max(...sorted.map((point) => point.enrolled), capacity ?? 0);
  // Zero-width series (one look) still need a span so the hold-tail has length.
  const span = last.t === first.t ? MIN_SPAN_MS : last.t - first.t;

  /*
   * The current level has to be drawn as a segment, not as a corner.
   *
   * `stepAfter` holds each value until the next observation and then steps.
   * That is the right shape, but it means the FINAL value steps up exactly
   * at the last x — zero width — so a section that went 66 → 86 draws as a
   * flat line at 66 with a hairline at the right edge. The reader's eye
   * takes the silhouette as the story, and the story it tells is the
   * previous value.
   *
   * Extending past the last look is a short tail so the current number has
   * a shape you can see. How stale the whole reading is stays the provenance
   * stamp's job, under the chip.
   */
  const drawn = [...sorted, { t: last.t + span * 0.12, enrolled: last.enrolled }];

  return {
    sorted,
    drawn,
    first,
    last,
    delta: last.enrolled - first.enrolled,
    // Head-room above the taller of the peak and the cap, so neither the line
    // nor the cap rule runs along the top edge of the plot.
    yMax: niceCeiling(peak * 1.08),
    /*
     * Format the axis by calendar day, not by elapsed hours. Two readings 24h
     * apart both taken at the overnight ingest are a 1.0-day span, and an
     * hours format renders them as "9 PM" and "9 PM" — an axis that labels
     * two different days with the same string.
     */
    sameDay: new Date(first.t).toDateString() === new Date(last.t).toDateString(),
    spanDays: span / 86_400_000,
  };
}
