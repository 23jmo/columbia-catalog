/**
 * The feed, and the section choice underneath it.
 *
 * Three things are asserted here that no other suite could assert:
 *
 *   1. **A first-year never receives COMS W4111** — checked through the REAL
 *      vector source rather than a hand-built one. `recommend.test.ts` already
 *      makes this claim against fixtures; the version here is the one that
 *      would have caught a wiring change that made taste large enough to drag
 *      an ineligible course past the filter.
 *   2. **The taste component is non-zero** once the vector source is wired.
 *      Every engine test passed with taste pinned at 0, because the only
 *      production `CourseVectorSource` returned `undefined` for every course.
 *   3. **A signed-out visitor gets a feed and not an exception.** `buildFeed`
 *      runs here with no Supabase environment at all, which is exactly the
 *      guest path: the profile read throws (no request scope), the prerequisite
 *      graph is unavailable, and the catalog falls back to the checked-in seed.
 *      Every one of those has to degrade rather than propagate.
 */

import { describe, expect, it } from "vitest";

import { toCourseId, type CourseId } from "@/lib/requirements/code";
import type { Meeting, Section, TermCode } from "@/lib/types";

import { loadCourseVectorSource, VECTOR_SOURCE_UNAVAILABLE } from "./course-vectors";
import { buildFeed, GRADUATE_LEVEL_FLOOR } from "./feed";
import { recommend } from "./index";
import {
  chooseSection,
  MAX_SECTION_FIT,
  offeringScore,
  scoreSection,
  seatsOpenFor,
  SECTION_FIT,
} from "./section-fit";
import type { CandidateCourse, PrereqSource } from "./types";

const id = (code: string): CourseId => {
  const parsed = toCourseId(code);
  if (!parsed) throw new Error(`unparseable fixture code: ${code}`);
  return parsed;
};

const DATABASES = id("COMS W4111");
const DATA_STRUCTURES = id("COMS W3134");
const INTRO_PROGRAMMING = id("COMS W1004");
const DISCRETE_MATH = id("COMS W3203");
const AI = id("COMS W4701");

/* ==========================================================================
 * The hard filter, against the real vector space
 * ========================================================================== */

/**
 * COMS W4111's prerequisite, as the registrar actually prints it:
 *
 *   "COMS W3134, COMS W3136, or COMS W3136; or instructor's permission"
 *
 * The parser reads that as an `any` over three real courses plus
 * `instructorPermission: true`, so for a first-year `evaluateCourse` returns
 * `unknown` with a NON-EMPTY `outstanding` — the "we watched the gate fail and
 * are only calling it unknown because permission is on the table" case. The
 * engine must treat that as an exclusion, not as a caveat.
 */
const REGISTRAR_PREREQS: PrereqSource = {
  statusFor(courseId, completed) {
    if (courseId === DATABASES) {
      if (completed.has(DATA_STRUCTURES)) {
        return { status: "met", outstanding: [], advisories: [] };
      }
      return {
        status: "unknown",
        outstanding: [[DATA_STRUCTURES, "COMS3136W"]],
        advisories: ["or instructor's permission"],
      };
    }
    if (courseId === AI) {
      if (completed.has(DATA_STRUCTURES)) {
        return { status: "met", outstanding: [], advisories: [] };
      }
      return { status: "unmet", outstanding: [[DATA_STRUCTURES]], advisories: [] };
    }
    return { status: "met", outstanding: [], advisories: [] };
  },
  newlyUnlockedBy: () => [],
};

function candidate(courseId: CourseId, title: string): CandidateCourse {
  return { courseId, code: courseId, title, points: 3 };
}

const CANDIDATES: CandidateCourse[] = [
  candidate(DATABASES, "INTRODUCTION TO DATABASES"),
  candidate(AI, "ARTIFICIAL INTELLIGENCE"),
  candidate(INTRO_PROGRAMMING, "INTRO TO COMPUTER SCIENCE"),
  candidate(DATA_STRUCTURES, "DATA STRUCTURES"),
  candidate(DISCRETE_MATH, "DISCRETE MATHEMATICS"),
];

describe("the prerequisite hard filter, with real vectors", () => {
  it("never recommends COMS W4111 to a first-year", async () => {
    const vectors = await loadCourseVectorSource();
    if (vectors === VECTOR_SOURCE_UNAVAILABLE) {
      console.warn("skipped: no embedding artifact; run npm run build:index");
      return;
    }

    // A first-year: nothing on the record at all.
    const result = recommend({
      profile: { taken: [] },
      candidates: CANDIDATES,
      vectors,
      prereqs: REGISTRAR_PREREQS,
      limit: CANDIDATES.length,
      withheldLimit: CANDIDATES.length,
    });

    const shown = result.recommendations.map((entry) => entry.course.courseId);
    expect(shown).not.toContain(DATABASES);
    expect(shown).not.toContain(AI);

    // …and the reason is kept rather than thrown away, which is what lets a
    // direct question be answered precisely.
    const heldBack = new Map(result.withheld.map((entry) => [entry.course.courseId, entry]));
    expect(heldBack.get(DATABASES)?.reason).toBe("prereq_unmet_but_permission");
    expect(heldBack.get(DATABASES)?.missing).toEqual([[DATA_STRUCTURES, "COMS3136W"]]);
    expect(heldBack.get(AI)?.reason).toBe("prereq_unmet");
  });

  it("recommends it once the prerequisite is on the record", async () => {
    const vectors = await loadCourseVectorSource();
    if (vectors === VECTOR_SOURCE_UNAVAILABLE) return;

    const result = recommend({
      profile: {
        taken: [
          { courseId: INTRO_PROGRAMMING, liked: true },
          { courseId: DATA_STRUCTURES, liked: null },
          { courseId: DISCRETE_MATH, liked: true },
        ],
      },
      candidates: CANDIDATES,
      vectors,
      prereqs: REGISTRAR_PREREQS,
      limit: CANDIDATES.length,
    });

    const shown = result.recommendations.map((entry) => entry.course.courseId);
    expect(shown).toContain(DATABASES);
  });

  /* ======================================================================
   * The taste component, end to end
   * ====================================================================== */

  it("produces a non-zero taste component for every vectorized candidate", async () => {
    const vectors = await loadCourseVectorSource();
    if (vectors === VECTOR_SOURCE_UNAVAILABLE) {
      console.warn("skipped: no embedding artifact; run npm run build:index");
      return;
    }

    const result = recommend({
      profile: {
        taken: [
          { courseId: INTRO_PROGRAMMING, liked: true },
          { courseId: DATA_STRUCTURES, liked: null },
          { courseId: DISCRETE_MATH, liked: true },
        ],
      },
      candidates: CANDIDATES,
      vectors,
      prereqs: REGISTRAR_PREREQS,
      limit: CANDIDATES.length,
    });

    expect(result.recommendations.length).toBeGreaterThan(0);

    for (const entry of result.recommendations) {
      // The whole point: this used to be 0 for every course in production.
      expect(entry.components.taste).not.toBe(0);
      // And no card should be claiming we have no semantic profile for it.
      expect(entry.caveats.map((caveat) => caveat.kind)).not.toContain("no_vector");
    }

    const databases = result.recommendations.find(
      (entry) => entry.course.courseId === DATABASES,
    );
    console.log(`taste component for COMS W4111 = ${databases?.components.taste.toFixed(4)}`);
    expect(databases?.components.taste).toBeGreaterThan(0);
  });
});

/* ==========================================================================
 * Section choice
 * ========================================================================== */

function meeting(startMinute: number, endMinute: number): Meeting {
  return { weekday: "Mo", startMinute, endMinute, buildingName: "Mudd", room: "833" };
}

function section(overrides: Partial<Section> & { sectionCode: string }): Section {
  return {
    sectionId: `20263COMS4111W${overrides.sectionCode}`,
    courseId: "COMS4111W",
    termCode: "20263" as TermCode,
    callNumber: `1000${overrides.sectionCode}`,
    component: null,
    methodOfInstruction: null,
    gradingMode: null,
    minUnit: 3,
    maxUnit: 3,
    instructors: ["Luis Gravano"],
    meetings: [meeting(600, 675)],
    enrollmentCount: 10,
    enrollmentCap: 100,
    waitlistCount: null,
    waitlistCap: null,
    status: "open",
    sourceAsOf: "August 22, 2026",
    lastSeenAt: null,
    detailUrl: null,
    ...overrides,
  } as Section;
}

describe("choosing the section a card is about", () => {
  it("prefers a section with no conflict over everything else", () => {
    const clashing = section({ sectionCode: "001" });
    const clear = section({
      sectionCode: "002",
      // Worse on every other axis: full, no published time, no named instructor.
      meetings: [],
      enrollmentCount: 100,
      status: "full",
      instructors: ["TBA"],
    });

    const choice = chooseSection([clashing, clear], {
      busy: [{ weekday: "Mo", startMinute: 600, endMinute: 675 }],
    });

    expect(choice?.best.section.sectionCode).toBe("002");
    expect(choice?.best.conflictsWithPlan).toBe(false);
    expect(choice?.others[0].conflictsWithPlan).toBe(true);
  });

  it("prefers open seats over a published time", () => {
    const full = section({ sectionCode: "001", enrollmentCount: 200, status: "full" });
    const openButTimeless = section({ sectionCode: "002", meetings: [] });

    const choice = chooseSection([full, openButTimeless]);
    expect(choice?.best.section.sectionCode).toBe("002");
    expect(choice?.best.provenance.kind).toBe("tba");
  });

  it("only picks a time-TBA section when nothing better exists", () => {
    const published = section({ sectionCode: "001" });
    const timeless = section({ sectionCode: "002", meetings: [] });

    const choice = chooseSection([timeless, published]);
    expect(choice?.best.section.sectionCode).toBe("001");
    expect(choice?.best.provenance.kind).toBe("published");
    expect(choice?.others).toHaveLength(1);
  });

  it("labels a historical pattern as an estimate and never as a published time", () => {
    const timeless = section({ sectionCode: "001", meetings: [] });

    const choice = chooseSection([timeless], {
      typical: new Map([
        [
          timeless.sectionId,
          { sourceTerm: "20253", sourceSection: "001", meetings: [meeting(600, 675)] },
        ],
      ]),
    });

    expect(choice?.best.provenance).toEqual({
      kind: "estimated",
      sourceTerm: "20253",
      sourceSection: "001",
    });
    expect(choice?.best.meetings).toHaveLength(1);
  });

  it("never lets an ESTIMATE veto a section on conflict grounds", () => {
    /*
     * The estimated pattern sits exactly on top of the student's existing
     * class. Claiming a conflict here would hide a section they might well be
     * able to take, on the strength of last year's schedule.
     */
    const timeless = section({ sectionCode: "001", meetings: [] });

    const fit = scoreSection(timeless, {
      busy: [{ weekday: "Mo", startMinute: 600, endMinute: 675 }],
      typical: new Map([
        [
          timeless.sectionId,
          { sourceTerm: "20253", sourceSection: "001", meetings: [meeting(600, 675)] },
        ],
      ]),
    });

    expect(fit.conflictsWithPlan).toBe(false);
  });

  it("is a strict priority order, not a blend", () => {
    // Every lower criterion together cannot outweigh one higher one.
    expect(SECTION_FIT.noConflict).toBeGreaterThan(
      SECTION_FIT.seatsOpen + SECTION_FIT.publishedTime + SECTION_FIT.namedInstructor,
    );
    expect(SECTION_FIT.seatsOpen).toBeGreaterThan(
      SECTION_FIT.publishedTime + SECTION_FIT.namedInstructor,
    );
    expect(SECTION_FIT.publishedTime).toBeGreaterThan(SECTION_FIT.namedInstructor);
  });

  it("treats an unpublished capacity as unknown rather than as full", () => {
    expect(seatsOpenFor(section({ sectionCode: "001", enrollmentCap: null, status: "unknown" })))
      .toBeNull();
    expect(seatsOpenFor(section({ sectionCode: "001", enrollmentCount: 100, status: "full" })))
      .toBe(false);
    expect(seatsOpenFor(section({ sectionCode: "001" }))).toBe(true);
  });

  it("normalizes the fit into 0…1 for the offering component", () => {
    const perfect = scoreSection(section({ sectionCode: "001" }));
    expect(perfect.score).toBe(MAX_SECTION_FIT);
    expect(offeringScore(perfect)).toBe(1);
  });

  it("returns null when a course has no live section", () => {
    expect(chooseSection([])).toBeNull();
    expect(chooseSection([section({ sectionCode: "001", callNumber: "  " })])).toBeNull();
  });

  it("carries an Open-in-Vergil URL on every section it returns", () => {
    const choice = chooseSection([section({ sectionCode: "001", callNumber: "13651" })]);
    expect(choice?.best.vergilUrl).toBe(
      "https://vergil.columbia.edu/vergil/class/20263/13651",
    );
  });
});

/* ==========================================================================
 * The signed-out feed
 * ========================================================================== */

describe("buildFeed for a signed-out visitor", () => {
  /*
   * No Supabase environment is configured under vitest, so this exercises every
   * degradation at once: the profile read throws (no request scope), the
   * prerequisite graph is unavailable, historical meetings return nothing, and
   * `getAllCourses` falls back to the checked-in COMS seed. A feed still has to
   * come out the other side.
   */
  it("renders a feed rather than throwing", async () => {
    const feed = await buildFeed({ limit: 5 });

    expect(feed.signedIn).toBe(false);
    expect(feed.personalized).toBe(false);
    expect(feed.takenCount).toBe(0);
    expect(feed.outstandingCount).toBe(0);
    expect(feed.cards.length).toBeGreaterThan(0);
    expect(feed.cards.length).toBeLessThanOrEqual(5);
  }, 30_000);

  it("gives every card a section, a call number and a Vergil link", async () => {
    const feed = await buildFeed({ limit: 5 });

    for (const card of feed.cards) {
      expect(card.best.callNumber.trim().length).toBeGreaterThan(0);
      expect(card.best.vergilUrl).toContain("vergil.columbia.edu/vergil/class/");
      expect(card.best.vergilUrl).toContain(card.best.callNumber);
      expect(["published", "estimated", "tba"]).toContain(card.best.timeKind);
      // An estimate must name the term it came from, or it is not labelled.
      if (card.best.timeKind === "estimated") {
        expect(card.best.estimatedFromTerm).toBeTruthy();
      }
    }
  }, 30_000);

  it("claims nothing is required, because it does not know the student", async () => {
    const feed = await buildFeed({ limit: 8 });

    for (const card of feed.cards) {
      for (const reason of card.reasons) {
        expect(reason.kind).not.toBe("required");
        expect(reason.kind).not.toBe("interesting_and_counts");
      }
    }
  }, 30_000);

  it("holds graduate-only listings back from a cold feed", async () => {
    const feed = await buildFeed({ limit: 20 });

    for (const card of feed.cards) {
      const number = Number(card.code.split(" ")[1]?.replace(/\D/g, ""));
      expect(number).toBeLessThan(GRADUATE_LEVEL_FLOOR);
    }
  }, 30_000);
});
