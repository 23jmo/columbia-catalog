import { cx } from "@/utils/cx";
import type { ReputationSummary, ReviewDimensions, ReviewSourceKind } from "@/lib/types";

/**
 * Rendering for review dimensions.
 *
 * Spec §12: dimensions, not a verdict. Course quality and instructor quality
 * are scored separately and NEVER averaged into one headline number, and there
 * is deliberately NO confidence label — instead we show the things that would
 * drive one (sample size, date range, per-source breakdown) and let the student
 * judge. Nothing in this file computes a composite.
 */

export type DimensionKey = keyof ReviewDimensions;

export const DIMENSION_LABEL: Record<DimensionKey, string> = {
  teachingQuality: "Teaching quality",
  workload: "Workload",
  difficulty: "Difficulty",
  gradingFairness: "Grading fairness",
  sentiment: "Overall sentiment",
  wouldTakeAgain: "Would take again",
};

const WORKLOAD_WORDS = ["Very light", "Light", "Moderate", "Heavy", "Very heavy"];
const DIFFICULTY_WORDS = ["Very easy", "Easy", "Moderate", "Hard", "Very hard"];

function wordFor(key: DimensionKey, value: number): string | null {
  const index = Math.min(4, Math.max(0, Math.round(value) - 1));
  if (key === "workload") return WORKLOAD_WORDS[index];
  if (key === "difficulty") return DIFFICULTY_WORDS[index];
  return null;
}

export function formatDimension(key: DimensionKey, dimensions: ReviewDimensions): string | null {
  const raw = dimensions[key];
  if (raw == null) return null;
  if (key === "wouldTakeAgain") {
    // The shared type carries a boolean, not a rate — so we report the signal
    // the aggregator gives us rather than inventing a percentage.
    return raw ? "Majority say yes" : "Majority say no";
  }
  if (typeof raw !== "number") return null;
  if (key === "sentiment") {
    if (raw > 0.25) return "Positive";
    if (raw < -0.25) return "Negative";
    return "Mixed";
  }
  const word = wordFor(key, raw);
  return word ? `${raw.toFixed(1)} / 5 · ${word}` : `${raw.toFixed(1)} / 5`;
}

export function dateRangeLabel(range: ReputationSummary["dateRange"]): string | null {
  if (!range) return null;
  const [from, to] = range;
  const year = (iso: string) => (iso.match(/(\d{4})/)?.[1] ?? iso);
  const a = year(from);
  const b = year(to);
  return a === b ? a : `${a}–${b}`;
}

export function SourceBreakdown({
  bySource,
  className,
}: {
  bySource: Record<ReviewSourceKind, number>;
  className?: string;
}) {
  const entries = (Object.entries(bySource) as [ReviewSourceKind, number][])
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `${source === "culpa" ? "CULPA" : "Reddit"} (${count})`);
  if (entries.length === 0) return null;
  return (
    <p className={cx("text-caption-1-regular text-text-secondary", className)}>
      Sources: {entries.join(" · ")}
    </p>
  );
}

/** One dimension row: value, then the evidence behind it. Never a badge. */
export function DimensionRow({
  label,
  value,
  meta,
  ratio,
}: {
  label: string;
  value: string | null;
  meta?: string | null;
  /** 0–1 for the inline bar. Omitted for non-scalar dimensions. */
  ratio?: number | null;
}) {
  return (
    <div className="grid grid-cols-[minmax(7rem,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-1.5">
      <div className="min-w-0">
        <p className="text-body-regular text-text-primary">{label}</p>
        {ratio != null ? (
          <div className="mt-1 h-1 w-full max-w-40 overflow-hidden rounded-full bg-chart-track">
            <div className="h-full rounded-full bg-chart-4" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
        ) : null}
      </div>
      <div className="text-right">
        <p className={cx("text-body-medium tabular-nums", value ? "text-text-primary" : "text-text-tertiary")}>
          {value ?? "No signal"}
        </p>
        {meta ? <p className="text-caption-2-regular text-text-tertiary">{meta}</p> : null}
      </div>
    </div>
  );
}

const SCALAR_KEYS: DimensionKey[] = [
  "teachingQuality",
  "gradingFairness",
  "workload",
  "difficulty",
  "sentiment",
  "wouldTakeAgain",
];

/**
 * A single scored subject — "Instructor" or "Course experience". Two of these
 * sit side by side and are never combined.
 */
/**
 * The one place this caveat is written. Panels that host `ReputationBlock`
 * state it once in their own description rather than letting every empty block
 * repeat it.
 */
export const UNREVIEWED_CAVEAT =
  "Unreviewed is not the same as bad — it usually means a course is new, small, or simply under-discussed.";

export function ReputationBlock({
  title,
  subtitle,
  summary,
  keys = SCALAR_KEYS,
}: {
  title: string;
  subtitle?: string | null;
  summary: ReputationSummary | null;
  keys?: DimensionKey[];
}) {
  const range = summary ? dateRangeLabel(summary.dateRange) : null;
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border-table p-3">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <h4 className="text-body-semibold text-text-primary">{title}</h4>
        {summary ? (
          <p className="text-caption-2-regular tabular-nums text-text-tertiary">
            n={summary.sampleSize}
            {range ? `, ${range}` : ""}
          </p>
        ) : null}
      </div>
      {subtitle ? <p className="mb-1 text-caption-1-regular text-text-secondary">{subtitle}</p> : null}

      {summary ? (
        <>
          <div className="divide-y divide-separator-border">
            {keys.map((key) => {
              const raw = summary.dimensions[key];
              const ratio =
                key !== "wouldTakeAgain" && key !== "sentiment" && typeof raw === "number"
                  ? raw / 5
                  : null;
              return (
                <DimensionRow
                  key={key}
                  label={DIMENSION_LABEL[key]}
                  value={formatDimension(key, summary.dimensions)}
                  ratio={ratio}
                />
              );
            })}
          </div>
          <SourceBreakdown bySource={summary.bySource} className="mt-3" />
        </>
      ) : (
        /*
         * Short on purpose.
         *
         * This block renders once per instructor and once per review dimension,
         * so a four-instructor course with no matched reviews printed the same
         * 25-word caveat seven times down a single page — which reads as filler
         * and trains the eye to skip the panel entirely. The caveat itself is
         * worth stating, so it moved up to `UNREVIEWED_CAVEAT`, which the
         * enclosing panels state once. What stays here is only the fact.
         */
        <p className="py-2 text-body-regular text-text-tertiary">No reviews matched yet.</p>
      )}
    </div>
  );
}
