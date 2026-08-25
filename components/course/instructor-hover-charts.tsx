/**
 * Compact chart graphics for the instructor hover card.
 *
 * Single-hue bars — shade tracks score strength. Pure CSS, no recharts.
 */

import { cx } from "@/utils/cx";
import type { ReputationSummary, ReviewDimensions, ReviewSourceKind, RmpSnapshot } from "@/lib/types";

import { DIMENSION_LABEL, type DimensionKey } from "./reputation";

/** One chart hue; opacity carries the score. */
const BAR_FILL = "bg-chart-4";

const EMPTY_STUB = 3;
const PLOT_HEIGHT = 48;

function scalarRatio(key: DimensionKey, raw: ReviewDimensions[DimensionKey]): number | null {
  if (typeof raw !== "number") return null;
  if (key === "sentiment") return Math.min(1, Math.max(0, (raw + 1) / 2));
  return Math.min(1, Math.max(0, raw / 5));
}

/** Stronger scores read darker; empty buckets stay faint. */
function barOpacity(ratio: number | null): number {
  if (ratio == null || ratio <= 0) return 0.22;
  return 0.28 + ratio * 0.72;
}

function BarColumn({
  label,
  value,
  ratio,
}: {
  label: string;
  value: string;
  ratio: number | null;
}) {
  const height =
    ratio != null && ratio > 0
      ? Math.max(6, Math.round(ratio * (PLOT_HEIGHT - 8)))
      : EMPTY_STUB;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
      <div
        className="flex w-full items-end rounded-sm bg-chart-track"
        style={{ height: PLOT_HEIGHT }}
        aria-hidden
      >
        <div
          className={cx(
            "h-full w-full origin-bottom rounded-sm",
            "transition-transform duration-300 ease-out motion-reduce:transition-none",
            BAR_FILL,
          )}
          style={{ transform: `scaleY(${height / PLOT_HEIGHT})`, opacity: barOpacity(ratio) }}
        />
      </div>
      <p className="w-full truncate text-center text-caption-2-medium text-text-tertiary">
        {label}
      </p>
      <p className="text-caption-2-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

export function ReputationMiniChart({
  summary,
  keys,
  className,
}: {
  summary: ReputationSummary;
  keys: DimensionKey[];
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-xl bg-background-secondary-default px-2 py-2",
        className,
      )}
      role="img"
      aria-label="Columbia review dimensions"
    >
      <div className="flex items-end gap-1">
        {keys.map((key) => {
          const raw = summary.dimensions[key];
          const short =
            typeof raw === "number"
              ? key === "wouldTakeAgain"
                ? raw
                  ? "Yes"
                  : "No"
                : raw.toFixed(1)
              : "—";
          return (
            <BarColumn
              key={key}
              label={DIMENSION_LABEL[key]
                .replace("Teaching quality", "Teaching")
                .replace("Grading fairness", "Grading")}
              value={short}
              ratio={scalarRatio(key, raw)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function RmpMiniChart({ snapshot, className }: { snapshot: RmpSnapshot; className?: string }) {
  const ratingRatio = snapshot.rating != null ? snapshot.rating / 5 : null;
  const difficultyRatio = snapshot.difficulty != null ? snapshot.difficulty / 5 : null;
  const againRatio =
    snapshot.wouldTakeAgainPercent != null ? snapshot.wouldTakeAgainPercent / 100 : null;

  return (
    <div
      className={cx(
        "rounded-xl bg-background-secondary-default px-2 py-2",
        className,
      )}
      role="img"
      aria-label="RateMyProfessor metrics"
    >
      <div className="flex items-end gap-1">
        <BarColumn
          label="Rating"
          value={snapshot.rating != null ? snapshot.rating.toFixed(1) : "—"}
          ratio={ratingRatio}
        />
        <BarColumn
          label="Difficulty"
          value={snapshot.difficulty != null ? snapshot.difficulty.toFixed(1) : "—"}
          ratio={difficultyRatio}
        />
        <BarColumn
          label="Again"
          value={
            snapshot.wouldTakeAgainPercent != null
              ? `${Math.round(snapshot.wouldTakeAgainPercent)}%`
              : "—"
          }
          ratio={againRatio}
        />
      </div>
    </div>
  );
}

export function SourceMixChart({
  bySource,
  className,
}: {
  bySource: Record<ReviewSourceKind, number>;
  className?: string;
}) {
  const entries = (Object.entries(bySource) as [ReviewSourceKind, number][]).filter(
    ([, count]) => count > 0,
  );
  if (entries.length === 0) return null;

  const label = entries
    .map(([source, count]) => `${source === "culpa" ? "CULPA" : "Reddit"} ${count}`)
    .join(" · ");

  return (
    <p className={cx("text-caption-2-regular text-text-tertiary", className)}>
      {label}
    </p>
  );
}

export function ChartSkeleton({ bars = 3, className }: { bars?: number; className?: string }) {
  return (
    <div
      className={cx(
        "flex items-end gap-1 rounded-xl bg-background-secondary-default px-2 py-2",
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: bars }, (_, index) => (
        <div key={index} className="flex flex-1 flex-col items-center gap-0.5">
          <div
            className="flex w-full animate-pulse items-end rounded-sm bg-chart-track"
            style={{ height: PLOT_HEIGHT }}
          >
            <div
              className={cx("w-full rounded-sm", BAR_FILL)}
              style={{ height: 8 + (index % 3) * 6, opacity: 0.25 }}
            />
          </div>
          <div className="h-2 w-8 animate-pulse rounded bg-background-tertiary-default" />
        </div>
      ))}
    </div>
  );
}
