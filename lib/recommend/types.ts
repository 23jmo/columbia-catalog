/**
 * The recommendation engine's contracts.
 *
 * One engine, server-side, backing three surfaces: the onboarding guess grid,
 * the home feed, and the agent's `recommend_courses` tool. Deliberately a
 * single implementation — a client copy and a server copy is exactly how
 * `student_courses` and `localStorage["…progression…"].completed` drifted into
 * two disagreeing student records.
 *
 * ── Why so much of this is injected ─────────────────────────────────────────
 *
 * Everything the engine needs from the outside arrives as an interface:
 * candidate courses, semantic vectors, the prerequisite graph. That is not
 * ceremony. Each of the three lives somewhere awkward, and hard-wiring any of
 * them would make the scoring untestable:
 *
 *   - **Candidates** come from a live PostgREST query narrowed to the active
 *     terms, so a unit test would need a database.
 *   - **Vectors** are LSA, and today they live in a binary artifact built for
 *     the browser (`public/index/*.emb.bin`), not in a table. Reading that
 *     artifact server-side is real work and it is not this module's work.
 *   - **The prerequisite graph** is built from 8,189 rows of parsed formula.
 *
 * Injecting them means the scoring rules can be tested against ten courses in
 * memory, which is the only way the assertions that matter — a first-year is
 * never shown COMS W4111 — stay readable.
 */

import type { CourseId } from "@/lib/requirements/code";

/* ==========================================================================
 * Inputs
 * ========================================================================== */

/**
 * One row of the student's record.
 *
 * `liked` is tri-state and NULL is the common case: it means "we have not
 * asked", not "they disliked it". Collapsing it to a boolean would make the
 * majority of any transcript read as disliked and poison the taste vector with
 * courses the student never had an opinion about.
 */
export interface TakenCourse {
  courseId: CourseId;
  /** `null` when the student has not been asked. NOT a grade — see 0032. */
  liked: boolean | null;
  /** Term taken, if known. Used only for recency weighting. */
  termCode?: string | null;
}

export interface StudentProfile {
  taken: TakenCourse[];
  /** Hand-authored, major-scoped tags. Each maps to a seed vector. */
  interestTags?: string[];
  /**
   * Courses the student has on a plan. Excluded from recommendations — they
   * have already decided — but they DO count as completed when evaluating
   * whether something further along is reachable.
   */
  planned?: CourseId[];
}

/** A course the engine may recommend. */
export interface CandidateCourse {
  courseId: CourseId;
  code: string;
  title: string;
  points: number | null;
}

/* ==========================================================================
 * Injected sources
 * ========================================================================== */

/**
 * Unit-normalized semantic vectors, by course.
 *
 * Returning `undefined` is expected and must not be treated as an error: only
 * courses with enough description text get a vector (`MIN_EMBEDDABLE_CHARS`),
 * and a one-line independent-study listing legitimately has none. A course
 * with no vector simply scores zero on taste rather than being dropped —
 * dropping it would silently hide every thinly-described course in the
 * catalog, which correlates with small departments rather than with quality.
 */
export interface CourseVectorSource {
  vectorFor(courseId: CourseId): Float32Array | undefined;
}

/**
 * Prerequisite reachability for one course, given what the student has done.
 *
 * Mirrors `PrereqStatus` from `lib/prereqs/graph.ts` rather than redefining it,
 * because the three-valued distinction is the whole point and a fourth opinion
 * about it would be a bug factory.
 */
export interface PrereqSource {
  statusFor(
    courseId: CourseId,
    completed: ReadonlySet<string>,
  ): { status: "met" | "unmet" | "unknown"; outstanding: string[][]; advisories: string[] };
  /** How many courses taking this one would newly bring within reach. */
  newlyUnlockedBy(courseId: CourseId, completed: ReadonlySet<string>): string[];
}

/* ==========================================================================
 * Outputs
 * ========================================================================== */

/**
 * Why a course is being shown. The card says this out loud.
 *
 * Three kinds, in the order a student cares about them. The distinction is
 * product-load-bearing: "it clears the Global Core" and "you might like it" are
 * different claims, and blending them into one number without saying which is
 * how a recommender stops being trusted.
 */
export type RecommendationReason =
  /** Clears an outstanding requirement group. Names the group. */
  | { kind: "required"; groupId: string; groupLabel: string }
  /** Matches taste AND counts for something. The strongest card. */
  | { kind: "interesting_and_counts"; groupId: string; groupLabel: string; similarTo: CourseId[] }
  /** Pure taste. Names the courses that drove it. */
  | { kind: "because_you_took"; similarTo: CourseId[] }
  /** Opens up courses further along. */
  | { kind: "unlocks"; courseIds: CourseId[] };

/**
 * A caveat that travels with the recommendation.
 *
 * Separate from the reason because a caveat is not a selling point, and because
 * `prereq_unknown` in particular must reach the UI: it is the difference
 * between "you can take this" and "we could not tell, here is the sentence the
 * registrar printed".
 */
export type RecommendationCaveat =
  | { kind: "prereq_unknown"; advisories: string[]; outstanding: string[][] }
  | { kind: "no_vector" };

/**
 * A course the filter held back, and why.
 *
 * Withheld is not the same as deleted. The feed shows `recommendations` and
 * ignores this list — an unsolicited suggestion a student cannot act on is the
 * failure the filter exists to prevent. But when a student ASKS about a
 * specific course, "you are missing COMS W3134, and this one takes instructor
 * permission — here is who to email" is the single most useful sentence the
 * product can say, and it is precisely what a catalog search cannot.
 *
 * Throwing the information away to keep the feed clean would trade a real
 * answer for a tidy return type.
 */
export interface WithheldCourse {
  course: CandidateCourse;
  /**
   * `prereq_unmet` is a hard no: a gate failed and nothing in the prose offers
   * a way around it.
   *
   * `prereq_unmet_but_permission` is a soft no, and the distinction is the
   * whole point of keeping this list. The gate failed, but the registrar's own
   * sentence ends "or permission of the instructor" — so the student has a
   * real and specific action available. Roughly a quarter of the catalog's
   * prerequisites end this way.
   */
  reason: "prereq_unmet" | "prereq_unmet_but_permission";
  /** Each entry is satisfied by any one of its options. */
  missing: string[][];
  advisories: string[];
}

export interface RecommendResult {
  /** What to show. Already filtered, scored and ranked. */
  recommendations: ScoredRecommendation[];
  /**
   * What was filtered out and why — for answering direct questions, never for
   * padding the feed. Capped; see `recommend`.
   */
  withheld: WithheldCourse[];
}

export interface ScoredRecommendation {
  course: CandidateCourse;
  /** The blended total. Comparable within one call, not across calls. */
  score: number;
  /** Every component, kept so a card can explain itself and a test can assert. */
  components: ScoreComponents;
  reasons: RecommendationReason[];
  caveats: RecommendationCaveat[];
}

/**
 * The score, unblended.
 *
 * Kept as a record rather than collapsed into the total on purpose: a single
 * number cannot be debugged, and the first question anyone asks about a
 * recommender is "why is that at the top". It is also what makes the weights
 * testable — a test can assert that requirement fit dominates taste without
 * hard-coding the resulting total.
 */
export interface ScoreComponents {
  /** Clears an outstanding requirement. The dominant term by design. */
  requirementFit: number;
  /** Cosine against the taste vector, in [-1, 1]. Zero when either is absent. */
  taste: number;
  /** Damped count of courses this one brings within reach. */
  unlock: number;
  /** Seats, conflicts, and the like. Zero until the feed wires offerings. */
  offering: number;
}
