/**
 * Changing a degree answer mid-flow must rebuild the guess deck.
 *
 * ── Why this is a separate suite from `onboarding.test.ts` ──────────────────
 *
 * That file already pins `reconcileDegreeChange` as a pure function: given a
 * before and an after, which rows survive. Every one of those assertions passed
 * while the reported bug was live, because the bug is not in the reducer. It is
 * in the JOIN — reducer output feeds `guessDeckCacheKey`, which decides whether
 * a cached deck is reused, which decides what `buildGuessDeck` is asked for,
 * which decides what the student sees pre-checked.
 *
 * So this suite walks the whole path the student walks: answer the degree
 * questions, take the deck, let tier 1 land on the record the way the coursework
 * screen does, step back, change one answer, come forward, and rebuild. Then it
 * asserts the deck actually MOVED.
 *
 * ── The assertion that is easy to get wrong ─────────────────────────────────
 *
 * `programsFor` always prepends the school's Core, because a Columbia College
 * student cannot elect out of it. Tier 1 is "required by a declared program at
 * or below your level ceiling", and the Core is the largest block of required
 * low-level courses any student has. So on a same-school major switch, most of
 * tier 1 legitimately does not move — those chips are Core courses that are
 * still required, and removing them would be the actual bug.
 *
 * Asserting "tier 1 changed" on a major switch would therefore fail for a
 * correct reason and send the next reader hunting a bug that is not there. The
 * major row of the matrix asserts on the NON-Core portion instead, which is
 * exactly the part a major switch owns.
 */

import { describe, expect, it } from "vitest";

import { programsFor } from "@/lib/profile/audit";
import { EMPTY_PROFILE } from "@/lib/profile/types";
import { noVectorSource, type PrereqSource } from "@/lib/recommend";
import { CC_CORE, SEAS_CORE } from "@/lib/requirements/programs";
import type { Program } from "@/lib/requirements/types";

import { buildGuessDeck, namedCoursesOf, type GuessCandidate, type GuessDeck } from "./guess";
import { guessDeckCacheKey } from "./guess-cache";
import {
  declaredProgramIds,
  degreeSignature,
  emptyGuestState,
  reconcileDegreeChange,
  upsertCourse,
  type GuestCourse,
  type GuestOnboardingState,
} from "./state";

/* ==========================================================================
 * The walk
 * ========================================================================== */

/**
 * Fixed so `yearsCompleted` is deterministic. September, so the academic year
 * has already turned over — a 2028 graduate is two years in, a 2026 graduate
 * has already left.
 */
const NOW = new Date("2026-09-15T00:00:00Z");

/**
 * No prerequisite edges at all.
 *
 * Deliberate: `implied_by` bypasses the level ceiling and the withheld check
 * (`guess.ts`, THE tier-1 rule), so a prereq graph would let courses into tier 1
 * for a reason that has nothing to do with the degree answer under test. The
 * matrix is about what the DEGREE contributes, so the graph is empty and the
 * implication path is pinned separately in `onboarding.test.ts`.
 */
const NO_PREREQS: PrereqSource = {
  statusFor: () => ({ status: "met", outstanding: [], advisories: [] }),
  newlyUnlockedBy: () => [],
};

/**
 * The programs the server would audit this guest against.
 *
 * Mirrors `toAuditProfile` + `programsFor` in `lib/onboarding/server.ts`, which
 * cannot be imported here — that module pulls in the database client and the
 * filesystem vector loader. The two fields `programsFor` actually reads are
 * school and declared program ids, so the mirror is exact rather than
 * approximate.
 */
function programsForState(state: GuestOnboardingState): Program[] {
  return programsFor({
    ...EMPTY_PROFILE,
    userId: "",
    school: state.school,
    programIds: declaredProgramIds(state.programIds),
    classYear: state.classYear,
  });
}

/** Rank the deck the way `loadGuessDeck` would, minus the catalog round trip. */
function deckFor(state: GuestOnboardingState): GuessDeck {
  return buildGuessDeck({
    programs: programsForState(state),
    school: state.school,
    classYear: state.classYear,
    confirmed: state.courses,
    dismissed: state.dismissedCourseIds,
    // Empty on purpose. `buildGuessDeck` falls back to `formatCourseId` for a
    // course with no catalog row, and every assertion here is on course ids.
    catalog: new Map(),
    prereqs: NO_PREREQS,
    vectors: noVectorSource(),
    now: NOW,
  });
}

/**
 * What the coursework screen does when a deck lands: tier 1 goes straight onto
 * the record as `onboarding_guess`, minus anything already confirmed or
 * refused. Mirrors `applyDeck` in `components/onboarding/step-coursework.tsx`.
 */
function applyTier1(state: GuestOnboardingState, deck: GuessDeck): GuestOnboardingState {
  const confirmed = new Set(state.courses.map((row) => row.courseId));
  const dismissed = new Set(state.dismissedCourseIds);

  return deck.tier1
    .filter((candidate) => !confirmed.has(candidate.courseId) && !dismissed.has(candidate.courseId))
    .reduce(
      (next, candidate) =>
        upsertCourse(next, {
          courseId: candidate.courseId,
          code: candidate.code,
          title: candidate.title,
          termLabel: null,
          points: candidate.points,
          liked: null,
          source: "onboarding_guess",
          inCatalog: true,
        }),
      state,
    );
}

/**
 * One arrival at the coursework screen: the deck that landed, and the record
 * after its tier 1 was written on.
 *
 * Both halves are needed, and re-deriving the deck from the returned state does
 * NOT give the first half back: `note()` skips anything already confirmed, so
 * ranking a state whose tier 1 is already on the record returns an empty tier 1.
 * That is correct behaviour — the screen has nothing left to pre-check — and it
 * is exactly the trap that makes "compare the deck before and after" read as a
 * total wipe if the deck is re-derived rather than remembered.
 */
interface Arrival {
  state: GuestOnboardingState;
  deck: GuessDeck;
}

/**
 * Answer the degree questions, reach coursework, and let tier 1 land.
 *
 * The returned state is what a student is holding when they press the back
 * arrow — which is the only interesting starting point for this suite.
 */
function walkToCoursework(degree: Partial<GuestOnboardingState>): Arrival {
  const answered: GuestOnboardingState = {
    ...emptyGuestState(),
    step: "coursework",
    furthestStep: "coursework",
    ...degree,
  };
  const deck = deckFor(answered);
  return { state: applyTier1(answered, deck), deck };
}

/**
 * Step back, change one degree answer, and come forward again.
 *
 * `reconcileDegreeChange` is the same funnel `updateDegree` uses in the flow, so
 * a change made here retires exactly what a change made in the UI would.
 */
function changeDegree(
  before: GuestOnboardingState,
  fields: Partial<GuestOnboardingState>,
): Arrival {
  const reconciled = reconcileDegreeChange(before, { ...before, ...fields });
  const deck = deckFor(reconciled);
  return { state: applyTier1(reconciled, deck), deck };
}

/* ==========================================================================
 * Readers
 * ========================================================================== */

const idsOf = (candidates: readonly GuessCandidate[]) =>
  candidates.map((candidate) => candidate.courseId).sort();

/**
 * Tier-1 ids a given program is responsible for.
 *
 * `reasons` already carries the program name on every `required_by` chip, which
 * is what lets the major row of the matrix ignore the Core without hard-coding
 * a list of Core course codes that would rot the first time the Core is edited.
 */
function requiredBy(deck: GuessDeck, programName: string): string[] {
  return deck.tier1
    .filter((candidate) =>
      candidate.reasons.some(
        (reason) => reason.kind === "required_by" && reason.programName === programName,
      ),
    )
    .map((candidate) => candidate.courseId)
    .sort();
}

/** The school's Core, by the name its `required_by` chips carry. */
function coreNameOf(state: GuestOnboardingState): string {
  const core = programsForState(state).find((program) => program.kind === "core");
  if (!core) throw new Error("no Core for this school — the fixture is wrong");
  return core.name;
}

/** Every tier-1 id NOT attributable to the school's Core. */
function tier1BeyondCore(state: GuestOnboardingState, deck: GuessDeck): string[] {
  const core = programsForState(state).find((program) => program.kind === "core");
  if (!core) return idsOf(deck.tier1);
  const coreIds = new Set(requiredBy(deck, core.name));
  return idsOf(deck.tier1).filter((courseId) => !coreIds.has(courseId));
}

const CC_CS: Partial<GuestOnboardingState> = {
  school: "CC",
  classYear: "2028",
  programIds: ["cc-major-computer-science"],
};

/* ==========================================================================
 * The matrix
 * ========================================================================== */

describe("a degree change recalibrates the guess deck", () => {
  it("swaps the Core when the school changes", () => {
    // The strongest signal in the matrix, and the one that decides whether this
    // is a state bug at all: CC and SEAS Cores name disjoint courses, so if
    // tier 1 does not move here, nothing downstream is worth debugging.
    const before = walkToCoursework(CC_CS);

    const after = changeDegree(before.state, {
      school: "SEAS",
      // A College major is not an answer for SEAS. The school question clears
      // both, so the walk clears both.
      programIds: [],
      customMajor: null,
    });

    expect(idsOf(before.deck.tier1).length).toBeGreaterThan(0);
    expect(idsOf(after.deck.tier1)).not.toEqual(idsOf(before.deck.tier1));
  });

  it("carries no College-only Core course onto a SEAS record", () => {
    // Not merely "different": a College Core course on an engineering student's
    // pre-checked list is a wrong transcript, and pinning inequality alone
    // would pass on a deck that kept every old chip and added one.
    //
    // "College-only" rather than "College", because the two Cores genuinely
    // overlap — University Writing (ENGL CC1010) is required by both, and
    // asserting it away would demand a wrong deck for the SEAS student.
    const seasCore = namedCoursesOf(SEAS_CORE);
    const collegeOnly = [...namedCoursesOf(CC_CORE).keys()].filter((id) => !seasCore.has(id));
    expect(collegeOnly.length).toBeGreaterThan(0);

    const before = walkToCoursework(CC_CS);
    const beforeIds = new Set(before.state.courses.map((row) => row.courseId));
    // The fixture is only meaningful if the College student actually held some
    // of them to begin with.
    expect(collegeOnly.some((id) => beforeIds.has(id))).toBe(true);

    const after = changeDegree(before.state, {
      school: "SEAS",
      programIds: [],
      customMajor: null,
    });

    for (const courseId of after.state.courses.map((row) => row.courseId)) {
      expect(collegeOnly).not.toContain(courseId);
    }
  });

  it("raises the pre-checked set when the class year moves earlier", () => {
    // Class year sets the level ceiling, and the ceiling is the only thing
    // standing between a 3000-level requirement and a tick next to it.
    //
    // 2029 → 2028 lifts the ceiling from 2000 to 3000, which is where it
    // actually binds for this degree. 2028 → 2027 lifts it 3000 → 4000 and
    // changes NOTHING, because every 4000-level course CC Computer Science
    // names is an `n_of` elective rather than an outright requirement, and only
    // required courses reach tier 1. That is correct behaviour, not a missed
    // recalibration — picking that pair here would pin the wrong claim.
    const before = walkToCoursework({ ...CC_CS, classYear: "2029" });

    const after = changeDegree(before.state, { classYear: "2028" });

    expect(idsOf(after.deck.tier1)).not.toEqual(idsOf(before.deck.tier1));
    expect(after.deck.tier1.length).toBeGreaterThan(before.deck.tier1.length);
  });

  it("lowers the pre-checked set when the class year moves later", () => {
    // A first-year: ceiling 1000, so nothing above the intro band survives.
    // Compared as arrivals from scratch rather than as a step-back, because a
    // narrower ceiling cannot un-tick what the wider one already wrote — the
    // retirement is `reconcileDegreeChange`'s job and is asserted below.
    const senior = walkToCoursework(CC_CS);
    const firstYear = walkToCoursework({ ...CC_CS, classYear: "2030" });

    expect(firstYear.deck.tier1.length).toBeLessThan(senior.deck.tier1.length);
  });

  it("retires the old year's pre-checked courses before rebuilding", () => {
    const before = walkToCoursework(CC_CS);
    expect(before.state.courses.length).toBeGreaterThan(0);

    const after = changeDegree(before.state, { classYear: "2030" });

    // Every surviving row must come from the NEW deck, not the old record.
    const rebuilt = new Set(idsOf(after.deck.tier1));
    for (const row of after.state.courses) expect(rebuilt.has(row.courseId)).toBe(true);
    expect(after.state.courses.length).toBeLessThan(before.state.courses.length);
  });

  it("swaps the major's own requirements while leaving the Core standing", () => {
    const before = walkToCoursework(CC_CS);
    const coreName = coreNameOf(before.state);
    const beforeCore = requiredBy(before.deck, coreName);

    const after = changeDegree(before.state, { programIds: ["cc-major-economics"] });

    // The part a major switch owns must move...
    expect(tier1BeyondCore(before.state, before.deck).length).toBeGreaterThan(0);
    expect(tier1BeyondCore(after.state, after.deck)).not.toEqual(
      tier1BeyondCore(before.state, before.deck),
    );
    // ...and no Computer Science requirement may survive it.
    expect(requiredBy(after.deck, "Computer Science")).toEqual([]);
    // ...while the part it does not own must NOT move. A student cannot elect
    // out of the Core, so retiring Core chips here would be the opposite bug.
    expect(requiredBy(after.deck, coreName)).toEqual(beforeCore);
  });

  it("adds the minor's requirements when a minor is declared", () => {
    const before = walkToCoursework({ ...CC_CS, programIds: ["cc-major-economics"] });

    const after = changeDegree(before.state, {
      programIds: ["cc-major-economics", "cc-minor-computer-science"],
    });

    expect(idsOf(after.deck.tier1)).not.toEqual(idsOf(before.deck.tier1));
  });

  it("retires the minor's requirements when the minor is dropped", () => {
    const before = walkToCoursework({
      ...CC_CS,
      programIds: ["cc-major-economics", "cc-minor-computer-science"],
    });
    const minorIds = requiredBy(before.deck, "Computer Science");

    const after = changeDegree(before.state, { programIds: ["cc-major-economics"] });

    expect(requiredBy(after.deck, "Computer Science")).toEqual([]);
    // And the ids themselves are gone from the record, not merely re-attributed.
    for (const courseId of minorIds) {
      expect(after.state.courses.map((row) => row.courseId)).not.toContain(courseId);
    }
  });
});

/* ==========================================================================
 * The same walk, with courses the student put there themselves
 * ========================================================================== */

describe("recalibration keeps what the student asserted", () => {
  const searched = (courseId: string): GuestCourse => ({
    courseId,
    code: courseId,
    title: null,
    termLabel: null,
    points: null,
    liked: null,
    source: "picker",
    inCatalog: true,
  });

  it("keeps a searched course through every degree change in the matrix", () => {
    let state = upsertCourse(walkToCoursework(CC_CS).state, searched("PHYS1601UN"));

    for (const change of [
      { classYear: "2027" },
      { programIds: ["cc-major-economics"] },
      { school: "SEAS" as const, programIds: [], customMajor: null },
    ]) {
      state = changeDegree(state, change).state;
      expect(state.courses.map((row) => row.courseId)).toContain("PHYS1601UN");
    }
  });

  it("does not re-tick a course the student refused, after the degree changes", () => {
    // "I did not take this" is a fact about the student, not about their major.
    const before = walkToCoursework(CC_CS).state;
    const refused = before.courses[0].courseId;
    const withRefusal: GuestOnboardingState = {
      ...before,
      courses: before.courses.filter((row) => row.courseId !== refused),
      dismissedCourseIds: [refused],
    };

    const after = changeDegree(withRefusal, { classYear: "2027" });

    expect(idsOf(after.deck.tier1)).not.toContain(refused);
    expect(after.state.courses.map((row) => row.courseId)).not.toContain(refused);
  });
});

/* ==========================================================================
 * The cache key is the other half of the join
 * ========================================================================== */

describe("the deck cache cannot serve a deck built for a different degree", () => {
  it("keys apart every degree answer the deck is built from", () => {
    const base = walkToCoursework(CC_CS).state;

    for (const change of [
      { school: "SEAS" as const },
      { classYear: "2027" },
      { programIds: ["cc-major-economics"] },
    ]) {
      expect(guessDeckCacheKey({ ...base, ...change })).not.toBe(guessDeckCacheKey(base));
    }
  });

  it("does not key apart answers that name the same degree", () => {
    // Re-picking the same school, or listing the same two programs in the other
    // order, must not cost a student a round trip and a re-ranked screen.
    const base = walkToCoursework({
      ...CC_CS,
      programIds: ["cc-major-economics", "cc-minor-computer-science"],
    }).state;

    expect(
      guessDeckCacheKey({
        ...base,
        programIds: ["cc-minor-computer-science", "cc-major-economics"],
      }),
    ).toBe(guessDeckCacheKey(base));
  });
});

/* ==========================================================================
 * The chip the student pressed themselves
 * ========================================================================== */

describe("a suggestion the student pressed is not a suggestion we made", () => {
  /** What the strip writes when a chip is tapped, post-0036. */
  const tapped = (courseId: string): GuestCourse => ({
    courseId,
    code: courseId,
    title: null,
    termLabel: null,
    points: null,
    liked: null,
    source: "onboarding_confirm",
    inCatalog: true,
  });

  it("survives a change of major, unlike the chips we pre-checked", () => {
    // The bug from the other side. Both rows came off the same screen; only one
    // of them is a claim we are entitled to withdraw.
    const before = walkToCoursework(CC_CS);
    expect(before.state.courses.length).toBeGreaterThan(0);
    const preChecked = before.state.courses.map((row) => row.courseId);

    const withTap = upsertCourse(before.state, tapped("PHYS1601UN"));
    const after = changeDegree(withTap, { programIds: ["cc-major-economics"] });
    const kept = after.state.courses;

    expect(kept.map((row) => row.courseId)).toContain("PHYS1601UN");
    expect(kept.find((row) => row.courseId === "PHYS1601UN")?.source).toBe("onboarding_confirm");

    // And the pre-checked rows we wrote are gone — anything still standing must
    // have been re-derived by the new deck, not carried over.
    const rebuilt = new Set(idsOf(after.deck.tier1));
    for (const courseId of preChecked) {
      if (courseId === "PHYS1601UN") continue;
      const stillHeld = kept.some((row) => row.courseId === courseId);
      if (stillHeld) expect(rebuilt.has(courseId)).toBe(true);
    }
  });

  it("survives every degree change in the matrix", () => {
    let state = upsertCourse(walkToCoursework(CC_CS).state, tapped("PHYS1601UN"));

    for (const change of [
      { classYear: "2027" },
      { programIds: ["cc-major-economics"] },
      { school: "SEAS" as const, programIds: [], customMajor: null },
    ]) {
      state = changeDegree(state, change).state;
      expect(state.courses.map((row) => row.courseId)).toContain("PHYS1601UN");
    }
  });
});

/* ==========================================================================
 * The mount-time guard keys on the degree, and only on the degree
 * ========================================================================== */

describe("the degree signature", () => {
  it("does not move when the student confirms a course", () => {
    // `StepCoursework` rebuilds its deck when this value changes. Coursework
    // edits must not trip it: the re-rank on confirmation is deliberately
    // batched (`RERANK_BATCH_SIZE`) so the strip does not reshuffle under a
    // student's finger, and a per-tap rebuild would undo that entirely.
    const before = walkToCoursework(CC_CS).state;
    const signature = degreeSignature(before);

    let state = upsertCourse(before, {
      courseId: "PHYS1601UN",
      code: "PHYS UN1601",
      title: null,
      termLabel: null,
      points: null,
      liked: null,
      source: "onboarding_confirm",
      inCatalog: true,
    });
    state = { ...state, confirmationsSinceRerank: 2 };

    expect(degreeSignature(state)).toBe(signature);
  });

  it("moves for every degree answer the deck is built from", () => {
    const base = walkToCoursework(CC_CS).state;

    for (const change of [
      { school: "SEAS" as const },
      { classYear: "2027" },
      { programIds: ["cc-major-economics"] },
      { customMajor: "Neuroscience" },
    ]) {
      expect(degreeSignature({ ...base, ...change })).not.toBe(degreeSignature(base));
    }
  });
});
