/**
 * Review ingest — the only path that writes `reviews_raw` and
 * `review_dimensions`.
 *
 * `lib/db/reputation.ts` is the read half of this pair. Everything the
 * aggregator needs is written here once, at ingest, and never recomputed at
 * view time.
 *
 * ── Four rules this file exists to enforce ─────────────────────────────────
 *
 * 1. **Idempotent.** `review_id` is a deterministic hash of the source's own
 *    identifiers (`stableReviewId` in lib/reviews/sources/contract.ts), so a
 *    second ingest of the same corpus updates rows rather than duplicating
 *    them. Re-running a source is always safe.
 *
 * 2. **A foreign key never takes the batch down.** `reviews_raw.course_id`
 *    references `courses`, and review sources name courses in prose — "COMS
 *    4118", "the OS class", a course number that has since been retired. An
 *    unresolvable reference is written as NULL with the source's own words
 *    preserved in `subject_ref`, because a review we can still show on an
 *    instructor page beats a run that aborted on row 12.
 *
 * 3. **NULL survives the round trip.** A review that said nothing about
 *    workload stores NULL, not a defaulted 3. The check constraints on
 *    `review_dimensions` accept NULL for exactly this reason and the
 *    aggregator relies on it — see the comment on `review_dimensions` in
 *    migration 0004.
 *
 * 4. **RateMyProfessor cannot be written.** There is no code path here that
 *    produces a source kind outside `culpa | reddit`, and the check constraint
 *    on `review_sources.kind` would reject one anyway.
 *
 * Nothing calls this in production yet: v1 ships with the pipeline built and
 * no review data (see .plans/BLOCKERS.md item 3). `scripts/ingest-reviews.ts`
 * is the runner, and it needs credentials that do not exist today.
 */

import type { RawReviewDocument } from "@/lib/reviews/sources/contract";
import type { ReviewRecord, ReviewSourceKind } from "@/lib/types";

import { requireServiceRoleClient, type CatalogClient } from "./client";

/**
 * Stamped onto every `review_dimensions` row so a future re-extraction
 * campaign can select the rows an older extractor produced. Bump it whenever
 * the extractor's output would change for the same input.
 */
export const EXTRACTOR_VERSION = "heuristic-v1";

export interface ReviewWriteSummary {
  /** Rows inserted or updated in `reviews_raw`. */
  reviewsWritten: number;
  /** Rows inserted or updated in `review_dimensions`. */
  dimensionsWritten: number;
  /** Records whose `courseId` matched no row in `courses`. */
  unresolvedCourses: number;
  /** Records whose `instructorName` matched no row in `instructors`. */
  unresolvedInstructors: number;
  warnings: string[];
}

function emptySummary(): ReviewWriteSummary {
  return {
    reviewsWritten: 0,
    dimensionsWritten: 0,
    unresolvedCourses: 0,
    unresolvedInstructors: 0,
    warnings: [],
  };
}

/**
 * `review_sources` is seeded by migration 0004 with one row per kind and a
 * unique index on `kind`, so this is a lookup rather than an upsert.
 */
async function sourceIdsByKind(db: CatalogClient): Promise<Map<ReviewSourceKind, string>> {
  const { data, error } = await db.from("review_sources").select("source_id, kind");
  if (error || !data) return new Map();
  const byKind = new Map<ReviewSourceKind, string>();
  for (const row of data) byKind.set(row.kind as ReviewSourceKind, row.source_id);
  return byKind;
}

/** Which of these course ids actually exist. Anything absent is written NULL. */
async function existingCourseIds(db: CatalogClient, courseIds: string[]): Promise<Set<string>> {
  if (courseIds.length === 0) return new Set();
  const { data, error } = await db.from("courses").select("course_id").in("course_id", courseIds);
  if (error || !data) return new Set();
  return new Set(data.map((row) => row.course_id));
}

/**
 * Instructor names → ids, matched on the exact `full_name` the directory
 * prints.
 *
 * Deliberately exact rather than fuzzy. A review that names "Prof. Smith"
 * stays unresolved and keeps its `subject_ref`; `getInstructorReputation`
 * matches on that name anyway, so a miss here costs a foreign key and nothing
 * a reader can see. Guessing which Smith would be worse than not guessing.
 */
async function instructorIdsByName(
  db: CatalogClient,
  names: string[],
): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  const { data, error } = await db
    .from("instructors")
    .select("instructor_id, full_name")
    .in("full_name", names);
  if (error || !data) return new Map();
  const byName = new Map<string, string>();
  for (const row of data) byName.set(row.full_name, row.instructor_id);
  return byName;
}

/** Postgres rejects timestamps it cannot parse; a bad date should not. */
function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export interface WriteReviewsArgs {
  records: ReviewRecord[];
  /** Full bodies, keyed by `reviewId`. Optional — a record without one stores its excerpt only. */
  documents?: RawReviewDocument[];
  /** Stamped onto `review_dimensions.model_version`. */
  extractorVersion?: string;
  /** Override for tests. Production resolves the service-role client itself. */
  client?: CatalogClient;
}

/**
 * Write a batch of reviews and their extracted dimensions.
 *
 * Dimensions are written for every record, including one where every
 * dimension is NULL: the row's existence is what records that this review has
 * been through the extractor, and its absence is what a re-extraction campaign
 * looks for.
 */
export async function writeReviews(args: WriteReviewsArgs): Promise<ReviewWriteSummary> {
  const summary = emptySummary();
  if (args.records.length === 0) return summary;

  const db = args.client ?? requireServiceRoleClient();
  const sources = await sourceIdsByKind(db);
  if (sources.size === 0) {
    summary.warnings.push("review_sources is empty — has migration 0004 been applied?");
    return summary;
  }

  const bodies = new Map((args.documents ?? []).map((doc) => [doc.reviewId, doc.body]));
  const courses = await existingCourseIds(
    db,
    [...new Set(args.records.flatMap((r) => (r.courseId ? [r.courseId] : [])))],
  );
  const instructors = await instructorIdsByName(
    db,
    [...new Set(args.records.flatMap((r) => (r.instructorName ? [r.instructorName] : [])))],
  );

  const rawRows = [];
  for (const record of args.records) {
    const sourceId = sources.get(record.source);
    if (!sourceId) {
      summary.warnings.push(`unknown review source "${record.source}" — skipping ${record.reviewId}`);
      continue;
    }
    const courseId = record.courseId && courses.has(record.courseId) ? record.courseId : null;
    if (record.courseId && !courseId) summary.unresolvedCourses += 1;

    const instructorId = record.instructorName
      ? (instructors.get(record.instructorName) ?? null)
      : null;
    if (record.instructorName && !instructorId) summary.unresolvedInstructors += 1;

    rawRows.push({
      review_id: record.reviewId,
      source_id: sourceId,
      // The source's own key is the front half of our id, which is what makes
      // the (source_id, source_review_key) unique index line up with it.
      source_review_key: record.reviewId,
      subject_ref: record.instructorName,
      instructor_id: instructorId,
      course_id: courseId,
      posted_at: isoOrNull(record.postedAt),
      body: bodies.get(record.reviewId) ?? record.excerpt,
      excerpt: record.excerpt,
      url: record.url,
      fetched_at: new Date().toISOString(),
    });
  }

  if (rawRows.length === 0) return summary;

  const { error: rawError } = await db
    .from("reviews_raw")
    .upsert(rawRows, { onConflict: "review_id" });
  if (rawError) {
    summary.warnings.push(`reviews_raw upsert failed: ${rawError.message}`);
    return summary;
  }
  summary.reviewsWritten = rawRows.length;

  const written = new Set(rawRows.map((row) => row.review_id));
  const dimensionRows = args.records
    .filter((record) => written.has(record.reviewId))
    .map((record) => ({
      review_id: record.reviewId,
      workload: record.workload,
      difficulty: record.difficulty,
      teaching_quality: record.teachingQuality,
      grading_fairness: record.gradingFairness,
      sentiment: record.sentiment,
      would_take_again: record.wouldTakeAgain,
      extracted_at: new Date().toISOString(),
      model_version: args.extractorVersion ?? EXTRACTOR_VERSION,
    }));

  const { error: dimensionError } = await db
    .from("review_dimensions")
    .upsert(dimensionRows, { onConflict: "review_id" });
  if (dimensionError) {
    summary.warnings.push(`review_dimensions upsert failed: ${dimensionError.message}`);
    return summary;
  }
  summary.dimensionsWritten = dimensionRows.length;

  return summary;
}
