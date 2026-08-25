/**
 * LionPlan — reputation aggregation (spec §12).
 *
 * Four rules govern this file. They are product decisions, not implementation
 * details, and every one of them is load-bearing:
 *
 * 1. **Course quality and instructor quality never merge.** They are computed
 *    by two different functions, over two differently-scoped review sets, and
 *    returned as two separate `ReputationSummary` values. There is deliberately
 *    no function in this module that averages them. A section shows both, side
 *    by side — see `sectionReputation`.
 *
 * 2. **No confidence label is derived.** We never print "high confidence" or a
 *    star count that secretly encodes sample size. Instead every summary
 *    carries the three components a reader would use to judge for themselves:
 *    `sampleSize`, `dateRange`, and `bySource`. Deriving a label from those and
 *    hiding them would be strictly worse.
 *
 * 3. **Recency is weighted.** Forty reviews of a professor who last taught the
 *    course in 2019 must not outvote six from last year. See `recencyWeight`.
 *
 * 4. **A composite is allowed, but only if it is expandable and reproducible.**
 *    `computeComposite` returns the score together with every input, every
 *    weight, and the formula string — enough for the UI to render the full
 *    derivation, and enough for `recomputeComposite` to reproduce the number
 *    exactly from what was returned. If you cannot show your work, you do not
 *    get a number.
 */

import type {
  ReputationSummary,
  ReviewDimensions,
  ReviewRecord,
  ReviewSourceKind,
} from "../types";

// ---------------------------------------------------------------------------
// Recency weighting
// ---------------------------------------------------------------------------

/**
 * Exponential decay with a two-year half-life:
 *
 *     weight(age) = max(MIN_RECENCY_WEIGHT, 0.5 ^ (ageYears / HALF_LIFE_YEARS))
 *
 * Why exponential, and why two years:
 *
 *   · A course is effectively a different course when the instructor changes,
 *     and instructors rotate on roughly a two-to-four-year cycle at Columbia.
 *     Two years puts a review from the last offering at ~0.5 and one from four
 *     years ago at ~0.25, which matches how much a student would discount them.
 *   · Exponential rather than linear or a hard cutoff: a cutoff creates a cliff
 *     where one review flips in or out of the corpus on an arbitrary date, and
 *     linear decay either goes negative or needs a clamp that reintroduces the
 *     cliff. Decay is smooth and monotone, so a summary never jumps.
 *   · The floor (`MIN_RECENCY_WEIGHT`) keeps very old reviews present but
 *     nearly weightless. They still count toward `sampleSize` and `dateRange` —
 *     which is exactly why those fields are shown — but they cannot drive the
 *     numbers. Deleting them instead would misrepresent how much evidence
 *     exists.
 *
 * A review with no date gets `UNDATED_RECENCY_WEIGHT`, equal to the weight of a
 * review two half-lives old. Undated reviews are mostly old ones, and guessing
 * "recent" for them would be the expensive mistake.
 */
export const RECENCY_HALF_LIFE_YEARS = 2;
export const MIN_RECENCY_WEIGHT = 0.05;
export const UNDATED_RECENCY_WEIGHT = 0.25;

const MILLIS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function recencyWeight(
  postedAt: string | null,
  now: Date = new Date(),
  halfLifeYears: number = RECENCY_HALF_LIFE_YEARS,
): number {
  if (!postedAt) return UNDATED_RECENCY_WEIGHT;
  const posted = Date.parse(postedAt);
  if (Number.isNaN(posted)) return UNDATED_RECENCY_WEIGHT;

  const ageYears = (now.getTime() - posted) / MILLIS_PER_YEAR;
  // A future-dated review (clock skew, bad parse) is treated as brand new.
  if (ageYears <= 0) return 1;
  const decayed = 0.5 ** (ageYears / Math.max(0.25, halfLifeYears));
  return Math.max(MIN_RECENCY_WEIGHT, roundTo(decayed, 6));
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export interface SummarizeOptions {
  /** Injected in tests so decay is deterministic. */
  now?: Date;
  halfLifeYears?: number;
}

/** Per-review weight, exposed so the UI can show why a summary looks as it does. */
export interface ReviewContribution {
  reviewId: string;
  source: ReviewSourceKind;
  postedAt: string | null;
  ageYears: number | null;
  weight: number;
}

/** How much evidence stood behind each dimension's mean. */
export type DimensionSupport = Record<
  keyof ReviewDimensions,
  { count: number; weight: number }
>;

export interface ReputationDerivation {
  summary: ReputationSummary;
  contributions: ReviewContribution[];
  support: DimensionSupport;
  /**
   * Weighted share of reviews answering "yes" to would-take-again, 0–100.
   * `null` when no review carried the signal. This is the number the UI shows
   * ("Would take again 78%"); `summary.dimensions.wouldTakeAgain` is the same
   * fact thresholded to a boolean because the shared type demands one.
   */
  wouldTakeAgainPercent: number | null;
  composite: CompositeScore | null;
}

const NUMERIC_DIMENSIONS = [
  "workload",
  "difficulty",
  "teachingQuality",
  "gradingFairness",
  "sentiment",
] as const;

type NumericDimension = (typeof NUMERIC_DIMENSIONS)[number];

/**
 * Aggregate an already-scoped set of reviews.
 *
 * This function does not know whether it is looking at a course or an
 * instructor — that is the caller's decision, and `summarizeCourse` /
 * `summarizeInstructor` are the callers you should be using. It is exported
 * for the case where a caller has scoped the set some other way.
 */
export function summarize(
  reviews: ReviewRecord[],
  options: SummarizeOptions = {},
): ReputationSummary {
  return summarizeWithDerivation(reviews, options).summary;
}

/** `summarize`, plus everything needed to explain the result. */
export function summarizeWithDerivation(
  reviews: ReviewRecord[],
  options: SummarizeOptions = {},
): ReputationDerivation {
  const now = options.now ?? new Date();
  const halfLife = options.halfLifeYears ?? RECENCY_HALF_LIFE_YEARS;

  const contributions: ReviewContribution[] = reviews.map((review) => ({
    reviewId: review.reviewId,
    source: review.source,
    postedAt: review.postedAt,
    ageYears: ageInYears(review.postedAt, now),
    weight: recencyWeight(review.postedAt, now, halfLife),
  }));

  const support = emptySupport();
  const dimensions: ReviewDimensions = {
    workload: null,
    difficulty: null,
    teachingQuality: null,
    gradingFairness: null,
    sentiment: null,
    wouldTakeAgain: null,
  };

  for (const dimension of NUMERIC_DIMENSIONS) {
    let weighted = 0;
    let weightTotal = 0;
    let count = 0;
    for (let index = 0; index < reviews.length; index += 1) {
      const value = reviews[index][dimension];
      if (typeof value !== "number" || Number.isNaN(value)) continue;
      const weight = contributions[index].weight;
      weighted += value * weight;
      weightTotal += weight;
      count += 1;
    }
    support[dimension] = { count, weight: roundTo(weightTotal, 6) };
    dimensions[dimension] = weightTotal > 0 ? roundTo(weighted / weightTotal, 2) : null;
  }

  // Would-take-again is a weighted proportion, not a mean of numbers.
  let yesWeight = 0;
  let answeredWeight = 0;
  let answeredCount = 0;
  for (let index = 0; index < reviews.length; index += 1) {
    const value = reviews[index].wouldTakeAgain;
    if (typeof value !== "boolean") continue;
    const weight = contributions[index].weight;
    answeredWeight += weight;
    answeredCount += 1;
    if (value) yesWeight += weight;
  }
  support.wouldTakeAgain = { count: answeredCount, weight: roundTo(answeredWeight, 6) };
  const wouldTakeAgainPercent =
    answeredWeight > 0 ? roundTo((yesWeight / answeredWeight) * 100, 1) : null;
  dimensions.wouldTakeAgain =
    wouldTakeAgainPercent === null ? null : wouldTakeAgainPercent >= 50;

  const summary: ReputationSummary = {
    dimensions,
    sampleSize: reviews.length,
    dateRange: dateRangeOf(reviews),
    bySource: countBySource(reviews),
  };

  return {
    summary,
    contributions,
    support,
    wouldTakeAgainPercent,
    composite: computeComposite(summary),
  };
}

/**
 * Course-scoped reputation: every review attached to this course, regardless of
 * who taught it.
 *
 * Kept deliberately separate from `summarizeInstructor`. "The course is a slog
 * but Ferguson makes it worth it" is a real and common shape, and averaging the
 * two into one number destroys exactly the information a student needs.
 */
export function summarizeCourse(
  reviews: ReviewRecord[],
  courseId: string,
  options: SummarizeOptions = {},
): ReputationSummary {
  return summarize(scopeToCourse(reviews, courseId), options);
}

export function summarizeCourseWithDerivation(
  reviews: ReviewRecord[],
  courseId: string,
  options: SummarizeOptions = {},
): ReputationDerivation {
  return summarizeWithDerivation(scopeToCourse(reviews, courseId), options);
}

/** Instructor-scoped reputation: every review of this instructor, any course. */
export function summarizeInstructor(
  reviews: ReviewRecord[],
  instructorName: string,
  options: SummarizeOptions = {},
): ReputationSummary {
  return summarize(scopeToInstructor(reviews, instructorName), options);
}

export function summarizeInstructorWithDerivation(
  reviews: ReviewRecord[],
  instructorName: string,
  options: SummarizeOptions = {},
): ReputationDerivation {
  return summarizeWithDerivation(scopeToInstructor(reviews, instructorName), options);
}

/**
 * The only place course and instructor reputation appear together — as two
 * fields, never as one number. This is what a section renders.
 */
export interface SectionReputation {
  courseId: string;
  instructorName: string | null;
  course: ReputationSummary;
  instructor: ReputationSummary | null;
}

export function sectionReputation(
  reviews: ReviewRecord[],
  courseId: string,
  instructorName: string | null,
  options: SummarizeOptions = {},
): SectionReputation {
  return {
    courseId,
    instructorName,
    course: summarizeCourse(reviews, courseId, options),
    instructor: instructorName ? summarizeInstructor(reviews, instructorName, options) : null,
  };
}

// ---------------------------------------------------------------------------
// Scoping
// ---------------------------------------------------------------------------

export function scopeToCourse(reviews: ReviewRecord[], courseId: string): ReviewRecord[] {
  const wanted = courseId.trim().toUpperCase();
  return reviews.filter((review) => (review.courseId ?? "").trim().toUpperCase() === wanted);
}

/**
 * Instructor matching is case- and punctuation-insensitive but otherwise
 * exact. Fuzzy name matching is how a review of the wrong person ends up on
 * someone's profile, so we do not do it here.
 */
export function scopeToInstructor(
  reviews: ReviewRecord[],
  instructorName: string,
): ReviewRecord[] {
  const wanted = normalizeInstructorName(instructorName);
  return reviews.filter(
    (review) =>
      review.instructorName !== null && normalizeInstructorName(review.instructorName) === wanted,
  );
}

export function normalizeInstructorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Composite — expandable and reproducible, or it does not exist
// ---------------------------------------------------------------------------

/**
 * Weights, versioned so a stored composite can be traced to the formula that
 * produced it.
 *
 * Workload and difficulty are deliberately NOT in the composite. They are
 * descriptive, not evaluative: a hard course is not a bad course, and a student
 * looking for a challenge wants the difficulty number raw, not folded into a
 * quality score with a sign someone else chose. They are surfaced as their own
 * dimensions and as their own filters.
 */
export const COMPOSITE_WEIGHTS_VERSION = "composite-v1";

export const COMPOSITE_WEIGHTS: Record<string, number> = {
  teachingQuality: 0.5,
  gradingFairness: 0.25,
  sentiment: 0.25,
};

export const COMPOSITE_FORMULA =
  "value = 1 + 4 * Σ(normalized_i × effectiveWeight_i), where effectiveWeight_i = weight_i / Σ(weights of present dimensions); normalized maps teachingQuality and gradingFairness from 1..5 to 0..1 and sentiment from -1..1 to 0..1";

export interface CompositeInput {
  key: string;
  label: string;
  /** The dimension mean, on its own scale, exactly as shown elsewhere. */
  rawValue: number;
  /** `rawValue` mapped to 0..1. */
  normalized: number;
  /** Configured weight from `COMPOSITE_WEIGHTS`. */
  weight: number;
  /** Weight after renormalising over the dimensions actually present. */
  effectiveWeight: number;
  /** `normalized × effectiveWeight`, rounded — this is what gets summed. */
  contribution: number;
}

export interface CompositeScore {
  /** On the same 1–5 scale as the dimensions. */
  value: number;
  scale: [number, number];
  formula: string;
  weightsVersion: string;
  inputs: CompositeInput[];
  /** Dimensions the formula wanted but the corpus did not supply. */
  missing: string[];
}

/** Digits kept on `contribution`, so `recomputeComposite` is bit-for-bit exact. */
const CONTRIBUTION_PRECISION = 6;

const COMPOSITE_LABELS: Record<string, string> = {
  teachingQuality: "Teaching quality",
  gradingFairness: "Grading fairness",
  sentiment: "Overall sentiment",
};

function normalizeForComposite(key: string, value: number): number {
  if (key === "sentiment") return clamp((value + 1) / 2, 0, 1);
  return clamp((value - 1) / 4, 0, 1);
}

/**
 * Build the composite, or return `null` when no contributing dimension exists.
 *
 * Everything the UI needs to render "here is exactly how we got 4.2" comes back
 * in the return value. Nothing is recomputed from hidden state.
 */
export function computeComposite(summary: ReputationSummary): CompositeScore | null {
  const present: Array<{ key: string; rawValue: number }> = [];
  const missing: string[] = [];

  for (const key of Object.keys(COMPOSITE_WEIGHTS)) {
    const value = summary.dimensions[key as NumericDimension];
    if (typeof value === "number" && !Number.isNaN(value)) {
      present.push({ key, rawValue: value });
    } else {
      missing.push(key);
    }
  }
  if (present.length === 0) return null;

  const weightTotal = present.reduce((total, item) => total + COMPOSITE_WEIGHTS[item.key], 0);

  const inputs: CompositeInput[] = present.map(({ key, rawValue }) => {
    const weight = COMPOSITE_WEIGHTS[key];
    const effectiveWeight = roundTo(weight / weightTotal, CONTRIBUTION_PRECISION);
    const normalized = roundTo(normalizeForComposite(key, rawValue), CONTRIBUTION_PRECISION);
    return {
      key,
      label: COMPOSITE_LABELS[key] ?? key,
      rawValue,
      normalized,
      weight,
      effectiveWeight,
      contribution: roundTo(normalized * effectiveWeight, CONTRIBUTION_PRECISION),
    };
  });

  return {
    value: recomputeComposite(inputs),
    scale: [1, 5],
    formula: COMPOSITE_FORMULA,
    weightsVersion: COMPOSITE_WEIGHTS_VERSION,
    inputs,
    missing,
  };
}

/**
 * Recompute a composite from nothing but its published inputs.
 *
 * This is the reproducibility guarantee, and it is a real function rather than
 * a comment so a test can assert it: `recomputeComposite(score.inputs)` must
 * equal `score.value` for every score this module ever emits.
 */
export function recomputeComposite(inputs: CompositeInput[]): number {
  const sum = inputs.reduce((total, input) => total + input.contribution, 0);
  return roundTo(1 + 4 * clamp(sum, 0, 1), 2);
}

// ---------------------------------------------------------------------------
// Components — shown instead of a confidence label
// ---------------------------------------------------------------------------

export function countBySource(reviews: ReviewRecord[]): Record<ReviewSourceKind, number> {
  // Both keys always present, so the UI can print "Reddit (0)" rather than
  // silently omitting a source that genuinely had nothing.
  const counts: Record<ReviewSourceKind, number> = { culpa: 0, reddit: 0 };
  for (const review of reviews) {
    if (review.source === "culpa" || review.source === "reddit") counts[review.source] += 1;
  }
  return counts;
}

/** `[oldest, newest]` as `YYYY-MM-DD`, or `null` when nothing is dated. */
export function dateRangeOf(reviews: ReviewRecord[]): [string, string] | null {
  let oldest: number | null = null;
  let newest: number | null = null;
  for (const review of reviews) {
    if (!review.postedAt) continue;
    const time = Date.parse(review.postedAt);
    if (Number.isNaN(time)) continue;
    if (oldest === null || time < oldest) oldest = time;
    if (newest === null || time > newest) newest = time;
  }
  if (oldest === null || newest === null) return null;
  return [isoDate(oldest), isoDate(newest)];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function emptySupport(): DimensionSupport {
  const zero = { count: 0, weight: 0 };
  return {
    workload: { ...zero },
    difficulty: { ...zero },
    teachingQuality: { ...zero },
    gradingFairness: { ...zero },
    sentiment: { ...zero },
    wouldTakeAgain: { ...zero },
  };
}

function ageInYears(postedAt: string | null, now: Date): number | null {
  if (!postedAt) return null;
  const posted = Date.parse(postedAt);
  if (Number.isNaN(posted)) return null;
  return roundTo((now.getTime() - posted) / MILLIS_PER_YEAR, 3);
}

function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
