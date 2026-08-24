/**
 * The taste vector: one point in LSA space standing for what a student likes.
 *
 * Built as a weighted mean of the vectors of courses they have taken, with
 * loved courses weighted up. That is the simplest thing that works, and the
 * simplicity is defensible rather than lazy — the alternatives (a per-student
 * model, a nearest-neighbour lookup over other students) need data this app
 * does not have and would make every recommendation unexplainable.
 *
 * A mean also gives the product something it needs: `similarCourses` can point
 * at the specific courses that pulled the vector toward a recommendation, so a
 * card can say "because you took Discrete Math and Advanced Programming"
 * instead of "because the model says so".
 */

import type { CourseId } from "@/lib/requirements/code";

import type { CourseVectorSource, TakenCourse } from "./types";

/**
 * How much more a loved course counts than a merely-taken one.
 *
 * Three, not ten. A student's transcript is mostly requirements they had no
 * choice about, so the loved courses are the real signal — but weighting them
 * overwhelmingly turns the feed into "more of the one class you starred",
 * which is a worse experience than it sounds: it collapses a broad catalog
 * into a single subject after one click.
 */
export const LOVED_WEIGHT = 3;

/**
 * How much less a disliked course counts. Not negative.
 *
 * Subtracting a disliked course's vector is tempting and wrong. LSA space is
 * not oriented so that "away from databases" means anything — the opposite
 * direction from a systems course is not "humanities", it is noise. Down-
 * weighting says "this told us less about you", which is all the data supports.
 */
export const DISLIKED_WEIGHT = 0.25;

/** A course the student took but was never asked about. The baseline. */
export const NEUTRAL_WEIGHT = 1;

export interface TasteVector {
  /** Unit-normalized. `null` when the student has no usable coursework yet. */
  vector: Float32Array | null;
  /**
   * The courses that actually contributed, heaviest first. Used to explain a
   * recommendation, so it holds course ids rather than weights.
   */
  contributors: CourseId[];
  /**
   * Courses in the record that had no vector and so contributed nothing.
   * Surfaced rather than swallowed: a student whose whole record is
   * unvectorized should get requirement-driven recommendations and an honest
   * feed, not a silently empty taste signal.
   */
  skipped: CourseId[];
}

function weightFor(course: TakenCourse): number {
  if (course.liked === true) return LOVED_WEIGHT;
  if (course.liked === false) return DISLIKED_WEIGHT;
  return NEUTRAL_WEIGHT;
}

/**
 * Build the taste vector.
 *
 * Returns a `null` vector rather than a zero vector when there is nothing to
 * build from. The distinction matters downstream: cosine against a zero vector
 * is 0 for every course, which is indistinguishable from "we compared and
 * nothing matched" — and a cold-start student would then get a feed that looks
 * considered but is really just requirement order.
 */
export function buildTasteVector(
  taken: readonly TakenCourse[],
  vectors: CourseVectorSource,
): TasteVector {
  const contributions: { courseId: CourseId; weight: number; vector: Float32Array }[] = [];
  const skipped: CourseId[] = [];

  for (const course of taken) {
    const vector = vectors.vectorFor(course.courseId);
    if (!vector) {
      skipped.push(course.courseId);
      continue;
    }
    contributions.push({ courseId: course.courseId, weight: weightFor(course), vector });
  }

  if (contributions.length === 0) {
    return { vector: null, contributors: [], skipped };
  }

  const dims = contributions[0].vector.length;
  const accumulator = new Float32Array(dims);
  let totalWeight = 0;

  for (const { weight, vector } of contributions) {
    /*
     * A record can legitimately mix dimensionalities if the artifact was
     * rebuilt mid-session with a different model. Skipping the odd one out is
     * better than throwing — the student did nothing wrong — and better than
     * truncating, which would silently compare different spaces.
     */
    if (vector.length !== dims) {
      continue;
    }
    for (let index = 0; index < dims; index += 1) {
      accumulator[index] += vector[index] * weight;
    }
    totalWeight += weight;
  }

  if (totalWeight === 0) return { vector: null, contributors: [], skipped };

  for (let index = 0; index < dims; index += 1) accumulator[index] /= totalWeight;

  const contributors = [...contributions]
    .sort((a, b) => b.weight - a.weight || a.courseId.localeCompare(b.courseId))
    .map((c) => c.courseId);

  return { vector: normalize(accumulator), contributors, skipped };
}

/**
 * Cosine similarity.
 *
 * Both sides are expected unit-normalized, so this is a dot product — but the
 * norms are divided out anyway. The cost is two extra passes and the benefit is
 * that a caller who hands in a raw vector gets a right answer instead of a
 * plausible wrong one.
 */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * The courses in the record most responsible for a recommendation.
 *
 * Computed per candidate rather than taken from the taste vector's global
 * contributor order, because "because you took X" has to be true about THIS
 * course. A student whose heaviest course is a loved poetry seminar should not
 * see "because you took Poetry" on an operating-systems recommendation.
 */
export function similarCourses(
  candidate: Float32Array,
  taken: readonly TakenCourse[],
  vectors: CourseVectorSource,
  limit = 3,
): CourseId[] {
  const scored: { courseId: CourseId; similarity: number }[] = [];

  for (const course of taken) {
    const vector = vectors.vectorFor(course.courseId);
    if (!vector) continue;
    const similarity = cosine(candidate, vector);
    // Negative and near-zero similarity is not evidence of anything; naming
    // such a course as the reason would be an outright false statement.
    if (similarity <= 0) continue;
    scored.push({ courseId: course.courseId, similarity });
  }

  return scored
    .sort((a, b) => b.similarity - a.similarity || a.courseId.localeCompare(b.courseId))
    .slice(0, limit)
    .map((entry) => entry.courseId);
}

function normalize(vector: Float32Array): Float32Array {
  let sumOfSquares = 0;
  for (let index = 0; index < vector.length; index += 1) {
    sumOfSquares += vector[index] * vector[index];
  }
  if (sumOfSquares === 0) return vector;

  const inverseNorm = 1 / Math.sqrt(sumOfSquares);
  for (let index = 0; index < vector.length; index += 1) vector[index] *= inverseNorm;
  return vector;
}
