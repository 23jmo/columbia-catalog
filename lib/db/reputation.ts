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
 * ── Coverage is the thing to keep in mind here ─────────────────────────────
 *
 * The corpus is real now — ~30.7k reviews over ~4.6k instructors — but it is
 * lopsided in a way every caller has to respect. Roughly a third of the
 * sections offered in an upcoming term have an instructor we can say anything
 * about, and course-level coverage is nearer 2%: 126 courses out of 10,582.
 *
 * So `null` is the COMMON answer, not the error case, and it means exactly one
 * thing: nobody has reviewed this. It never means zero, never means bad, and a
 * surface that renders it as either is lying. See `lib/reviews/coverage.ts`.
 */

import { summarizeCourse, summarizeInstructor } from "@/lib/reviews/aggregate";
import { canonicalCulpaProfessorUrl } from "@/lib/reviews/culpa-links";
import type { ReputationSummary, ReviewRecord, ReviewSourceKind } from "@/lib/types";

import { createAnonServerClient, getBrowserClient, isConfigured } from "./client";

/** Enough to make an aggregate stable; far more than any course will have. */
const MAX_REVIEWS = 400;

/** A whole feed's worth of instructors. See `getInstructorReputations`. */
const MAX_BATCH_REVIEWS = 2000;

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
 * The same read, for a whole screen of instructors at once.
 *
 * ── Why this exists next to `getInstructorReputation` ──────────────────────
 *
 * The single-instructor read is shaped for a hover card: one person, opened
 * deliberately, `%name%` so a middle initial or a suffix cannot cost a match.
 * A leading wildcard cannot use an index, which is fine once and ruinous
 * twelve times — a feed calling it per card would issue twelve sequential
 * scans before the first pixel.
 *
 * So the feed gets its own read: one query, exact names, `in`. That trade is
 * only acceptable because it turns out to cost nothing. `instructors.full_name`
 * and `reviews_raw.subject_ref` are already written in the same form, and an
 * exact match over the upcoming terms covers 6,047 sections — the identical
 * number the fuzzy match finds. We are buying a round trip, not accuracy.
 *
 * ── The cap is a backstop, not a budget ────────────────────────────────────
 *
 * The busiest instructor in the corpus has 131 reviews; the median has 4. A
 * dozen names therefore land near 100 rows and could not plausibly reach 2,000.
 * The limit exists so a future corpus cannot turn one feed render into an
 * unbounded read, and the ordering is newest-first so that if it ever does
 * bite, what survives is the recent half rather than an arbitrary half.
 *
 * Returns a map keyed by the name that was ASKED for, so a caller can look up
 * with the string it already holds and never has to know how we matched.
 */
export async function getInstructorReputations(
  instructorNames: readonly string[],
): Promise<Map<string, ReputationSummary>> {
  const out = new Map<string, ReputationSummary>();

  const db = readClient();
  if (!db) return out;

  // Deduplicate before asking: a feed routinely repeats an instructor across
  // two sections of the same course, and `in` with the same value twice is a
  // wider query for an identical answer.
  const names = [...new Set(instructorNames.map((name) => name.trim()).filter(Boolean))];
  if (names.length === 0) return out;

  const { data, error } = await db
    .from("reviews_raw")
    .select(SELECT)
    .in("subject_ref", names)
    .order("posted_at", { ascending: false })
    .limit(MAX_BATCH_REVIEWS);

  // A failed read is not "nobody has been reviewed". It returns an empty map
  // for the same reason the single read returns null: the card renders as
  // unrated, which is the honest reading of "we do not know".
  if (error || !data) return out;

  const byName = new Map<string, ReviewRecord[]>();
  for (const row of data as unknown as RawRow[]) {
    const key = row.subject_ref?.trim();
    if (!key) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(toRecord(row));
    else byName.set(key, [toRecord(row)]);
  }

  for (const name of names) {
    const reviews = byName.get(name);
    if (!reviews || reviews.length === 0) continue;
    // Same aggregator as every other surface. This file still does no maths.
    out.set(name, summarizeInstructor(reviews, name));
  }

  return out;
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
