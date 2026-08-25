/**
 * Reputation reads.
 *
 * Reviews are ingested raw into `reviews_raw` and their dimensions extracted
 * once into `review_dimensions` (migration 0004). Aggregation is *not* done in
 * SQL: `lib/reviews/aggregate.ts` owns the weighting — recency half-life,
 * per-dimension support, the deliberate refusal to coerce a missing dimension
 * to a number — and having two implementations of that would guarantee the
 * website and the MCP server eventually disagreed about a professor.
 *
 * So this file reads rows and hands them to the aggregator. It does no maths.
 *
 * ── Course and instructor are read separately, always ──────────────────────
 *
 * Spec §12: course quality and instructor quality are scored separately and
 * never averaged. That is enforced by there being two functions with no shared
 * path between them, rather than one function with a `kind` argument that
 * someone could later be tempted to sum over.
 *
 * ── Nothing is ingested yet ────────────────────────────────────────────────
 *
 * By decision, v1 ships with the pipeline built and no review data (see
 * .plans/BLOCKERS.md). Both functions therefore return `null` today, which is
 * the same answer they will return for a course nobody has ever reviewed —
 * and the UI already renders that state honestly rather than as a zero.
 */

import { summarizeCourse, summarizeInstructor } from "@/lib/reviews/aggregate";
import { canonicalCulpaProfessorUrl } from "@/lib/reviews/culpa-links";
import type { ReputationSummary, ReviewRecord, ReviewSourceKind } from "@/lib/types";

import { createAnonServerClient, getBrowserClient, isConfigured } from "./client";

/** Enough to make an aggregate stable; far more than any course will have. */
const MAX_REVIEWS = 400;

function readClient() {
  if (!isConfigured()) return null;
  return typeof window === "undefined" ? createAnonServerClient() : getBrowserClient();
}

/**
 * The `reviews_raw` + `review_dimensions` join, in the shape the aggregator
 * wants. `instructorName` comes from `subject_ref` — the source's own words
 * for who it is about — because a review that never resolved to an instructor
 * row still carries a name worth matching on.
 */
const SELECT = `
  review_id, course_id, subject_ref, posted_at, url, excerpt,
  review_sources ( kind ),
  review_dimensions ( workload, difficulty, teaching_quality, grading_fairness, sentiment, would_take_again )
`;

interface RawRow {
  review_id: string;
  course_id: string | null;
  subject_ref: string | null;
  posted_at: string | null;
  url: string;
  excerpt: string | null;
  review_sources: { kind: string } | null;
  review_dimensions: {
    workload: number | null;
    difficulty: number | null;
    teaching_quality: number | null;
    grading_fairness: number | null;
    sentiment: number | null;
    would_take_again: boolean | null;
  } | null;
}

function toRecord(row: RawRow): ReviewRecord {
  const dimensions = row.review_dimensions;
  return {
    reviewId: row.review_id,
    source: (row.review_sources?.kind ?? "culpa") as ReviewSourceKind,
    courseId: row.course_id,
    instructorName: row.subject_ref,
    postedAt: row.posted_at,
    url: row.url,
    excerpt: row.excerpt,
    // Null stays null all the way through. A review that said nothing about
    // workload must not become a 3 — see review_dimensions' own comment.
    workload: dimensions?.workload ?? null,
    difficulty: dimensions?.difficulty ?? null,
    teachingQuality: dimensions?.teaching_quality ?? null,
    gradingFairness: dimensions?.grading_fairness ?? null,
    sentiment: dimensions?.sentiment ?? null,
    wouldTakeAgain: dimensions?.would_take_again ?? null,
  };
}

export async function getCourseReviews(courseId: string): Promise<ReviewRecord[]> {
  const db = readClient();
  if (!db) return [];

  const { data, error } = await db
    .from("reviews_raw")
    .select(SELECT)
    .eq("course_id", courseId)
    .limit(MAX_REVIEWS);

  if (error) return [];
  return (data as unknown as RawRow[]).map(toRecord);
}

export async function getCourseReputation(courseId: string): Promise<ReputationSummary | null> {
  const reviews = await getCourseReviews(courseId);
  if (reviews.length === 0) return null;
  return summarizeCourse(reviews, courseId);
}

/**
 * Keyed by instructor NAME, not by `instructor_id`.
 *
 * Reviews arrive from CULPA and Reddit naming a person in prose; most never
 * resolve to a row in `instructors`. Requiring a foreign key would silently
 * drop the majority of what we ingest, so the match is on the normalized name
 * that `lib/reviews/aggregate.ts` already uses for exactly this reason.
 */
export async function getInstructorReputation(
  instructorName: string,
): Promise<ReputationSummary | null> {
  const db = readClient();
  if (!db) return null;

  const { data, error } = await db
    .from("reviews_raw")
    .select(SELECT)
    .ilike("subject_ref", `%${instructorName}%`)
    .limit(MAX_REVIEWS);

  if (error || !data) return null;
  const reviews = (data as unknown as RawRow[]).map(toRecord);
  if (reviews.length === 0) return null;
  return summarizeInstructor(reviews, instructorName);
}

/**
 * Canonical CULPA professor page for an instructor, when one of our attributed
 * CULPA reviews proves the numeric profile id. Never manufacture CULPA's old
 * `/search` URL: its SPA routes profiles only as `/professor/:id`.
 */
export async function getInstructorCulpaUrl(instructorName: string): Promise<string | null> {
  const db = readClient();
  if (!db || instructorName.trim().length === 0) return null;

  const { data, error } = await db
    .from("reviews_raw")
    .select("url")
    .ilike("subject_ref", instructorName.trim())
    .like("url", "https://culpa.info/professor/%")
    .limit(1);

  if (error || !data?.[0]) return null;
  return canonicalCulpaProfessorUrl(data[0].url);
}
