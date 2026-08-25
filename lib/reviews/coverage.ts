/**
 * LionPlan — review coverage (spec §6 and §12, "Coverage honesty").
 *
 * Most Columbia courses have no reviews. That is not a defect to be hidden; it
 * is the single most important thing to be honest about, because the failure
 * mode is silent and severe: a student drags the "teaching quality ≥ 4" slider,
 * the result set shrinks, and every unreviewed course — which is most of the
 * catalog, including the one they were looking for — vanishes without a word.
 *
 * So the default here is INCLUDE. `includeUnrated` defaults to `true`
 * everywhere in this module, an absent value means `true`, and only an explicit
 * `false` removes an unrated course from a result set. `SearchFilters` in
 * `lib/types.ts` documents the same default; this module is where it is
 * actually enforced.
 *
 * The index is a plain in-memory structure built from `ReviewRecord[]`. It is
 * cheap to rebuild and is not persisted here — the search lane owns delivery.
 */

import type { ReviewRecord, ReviewSourceKind, SearchFilters } from "../types";
import { countBySource, dateRangeOf, normalizeInstructorName, summarize } from "./aggregate";
import type { SummarizeOptions } from "./aggregate";

/** Spec §6: unreviewed courses are included unless the user opts out. */
export const DEFAULT_INCLUDE_UNRATED = true;

export interface CoverageEntry {
  /** `courseId` or normalized instructor name, depending on the map. */
  key: string;
  reviewCount: number;
  bySource: Record<ReviewSourceKind, number>;
  dateRange: [string, string] | null;
  /** How many reviews carried at least one non-null dimension. */
  ratedReviewCount: number;
}

export interface CoverageIndex {
  courses: Map<string, CoverageEntry>;
  instructors: Map<string, CoverageEntry>;
  /** Total reviews the index was built from. */
  totalReviews: number;
  builtAt: string;
}

export function emptyCoverageIndex(): CoverageIndex {
  return {
    courses: new Map(),
    instructors: new Map(),
    totalReviews: 0,
    builtAt: new Date(0).toISOString(),
  };
}

function hasAnyDimension(review: ReviewRecord): boolean {
  return (
    review.workload !== null ||
    review.difficulty !== null ||
    review.teachingQuality !== null ||
    review.gradingFairness !== null ||
    review.sentiment !== null ||
    review.wouldTakeAgain !== null
  );
}

function accumulate(map: Map<string, CoverageEntry>, key: string, review: ReviewRecord): void {
  let entry = map.get(key);
  if (!entry) {
    entry = {
      key,
      reviewCount: 0,
      bySource: { culpa: 0, reddit: 0 },
      dateRange: null,
      ratedReviewCount: 0,
    };
    map.set(key, entry);
  }
  entry.reviewCount += 1;
  if (review.source === "culpa" || review.source === "reddit") entry.bySource[review.source] += 1;
  if (hasAnyDimension(review)) entry.ratedReviewCount += 1;
}

export function buildCoverageIndex(reviews: ReviewRecord[]): CoverageIndex {
  const index = emptyCoverageIndex();
  index.totalReviews = reviews.length;
  index.builtAt = new Date().toISOString();

  const courseReviews = new Map<string, ReviewRecord[]>();
  const instructorReviews = new Map<string, ReviewRecord[]>();

  for (const review of reviews) {
    if (review.courseId) {
      const key = review.courseId.trim().toUpperCase();
      accumulate(index.courses, key, review);
      pushTo(courseReviews, key, review);
    }
    if (review.instructorName) {
      const key = normalizeInstructorName(review.instructorName);
      if (key.length > 0) {
        accumulate(index.instructors, key, review);
        pushTo(instructorReviews, key, review);
      }
    }
  }

  // Date ranges and per-source counts come from the same helpers the summary
  // uses, so a coverage badge can never disagree with the drawer it opens.
  for (const [key, entry] of index.courses) {
    const scoped = courseReviews.get(key) ?? [];
    entry.dateRange = dateRangeOf(scoped);
    entry.bySource = countBySource(scoped);
  }
  for (const [key, entry] of index.instructors) {
    const scoped = instructorReviews.get(key) ?? [];
    entry.dateRange = dateRangeOf(scoped);
    entry.bySource = countBySource(scoped);
  }

  return index;
}

function pushTo(map: Map<string, ReviewRecord[]>, key: string, review: ReviewRecord): void {
  const existing = map.get(key);
  if (existing) existing.push(review);
  else map.set(key, [review]);
}

// ---------------------------------------------------------------------------
// The active index
// ---------------------------------------------------------------------------

/**
 * A process-local index so callers can ask `hasCoverage(courseId)` without
 * threading an index through every layer. Explicit-index overloads exist for
 * tests and for server contexts that hold their own.
 */
let activeIndex: CoverageIndex = emptyCoverageIndex();

export function setCoverageIndex(index: CoverageIndex): void {
  activeIndex = index;
}

export function getCoverageIndex(): CoverageIndex {
  return activeIndex;
}

export function resetCoverageIndex(): void {
  activeIndex = emptyCoverageIndex();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Does this course have at least one review? */
export function hasCoverage(courseId: string, index: CoverageIndex = activeIndex): boolean {
  return coverageFor(courseId, index) !== null;
}

export function coverageFor(
  courseId: string,
  index: CoverageIndex = activeIndex,
): CoverageEntry | null {
  if (!courseId) return null;
  return index.courses.get(courseId.trim().toUpperCase()) ?? null;
}

export function hasInstructorCoverage(
  instructorName: string,
  index: CoverageIndex = activeIndex,
): boolean {
  return instructorCoverageFor(instructorName, index) !== null;
}

export function instructorCoverageFor(
  instructorName: string,
  index: CoverageIndex = activeIndex,
): CoverageEntry | null {
  if (!instructorName) return null;
  return index.instructors.get(normalizeInstructorName(instructorName)) ?? null;
}

export function reviewCount(courseId: string, index: CoverageIndex = activeIndex): number {
  return coverageFor(courseId, index)?.reviewCount ?? 0;
}

// ---------------------------------------------------------------------------
// The "include unrated" toggle
// ---------------------------------------------------------------------------

/** An absent toggle means include. Only an explicit `false` excludes. */
export function resolveIncludeUnrated(filters: Pick<SearchFilters, "includeUnrated">): boolean {
  return filters.includeUnrated ?? DEFAULT_INCLUDE_UNRATED;
}

/** Is any reputation filter actually engaged? */
export function hasReputationFilter(
  filters: Pick<SearchFilters, "maxWorkload" | "minTeachingQuality">,
): boolean {
  return typeof filters.maxWorkload === "number" || typeof filters.minTeachingQuality === "number";
}

export type ReputationLookup = (courseId: string) => {
  workload: number | null;
  teachingQuality: number | null;
} | null;

/**
 * Should this course survive the reputation filters?
 *
 * The whole point of the module, in one function:
 *
 *   · No reputation filter engaged → everything passes.
 *   · Course has no coverage → passes when `includeUnrated` (the default),
 *     fails only when the user explicitly turned the toggle off.
 *   · Course has coverage → its numbers are compared. A dimension the corpus
 *     never scored is treated as unrated for that dimension and follows the
 *     same rule, rather than being silently failed.
 */
export function passesReputationFilter(
  courseId: string,
  filters: Pick<SearchFilters, "maxWorkload" | "minTeachingQuality" | "includeUnrated">,
  lookup: ReputationLookup,
  index: CoverageIndex = activeIndex,
): boolean {
  if (!hasReputationFilter(filters)) return true;

  const includeUnrated = resolveIncludeUnrated(filters);
  if (!hasCoverage(courseId, index)) return includeUnrated;

  const dimensions = lookup(courseId);
  if (!dimensions) return includeUnrated;

  if (typeof filters.maxWorkload === "number") {
    if (dimensions.workload === null) {
      if (!includeUnrated) return false;
    } else if (dimensions.workload > filters.maxWorkload) {
      return false;
    }
  }

  if (typeof filters.minTeachingQuality === "number") {
    if (dimensions.teachingQuality === null) {
      if (!includeUnrated) return false;
    } else if (dimensions.teachingQuality < filters.minTeachingQuality) {
      return false;
    }
  }

  return true;
}

/** Split a result set for a UI that wants to show unrated courses last. */
export function partitionByCoverage(
  courseIds: string[],
  index: CoverageIndex = activeIndex,
): { rated: string[]; unrated: string[] } {
  const rated: string[] = [];
  const unrated: string[] = [];
  for (const courseId of courseIds) {
    if (hasCoverage(courseId, index)) rated.push(courseId);
    else unrated.push(courseId);
  }
  return { rated, unrated };
}

/** Apply the toggle to a plain list of ids. */
export function filterByCoverage(
  courseIds: string[],
  filters: Pick<SearchFilters, "includeUnrated">,
  index: CoverageIndex = activeIndex,
): string[] {
  if (resolveIncludeUnrated(filters)) return [...courseIds];
  return courseIds.filter((courseId) => hasCoverage(courseId, index));
}

/**
 * Numbers for the "why is this list this long" line under the filter bar —
 * e.g. "412 results · 118 with reviews · 294 unrated (shown)".
 *
 * Same principle as `ReputationSummary`: report the components, do not derive a
 * label from them.
 */
export interface CoverageStats {
  total: number;
  rated: number;
  unrated: number;
  includeUnrated: boolean;
}

export function coverageStats(
  courseIds: string[],
  filters: Pick<SearchFilters, "includeUnrated">,
  index: CoverageIndex = activeIndex,
): CoverageStats {
  const { rated, unrated } = partitionByCoverage(courseIds, index);
  return {
    total: courseIds.length,
    rated: rated.length,
    unrated: unrated.length,
    includeUnrated: resolveIncludeUnrated(filters),
  };
}

/**
 * Build a `ReputationLookup` backed by real summaries.
 *
 * Convenience for callers that hold the corpus in memory (tests, scripts, the
 * MCP server). A production read path would back this with the stored
 * `review_dimensions` rows instead.
 */
export function reputationLookupFrom(
  reviews: ReviewRecord[],
  options: SummarizeOptions = {},
): ReputationLookup {
  const byCourse = new Map<string, ReviewRecord[]>();
  for (const review of reviews) {
    if (!review.courseId) continue;
    pushTo(byCourse, review.courseId.trim().toUpperCase(), review);
  }
  const cache = new Map<string, { workload: number | null; teachingQuality: number | null }>();

  return (courseId: string) => {
    const key = courseId.trim().toUpperCase();
    const cached = cache.get(key);
    if (cached) return cached;
    const scoped = byCourse.get(key);
    if (!scoped) return null;
    const { dimensions } = summarize(scoped, options);
    const value = { workload: dimensions.workload, teachingQuality: dimensions.teachingQuality };
    cache.set(key, value);
    return value;
  };
}
