/**
 * The recommendation engine.
 *
 * The headline assertion is in the first block: a first-year is never
 * recommended COMS W4111. That is the spec's own acceptance test and it is the
 * failure that would end the product's credibility in one screen, so it is
 * checked three ways — the obvious one, one where the course is made maximally
 * attractive on every other axis, and one where it is the only candidate.
 */

import { describe, expect, it } from "vitest";

import { toCourseId, type CourseId } from "@/lib/requirements/code";
import type { GroupResult } from "@/lib/requirements/types";

import {
  recommend,
  unlockScore,
  WEIGHTS,
  TASTE_REASON_THRESHOLD,
  type CandidateCourse,
  type CourseVectorSource,
  type PrereqSource,
  type TakenCourse,
} from "./index";

/* ==========================================================================
 * Fixtures
 * ========================================================================== */

const id = (code: string): CourseId => {
  const parsed = toCourseId(code);
  if (!parsed) throw new Error(`unparseable fixture code: ${code}`);
  return parsed;
};

const DATABASES = id("COMS W4111");
const INTRO_PROGRAMMING = id("COMS W1004");
const DATA_STRUCTURES = id("COMS W3134");
const DISCRETE_MATH = id("COMS W3203");
const ADVANCED_PROGRAMMING = id("COMS W3157");
const AFRICAN_AMERICAN_STUDIES = id("AFAS UN1001");
const EAST_ASIAN_CIV = id("ASCE UN1359");

function course(courseId: CourseId, title: string): CandidateCourse {
  return { courseId, code: courseId, title, points: 3 };
}

const CANDIDATES: CandidateCourse[] = [
  course(DATABASES, "INTRODUCTION TO DATABASES"),
  course(INTRO_PROGRAMMING, "INTRO TO COMPUTER SCIENCE"),
  course(DATA_STRUCTURES, "DATA STRUCTURES"),
  course(DISCRETE_MATH, "DISCRETE MATHEMATICS"),
  course(ADVANCED_PROGRAMMING, "ADVANCED PROGRAMMING"),
  course(AFRICAN_AMERICAN_STUDIES, "INTRO TO AFRICAN-AMER STUDIES"),
  course(EAST_ASIAN_CIV, "INTRO TO EAST ASIAN CIV: CHINA"),
];

/**
 * A tiny hand-built vector space.
 *
 * Two clusters — computing and humanities — so "similar" and "dissimilar" mean
 * something a reader can verify by eye, rather than depending on a real LSA
 * artifact that would make every assertion here unfalsifiable.
 */
const VECTORS: Record<string, number[]> = {
  [DATABASES]: [0.9, 0.4, 0],
  [INTRO_PROGRAMMING]: [1, 0.1, 0],
  [DATA_STRUCTURES]: [0.95, 0.3, 0],
  [DISCRETE_MATH]: [0.8, 0.5, 0],
  [ADVANCED_PROGRAMMING]: [0.97, 0.2, 0],
  [AFRICAN_AMERICAN_STUDIES]: [0, 0.2, 1],
  [EAST_ASIAN_CIV]: [0, 0.1, 1],
};

const vectors: CourseVectorSource = {
  vectorFor: (courseId) => {
    const raw = VECTORS[courseId];
    return raw ? Float32Array.from(raw) : undefined;
  },
};

/** COMS W4111 requires data structures; data structures requires intro. */
const PREREQ_OF: Record<string, string[]> = {
  [DATABASES]: [DATA_STRUCTURES],
  [DATA_STRUCTURES]: [INTRO_PROGRAMMING],
  [ADVANCED_PROGRAMMING]: [INTRO_PROGRAMMING],
};

/** Courses whose prerequisite prose the parser could not resolve. */
const UNRESOLVED = new Set<string>();

/**
 * Courses whose prose ends "or permission of the instructor".
 *
 * Modelled separately from UNRESOLVED because the two produce the same
 * `status: "unknown"` and must NOT behave the same — see the two-kinds-of-
 * unknown section in index.ts. A permission course still reports what is
 * outstanding, because the gate was evaluated and did fail.
 */
const INSTRUCTOR_PERMISSION = new Set<string>();

function makePrereqSource(): PrereqSource {
  const statusFor: PrereqSource["statusFor"] = (courseId, completed) => {
    if (UNRESOLVED.has(courseId)) {
      return {
        status: "unknown",
        outstanding: [],
        advisories: ["permission of the instructor"],
      };
    }
    const required = PREREQ_OF[courseId] ?? [];
    const missing = required.filter((r) => !completed.has(r));
    if (missing.length === 0) return { status: "met", outstanding: [], advisories: [] };

    /*
     * Exactly what `evaluateCourse` does: instructor permission softens a
     * failed gate to `unknown`, but `outstanding` still names what is missing,
     * because the gate really was evaluated.
     */
    if (INSTRUCTOR_PERMISSION.has(courseId)) {
      return {
        status: "unknown",
        outstanding: [missing],
        advisories: ["or permission of the instructor"],
      };
    }
    return { status: "unmet", outstanding: [missing], advisories: [] };
  };

  return {
    statusFor,
    newlyUnlockedBy: (courseId, completed) => {
      const after = new Set(completed);
      after.add(courseId);
      return Object.keys(PREREQ_OF).filter((candidate) => {
        if (completed.has(candidate)) return false;
        if (statusFor(candidate as CourseId, completed).status === "met") return false;
        return statusFor(candidate as CourseId, after).status !== "unmet";
      });
    },
  };
}

const prereqs = makePrereqSource();

/**
 * Just the shown list. Most tests are about what a student sees; the ones that
 * are about what was held back call `recommend` directly.
 */
function recommended(input: Parameters<typeof recommend>[0]) {
  return recommend(input).recommendations;
}


function taken(...entries: [CourseId, boolean | null][]): TakenCourse[] {
  return entries.map(([courseId, liked]) => ({ courseId, liked }));
}

function group(
  groupId: string,
  label: string,
  candidates: CourseId[],
  status: GroupResult["status"] = "unmet",
): GroupResult {
  // Only the fields the engine reads. Cast because GroupResult carries a full
  // RequirementGroup the engine never touches, and building one here would
  // couple this test to a rule shape it is not about.
  return {
    group: { id: groupId, label, rule: { kind: "attested", note: "" } },
    status,
    verification: "flagged",
    matched: [],
    completed: 0,
    required: 2,
    unit: "courses",
    candidates,
  } as GroupResult;
}

/* ==========================================================================
 * The headline assertion
 * ========================================================================== */

describe("the prerequisite hard filter", () => {
  const firstYear = { taken: [] as TakenCourse[] };

  it("never recommends COMS W4111 to a first-year", () => {
    /*
     * The spec's acceptance test, and the failure that would end the product's
     * credibility in a single screen: a first-year shown Databases learns
     * immediately that the recommendations are decoration.
     */
    const results = recommended({
      profile: firstYear,
      candidates: CANDIDATES,
      vectors,
      prereqs,
    });

    expect(results.map((r) => r.course.courseId)).not.toContain(DATABASES);
  });

  it("still refuses it when it is the single most attractive candidate", () => {
    /*
     * The version that catches a penalty masquerading as a filter. Here W4111
     * clears TWO outstanding requirements and matches the student's taste
     * exactly — every scoring term argues for it. If the filter were a weight,
     * this is precisely the case where it would lose.
     */
    const results = recommended({
      profile: { taken: taken([INTRO_PROGRAMMING, true]) },
      candidates: CANDIDATES,
      vectors,
      prereqs,
      outstanding: [
        group("electives", "Computer Science Electives", [DATABASES]),
        group("area-foundation", "Area Foundation", [DATABASES]),
      ],
    });

    expect(results.map((r) => r.course.courseId)).not.toContain(DATABASES);
  });

  it("returns an empty list rather than an ineligible one", () => {
    /*
     * No fallback, no "closest we could do". An empty feed is an honest
     * statement; a feed of courses the student cannot register for is not.
     */
    const results = recommended({
      profile: firstYear,
      candidates: [course(DATABASES, "INTRODUCTION TO DATABASES")],
      vectors,
      prereqs,
    });

    expect(results).toEqual([]);
  });

  it("recommends it once the prerequisite is actually done", () => {
    // The control. A filter that excluded everything would pass all three tests
    // above and be worthless.
    const results = recommended({
      profile: { taken: taken([INTRO_PROGRAMMING, null], [DATA_STRUCTURES, null]) },
      candidates: CANDIDATES,
      vectors,
      prereqs,
    });

    expect(results.map((r) => r.course.courseId)).toContain(DATABASES);
  });

  it("counts planned courses as completed when checking reachability", () => {
    /*
     * A student with next term's schedule built is asking "what comes after
     * this". Evaluating against finished coursework only would hide exactly the
     * courses they are planning toward.
     */
    const results = recommended({
      profile: {
        taken: taken([INTRO_PROGRAMMING, null]),
        planned: [DATA_STRUCTURES],
      },
      candidates: CANDIDATES,
      vectors,
      prereqs,
    });

    expect(results.map((r) => r.course.courseId)).toContain(DATABASES);
    // …but the planned course itself is not re-recommended.
    expect(results.map((r) => r.course.courseId)).not.toContain(DATA_STRUCTURES);
  });
});

describe("the two kinds of unknown", () => {
  /*
   * The regression this whole section exists for.
   *
   * Every test above passed while the live engine was still recommending
   * COMS W4111 to first-years, because the fixture had no course shaped like
   * the real one: a gate that parses cleanly, fails cleanly, and is softened to
   * `unknown` only by "or instructor's permission". W4111's actual prose is
   *
   *   "COMS W3134, COMS W3136, or COMS W3136; or instructor's permission"
   *
   * — 23.7% of the catalog carries that ending, so this is not an edge case.
   */

  it("refuses a course whose gate we evaluated and watched fail", () => {
    INSTRUCTOR_PERMISSION.add(DATABASES);
    try {
      const results = recommended({
        profile: { taken: [] },
        candidates: CANDIDATES,
        vectors,
        prereqs,
      });

      // `unknown`, but we know precisely what is missing — so it is not a
      // suggestion we are entitled to make unprompted.
      expect(prereqs.statusFor(DATABASES, new Set()).status).toBe("unknown");
      expect(results.map((r) => r.course.courseId)).not.toContain(DATABASES);
    } finally {
      INSTRUCTOR_PERMISSION.delete(DATABASES);
    }
  });

  it("still recommends it once the gate passes, permission or not", () => {
    /*
     * The control. Permission must not make a course permanently unsuggestable
     * — that would be the opposite over-correction, hiding a quarter of the
     * catalog from the students who have earned it.
     */
    INSTRUCTOR_PERMISSION.add(DATABASES);
    try {
      const results = recommended({
        profile: { taken: taken([INTRO_PROGRAMMING, null], [DATA_STRUCTURES, null]) },
        candidates: CANDIDATES,
        vectors,
        prereqs,
      });

      expect(results.map((r) => r.course.courseId)).toContain(DATABASES);
    } finally {
      INSTRUCTOR_PERMISSION.delete(DATABASES);
    }
  });
});

describe("withheld courses", () => {
  /*
   * Withholding is not deleting. The feed ignores this list; a student asking
   * about a specific course is answered from it.
   */

  it("reports what was held back and exactly what is missing", () => {
    const { recommendations, withheld } = recommend({
      profile: { taken: [] },
      candidates: CANDIDATES,
      vectors,
      prereqs,
    });

    expect(recommendations.map((r) => r.course.courseId)).not.toContain(DATABASES);

    const databases = withheld.find((w) => w.course.courseId === DATABASES);
    expect(databases).toBeDefined();
    expect(databases!.reason).toBe("prereq_unmet");
    // Not just "you can't take this" — the specific gate, so the answer to
    // "why not?" is a course code rather than a shrug.
    expect(databases!.missing).toEqual([[DATA_STRUCTURES]]);
  });

  it("marks a permission-gated course as the actionable kind", () => {
    /*
     * The distinction the product is actually built on. `prereq_unmet` is a
     * hard no; `prereq_unmet_but_permission` means the student can email the
     * instructor today, which is advice worth giving and advice Vergil cannot.
     */
    INSTRUCTOR_PERMISSION.add(DATABASES);
    try {
      const { withheld } = recommend({
        profile: { taken: [] },
        candidates: CANDIDATES,
        vectors,
        prereqs,
      });

      const databases = withheld.find((w) => w.course.courseId === DATABASES);
      expect(databases!.reason).toBe("prereq_unmet_but_permission");
      expect(databases!.advisories).toContain("or permission of the instructor");
    } finally {
      INSTRUCTOR_PERMISSION.delete(DATABASES);
    }
  });

  it("sorts the actionable ones first", () => {
    // A student reading a withheld list should hit the courses they can do
    // something about before the ones they cannot.
    INSTRUCTOR_PERMISSION.add(DATABASES);
    try {
      const { withheld } = recommend({
        profile: { taken: [] },
        candidates: CANDIDATES,
        vectors,
        prereqs,
      });

      const firstHardNo = withheld.findIndex((w) => w.reason === "prereq_unmet");
      const lastActionable = withheld.map((w) => w.reason).lastIndexOf("prereq_unmet_but_permission");
      expect(lastActionable).toBeLessThan(firstHardNo);
    } finally {
      INSTRUCTOR_PERMISSION.delete(DATABASES);
    }
  });

  it("does not withhold a course that merely has unresolvable prose", () => {
    /*
     * The ignorance case belongs in the feed, not in the withheld list — we
     * have no grounds to hold it back and no specific missing course to name.
     */
    UNRESOLVED.add(DATABASES);
    try {
      const { recommendations, withheld } = recommend({
        profile: { taken: [] },
        candidates: CANDIDATES,
        vectors,
        prereqs,
      });

      expect(recommendations.map((r) => r.course.courseId)).toContain(DATABASES);
      expect(withheld.map((w) => w.course.courseId)).not.toContain(DATABASES);
    } finally {
      UNRESOLVED.delete(DATABASES);
    }
  });
});

describe("unknown prerequisites are not exclusions", () => {
  it("shows a course whose prerequisites could not be resolved, with a caveat", () => {
    /*
     * 43.2% of the catalog's parsed prerequisites resolved to no course
     * reference at all, and 23.7% end "or permission of the instructor".
     * Excluding on `unknown` would hide most gated courses from everyone and
     * would punish exactly the students who ask.
     */
    UNRESOLVED.add(DATABASES);
    try {
      const results = recommended({
        profile: { taken: [] },
        candidates: CANDIDATES,
        vectors,
        prereqs,
      });

      const databases = results.find((r) => r.course.courseId === DATABASES);
      expect(databases).toBeDefined();
      expect(databases!.caveats).toContainEqual({
        kind: "prereq_unknown",
        advisories: ["permission of the instructor"],
        outstanding: [],
      });
    } finally {
      UNRESOLVED.delete(DATABASES);
    }
  });
});

/* ==========================================================================
 * Scoring
 * ========================================================================== */

describe("the blend", () => {
  it("ranks a required course above an equally interesting optional one", () => {
    /*
     * The ordering the weights exist to produce. A student's degree is not
     * optional and their curiosity is; a feed that puts a fascinating elective
     * above the course blocking graduation is entertaining and useless.
     */
    const results = recommended({
      profile: { taken: taken([DISCRETE_MATH, true]) },
      candidates: [course(INTRO_PROGRAMMING, "INTRO"), course(ADVANCED_PROGRAMMING, "ADV")],
      vectors,
      prereqs,
      outstanding: [group("core", "CS Core", [INTRO_PROGRAMMING])],
    });

    expect(results[0].course.courseId).toBe(INTRO_PROGRAMMING);
    expect(results[0].components.requirementFit).toBeGreaterThan(0);
  });

  it("weights a loved course more heavily than a merely-taken one", () => {
    const loved = recommended({
      profile: { taken: taken([AFRICAN_AMERICAN_STUDIES, true]) },
      candidates: [course(EAST_ASIAN_CIV, "EAST ASIAN")],
      vectors,
      prereqs,
    });
    const neutral = recommended({
      profile: { taken: taken([AFRICAN_AMERICAN_STUDIES, null]) },
      candidates: [course(EAST_ASIAN_CIV, "EAST ASIAN")],
      vectors,
      prereqs,
    });

    /*
     * With a single contributing course the taste vector normalizes to the same
     * direction either way, so the similarity is equal — which is correct, and
     * worth pinning so nobody "fixes" it later. The weight only changes the
     * BLEND between several courses.
     */
    expect(loved[0].components.taste).toBeCloseTo(neutral[0].components.taste, 5);
  });

  it("lets a loved course pull the taste vector away from a disliked one", () => {
    const results = recommended({
      profile: {
        taken: taken([AFRICAN_AMERICAN_STUDIES, true], [INTRO_PROGRAMMING, false]),
      },
      candidates: [course(EAST_ASIAN_CIV, "EAST ASIAN"), course(DATA_STRUCTURES, "DS")],
      vectors,
      prereqs,
    });

    const humanities = results.find((r) => r.course.courseId === EAST_ASIAN_CIV)!;
    const computing = results.find((r) => r.course.courseId === DATA_STRUCTURES)!;
    expect(humanities.components.taste).toBeGreaterThan(computing.components.taste);
  });

  it("gives a cold-start student zero taste signal rather than a fake one", () => {
    /*
     * With no coursework there is no taste vector, and every course must score
     * exactly zero on that term. A zero VECTOR would produce the same numbers
     * while looking like a considered comparison — the distinction is why
     * `buildTasteVector` returns null.
     */
    const results = recommended({
      profile: { taken: [] },
      candidates: CANDIDATES,
      vectors,
      prereqs,
    });

    for (const result of results) {
      expect(result.components.taste).toBe(0);
    }
  });

  it("damps the unlock term so an intro course cannot outrank a requirement", () => {
    // log1p(40) ≈ 3.71, times 0.3 ≈ 1.11 — comparable to ONE requirement, not
    // to several. Undamped, 40 × 0.3 = 12 would bury everything else.
    expect(WEIGHTS.unlock * unlockScore(40)).toBeLessThan(WEIGHTS.requirement * 2);
    expect(unlockScore(0)).toBe(0);
  });
});

/* ==========================================================================
 * Reasons
 * ========================================================================== */

describe("reasons", () => {
  it("says a course is required when it clears an outstanding group", () => {
    const results = recommended({
      profile: { taken: [] },
      candidates: [course(AFRICAN_AMERICAN_STUDIES, "AFAS")],
      vectors,
      prereqs,
      outstanding: [group("global-core", "Global Core", [AFRICAN_AMERICAN_STUDIES])],
    });

    expect(results[0].reasons).toContainEqual({
      kind: "required",
      groupId: "global-core",
      groupLabel: "Global Core",
    });
  });

  it("upgrades to 'interesting and it counts' when taste agrees", () => {
    const results = recommended({
      profile: { taken: taken([AFRICAN_AMERICAN_STUDIES, true]) },
      candidates: [course(EAST_ASIAN_CIV, "EAST ASIAN")],
      vectors,
      prereqs,
      outstanding: [group("global-core", "Global Core", [EAST_ASIAN_CIV])],
    });

    const reason = results[0].reasons[0];
    expect(reason.kind).toBe("interesting_and_counts");
    expect(reason.kind === "interesting_and_counts" && reason.similarTo).toContain(
      AFRICAN_AMERICAN_STUDIES,
    );
  });

  it("never claims a taste reason it cannot support", () => {
    /*
     * A card saying "because you took Discrete Math" about a course that merely
     * failed to be dissimilar is a small lie, and it is the kind a student
     * notices the first time they read one carefully. Below the threshold the
     * course is still shown — with no taste reason attached.
     */
    const results = recommended({
      // The intro course, not data structures: data structures is prerequisite-
      // gated and the hard filter would remove it before scoring, which would
      // make this test pass for the wrong reason.
      profile: { taken: taken([AFRICAN_AMERICAN_STUDIES, null]) },
      candidates: [course(INTRO_PROGRAMMING, "INTRO TO COMPUTER SCIENCE")],
      vectors,
      prereqs,
    });

    const result = results[0];
    // `components.taste` is WEIGHTS.taste × cosine, so this asserts the cosine
    // itself sits below the threshold — a humanities course tells us nothing
    // about a programming course.
    expect(result.components.taste).toBeLessThan(WEIGHTS.taste * TASTE_REASON_THRESHOLD);
    expect(result.reasons.filter((r) => r.kind === "because_you_took")).toEqual([]);
  });

  it("names the courses a taste recommendation actually came from", () => {
    const results = recommended({
      profile: { taken: taken([DISCRETE_MATH, true], [AFRICAN_AMERICAN_STUDIES, null]) },
      // Ungated, so the filter cannot pre-empt the thing being tested.
      candidates: [course(INTRO_PROGRAMMING, "INTRO TO COMPUTER SCIENCE")],
      vectors,
      prereqs,
    });

    const reason = results[0].reasons.find((r) => r.kind === "because_you_took");
    expect(reason).toBeDefined();
    // The computing course, not the humanities one — "because you took X" has
    // to be true about THIS recommendation, not about the record in general.
    expect(reason!.kind === "because_you_took" && reason!.similarTo[0]).toBe(DISCRETE_MATH);
  });
});

/* ==========================================================================
 * Degenerate inputs
 * ========================================================================== */

describe("courses with no semantic vector", () => {
  it("scores zero on taste and is still recommendable", () => {
    /*
     * Only courses with enough description text get a vector, and a one-line
     * independent-study listing legitimately has none. Dropping them would
     * silently hide every thinly-described course — which correlates with small
     * departments, not with quality.
     */
    const unvectored = id("XXXX 1234");
    const results = recommended({
      profile: { taken: taken([DISCRETE_MATH, true]) },
      candidates: [course(unvectored, "SOMETHING UNDESCRIBED")],
      vectors,
      prereqs,
    });

    expect(results).toHaveLength(1);
    expect(results[0].components.taste).toBe(0);
    expect(results[0].caveats).toContainEqual({ kind: "no_vector" });
  });
});

describe("satisfied requirement groups", () => {
  it("does not offer a requirement reason for a group already finished", () => {
    const results = recommended({
      profile: { taken: [] },
      candidates: [course(AFRICAN_AMERICAN_STUDIES, "AFAS")],
      vectors,
      prereqs,
      outstanding: [
        group("global-core", "Global Core", [AFRICAN_AMERICAN_STUDIES], "satisfied"),
      ],
    });

    expect(results[0].components.requirementFit).toBe(0);
    expect(results[0].reasons.filter((r) => r.kind === "required")).toEqual([]);
  });
});
