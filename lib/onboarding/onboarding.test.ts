import { describe, expect, it } from "vitest";

import {
  interestTagsForPrograms,
  knownInterestTagIds,
  programsWithInterestTags,
} from "@/lib/profile/interest-tags";
import {
  BC_FOUNDATIONS,
  CC_CORE,
  CC_MAJOR_BIOLOGY,
  CC_MAJOR_COMPUTER_SCIENCE,
  CC_MAJOR_POLITICAL_SCIENCE,
  CC_MINOR_COMPUTER_SCIENCE,
  SEAS_CORE,
  SEAS_MAJOR_COMPUTER_SCIENCE,
  listPrograms,
} from "@/lib/requirements/programs";
import { toCourseId } from "@/lib/requirements/code";
import type { PrereqSource } from "@/lib/recommend";
import type { GroupResult, RequirementRule } from "@/lib/requirements/types";
import { noVectorSource } from "@/lib/recommend";

import {
  buildGuessDeck,
  expectedLevelCeiling,
  impliedPrerequisites,
  levelCeilingFor,
  namedCoursesOf,
  satisfiedOnlyCourseIds,
  unambiguousPrereqChain,
  unambiguousPrereqsOf,
  yearsCompleted,
} from "./guess";
import { sameIds, stabilizeStrip } from "./stable-strip";
import { likelyChoiceFor } from "./likely-choice";
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
  hasTranscriptCourses,
  goToStep,
  ONBOARDING_STEPS,
  NO_MINORS_PROGRAM_ID,
  nextStep,
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
  type OnboardingStepId,
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
    customMajor: null,
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
    expect(restored?.customMajor).toBeNull();
    expect(restored?.courses.length).toBe(fullyAnsweredState().courses.length);
  });

  it("reads a state stored before `customMajor` existed, without a key bump", () => {
    const stored = fullyAnsweredState() as Partial<GuestOnboardingState>;
    delete stored.customMajor;

    const restored = deserialize(JSON.stringify(stored));
    expect(restored).not.toBeNull();
    expect(restored?.customMajor).toBeNull();
    expect(restored?.programIds).toEqual(fullyAnsweredState().programIds);
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

    /*
     * Forward, accumulating an answer at each stop so the back walk has
     * something to lose if it is going to lose anything.
     *
     * Driven by the step list rather than a fixed run of `advance` calls.
     * Inserting a step used to break this on the COUNT — it stopped one short
     * and failed on `state.step`, which says nothing about whether the walk is
     * still lossless and buries the real assertions below an arithmetic edit.
     */
    const answerOn: Partial<
      Record<OnboardingStepId, (current: GuestOnboardingState) => GuestOnboardingState>
    > = {
      coursework: (current) =>
        upsertCourse(current, course({ courseId: "COMS1004W", code: "COMS W1004" })),
      love: (current) => setLiked(current, "COMS1004W", true),
      interests: (current) => ({ ...current, interestTags: ["ai-ml"] }),
    };

    while (nextStep(state.step)) {
      state = answerOn[state.step]?.(state) ?? state;
      state = advance(state);
    }

    expect(state.step).toBe(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]);
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

describe("a transcript on the first screen skips the coursework screens", () => {
  const withTranscript = (): GuestOnboardingState =>
    upsertCourse(
      { ...emptyGuestState(), school: "CC" },
      {
        courseId: "COMS3134W",
        code: "COMS W3134",
        title: "Data Structures in Java",
        termLabel: "Fall 2024",
        points: 3,
        liked: null,
        source: "transcript_pdf",
        inCatalog: true,
      },
    );

  it("advances from the degree questions straight to what you liked", () => {
    expect(hasTranscriptCourses(withTranscript())).toBe(true);
    expect(advance(withTranscript()).step).toBe("love");
  });

  it("goes back from what you liked to the degree questions", () => {
    const atLove = advance(withTranscript());
    expect(goBack(atLove).step).toBe("school");
  });

  it("still gates on the school answer", () => {
    const state = { ...withTranscript(), school: null };
    expect(advance(state).step).toBe("school");
  });

  it("does not skip when the courses came from the guess deck", () => {
    const guessed = upsertCourse(
      { ...emptyGuestState(), school: "CC" },
      {
        courseId: "COMS3134W",
        code: "COMS W3134",
        title: "Data Structures in Java",
        termLabel: null,
        points: 3,
        liked: null,
        source: "onboarding_guess",
        inCatalog: true,
      },
    );
    expect(hasTranscriptCourses(guessed)).toBe(false);
    expect(advance(guessed).step).toBe("choices");
  });
});

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

    // The standard intro route is no longer on the strip: a student with a year
    // behind them gets it pre-checked instead — see "choose-one defaults".
    expect(deck.tier1.map((candidate) => candidate.courseId)).toContain("COMS1004W");

    // The honours alternative is the intro option still in the strip, and the
    // ordering rule under test is unchanged: something they plausibly HAVE
    // taken outranks a 3000-level requirement they have not reached.
    const strip = deck.tier2.map((candidate) => candidate.courseId);
    const introAt = strip.indexOf("COMS1007W");
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

  it("does not pre-check the College Core for a SEAS student", () => {
    // Lit Hum AND CC AND Frontiers AND both Hums is a Columbia College
    // degree. Engineering takes University Writing, one humanities
    // sequence (or Global Core), and Art or Music Hum — plus Calc, Physics,
    // and The Art of Engineering. Pre-checking the College block on a SEAS
    // transcript would be a claim we would not make.
    const seasCatalog = new Map(
      [
        ["ENGL1010CC", "ENGL CC1010"],
        ["ECON1105UN", "ECON UN1105"],
        ["ENGI1102E", "ENGI E1102"],
        ["ENGI1006E", "ENGI E1006"],
        ["MATH1101UN", "MATH UN1101"],
        ["MATH1102UN", "MATH UN1102"],
        ["APMA2000E", "APMA E2000"],
        ["SCNC1000CC", "SCNC CC1000"],
        ["HUMA1001CC", "HUMA CC1001"],
        ["HUMA1002CC", "HUMA CC1002"],
        ["COCI1101CC", "COCI CC1101"],
        ["COCI1102CC", "COCI CC1102"],
        ["HUMA1121UN", "HUMA UN1121"],
        ["HUMA1123UN", "HUMA UN1123"],
        ["PHYS1401UN", "PHYS UN1401"],
      ].map(([courseId, code]) => [courseId, { code, title: code, points: 3 }]),
    );

    const deck = buildGuessDeck({
      programs: [SEAS_CORE, SEAS_MAJOR_COMPUTER_SCIENCE],
      school: "SEAS",
      classYear: "2027",
      confirmed: [],
      catalog: seasCatalog,
      prereqs: fakePrereqs({}),
      vectors: noVectorSource(),
      now: new Date("2026-09-15T00:00:00Z"),
    });

    const tier1 = new Set(deck.tier1.map((candidate) => candidate.courseId));
    // "Offered" spans all three surfaces. The Core sequence and the physics
    // sequences are choose-one requirements, so they are put as a question
    // above the strip rather than as chips in it — see "choose-one questions".
    const offered = new Set([
      ...[...deck.tier1, ...deck.tier2].map((candidate) => candidate.courseId),
      ...deck.choices.flatMap((choice) =>
        choice.routes.flatMap((route) => route.courses.map((facts) => facts.courseId)),
      ),
    ]);

    expect(tier1.has("ENGL1010CC")).toBe(true);
    expect(tier1.has("ECON1105UN")).toBe(true);
    expect(tier1.has("ENGI1102E")).toBe(true);
    expect(tier1.has("MATH1101UN")).toBe(true);

    expect(tier1.has("SCNC1000CC")).toBe(false);
    expect(offered.has("SCNC1000CC")).toBe(false);
    expect(tier1.has("HUMA1001CC")).toBe(false);
    expect(tier1.has("HUMA1002CC")).toBe(false);
    expect(tier1.has("COCI1101CC")).toBe(false);
    expect(tier1.has("COCI1102CC")).toBe(false);
    expect(tier1.has("HUMA1121UN")).toBe(false);
    expect(tier1.has("HUMA1123UN")).toBe(false);

    expect(offered.has("HUMA1001CC") || offered.has("COCI1101CC")).toBe(true);
    expect(offered.has("PHYS1401UN")).toBe(true);
  });
});

/* ==========================================================================
 * A finished requirement stops making suggestions
 * ========================================================================== */

describe("finished requirements", () => {
  const catalog = new Map<string, { code: string; title: string | null; points: number | null }>();

  /** A `GroupResult` with only the fields the suppression logic reads. */
  function group(
    label: string,
    rule: RequirementRule,
    status: "satisfied" | "partial" | "unmet",
    candidates: string[] = [],
  ) {
    return {
      group: { id: label, label, rule },
      status,
      verification: "catalog",
      matched: [],
      completed: 0,
      required: 1,
      unit: "courses",
      candidates,
    } as unknown as GroupResult;
  }

  it("stops offering the other rails of a sequence the student has finished", () => {
    /*
     * The exact shape that put straight physics on a CS junior's strip. The
     * SEAS physics requirement is one `sequence_choice` with three rails; a
     * student who finished rail one has finished the requirement, and rails
     * two and three are not courses they might also have taken.
     */
    const physics = group(
      "Physics",
      {
        kind: "sequence_choice",
        sequences: [
          { label: "Sequence 1", courses: ["PHYS UN1401", "PHYS UN1402"] },
          { label: "Sequence 3", courses: ["PHYS UN2801", "PHYS UN2802"] },
        ],
      },
      "satisfied",
    );

    const suppressed = satisfiedOnlyCourseIds([physics]);
    expect(suppressed.has("PHYS2801UN")).toBe(true);
    expect(suppressed.has("PHYS2802UN")).toBe(true);
  });

  it("keeps a course that a still-open requirement also names", () => {
    /*
     * MATH UN2015 satisfies both Linear Algebra and Probability/Statistics.
     * Finishing one of those must not hide it while the other is open —
     * "only" is the load-bearing word in the function's name, and a plain
     * "belongs to a satisfied group" test would fail this.
     */
    const linear = group(
      "Linear Algebra",
      { kind: "n_of", n: 1, courses: ["MATH UN2010", "MATH UN2015"] },
      "satisfied",
    );
    const probability = group(
      "Probability / Statistics",
      { kind: "n_of", n: 1, courses: ["MATH UN2015", "STAT UN1201"] },
      "unmet",
    );

    const suppressed = satisfiedOnlyCourseIds([linear, probability]);
    expect(suppressed.has("MATH2015UN")).toBe(false);
    // The option only the finished group named is still suppressed.
    expect(suppressed.has("MATH2010UN")).toBe(true);
  });

  it("keeps a course an open-ended group expanded onto", () => {
    // `n_matching` names nothing, so its reach arrives as `candidates`. A
    // course a satisfied group named and an open elective group can still
    // count belongs on the strip.
    const finished = group(
      "Chemistry or Biology",
      { kind: "n_of", n: 1, courses: ["CHEM UN1403", "EEEB UN2005"] },
      "satisfied",
    );
    const electives = group(
      "Science electives",
      { kind: "n_matching", n: 2, match: {} } as unknown as RequirementRule,
      "unmet",
      ["EEEB2005UN"],
    );

    expect(satisfiedOnlyCourseIds([finished, electives]).has("EEEB2005UN")).toBe(false);
  });

  it("drops the dead option from the deck, and only from the guessing passes", () => {
    const physics = group(
      "Physics",
      {
        kind: "sequence_choice",
        sequences: [
          { label: "Sequence 1", courses: ["PHYS UN1401", "PHYS UN1402"] },
          { label: "Sequence 3", courses: ["PHYS UN2801", "PHYS UN2802"] },
        ],
      },
      "satisfied",
    );

    const base = {
      programs: [SEAS_MAJOR_COMPUTER_SCIENCE],
      school: "SEAS" as const,
      classYear: "2027",
      confirmed: [
        course({ courseId: "PHYS1401UN", code: "PHYS UN1401" }),
        course({ courseId: "PHYS1402UN", code: "PHYS UN1402" }),
      ],
      catalog,
      prereqs: fakePrereqs({}),
      vectors: noVectorSource(),
      outstanding: [],
      now: new Date("2026-09-15T00:00:00Z"),
    };

    const before = buildGuessDeck(base);
    const after = buildGuessDeck({
      ...base,
      satisfiedOnly: satisfiedOnlyCourseIds([physics]),
    });

    const idsOf = (deck: ReturnType<typeof buildGuessDeck>) =>
      [...deck.tier1, ...deck.tier2].map((candidate) => candidate.courseId);

    expect(idsOf(before)).toContain("PHYS2801UN");
    expect(idsOf(after)).not.toContain("PHYS2801UN");

    // Nothing else moved: the suppression is scoped to the two passes that
    // read requirement tables blind, not a blanket filter over the deck.
    expect(idsOf(after).length).toBeLessThan(idsOf(before).length);
    expect(idsOf(after)).toContain("COMS3261W");
  });
});

/* ==========================================================================
 * Seniority, and the students who outrun it
 * ========================================================================== */

describe("level ceiling", () => {
  it("falls back to the year-based prior when there is nothing to go on", () => {
    expect(levelCeilingFor(2, [])).toBe(expectedLevelCeiling(2));
    expect(levelCeilingFor(null, [])).toBe(1000);
  });

  it("lets a sophomore who has taken a 4000-level course say so", () => {
    /*
     * The prior gives a second-year 3000, which is right for a student whose
     * program paces that way and wrong for engineering, where 4000-level
     * major requirements are normal in year two. Rather than a per-program
     * table of expected paces, the record overrides the estimate.
     */
    expect(expectedLevelCeiling(2)).toBe(3000);
    expect(levelCeilingFor(2, ["COMS4111W"])).toBe(4000);
  });

  it("never lets the record lower the ceiling", () => {
    // A senior who has only confirmed Intro is still a senior. Evidence
    // raises the estimate; its absence does not lower it.
    expect(levelCeilingFor(3, ["COMS1004W"])).toBe(4000);
  });

  it("ignores ids it cannot read a level out of", () => {
    expect(levelCeilingFor(1, ["not-a-course-id"])).toBe(2000);
  });
});

describe("typical schedules", () => {
  it("uses GS-qualified Core courses for a General Studies student", () => {
    const gs = typicalGuesses({
      school: "GS",
      yearsCompleted: 1,
      ceiling: 2000,
      programs: [],
    }).map((guess) => guess.courseId);

    expect(gs).toContain("ENGL1010GS");
    expect(gs).toContain("HUMA1001GS");
    expect(gs).toContain("HUMA1002GS");
    expect(gs).toContain("COCI1101GS");
    expect(gs).not.toContain("ENGL1010CC");
    expect(gs).not.toContain("HUMA1001CC");
  });

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

    // Barnard has no hand-written band, so with no programs resolved there
    // is nothing school-shaped to offer.
    expect(
      typicalGuesses({
        school: "BC",
        yearsCompleted: 2,
        ceiling: 3000,
        programs: [],
      }),
    ).toEqual([]);
  });

  it("offers a Barnard first-year the Foundations courses that are choices", () => {
    // The empty BC band is not "Barnard gets nothing". Foundations encodes
    // First-Year Writing and First-Year Seminar as `n_of`, so they arrive
    // through the program loop with the requirement's own label — which is
    // why writing a BC band would duplicate the registry. Guard the real
    // flow, where the Core IS resolved, not just the bare-school case above.
    const barnard = typicalGuesses({
      school: "BC",
      yearsCompleted: 0,
      ceiling: 2000,
      programs: [BC_FOUNDATIONS],
    });
    const ids = barnard.map((guess) => guess.courseId);

    expect(ids).toContain("FYWB1001BC");
    expect(ids).toContain("FYWB1002BC");
    expect(ids).toContain("FYSB1001BC");
    expect(ids).toContain("FYSB1002BC");
    expect(barnard.map((guess) => guess.label)).toContain("First-Year Writing");
    // Columbia's Core must never land on a Barnard strip.
    expect(ids).not.toContain("HUMA1001CC");
    expect(ids).not.toContain("COCI1101CC");
  });

  it("does not treat the College Core as an engineering first year", () => {
    const seas = typicalGuesses({
      school: "SEAS",
      yearsCompleted: 1,
      ceiling: 2000,
      programs: [SEAS_CORE],
    }).map((guess) => guess.courseId);

    expect(seas).toContain("MATH1101UN");
    expect(seas).toContain("ENGI1102E");
    expect(seas).toContain("ENGL1010CC");
    // Frontiers is Columbia College Science A. SEAS does not take it.
    expect(seas).not.toContain("SCNC1000CC");
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
      "bc-major-biology",
      "bc-major-computer-science",
      "bc-major-economics",
      "bc-major-english",
      "bc-major-history",
      "bc-major-neuroscience-and-behavior",
      "bc-major-political-economy",
      "bc-major-political-science",
      "bc-major-psychology",
      "bc-major-sociology",
      "bc-major-urban-studies",
    ]) {
      const tags = interestTagsForPrograms([programId]);
      expect(tags.length, `${programId} has no interest tags`).toBeGreaterThanOrEqual(8);
      expect(tags.length, `${programId} has too many to fit one screen`).toBeLessThanOrEqual(12);
    }
  });

  it("offers a list for every authored Barnard major", () => {
    /*
     * Derived from the registry rather than listed, so adding a Barnard major
     * without tags fails here instead of silently skipping the interest step
     * for those students. The explicit list above is the screen-size guard;
     * this one is the coverage guard.
     */
    const missing = listPrograms()
      .filter((program) => program.school === "BC" && program.kind === "major")
      .map((program) => program.id)
      .filter((id) => interestTagsForPrograms([id]).length === 0);

    expect(missing).toEqual([]);
  });

  it("gives Barnard its own tags rather than the College's course codes", () => {
    /*
     * The failure this catches is a lazy alias: pointing a Barnard major at the
     * College's list. It typechecks and renders, and every exemplar then seeds
     * from a course in a department the student is not in.
     *
     * Barnard History is the sharpest case. The College's list carries
     * `east-asia` and `middle-east`; Barnard's department staffs neither, so
     * their presence would mean two of ten options are dead.
     */
    const bcHistory = interestTagsForPrograms(["bc-major-history"]).map((tag) => tag.id);
    expect(bcHistory).not.toContain("east-asia");
    expect(bcHistory).not.toContain("middle-east");

    // Psychology's animal-cognition group is Barnard's and has no College twin.
    expect(interestTagsForPrograms(["bc-major-psychology"]).map((t) => t.id)).toContain(
      "animal-cognition",
    );

    // Economics: no industrial-organisation course exists at Barnard.
    expect(interestTagsForPrograms(["bc-major-economics"]).map((t) => t.id)).not.toContain(
      "industrial-organization",
    );
  });

  it("keeps one label per tag id, across every program that reuses it", () => {
    /*
     * The id is what `student_profiles.interest_tags` stores; the label is only
     * how it is drawn. Two labels behind one id means the stored string no
     * longer says what the student saw when she picked it, and
     * `interestTagsForPrograms` — which de-duplicates by id and keeps the
     * first — would quietly pick one of them for a student in two programs.
     *
     * This caught four real cases when the Barnard lists landed: `security`,
     * `international-econ`, `behavioral-econ` and `physiology` had each been
     * given a slightly wider Barnard label. The fix is to widen the blurb.
     */
    const labels = new Map<string, Set<string>>();
    for (const programId of programsWithInterestTags()) {
      for (const tag of interestTagsForPrograms([programId])) {
        const seen = labels.get(tag.id) ?? new Set<string>();
        seen.add(tag.label);
        labels.set(tag.id, seen);
      }
    }

    const conflicting = [...labels]
      .filter(([, seen]) => seen.size > 1)
      .map(([id, seen]) => `${id}: ${[...seen].join(" / ")}`);

    expect(conflicting).toEqual([]);
  });

  it("writes every exemplar as a parseable Bulletin code", () => {
    /*
     * `toCourseId` is the bridge every requirement definition crosses, and an
     * exemplar that does not cross it seeds an empty vector — a tag that looks
     * fine on screen and recommends nothing, forever.
     *
     * This is the offline half of the check. It cannot tell an unparseable code
     * from one that parses but names no real course; for that,
     * `scripts/verify-interest-tag-exemplars.ts` hits the live catalog, and it
     * currently reports 33 dead exemplars in the CC and SEAS lists that predate
     * the Barnard work (PSYC UN1010 and BMEN E4010 among them).
     */
    for (const programId of programsWithInterestTags()) {
      for (const tag of interestTagsForPrograms([programId])) {
        expect(tag.exemplars.length, `${tag.id} has no exemplars`).toBeGreaterThan(0);
        for (const code of tag.exemplars) {
          expect(toCourseId(code), `${programId}/${tag.id}: unparseable "${code}"`).toBeTruthy();
        }
      }
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

describe("choose-one defaults", () => {
  // A 2026 graduate, in August 2026: four years behind them, ceiling 4000.
  const NOW = new Date("2026-08-26T12:00:00Z");

  /*
   * The CS spine as the Bulletin gates it. Every link but the last is a choice
   * of two, which is the whole reason this mechanism exists: without a default
   * nothing in the chain is ever confirmed, so the prerequisite filter withholds
   * the two courses at the end that the major flatly requires.
   */
  const CS_CHAIN = {
    COMS3134W: [["COMS1004W", "COMS1007W"]],
    COMS3137W: [["COMS1004W", "COMS1007W"]],
    COMS3157W: [["COMS3134W", "COMS3137W"]],
    COMS3261W: [["COMS3134W", "COMS3137W"]],
  };

  function deck(overrides: Partial<Parameters<typeof buildGuessDeck>[0]> = {}) {
    return buildGuessDeck({
      programs: [CC_MAJOR_COMPUTER_SCIENCE],
      classYear: "2026",
      confirmed: [],
      catalog: new Map(),
      prereqs: fakePrereqs(CS_CHAIN),
      vectors: noVectorSource(),
      now: NOW,
      ...overrides,
    });
  }

  const idsIn = (candidates: { courseId: string }[]) => candidates.map((c) => c.courseId);

  it("names a default only for an option set on the allowlist", () => {
    expect(likelyChoiceFor(["COMS1004W", "COMS1007W"])).toEqual({
      courseId: "COMS1004W",
      alternatives: ["COMS1007W"],
    });
    // Order is not part of the key — the same pair spelled the other way round
    // is the same requirement.
    expect(likelyChoiceFor(["COMS1007W", "COMS1004W"])?.courseId).toBe("COMS1004W");

    // Linear Algebra offers six routes and no one of them dominates, so it is
    // not on the table and gets no default.
    expect(likelyChoiceFor(["MATH2010UN", "MATH2015UN", "MATH2020UN"])).toBeNull();
    expect(likelyChoiceFor([])).toBeNull();
  });

  it("pre-checks the standard route through a choose-one requirement", () => {
    const tier1 = idsIn(deck().tier1);

    expect(tier1).toContain("COMS1004W");
    expect(tier1).toContain("COMS3134W");
    // The honours alternatives are still offered, just not claimed on the
    // student's behalf.
    expect(tier1).not.toContain("COMS1007W");
    expect(idsIn(deck().tier2)).toContain("COMS1007W");
  });

  it("unblocks the required courses that were gated on the ambiguous one", () => {
    // The regression this exists for: COMS W3157 and COMS W3261 are `all_of`
    // requirements of the major, and both used to fall out of tier 1 because
    // the engine withheld anything gated on a Data Structures nobody had
    // confirmed. One coin flip in the middle blanked out the whole chain.
    const tier1 = idsIn(deck().tier1);

    expect(tier1).toContain("COMS3157W");
    expect(tier1).toContain("COMS3261W");
  });

  it("leaves first-years alone, who have not had time to finish either option", () => {
    // Defaulting compounds two guesses — that they finished the requirement at
    // all, and which way. The level ceiling stops the second half of the chain
    // on its own; this is what stops the 1000-level half.
    const tier1 = idsIn(deck({ classYear: "2030" }).tier1);

    expect(tier1).not.toContain("COMS1004W");
    expect(tier1).not.toContain("COMS3134W");
  });

  it("does not default a group the student has already answered themselves", () => {
    // They ticked the honours course. Adding the standard one too would put two
    // courses on the record for a requirement that takes one — and the invented
    // one is the likelier of the two to be wrong.
    const tier1 = idsIn(
      deck({ confirmed: [course({ courseId: "COMS3137W", code: "COMS W3137" })] }).tier1,
    );

    expect(tier1).not.toContain("COMS3134W");
    // The rest of the chain still resolves: their own confirmation clears the
    // same gate the default would have.
    expect(tier1).toContain("COMS3157W");
  });

  it("does not bring a removed default back, or swap it for the alternative", () => {
    // Being corrected once is a correction. Coming back with the other option
    // would be an argument.
    const dismissed = deck({ dismissed: ["COMS1004W"] });

    expect(idsIn(dismissed.tier1)).not.toContain("COMS1004W");
    expect(idsIn(dismissed.tier1)).not.toContain("COMS1007W");
  });

  it("keeps defaults out of the implication map, which states facts", () => {
    // `impliesTaken` drives "confirming this means you also took that". It is
    // read off the raw prerequisite graph, so an assumption we made cannot
    // launder itself into something the student is told they took.
    const built = deck();

    expect(built.impliesTaken["COMS3157W"] ?? []).toEqual([]);
  });
});

describe("choose-one questions", () => {
  const NOW = new Date("2026-08-26T12:00:00Z");
  const PROGRAMS = [SEAS_CORE, SEAS_MAJOR_COMPUTER_SCIENCE];

  function deck(overrides: Partial<Parameters<typeof buildGuessDeck>[0]> = {}) {
    return buildGuessDeck({
      programs: PROGRAMS,
      school: "SEAS",
      classYear: "2026",
      confirmed: [],
      catalog: new Map(),
      prereqs: fakePrereqs({}),
      vectors: noVectorSource(),
      now: NOW,
      ...overrides,
    });
  }

  const labels = (built: { choices: { label: string }[] }) =>
    built.choices.map((choice) => choice.label);

  it("asks about a requirement it knows was satisfied exactly one way", () => {
    expect(labels(deck())).toContain("Physics");
    expect(labels(deck())).toContain("Linear Algebra");
    expect(labels(deck())).toContain("Chemistry or Biology");
  });

  it("carries every course in a sequence route, not just the first term", () => {
    // "I took Lit Hum" is a claim about two semesters. A route that named only
    // HUMA CC1001 would silently drop the second half of the requirement.
    const core = deck().choices.find((choice) => choice.label === "Core sequence");
    const litHum = core?.routes.find((route) => route.label === "Literature Humanities");

    expect(litHum?.courses.map((facts) => facts.courseId)).toEqual(["HUMA1001CC", "HUMA1002CC"]);
  });

  it("does not ask what it already defaulted", () => {
    // `likely-choice.ts` puts COMS W1004 and COMS W3134 in tier 1. Asking as
    // well would put the same question on the screen twice, once answered.
    expect(labels(deck())).not.toContain("Introductory Programming");
    expect(labels(deck())).not.toContain("Data Structures");
  });

  it("does not ask about a menu the student worked through rather than forked at", () => {
    // Area Foundation is four courses chosen from twenty-one. The student did
    // not take one of them, and we could not guess which four regardless.
    expect(labels(deck())).not.toContain("Area Foundation Courses");
  });

  it("declines to render a picker that would be worse than the search box", () => {
    // CC Political Science offers seventeen routes through Research Methods.
    const built = deck({ programs: [CC_MAJOR_POLITICAL_SCIENCE], school: "CC" });

    expect(labels(built)).not.toContain("Research Methods");
  });

  it("counts that cap in courses, because courses are what get drawn", () => {
    // CC Biology's Chemistry group is only four routes — under the route cap —
    // but fifteen distinct courses, and the screen draws one chip per course.
    // As routes it was four buttons; as courses it is a wall of call numbers
    // above a question meant to be answered at a glance.
    const built = deck({ programs: [CC_MAJOR_BIOLOGY], school: "CC" });

    expect(labels(built)).not.toContain("Chemistry");
  });

  it("still asks the groups that stayed a reasonable size", () => {
    // The guard against the cap being set so low it empties the screen: the
    // Physics group is six courses across three sequences and has to survive.
    const physics = deck().choices.find((choice) => choice.label === "Physics");

    expect(physics).toBeDefined();
    expect(
      new Set(physics?.routes.flatMap((route) => route.courses.map((f) => f.courseId))).size,
    ).toBe(6);
  });

  it("asks nothing of a first-year", () => {
    expect(deck({ classYear: "2030" }).choices).toEqual([]);
  });

  it("stops asking once the student answers, and once they decline", () => {
    const answered = deck({
      confirmed: [course({ courseId: "PHYS1401UN", code: "PHYS UN1401" })],
    });
    expect(labels(answered)).not.toContain("Physics");

    // "None yet" dismisses every route, which is what has to be true before the
    // question stops being asked — one dismissed sequence is not an answer.
    const partly = deck({ dismissed: ["PHYS1401UN", "PHYS1601UN"] });
    expect(labels(partly)).toContain("Physics");

    const declined = deck({
      dismissed: ["PHYS1401UN", "PHYS1402UN", "PHYS1601UN", "PHYS1602UN", "PHYS2801UN", "PHYS2802UN"],
    });
    expect(labels(declined)).not.toContain("Physics");
  });

  it("takes the courses it asks about out of the suggestion strip", () => {
    // The strip has eight slots. Leaving the options in would spend four of
    // them on the Core sequence alone, which is the whole reason these moved.
    const built = deck();
    const asked = new Set(
      built.choices.flatMap((choice) =>
        choice.routes.flatMap((route) => route.courses.map((facts) => facts.courseId)),
      ),
    );
    const strip = built.tier2.map((candidate) => candidate.courseId);

    expect(asked.size).toBeGreaterThan(0);
    expect(strip.filter((courseId) => asked.has(courseId))).toEqual([]);
  });

  it("asks a requirement two declared programs both name only once", () => {
    // The CS major and the CS minor spell Intro identically. Keyed on the
    // routes, so it is one question however many programs mention it.
    const built = deck({
      programs: [CC_MAJOR_COMPUTER_SCIENCE, CC_MINOR_COMPUTER_SCIENCE],
      school: "CC",
    });
    const linearAlgebra = labels(built).filter((label) => label === "Linear Algebra");

    expect(linearAlgebra.length).toBeLessThanOrEqual(1);
  });
});
