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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { toCourseId, type CourseId } from "@/lib/requirements/code";
import type { CourseWithSections, Meeting, Section, TermCode } from "@/lib/types";

import { loadCourseVectorSource, VECTOR_SOURCE_UNAVAILABLE } from "./course-vectors";
import { assembleFeedCards, buildFeed, GRADUATE_LEVEL_FLOOR, type FeedCard } from "./feed";
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

/* ==========================================================================
 * Which class the card is offering
 * ========================================================================== */

/**
 * A card names ONE section, and on a container course the section is the class.
 *
 * COMS 6998 is one course titled "TOPICS IN COMPUTER SCIENCE" carrying 20
 * unrelated Fall 2026 seminars; COMS 4995 is another, and COMS 1002 splits
 * "COMPUTING IN CONTEXT" into Economics, Art and Biology. A card for one of
 * their sections that prints only the course title is indistinguishable from
 * every sibling card, and the one string that would tell them apart lives on
 * the section and nowhere else.
 *
 * Asserted against the real seed rather than a fixture, because the failure
 * this guards against is the title never leaving the data layer -- which a
 * hand-built section would hide by construction.
 */
describe("the class a card is actually offering", () => {
  const seed = JSON.parse(
    readFileSync("lib/seed/coms-fall2026.json", "utf8"),
  ) as CourseWithSections[];

  const courseFor = (courseId: string): CourseWithSections => {
    const course = seed.find((candidate) => candidate.courseId === courseId);
    if (!course) throw new Error(`seed has no ${courseId}`);
    return course;
  };

  async function cardFor(courseId: string): Promise<FeedCard> {
    const course = courseFor(courseId);
    const cards = await assembleFeedCards({
      recommendations: [
        {
          course: {
            courseId: course.courseId,
            code: `${course.subjectCode} ${course.number}`,
            title: course.title,
            points: course.pointsMin,
          },
          score: 1,
          components: { requirementFit: 0, taste: 0, unlock: 0, offering: 0 },
          reasons: [],
          caveats: [],
        },
      ],
      coursesById: new Map([[course.courseId, course]]),
      limit: 1,
      terms: ["20263"],
    });
    if (cards.length !== 1) throw new Error(`expected one card for ${courseId}`);
    return cards[0];
  }

  it("carries the section's own topic title, not just the container's name", async () => {
    const card = await cardFor("COMS6998E");

    expect(card.title).toBe("TOPICS IN COMPUTER SCIENCE");
    // The whole point: something other than the course title reached the card.
    expect(card.best.title).toBeTruthy();
    expect(card.best.title).not.toBe(card.title);
    expect(courseFor("COMS6998E").sections.map((section) => section.title)).toContain(
      card.best.title,
    );
  }, 30_000);

  it("does it for 4995 too, and for every other container course", async () => {
    for (const courseId of ["COMS4995W", "COMS1002W"]) {
      const card = await cardFor(courseId);
      expect(card.best.title, courseId).toBeTruthy();
      expect(card.best.title, courseId).not.toBe(card.title);
      // The siblings a card lists are named for the same reason it is.
      for (const other of card.others) expect(other.title, courseId).toBeTruthy();
    }
  }, 30_000);

  it("says null on an ordinary course rather than restating its title", async () => {
    // Both COMS 4111 rows carry "INTRODUCTION TO DATABASES" in the directory's
    // section field -- the header the card already prints. Repeating it beside
    // the section code would read as though it meant something.
    const course = courseFor("COMS4111W");
    expect(course.sections.every((section) => Boolean(section.title))).toBe(true);

    const card = await cardFor("COMS4111W");
    expect(card.best.title).toBeNull();
    for (const other of card.others) expect(other.title).toBeNull();
  }, 30_000);
});
