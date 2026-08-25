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
import {
  resolveInstructorName,
  surnameOf,
  type NameCandidate,
} from "@/lib/reviews/instructor-match";

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
 * Instructor names → their catalog id AND the catalog's own spelling.
 *
 * An exact `full_name` match is tried first and is what nearly every row hits.
 * When it misses, `resolveInstructorName` allows a middle name or initial to
 * differ and nothing else, requiring a unique survivor.
 *
 * **This is not general fuzzy matching, and the distinction matters.** The old
 * version was exact-only, on the reasoning that an unresolved review keeps its
 * `subject_ref` and `getInstructorReputation` matches on that name anyway — so
 * a miss cost a foreign key and nothing a reader could see. That reasoning does
 * not survive contact with CULPA: it spells the professor "Jae Lee" where the
 * registrar prints "Jae W Lee", so the stored `subject_ref` was a name no page
 * ever queries with. 55 reviews landed, aggregated correctly, and were invisible.
 *
 * Resolving here — rather than loosening `scopeToInstructor` — keeps every read
 * path exactly as strict as it was.
 */
interface ResolvedInstructor {
  instructorId: string;
  /** The catalog's spelling, which is what read paths match on. */
  canonicalName: string;
}

/**
 * How many candidates one surname may contribute before we stop trusting the
 * pool. Suffix matching keeps the real numbers far below this — the worst
 * surname in the Columbia directory is "li" at 60 — so hitting this cap means
 * an assumption broke, and it is reported rather than silently truncated.
 */
const SURNAME_CANDIDATE_CAP = 500;

async function instructorIdsByName(
  db: CatalogClient,
  names: string[],
  warnings: string[],
): Promise<Map<string, ResolvedInstructor>> {
  const resolved = new Map<string, ResolvedInstructor>();
  if (names.length === 0) return resolved;

  const { data: exactRows, error: exactError } = await db
    .from("instructors")
    .select("instructor_id, full_name")
    .in("full_name", names);
  if (exactError) {
    warnings.push(`instructor exact lookup failed (${exactError.message}) — names left unresolved`);
  }
  for (const row of exactRows ?? []) {
    resolved.set(row.full_name, {
      instructorId: row.instructor_id,
      canonicalName: row.full_name,
    });
  }

  /*
   * Only the leftovers go through the surname query. One request per distinct
   * surname, not per name, and none at all when every name matched exactly —
   * which is the common case for Reddit, where names come from our own catalog.
   */
  const unmatched = names.filter((name) => !resolved.has(name));
  const surnames = new Set(
    unmatched.map((name) => surnameOf(name)).filter((s): s is string => s !== null),
  );
  if (surnames.size === 0) return resolved;

  /*
   * SUFFIX, not substring. `%li%` matches "E-li-zabeth", "Col-li-ns" and
   * "Ju-li-a" — 825 of 6,669 instructors — where `%li` matches only names that
   * END in "li", which is 60. A surname IS the last token, so anchoring the
   * pattern is both more correct and two orders of magnitude more selective.
   *
   * That selectivity is what makes the cap safe. The previous `.limit(200)`
   * against a substring match could silently drop the right person out of the
   * candidate pool for any short surname, producing an unresolved review that
   * was indistinguishable from a deliberate refusal.
   */
  const candidates: NameCandidate[] = [];
  for (const surname of surnames) {
    const { data, error } = await db
      .from("instructors")
      .select("instructor_id, full_name")
      .ilike("full_name", `%${surname}`)
      .limit(SURNAME_CANDIDATE_CAP);
    if (error) {
      // Never swallow this. An unresolved review and a failed query produce the
      // same NULL instructor_id, so without the warning a transient outage is
      // indistinguishable from the matcher correctly declining to guess.
      warnings.push(`instructor surname lookup failed for "${surname}" (${error.message})`);
      continue;
    }
    if ((data?.length ?? 0) >= SURNAME_CANDIDATE_CAP) {
      warnings.push(
        `surname "${surname}" returned ${data?.length} candidates, at the ${SURNAME_CANDIDATE_CAP} cap — matches may be truncated`,
      );
    }
    for (const row of data ?? []) {
      candidates.push({ id: row.instructor_id, fullName: row.full_name });
    }
  }

  for (const name of unmatched) {
    const match = resolveInstructorName(name, candidates);
    if (match) {
      resolved.set(name, { instructorId: match.id, canonicalName: match.fullName });
    }
  }
  return resolved;
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
    summary.warnings,
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

    const resolvedInstructor = record.instructorName
      ? (instructors.get(record.instructorName) ?? null)
      : null;
    const instructorId = resolvedInstructor?.instructorId ?? null;
    if (record.instructorName && !instructorId) summary.unresolvedInstructors += 1;

    /*
     * Store the CATALOG's spelling when we resolved one. `subject_ref` is what
     * `getInstructorReputation` filters on, so writing the source's spelling
     * here is what made 55 correctly-stored CULPA reviews invisible on the
     * page. Unresolved rows keep the source's spelling — it is the only name
     * we have, and losing it would make the miss undiagnosable.
     */
    const subjectRef = resolvedInstructor?.canonicalName ?? record.instructorName;

    rawRows.push({
      review_id: record.reviewId,
      source_id: sourceId,
      // The source's own key is the front half of our id, which is what makes
      // the (source_id, source_review_key) unique index line up with it.
      source_review_key: record.reviewId,
      subject_ref: subjectRef,
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
