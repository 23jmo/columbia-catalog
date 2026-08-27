/**
 * The recommendation engine.
 *
 *   score = requirementFit
 *         + λ · cosine(tasteVector, courseVector)
 *         + unlockBoost
 *         + offeringSignals
 *   … over candidates that survived a HARD prerequisite filter.
 *
 * ── The prerequisite filter is an exclusion, not a penalty ──────────────────
 *
 * This is the single most important decision in the module and it is worth
 * being explicit about why it is not a weight.
 *
 * Recommending a course a student cannot take is the class of wrong answer that
 * ends the relationship. It is not "a slightly worse suggestion" — it is proof
 * that the app does not know the thing it is claiming to know. A first-year
 * shown COMS W4111 Databases learns in one screen that the recommendations are
 * decoration. As a penalty, a sufficiently interesting ineligible course still
 * surfaces; as an exclusion, it cannot.
 *
 * ── But `unknown` does NOT exclude ──────────────────────────────────────────
 *
 * `lib/prereqs/graph.ts` is careful to distinguish "provably unsatisfied" from
 * "we could not tell", and that care would be wasted if this module collapsed
 * them. Three facts make the distinction load-bearing:
 *
 *   - 43.2% of parsed prerequisites resolved to no course reference at all
 *     (confidence `prose`). Excluding on unknown would hide most of the
 *     catalog's gated courses from everyone.
 *   - 23.7% end "or permission of the instructor", which `evaluateCourse`
 *     already downgrades from `unmet` to `unknown`. Those are precisely the
 *     courses a motivated student CAN get into by asking, and hiding them
 *     punishes initiative.
 *   - The parser's own measured recall is 85.7%, so some `unknown` is our
 *     fault rather than the registrar's.
 *
 * So `unknown` passes the filter and carries a `prereq_unknown` caveat. The
 * student sees the course and the registrar's own sentence, and decides.
 *
 * ── …but there are two kinds of unknown, and only one of them is ignorance ──
 *
 * This distinction was missing from the first version of this module and it let
 * the spec's own acceptance test fail against live data while passing in unit
 * tests. Worth spelling out.
 *
 * COMS W4111 Databases reads, verbatim: "COMS W3134, COMS W3136, or COMS W3136;
 * or instructor's permission". The parser handles it perfectly — an `any` over
 * three real courses, plus `instructorPermission: true`. For a first-year every
 * branch fails, so `evaluatePrereqTree` returns `unmet`, and `evaluateCourse`
 * then softens that to `unknown` because permission is on the table.
 *
 * That softening is right for the question `evaluateCourse` answers, which is
 * "could this student take the course". Permission is real; a determined
 * first-year can ask. It is wrong for the question THIS module answers, which is
 * "should we put this in front of them unprompted". We know exactly what they
 * are missing — all three prerequisites — and proposing it anyway is the
 * credibility failure the filter exists to prevent, dressed in a caveat.
 *
 * The two cases are distinguishable without any new interface, because
 * `outstanding` is only populated when a gate was actually evaluated:
 *
 *   unknown, outstanding NON-EMPTY  → we parsed the gate and it failed.
 *                                     We know what is missing. Do not propose.
 *   unknown, outstanding EMPTY      → no tree resolved, or the tree passed and
 *                                     prose remains. We genuinely do not know.
 *                                     Propose, with the registrar's sentence.
 *
 * The second case is the common one — 43.2% of the catalog — so this costs
 * almost none of the coverage the `unknown`-passes rule was protecting. What it
 * removes is precisely the set of courses we can already prove the student is
 * not ready for.
 *
 * Note this does NOT put the course out of reach, and it does not throw the
 * finding away either. Everything the filter holds back comes back in
 * `RecommendResult.withheld` with the specific gate that failed — so when a
 * student ASKS "can I take Databases?", the answer is "you are missing COMS
 * W3134, and this one takes instructor permission", which is the most useful
 * sentence the product has and exactly what a catalog search cannot say.
 *
 * Unsolicited: excluded. Solicited: answered precisely. That is the whole rule.
 */

import type { CourseId } from "@/lib/requirements/code";
import type { GroupResult } from "@/lib/requirements/types";

import { buildTasteVector, cosine, similarCourses } from "./taste";
import type {
  CandidateCourse,
  CourseVectorSource,
  PrereqSource,
  RecommendationCaveat,
  RecommendationReason,
  RecommendResult,
  ScoreComponents,
  ScoredRecommendation,
  StudentProfile,
  WithheldCourse,
} from "./types";

export * from "./types";
export { buildTasteVector, cosine, similarCourses, type TasteVector } from "./taste";

/**
 * The real sources, re-exported so `@/lib/recommend` is one door rather than
 * two.
 *
 * This is the one place the module's purity is traded away, and it is worth
 * naming the cost: `./sources` and `./course-vectors` reach the database and
 * the filesystem, so importing this barrel from a client component would pull
 * a Supabase client into the browser bundle. Nothing does — every consumer is a
 * server module or a server action, and the feed's client leaves receive plain
 * data as props rather than importing from here.
 *
 * The alternative was making every caller learn which of five files a given
 * symbol lives in, which is how `lib/agent/tools.ts` and `lib/onboarding/`
 * ended up importing from three different paths for one feature.
 */
export {
  graphPrereqSource,
  loadProgressionGraph,
  mapVectorSource,
  noVectorSource,
  unknownPrereqSource,
} from "./sources";
export {
  buildCourseVectorIndex,
  invalidateCourseVectorCache,
  loadCourseVectorSource,
  VECTOR_SOURCE_UNAVAILABLE,
  type CourseVectorIndex,
} from "./course-vectors";

/* ==========================================================================
 * Weights
 * ========================================================================== */

/**
 * Weights, gathered in one place so the blend can be argued about as a whole.
 *
 * The ordering between them is the real design, not the exact numbers:
 * requirement fit must dominate taste, and taste must dominate unlock. A
 * student's degree is not optional and their curiosity is; a feed that ranks a
 * fascinating elective above the course blocking their graduation is
 * entertaining and useless.
 */
export const WEIGHTS = {
  /** Applied once per outstanding group the course would advance. */
  requirement: 1,
  /** λ. Cosine is in [-1, 1], so this caps taste's contribution at ±0.5. */
  taste: 0.5,
  /**
   * Applied to a DAMPED unlock count — see `unlockScore`. Small on purpose:
   * "this opens doors" is a tiebreak, not a reason to take a course.
   */
  unlock: 0.3,
  offering: 0.2,
} as const;

/**
 * Unlock counts are damped with log1p before weighting.
 *
 * Raw counts are wildly skewed: an intro programming course unlocks dozens of
 * things while a 4000-level seminar unlocks none, and undamped that single term
 * would outrank every requirement in the blend. It would also give the feed a
 * strong and unhelpful opinion — "take the intro course" — for students who
 * finished the intro sequence two years ago.
 */
export function unlockScore(unlockedCount: number): number {
  return Math.log1p(Math.max(0, unlockedCount));
}

/* ==========================================================================
 * Inputs
 * ========================================================================== */

export interface RecommendInput {
  profile: StudentProfile;
  candidates: readonly CandidateCourse[];
  vectors: CourseVectorSource;
  prereqs: PrereqSource;
  /**
   * Outstanding requirement groups, with the candidate ids the audit expanded
   * for each. This is what `expandCandidates` produces, and it is why Lane A2
   * had to land before this module could exist: every `n_matching` group
   * returned an empty candidate list, so the requirements a student most needs
   * help with were the ones the engine could say nothing about.
   */
  outstanding?: readonly GroupResult[];
  limit?: number;
  /**
   * Cap on `withheld`. Separate from `limit` because the two answer different
   * questions and a feed passing the whole 4,878-course active surface would
   * otherwise build a withheld list longer than the catalog it came from.
   *
   * Permission-gated courses sort first within the cap: they are the only
   * withheld entries a student can act on today.
   */
  withheldLimit?: number;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_WITHHELD_LIMIT = 50;

/* ==========================================================================
 * The engine
 * ========================================================================== */

export function recommend(input: RecommendInput): RecommendResult {
  const { profile, candidates, vectors, prereqs } = input;
  const limit = input.limit ?? DEFAULT_LIMIT;
  const withheldLimit = input.withheldLimit ?? DEFAULT_WITHHELD_LIMIT;

  /*
   * Completed set for prerequisite evaluation includes PLANNED courses.
   *
   * A student who has next term's schedule built is asking "what comes after
   * this", and answering it against only their finished coursework would hide
   * every course the plan is a prerequisite for — the exact courses they are
   * planning toward. Planned courses are excluded from being RECOMMENDED
   * (below), which is a different question: they have already decided.
   */
  const completed = new Set<string>([
    ...profile.taken.map((course) => course.courseId),
    ...(profile.planned ?? []),
  ]);

  const alreadyDecided = new Set<string>(completed);

  const taste = buildTasteVector(profile.taken, vectors);
  const requirementIndex = indexOutstanding(input.outstanding ?? []);

  const scored: ScoredRecommendation[] = [];
  const withheld: WithheldCourse[] = [];

  for (const course of candidates) {
    // A student cannot be recommended what they have already taken or planned.
    if (alreadyDecided.has(course.courseId)) continue;

    const prereq = prereqs.statusFor(course.courseId, completed);

    /*
     * THE hard filter.
     *
     * `unmet` is a provably unsatisfied gate. `unknown` WITH outstanding
     * choices is a gate we evaluated, watched fail, and are only calling
     * unknown because "or permission of the instructor" appears in the prose —
     * see the two-kinds-of-unknown section in this file's header. Both are
     * cases where we know what the student is missing, and neither belongs in
     * an unsolicited recommendation.
     *
     * `unknown` with nothing outstanding is real ignorance, and survives.
     */
    if (prereq.status === "unmet" || (prereq.status === "unknown" && prereq.outstanding.length > 0)) {
      withheld.push({
        course,
        // `unknown` here can only mean the gate was evaluated and failed, and
        // was softened by instructor permission — the ignorance case has an
        // empty `outstanding` and never reaches this branch.
        reason:
          prereq.status === "unknown" ? "prereq_unmet_but_permission" : "prereq_unmet",
        missing: prereq.outstanding,
        advisories: prereq.advisories,
      });
      continue;
    }

    const caveats: RecommendationCaveat[] = [];
    if (prereq.status === "unknown") {
      caveats.push({
        kind: "prereq_unknown",
        advisories: prereq.advisories,
        outstanding: prereq.outstanding,
      });
    }

    const courseVector = vectors.vectorFor(course.courseId);
    if (!courseVector) caveats.push({ kind: "no_vector" });

    const tasteSimilarity =
      taste.vector && courseVector ? cosine(taste.vector, courseVector) : 0;

    const groups = requirementIndex.get(course.courseId) ?? [];
    const unlocked = prereqs.newlyUnlockedBy(course.courseId, completed);

    const components: ScoreComponents = {
      requirementFit: WEIGHTS.requirement * groups.length,
      taste: WEIGHTS.taste * tasteSimilarity,
      unlock: WEIGHTS.unlock * unlockScore(unlocked.length),
      // Seats, conflicts and commute are computed by the feed, which knows the
      // student's schedule. Zero here rather than absent so the shape of the
      // blend is visible and a caller can add to it without changing this type.
      offering: 0,
    };

    scored.push({
      course,
      score: components.requirementFit + components.taste + components.unlock + components.offering,
      components,
      reasons: reasonsFor({
        groups,
        tasteSimilarity,
        courseVector,
        profile,
        vectors,
        unlocked,
      }),
      caveats,
    });
  }

  return {
    recommendations: scored
      .sort((a, b) => b.score - a.score || a.course.courseId.localeCompare(b.course.courseId))
      .slice(0, limit),
    withheld: withheld
      .sort((a, b) => {
        // Actionable first: a permission course is something the student can do
        // something about today, a hard-gated one is not.
        const aActionable = a.reason === "prereq_unmet_but_permission" ? 0 : 1;
        const bActionable = b.reason === "prereq_unmet_but_permission" ? 0 : 1;
        return aActionable - bActionable || a.course.courseId.localeCompare(b.course.courseId);
      })
      .slice(0, withheldLimit),
  };
}

/* ==========================================================================
 * Reasons
 * ========================================================================== */

/**
 * Taste similarity below which we will not claim a course is "interesting".
 *
 * A cosine of 0.05 is noise, and a card that says "because you took Discrete
 * Math" about a course that merely failed to be dissimilar is a small lie that
 * the student will notice the first time they read one carefully. Better to
 * show the course with no taste reason than with a fabricated one.
 */
export const TASTE_REASON_THRESHOLD = 0.15;

/** At least this many newly-reachable courses before we call it an unlock. */
export const UNLOCK_REASON_THRESHOLD = 2;

function reasonsFor(args: {
  groups: { id: string; label: string }[];
  tasteSimilarity: number;
  courseVector: Float32Array | undefined;
  profile: StudentProfile;
  vectors: CourseVectorSource;
  unlocked: string[];
}): RecommendationReason[] {
  const { groups, tasteSimilarity, courseVector, profile, vectors, unlocked } = args;
  const reasons: RecommendationReason[] = [];

  const similar =
    courseVector && tasteSimilarity >= TASTE_REASON_THRESHOLD
      ? similarCourses(courseVector, profile.taken, vectors)
      : [];

  for (const group of groups) {
    /*
     * "Interesting AND it counts" is the strongest card the product has, so it
     * is a distinct reason rather than two chips side by side — but it may only
     * be claimed when BOTH halves are independently true, and `similar` being
     * non-empty is what makes the second half checkable.
     */
    if (similar.length > 0) {
      reasons.push({
        kind: "interesting_and_counts",
        groupId: group.id,
        groupLabel: group.label,
        similarTo: similar,
      });
    } else {
      reasons.push({ kind: "required", groupId: group.id, groupLabel: group.label });
    }
  }

  // Pure taste, only when the course counts for nothing — otherwise the card
  // would carry two reasons that say the same thing.
  if (groups.length === 0 && similar.length > 0) {
    reasons.push({ kind: "because_you_took", similarTo: similar });
  }

  /*
   * "Opens up" is a claim about the student, not about the course.
   *
   * `unlocked` is computed against `profile.taken`: it is the set of courses
   * that become reachable BECAUSE this one is done. With an empty record that
   * degenerates — every 1000-level course "unlocks" whatever sits behind it,
   * for everyone, which is a fact about the catalog wearing a personal
   * pronoun. The signed-out feed proved it: eight cards, eight identical rows.
   *
   * So it is only said to a student whose record can make it true. A guest
   * gets no reason row at all, and the feed says why in one line above the
   * cards ("Broadly what is on offer") rather than eight times inside them.
   */
  if (profile.taken.length > 0 && unlocked.length >= UNLOCK_REASON_THRESHOLD) {
    reasons.push({
      kind: "unlocks",
      // Three to name, and the real total beside them. See the type.
      courseIds: unlocked.slice(0, 3) as CourseId[],
      unlockedCount: unlocked.length,
    });
  }

  return reasons;
}

/**
 * Map each expanded candidate id to the groups that would count it.
 *
 * Built from `GroupResult.candidates`, which is populated by
 * `expandCandidates` — and which is empty for every open-ended rule unless that
 * expansion ran. A caller that forgets it gets a feed with no requirement
 * reasons at all rather than an error, so this is worth checking when the feed
 * looks oddly taste-driven.
 */
function indexOutstanding(
  groups: readonly GroupResult[],
): Map<string, { id: string; label: string }[]> {
  const index = new Map<string, { id: string; label: string }[]>();

  for (const result of groups) {
    if (result.status === "satisfied") continue;
    for (const courseId of result.candidates) {
      const list = index.get(courseId) ?? [];
      list.push({ id: result.group.id, label: result.group.label });
      index.set(courseId, list);
    }
  }

  return index;
}
