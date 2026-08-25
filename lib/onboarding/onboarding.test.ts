import { describe, expect, it } from "vitest";

import { interestTagsForPrograms, knownInterestTagIds } from "@/lib/profile/interest-tags";
import { CC_CORE, CC_MAJOR_COMPUTER_SCIENCE } from "@/lib/requirements/programs";
import type { PrereqSource } from "@/lib/recommend";
import { noVectorSource } from "@/lib/recommend";

import {
  buildGuessDeck,
  expectedLevelCeiling,
  impliedPrerequisites,
  namedCoursesOf,
  unambiguousPrereqChain,
  unambiguousPrereqsOf,
  yearsCompleted,
} from "./guess";
import { sameIds, stabilizeStrip } from "./stable-strip";
import { typicalGuesses } from "./typical";
import { displayCourseTitle } from "./course-title";
import { hasAnythingToMigrate, toMigrationPayload } from "./migrate";
import { defaultCandidateSelection, parseTranscript } from "./transcript";
import {
  advance,
  canAdvance,
  canJumpTo,
  deserialize,
  emptyGuestState,
  goBack,
  goToStep,
  ONBOARDING_STEPS,
  NO_MINORS_PROGRAM_ID,
  previousStep,
  reconcileDegreeChange,
  removeCourse,
  RERANK_BATCH_SIZE,
  serialize,
  setLiked,
  shouldRerank,
  stepIndex,
  upsertCourse,
  type GuestCourse,
  type GuestOnboardingState,
} from "./state";

/* ==========================================================================
 * Fixtures
 * ========================================================================== */

function course(overrides: Partial<GuestCourse> & { courseId: string }): GuestCourse {
  return {
    code: overrides.courseId,
    title: null,
    termLabel: null,
    points: null,
    liked: null,
    source: "onboarding_guess",
    inCatalog: true,
    ...overrides,
  };
}

/**
 * A guest who answered EVERY question, including the awkward answers: a course
 * our catalog does not hold, a course with a term and points, a disliked
 * course, and a course with no opinion. This is the fixture the losslessness
 * assertion runs against, so it is deliberately maximal.
 */
function fullyAnsweredState(): GuestOnboardingState {
  return {
    version: 1,
    school: "CC",
    classYear: "2028",
    programIds: ["cc-major-computer-science", "cc-minor-computer-science"],
    courses: [
      course({
        courseId: "COMS1004W",
        code: "COMS W1004",
        title: "Introduction to Computer Science",
        points: 3,
        liked: true,
        source: "onboarding_guess",
      }),
      course({
        courseId: "COMS3134W",
        code: "COMS W3134",
        title: "Data Structures",
        termLabel: "Fall 2024",
        points: 3,
        liked: false,
        source: "picker",
      }),
      course({
        courseId: "MATH1201UN",
        code: "MATH UN1201",
        title: "Calculus III",
        liked: null,
        source: "transcript_pdf",
      }),
      // The row that matters most: transfer credit our catalog cannot resolve.
      course({
        courseId: "PHYS2601XX",
        code: "PHYS XX2601",
        title: null,
        termLabel: "Spring 2023",
        points: 4,
        liked: true,
        source: "transcript_paste",
        inCatalog: false,
      }),
    ],
    interestTags: ["ai-ml", "systems"],
    step: "feed",
    furthestStep: "feed",
    confirmationsSinceRerank: 2,
    dismissedCourseIds: ["PHYS1201C"],
    updatedAt: "2026-08-24T12:00:00.000Z",
  };
}

/** A prerequisite source with hand-written gates. Ten courses, in memory. */
function fakePrereqs(
  gates: Record<string, string[][]>,
  unlocks: Record<string, string[]> = {},
): PrereqSource {
  return {
    statusFor(courseId, completed) {
      const outstanding = (gates[courseId] ?? []).filter(
        (choice) => !choice.some((option) => completed.has(option)),
      );
      return {
        status: outstanding.length === 0 ? "met" : "unmet",
        outstanding,
        advisories: [],
      };
    },
    newlyUnlockedBy: (courseId) => unlocks[courseId] ?? [],
  };
}

/* ==========================================================================
 * 1. Guest state round-trips losslessly through the sign-in migration
 * ========================================================================== */

describe("guest state survives the trip to an account", () => {
  it("round-trips through localStorage serialization unchanged", () => {
    const original = fullyAnsweredState();
    const restored = deserialize(serialize(original));

    // Deep equality, not field-by-field: a field added to the state type and
    // forgotten in `serialize` has to fail here, and only deep equality does
    // that without the test being edited too.
    expect(restored).toEqual(original);
  });

  it("reads a state stored before `dismissedCourseIds` existed, without a key bump", () => {
    /*
     * The versioned key is for shapes we cannot read correctly, not for every
     * shape change. A guest mid-onboarding across a deploy that added this
     * field loses nothing: the field defaults, and the rest is understood
     * exactly as written.
     */
    const stored = fullyAnsweredState() as Partial<GuestOnboardingState>;
    delete stored.dismissedCourseIds;

    const restored = deserialize(JSON.stringify(stored));
    expect(restored).not.toBeNull();
    expect(restored?.dismissedCourseIds).toEqual([]);
    expect(restored?.courses.length).toBe(fullyAnsweredState().courses.length);
  });

  it("rejects a stored value it does not recognise rather than half-reading it", () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize("not json")).toBeNull();
    // A future version's object. Restarting onboarding is the only safe answer.
    expect(deserialize(JSON.stringify({ ...fullyAnsweredState(), version: 2 }))).toBeNull();
    // A course row missing the tri-state `liked` field.
    expect(
      deserialize(
        JSON.stringify({
          ...fullyAnsweredState(),
          courses: [{ courseId: "COMS1004W", code: "COMS W1004" }],
        }),
      ),
    ).toBeNull();
  });

  it("carries every student-supplied field into the migration payload", () => {
    const state = fullyAnsweredState();
    const payload = toMigrationPayload(state);

    expect(payload.school).toBe("CC");
    expect(payload.class_year).toBe("2028");
    expect(payload.program_ids).toEqual([
      "cc-major-computer-science",
      "cc-minor-computer-science",
    ]);
    expect(payload.interest_tags).toEqual(["ai-ml", "systems"]);

    // Every course, with its term, points, opinion and provenance.
    expect(payload.courses).toHaveLength(state.courses.length);
    for (const original of state.courses) {
      const row = payload.courses.find((candidate) => candidate.course_id === original.courseId);
      expect(row, `${original.courseId} was dropped on the way to the database`).toBeDefined();
      expect(row?.term_label).toBe(original.termLabel);
      expect(row?.points).toBe(original.points);
      expect(row?.liked).toBe(original.liked);
      expect(row?.source).toBe(original.source);
    }
  });

  it("keeps `liked: null` as null rather than collapsing it to false", () => {
    // The single most damaging silent change this payload could make: the taste
    // vector weights a disliked course DOWN, so a null read as false would push
    // the recommender away from most of a transcript.
    const payload = toMigrationPayload(fullyAnsweredState());
    const untouched = payload.courses.find((row) => row.course_id === "MATH1201UN");
    expect(untouched?.liked).toBeNull();
  });

  it("drops program ids and tags that resolve to nothing, and only those", () => {
    const state: GuestOnboardingState = {
      ...fullyAnsweredState(),
      programIds: ["cc-major-computer-science", "no-such-program"],
      interestTags: ["ai-ml", "not-a-real-tag"],
    };
    const payload = toMigrationPayload(state);

    expect(payload.program_ids).toEqual(["cc-major-computer-science"]);
    expect(payload.interest_tags).toEqual(["ai-ml"]);
    // Nothing the STUDENT supplied was touched.
    expect(payload.courses).toHaveLength(state.courses.length);
  });

  it("emits one row per course id, so the upsert cannot depend on array order", () => {
    const state = fullyAnsweredState();
    const withDuplicate: GuestOnboardingState = {
      ...state,
      courses: [...state.courses, course({ courseId: "COMS1004W", liked: false })],
    };

    const payload = toMigrationPayload(withDuplicate);
    const ids = payload.courses.map((row) => row.course_id);
    expect(new Set(ids).size).toBe(ids.length);
    // Last write wins, matching `upsertCourse`.
    expect(payload.courses.find((row) => row.course_id === "COMS1004W")?.liked).toBe(false);
  });

  it("reports an empty state as nothing to migrate rather than as a failure", () => {
    expect(hasAnythingToMigrate(emptyGuestState())).toBe(false);
    expect(hasAnythingToMigrate(fullyAnsweredState())).toBe(true);
  });
});

/* ==========================================================================
 * 2. Every step's back button works, and nothing is a one-way door
 * ========================================================================== */

describe("every step is reversible", () => {
  it("offers a previous step from every step except the first", () => {
    expect(previousStep(ONBOARDING_STEPS[0])).toBeNull();
    for (const step of ONBOARDING_STEPS.slice(1)) {
      const back = previousStep(step);
      expect(back, `${step} has no way back`).not.toBeNull();
      expect(stepIndex(back!)).toBe(stepIndex(step) - 1);
    }
  });

  it("walks forward to the last step and back to the first, losing nothing", () => {
    let state: GuestOnboardingState = { ...emptyGuestState(), school: "CC" };

    // Forward, accumulating an answer at each stop so the back walk has
    // something to lose if it is going to lose anything.
    state = advance(state);
    state = upsertCourse(state, course({ courseId: "COMS1004W", code: "COMS W1004" }));
    state = advance(state);
    state = setLiked(state, "COMS1004W", true);
    state = advance(state);
    state = { ...state, interestTags: ["ai-ml"] };
    state = advance(state);

    expect(state.step).toBe("feed");
    expect(state.furthestStep).toBe("feed");

    for (let index = ONBOARDING_STEPS.length - 1; index > 0; index--) {
      expect(state.step).toBe(ONBOARDING_STEPS[index]);
      state = goBack(state);
    }

    expect(state.step).toBe("school");
    // Back is navigation, never destruction.
    expect(state.courses).toHaveLength(1);
    expect(state.courses[0].liked).toBe(true);
    expect(state.interestTags).toEqual(["ai-ml"]);
    // And the furthest point reached is remembered, so forward is free again.
    expect(state.furthestStep).toBe("feed");
    expect(canJumpTo(state, "interests")).toBe(true);
  });

  it("makes going back from the first step a no-op rather than an error", () => {
    const first = { ...emptyGuestState(), school: "CC" as const };
    expect(goBack(first)).toEqual(first);
  });

  it("will not jump forward past where the student has actually been", () => {
    const state = { ...emptyGuestState(), school: "CC" as const };
    expect(canJumpTo(state, "school")).toBe(true);
    expect(canJumpTo(state, "love")).toBe(false);

    const later = goToStep(state, "coursework");
    expect(canJumpTo(later, "coursework")).toBe(true);
    expect(canJumpTo(later, "love")).toBe(false);
  });

  it("gates only the first step, and only on the one answer nothing works without", () => {
    expect(canAdvance(emptyGuestState())).toBe(false);
    expect(canAdvance({ ...emptyGuestState(), school: "SEAS" })).toBe(true);

    // Every later step is skippable: a student who confirms nothing still gets
    // a feed, and forcing an answer to get a recommendation loses the people
    // the flow was built for.
    for (const step of ONBOARDING_STEPS.slice(1)) {
      expect(canAdvance({ ...emptyGuestState(), step })).toBe(true);
    }
  });

  it("does not advance past the last step", () => {
    const last = { ...emptyGuestState(), school: "CC" as const, step: "feed" as const };
    expect(advance(last)).toEqual(last);
  });
});

/* ==========================================================================
 * 3. Unmatched coursework is stored and marked, never rejected
 * ========================================================================== */

describe("unmatched coursework", () => {
  it("stays on the record, marked, all the way into the database payload", () => {
    const state = fullyAnsweredState();
    const unmatched = state.courses.find((row) => !row.inCatalog);
    expect(unmatched, "fixture no longer covers the unmatched case").toBeDefined();

    const payload = toMigrationPayload(state);
    const row = payload.courses.find((candidate) => candidate.course_id === unmatched!.courseId);

    // Present, with its term and points intact. `student_courses.course_id` is
    // deliberately not a foreign key precisely so this row can exist.
    expect(row).toBeDefined();
    expect(row?.term_label).toBe("Spring 2023");
    expect(row?.points).toBe(4);
  });

  it("keeps the marking in the guest state so the UI can say 'not in our catalog'", () => {
    let state = emptyGuestState();
    state = upsertCourse(
      state,
      course({ courseId: "HIST1234ZZ", code: "HIST ZZ1234", inCatalog: false }),
    );

    expect(state.courses).toHaveLength(1);
    expect(state.courses[0].inCatalog).toBe(false);

    // The mark is display only — it never becomes a filter on the way out.
    expect(toMigrationPayload(state).courses).toHaveLength(1);
  });

  it("survives being re-added by another path without losing its opinion", () => {
    let state = emptyGuestState();
    state = upsertCourse(state, course({ courseId: "PHYS2601XX", inCatalog: false }));
    state = setLiked(state, "PHYS2601XX", true);
    // The same course arrives again from the transcript importer, with no
    // opinion attached. The student's answer must not be erased by it.
    state = upsertCourse(
      state,
      course({ courseId: "PHYS2601XX", source: "transcript_pdf", inCatalog: false, liked: null }),
    );

    expect(state.courses).toHaveLength(1);
    expect(state.courses[0].liked).toBe(true);
    expect(state.courses[0].source).toBe("transcript_pdf");
  });

  it("removes cleanly when the student says we got it wrong", () => {
    let state = emptyGuestState();
    state = upsertCourse(state, course({ courseId: "COMS1004W" }));
    state = removeCourse(state, "COMS1004W");
    expect(state.courses).toEqual([]);
  });

  it("remembers an untick so a rebuilt deck cannot re-tick it", () => {
    // The bug this pins: the coursework step rebuilds its deck on every mount
    // and pre-checks tier 1. A student who unticks a course, steps forward and
    // steps back found it ticked again — the flow undoing their correction.
    let state = emptyGuestState();
    state = upsertCourse(state, course({ courseId: "MATH1102UN" }));
    state = removeCourse(state, "MATH1102UN");

    expect(state.dismissedCourseIds).toEqual(["MATH1102UN"]);
    // And it survives the round trip, which is the whole point — the refusal is
    // only useful if it outlives the component that recorded it.
    expect(deserialize(serialize(state))?.dismissedCourseIds).toEqual(["MATH1102UN"]);
  });

  it("clears a refusal when the student adds the course back deliberately", () => {
    let state = emptyGuestState();
    state = upsertCourse(state, course({ courseId: "MATH1102UN" }));
    state = removeCourse(state, "MATH1102UN");
    state = upsertCourse(state, course({ courseId: "MATH1102UN", source: "picker" }));

    expect(state.dismissedCourseIds).toEqual([]);
    expect(state.courses.map((row) => row.courseId)).toEqual(["MATH1102UN"]);
  });

  it("records a refusal once, however many times it is repeated", () => {
    let state = emptyGuestState();
    state = upsertCourse(state, course({ courseId: "MATH1102UN" }));
    state = removeCourse(state, "MATH1102UN");
    state = removeCourse(state, "MATH1102UN");
    expect(state.dismissedCourseIds).toEqual(["MATH1102UN"]);
  });

  it("keeps a refusal out of the database payload — an absent row already says it", () => {
    let state = emptyGuestState();
    state = upsertCourse(state, course({ courseId: "MATH1102UN" }));
    state = removeCourse(state, "MATH1102UN");
    expect(toMigrationPayload(state).courses).toEqual([]);
  });

  it("accepts a transcript row whose code our catalog will not resolve", () => {
    // A real transfer-credit line. The parser's job is to produce a candidate;
    // deciding it is invalid is not anyone's job.
    const candidates = parseTranscript("Spring 2023  PHYS UN1601  Mechanics  4.00  TR");
    expect(candidates.length).toBeGreaterThan(0);

    const transfer = candidates[0];
    expect(transfer.courseId).toBe("PHYS1601UN");
    // Flagged for the student's review — and therefore NOT pre-checked.
    expect(transfer.warnings.length).toBeGreaterThan(0);
    expect(defaultCandidateSelection(candidates).has(transfer.courseId)).toBe(false);
  });
});

/* ==========================================================================
 * The guess deck
 * ========================================================================== */

describe("changing a degree answer retires the guesses made from the old one", () => {
  /** A student mid-flow: three of our guesses, one course they found themselves. */
  function afterCoursework(): GuestOnboardingState {
    let state = emptyGuestState();
    state = { ...state, school: "SEAS", classYear: "2028", programIds: ["seas-major-cs"] };
    state = upsertCourse(state, course({ courseId: "COMS1004W" }));
    state = upsertCourse(state, course({ courseId: "COMS3134W" }));
    state = upsertCourse(state, course({ courseId: "COMS3157W" }));
    state = upsertCourse(state, course({ courseId: "ECON1105W", source: "picker" }));
    return state;
  }

  const withMajor = (state: GuestOnboardingState, programIds: string[]) => ({
    ...state,
    programIds,
  });

  it("drops guesses when the major changes, and keeps what the student added", () => {
    // The bug: the coursework screen writes tier 1 straight onto the record, so
    // a student who stepped back and switched major returned to "here's what we
    // think you've taken" still holding the old major's course list.
    const before = afterCoursework();
    const after = reconcileDegreeChange(before, withMajor(before, ["cc-major-economics"]));

    expect(after.courses.map((row) => row.courseId)).toEqual(["ECON1105W"]);
  });

  it("drops guesses when the class year changes", () => {
    // Class year sets the level ceiling — a rising senior's pre-checked list is
    // not a first-year's, in either direction.
    const before = afterCoursework();
    const after = reconcileDegreeChange(before, { ...before, classYear: "2026" });

    expect(after.courses.map((row) => row.courseId)).toEqual(["ECON1105W"]);
  });

  it("drops guesses when the school changes", () => {
    const before = afterCoursework();
    const after = reconcileDegreeChange(before, { ...before, school: "CC" });

    expect(after.courses.map((row) => row.courseId)).toEqual(["ECON1105W"]);
  });

  it("keeps a guess the student answered the love screen about", () => {
    // Answering "did you like this?" is an implicit confirmation that they took
    // it, and a stronger statement than the guess that put it there. Dropping
    // the row would also throw the opinion away.
    let before = afterCoursework();
    before = setLiked(before, "COMS3134W", true);
    before = setLiked(before, "COMS3157W", false);

    const after = reconcileDegreeChange(before, withMajor(before, ["cc-major-economics"]));

    expect(after.courses.map((row) => row.courseId)).toEqual([
      "COMS3134W",
      "COMS3157W",
      "ECON1105W",
    ]);
    expect(after.courses.find((row) => row.courseId === "COMS3134W")?.liked).toBe(true);
  });

  it("keeps transcript rows, which are the student's own record", () => {
    let before = afterCoursework();
    before = upsertCourse(
      before,
      course({ courseId: "MATH1101UN", source: "transcript_pdf", termLabel: "Fall 2024" }),
    );

    const after = reconcileDegreeChange(before, withMajor(before, ["cc-major-economics"]));

    expect(after.courses.map((row) => row.courseId)).toEqual(["ECON1105W", "MATH1101UN"]);
  });

  it("keeps refusals, which stay true across a change of major", () => {
    // "I did not take Calculus II" is a fact about the student, not about their
    // degree. Clearing it would let the rebuilt deck re-tick what they unticked.
    let before = afterCoursework();
    before = removeCourse(before, "COMS3157W");

    const after = reconcileDegreeChange(before, withMajor(before, ["cc-major-economics"]));

    expect(after.dismissedCourseIds).toEqual(["COMS3157W"]);
  });

  it("leaves the record alone when the answer did not actually change", () => {
    // Re-picking the same school, or toggling a minor off and straight back on,
    // must not cost a student their pre-checked list.
    const before = afterCoursework();
    const next = { ...before, school: "SEAS" as const };
    const after = reconcileDegreeChange(before, next);

    // Returned untouched, not rebuilt: nothing downstream should see a new
    // object and re-run because a student re-picked the answer they had.
    expect(after).toBe(next);
    expect(after.courses.map((row) => row.courseId)).toEqual([
      "COMS1004W",
      "COMS3134W",
      "COMS3157W",
      "ECON1105W",
    ]);
  });

  it("does not read declining minors as a change of degree", () => {
    // The sentinel is guest-only bookkeeping and names no program, so it must
    // not invalidate a deck the student has already corrected.
    const before = afterCoursework();
    const after = reconcileDegreeChange(
      before,
      withMajor(before, ["seas-major-cs", NO_MINORS_PROGRAM_ID]),
    );

    expect(after.courses).toHaveLength(4);
  });

  it("does not read a reordered program list as a change of degree", () => {
    const before = withMajor(afterCoursework(), ["seas-major-cs", "cc-minor-math"]);
    const after = reconcileDegreeChange(
      before,
      withMajor(before, ["cc-minor-math", "seas-major-cs"]),
    );

    expect(after.courses).toHaveLength(4);
  });

  it("rewinds the re-rank counter, since the deck it was pacing is gone", () => {
    const before = { ...afterCoursework(), confirmationsSinceRerank: 1 };
    const after = reconcileDegreeChange(before, withMajor(before, ["cc-major-economics"]));

    expect(after.confirmationsSinceRerank).toBe(0);
  });
});

describe("guess deck", () => {
  const catalog = new Map(
    [
      ["COMS1004W", "COMS W1004"],
      ["COMS3134W", "COMS W3134"],
      ["COMS3157W", "COMS W3157"],
      ["COMS4118W", "COMS W4118"],
      ["MATH1201UN", "MATH UN1201"],
    ].map(([courseId, code]) => [courseId, { code, title: code, points: 3 }]),
  );

  it("re-ranks after a few confirmations, not each one", () => {
    expect(RERANK_BATCH_SIZE).toBe(3);
    expect(shouldRerank(0)).toBe(false);
    expect(shouldRerank(2)).toBe(false);
    expect(shouldRerank(3)).toBe(true);
  });

  it("reads the courses a program names, and marks the required ones", () => {
    const named = namedCoursesOf(CC_MAJOR_COMPUTER_SCIENCE);
    expect(named.size).toBeGreaterThan(0);

    // `all_of` — the CS Core requires all four outright, so they may be
    // pre-checked for a senior.
    expect(named.get("COMS3157W")?.required).toBe(true);
    expect(named.get("CSEE3827W")?.required).toBe(true);

    // `n_of` — "COMS W1004 OR COMS W1007". Both are worth OFFERING, and
    // neither may be pre-checked: the student took one of two and we do not
    // know which. This is the distinction the whole tiering rule rests on.
    expect(named.get("COMS1004W")?.required).toBe(false);
    expect(named.get("COMS1007W")?.required).toBe(false);
  });

  it("derives seniority from the class year, conservatively at both ends", () => {
    const now = new Date("2026-09-15T00:00:00Z"); // academic year 2027
    expect(yearsCompleted("2027", now)).toBe(3);
    expect(yearsCompleted("2030", now)).toBe(0);
    // An alum, and a typo. Both clamp rather than going negative.
    expect(yearsCompleted("2010", now)).toBe(4);
    expect(yearsCompleted(null, now)).toBeNull();
    expect(yearsCompleted("not a year", now)).toBeNull();
  });

  it("never pre-checks above the level a student's seniority implies", () => {
    // A first-year has finished at most one semester. Nothing above the intro
    // band may arrive pre-checked for them.
    expect(expectedLevelCeiling(0)).toBe(1000);
    expect(expectedLevelCeiling(2)).toBe(3000);
    // Unknown class year is treated as a first-year, not as a senior.
    expect(expectedLevelCeiling(null)).toBe(1000);
  });

  it("infers a prerequisite the student never ticked, from one they did", () => {
    const prereqs = fakePrereqs({ COMS3134W: [["COMS1004W"]] });
    expect([...impliedPrerequisites(["COMS3134W"], prereqs)]).toEqual(["COMS1004W"]);
  });

  it("refuses to infer from an ambiguous gate", () => {
    // "COMS W3134 or COMS W3136" tells us they took one of two, which is not a
    // course we can put a tick next to.
    const prereqs = fakePrereqs({ COMS4118W: [["COMS3134W", "COMS3136W"]] });
    expect([...impliedPrerequisites(["COMS4118W"], prereqs)]).toEqual([]);
  });

  it("puts an implied prerequisite in tier 1 even when the level ceiling says no", () => {
    const deck = buildGuessDeck({
      programs: [],
      // A first-year, so the ceiling is 1000 and nothing above it qualifies on
      // seniority. The student's own testimony beats our estimate.
      classYear: "2030",
      confirmed: [course({ courseId: "COMS4118W", code: "COMS W4118" })],
      catalog,
      prereqs: fakePrereqs({ COMS4118W: [["COMS3157W"]] }),
      vectors: noVectorSource(),
      now: new Date("2026-09-15T00:00:00Z"),
    });

    expect(deck.tier1.map((candidate) => candidate.courseId)).toContain("COMS3157W");
    expect(deck.tier2.map((candidate) => candidate.courseId)).not.toContain("COMS3157W");
  });

  it("demotes a required course the student is not senior enough for to tier 2", () => {
    const deck = buildGuessDeck({
      programs: [CC_MAJOR_COMPUTER_SCIENCE],
      classYear: "2030", // first-year: ceiling 1000
      confirmed: [],
      catalog,
      prereqs: fakePrereqs({}),
      vectors: noVectorSource(),
      now: new Date("2026-09-15T00:00:00Z"),
    });

    const tier1 = new Set(deck.tier1.map((candidate) => candidate.courseId));
    const everything = [...deck.tier1, ...deck.tier2].map((candidate) => candidate.courseId);

    // A 3000-level requirement is plausible, so it is offered — but never
    // pre-checked for someone who has been here five weeks.
    expect(everything).toContain("COMS3134W");
    expect(tier1.has("COMS3134W")).toBe(false);
  });

  it("never offers a course the student has already confirmed", () => {
    const deck = buildGuessDeck({
      programs: [CC_MAJOR_COMPUTER_SCIENCE],
      classYear: "2027",
      confirmed: [course({ courseId: "COMS1004W", code: "COMS W1004" })],
      catalog,
      prereqs: fakePrereqs({}),
      vectors: noVectorSource(),
      now: new Date("2026-09-15T00:00:00Z"),
    });

    const offered = [...deck.tier1, ...deck.tier2].map((candidate) => candidate.courseId);
    expect(offered).not.toContain("COMS1004W");
  });

  it("produces a deck with no programs and no prerequisites at all", () => {
    // The degenerate case: a student who declared nothing. An empty deck is a
    // correct answer; a crash is not, and this is the state the very first
    // render of the grid is in.
    const deck = buildGuessDeck({
      programs: [],
      classYear: null,
      confirmed: [],
      catalog: new Map(),
      prereqs: fakePrereqs({}),
      vectors: noVectorSource(),
    });

    expect(deck.tier1).toEqual([]);
    expect(deck.tier2).toEqual([]);
    expect(deck.impliesTaken).toEqual({});
  });

  it("names the intro a confirmation would imply, before the student ticks it", () => {
    const deck = buildGuessDeck({
      programs: [CC_MAJOR_COMPUTER_SCIENCE],
      classYear: "2027",
      confirmed: [],
      catalog,
      prereqs: fakePrereqs({ COMS3134W: [["COMS1004W"]] }),
      vectors: noVectorSource(),
      now: new Date("2026-09-15T00:00:00Z"),
    });

    expect(unambiguousPrereqsOf("COMS3134W", fakePrereqs({ COMS3134W: [["COMS1004W"]] }))).toEqual([
      "COMS1004W",
    ]);
    expect(deck.impliesTaken.COMS3134W?.map((facts) => facts.courseId)).toEqual(["COMS1004W"]);
  });

  it("follows a unique prereq chain, not only the course immediately under the tap", () => {
    const prereqs = fakePrereqs({
      COMS4118W: [["COMS3134W"]],
      COMS3134W: [["COMS1004W"]],
    });

    expect(unambiguousPrereqChain("COMS4118W", prereqs)).toEqual(["COMS3134W", "COMS1004W"]);

    const deck = buildGuessDeck({
      programs: [CC_MAJOR_COMPUTER_SCIENCE],
      classYear: "2027",
      confirmed: [],
      catalog,
      prereqs,
      vectors: noVectorSource(),
      now: new Date("2026-09-15T00:00:00Z"),
    });

    expect(deck.impliesTaken.COMS4118W?.map((facts) => facts.courseId)).toEqual([
      "COMS3134W",
      "COMS1004W",
    ]);
  });

  it("offers first-year cores and intro options before future required 3000-level", () => {
    const sophomoreCatalog = new Map(
      [
        ["COMS1004W", "COMS W1004"],
        ["COMS1007W", "COMS W1007"],
        ["COMS3134W", "COMS W3134"],
        ["COMS3157W", "COMS W3157"],
        ["HUMA1001CC", "HUMA CC1001"],
        ["ENGL1010CC", "ENGL CC1010"],
        ["MATH1101UN", "MATH UN1101"],
        ["MATH1201UN", "MATH UN1201"],
      ].map(([courseId, code]) => [courseId, { code, title: code, points: 3 }]),
    );

    const deck = buildGuessDeck({
      programs: [CC_CORE, CC_MAJOR_COMPUTER_SCIENCE],
      school: "CC",
      classYear: "2029",
      confirmed: [],
      catalog: sophomoreCatalog,
      prereqs: fakePrereqs({ MATH1201UN: [["MATH1101UN"]] }),
      vectors: noVectorSource(),
      now: new Date("2026-09-15T00:00:00Z"),
    });

    const strip = deck.tier2.map((candidate) => candidate.courseId);
    const introAt = strip.indexOf("COMS1004W");
    const futureCoreAt = strip.indexOf("COMS3157W");
    expect(introAt).toBeGreaterThanOrEqual(0);
    expect(futureCoreAt).toBeGreaterThanOrEqual(0);
    expect(introAt).toBeLessThan(futureCoreAt);

    const offered = new Set([...deck.tier1, ...deck.tier2].map((candidate) => candidate.courseId));
    expect(offered.has("HUMA1001CC")).toBe(true);
    expect(offered.has("ENGL1010CC")).toBe(true);
    // Calc III is a named option; its unique prereq is the first-year course
    // a CS major has almost always taken and the strip used to skip.
    expect(offered.has("MATH1101UN")).toBe(true);
  });

  it("keeps a dismissed guess off the next deck", () => {
    const deck = buildGuessDeck({
      programs: [CC_MAJOR_COMPUTER_SCIENCE],
      school: "CC",
      classYear: "2027",
      confirmed: [],
      dismissed: ["COMS1004W"],
      catalog,
      prereqs: fakePrereqs({}),
      vectors: noVectorSource(),
      now: new Date("2026-09-15T00:00:00Z"),
    });

    const offered = [...deck.tier1, ...deck.tier2].map((candidate) => candidate.courseId);
    expect(offered).not.toContain("COMS1004W");
  });
});

describe("typical schedules", () => {
  it("paces College Core by year, and does not invent a Barnard Core", () => {
    const firstYear = typicalGuesses({
      school: "CC",
      yearsCompleted: 0,
      ceiling: 1000,
      programs: [],
    }).map((guess) => guess.courseId);
    expect(firstYear).toContain("HUMA1001CC");
    expect(firstYear).toContain("ENGL1010CC");
    expect(firstYear).not.toContain("HUMA1002CC");
    expect(firstYear).not.toContain("COCI1101CC");

    const afterOneYear = typicalGuesses({
      school: "CC",
      yearsCompleted: 1,
      ceiling: 2000,
      programs: [],
    }).map((guess) => guess.courseId);
    expect(afterOneYear).toContain("HUMA1002CC");
    expect(afterOneYear).toContain("COCI1101CC");
    expect(afterOneYear).not.toContain("COCI1102CC");

    expect(
      typicalGuesses({
        school: "BC",
        yearsCompleted: 2,
        ceiling: 3000,
        programs: [],
      }),
    ).toEqual([]);
  });
});

describe("stable maybe-strip", () => {
  const pool = ["a", "b", "c", "d", "e"].map((courseId) => ({ courseId }));

  it("keeps pinned chips in place and appends new ones at the end", () => {
    expect(stabilizeStrip(["b", "a"], pool, 4).map((item) => item.courseId)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("fills a hole from the remaining pool without reordering what is left", () => {
    // Student dismissed `b`. The others stay; `c` was already next in line.
    expect(stabilizeStrip(["a", "b", "c"], pool.filter((item) => item.courseId !== "b"), 3).map(
      (item) => item.courseId,
    )).toEqual(["a", "c", "d"]);
  });

  it("sameIds is order-sensitive", () => {
    expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(false);
  });
});

/* ==========================================================================
 * Interest tags
 * ========================================================================== */

describe("interest tags", () => {
  it("offers a list for every authored major we support", () => {
    for (const programId of [
      "cc-major-computer-science",
      "cc-major-economics",
      "cc-major-english",
      "cc-major-history",
      "cc-major-political-science",
      "cc-major-psychology",
      "cc-major-biology",
      "cc-minor-computer-science",
      "cc-concentration-economics",
      "seas-major-computer-science",
      "seas-major-mechanical-engineering",
      "seas-major-operations-research",
      "seas-major-biomedical-engineering",
    ]) {
      const tags = interestTagsForPrograms([programId]);
      expect(tags.length, `${programId} has no interest tags`).toBeGreaterThanOrEqual(8);
      expect(tags.length, `${programId} has too many to fit one screen`).toBeLessThanOrEqual(12);
    }
  });

  it("de-duplicates across programs that share a list", () => {
    // A CS major who is also a CS minor must not be offered "systems" twice —
    // the second checkbox would silently toggle the first.
    const tags = interestTagsForPrograms([
      "cc-major-computer-science",
      "cc-minor-computer-science",
    ]);
    const ids = tags.map((tag) => tag.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contributes nothing for a program with no authored list", () => {
    expect(interestTagsForPrograms(["cc-core", "no-such-program"])).toEqual([]);
  });

  it("gives every tag at least one exemplar course to seed a vector from", () => {
    for (const programId of knownInterestTagIds().size > 0
      ? ["cc-major-computer-science", "cc-major-biology", "seas-major-operations-research"]
      : []) {
      for (const tag of interestTagsForPrograms([programId])) {
        expect(tag.exemplars.length, `${tag.id} has no exemplars`).toBeGreaterThan(0);
      }
    }
  });
});

describe("displayCourseTitle", () => {
  it("title-cases the registrar's all-caps titles", () => {
    expect(displayCourseTitle("THE SCIENCE OF PSYCHOLOGY")).toBe("The Science of Psychology");
    expect(displayCourseTitle("GENERAL CHEMISTRY LABORATORY")).toBe("General Chemistry Laboratory");
    expect(displayCourseTitle("INTRO TO MECHANICS & THERMO")).toBe("Intro to Mechanics & Thermo");
  });

  it("leaves a title the registrar already cased strictly alone", () => {
    // The case that makes the strip look broken is the MIXTURE, so a title
    // that arrives correct must come back byte-identical — including its
    // acronyms, which we have no business re-deciding.
    for (const title of [
      "Computer Vision I: First Principles",
      "iOS Application Development",
      "The Rise of Modern China",
    ]) {
      expect(displayCourseTitle(title)).toBe(title);
    }
  });

  it("keeps roman numerals past II, which prettyTitle alone drops", () => {
    expect(displayCourseTitle("CALCULUS I")).toBe("Calculus I");
    expect(displayCourseTitle("CALCULUS II")).toBe("Calculus II");
    expect(displayCourseTitle("CALCULUS III")).toBe("Calculus III");
    expect(displayCourseTitle("ORGANIC CHEMISTRY IV")).toBe("Organic Chemistry IV");
    expect(displayCourseTitle("PHYSICS VIII")).toBe("Physics VIII");
    expect(displayCourseTitle("GENERAL CHEMISTRY I-LECTURES")).toBe("General Chemistry I-Lectures");
  });

  it("does not turn ordinary words into numerals", () => {
    // "DID", "MILD" and "CIVIC" are spelled entirely from roman-numeral
    // letters. A loose /^[IVXLCDM]+$/ would upper-case all three.
    expect(displayCourseTitle("WHAT DID THEY KNOW")).toBe("What Did They Know");
    expect(displayCourseTitle("CIVIC ENGAGEMENT")).toBe("Civic Engagement");
  });

  it("keeps subject acronyms", () => {
    expect(displayCourseTitle("INTRODUCTION TO AI")).toBe("Introduction to AI");
    expect(displayCourseTitle("LLM BASED GENERATIVE AI")).toBe("LLM Based Generative AI");
    expect(displayCourseTitle("US FOREIGN POLICY")).toBe("US Foreign Policy");
    expect(displayCourseTitle("INTRO-COMPUT SCI/PROG IN JAVA")).toBe(
      "Intro-Comput Sci/Prog in Java",
    );
  });

  it("capitalises a word hiding behind an opening bracket", () => {
    expect(displayCourseTitle("2ND TERM GEN CHEM (INTENSIVE)")).toBe(
      "2nd Term Gen Chem (Intensive)",
    );
  });

  it("capitalises the clause after a colon the registrar did not space", () => {
    expect(displayCourseTitle("PHYSICS I:MECHANICS/RELATIVITY")).toBe(
      "Physics I:Mechanics/Relativity",
    );
    expect(displayCourseTitle("EARTH'S ENVIRO SYST: CLIM SYST")).toBe(
      "Earth's Enviro Syst: Clim Syst",
    );
  });
});
