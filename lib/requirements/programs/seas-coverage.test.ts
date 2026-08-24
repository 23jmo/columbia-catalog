/**
 * A SEAS degree is published across TWO Bulletin tables, and a student sees one
 * audit.
 *
 * Every engineering degree is split between the School's own page — the
 * 27-point nontechnical Core, transcribed on `seas-core` — and the department's
 * Degree Track grid, transcribed on the major. Neither page is a complete
 * degree, and neither file is wrong on its own. That seam is where two separate
 * bugs lived, both found on 2026-08-24 and both invisible from inside a single
 * file:
 *
 *   THE HOLE. `seas-core` states that the technical requirements "belong on the
 *   department's own program", and `seas-major-computer-science` never picked
 *   them up. A SEAS computer science student was shown a degree with no
 *   physics, no chemistry, no laboratory and no Art of Engineering in it —
 *   roughly 17 points that simply never appeared.
 *
 *   THE OVERLAP. `seas-major-mechanical-engineering`,
 *   `seas-major-operations-research` and `seas-major-biomedical-engineering`
 *   each carried `ECON UN1105` in their own foundations group, which
 *   `seas-core` already carries as `principles-of-economics`. The same
 *   requirement appeared twice, in two groups evaluated independently, so the
 *   two copies could show green and red at once.
 *
 * The tests below are the two halves of that seam, pinned. The first two
 * describes are structural and general — they will catch the same mistake in a
 * SEAS program written next year by someone who never read this comment. The
 * rest pin specific facts read off the live Bulletin on 2026-08-24.
 */

import { describe, expect, it } from "vitest";

import { toCourseId } from "../code";
import type { BulletinCode } from "../code";
import type { Program, RequirementGroup } from "../types";

import { SEAS_CORE } from "./seas-core";
import { SEAS_MAJOR_BIOMEDICAL_ENGINEERING } from "./seas-major-biomedical-engineering";
import { SEAS_MAJOR_COMPUTER_SCIENCE } from "./seas-major-computer-science";
import { SEAS_MAJOR_MECHANICAL_ENGINEERING } from "./seas-major-mechanical-engineering";
import { SEAS_MAJOR_OPERATIONS_RESEARCH } from "./seas-major-operations-research";

/** Every SEAS major. A student holds exactly one of these plus `seas-core`. */
const SEAS_MAJORS = [
  ["seas-major-computer-science", SEAS_MAJOR_COMPUTER_SCIENCE],
  ["seas-major-biomedical-engineering", SEAS_MAJOR_BIOMEDICAL_ENGINEERING],
  ["seas-major-mechanical-engineering", SEAS_MAJOR_MECHANICAL_ENGINEERING],
  ["seas-major-operations-research", SEAS_MAJOR_OPERATIONS_RESEARCH],
] as const satisfies readonly (readonly [string, Program])[];

/** The codes a rule names outright — the ones a duplicate can be spotted in. */
function namedCodes(group: RequirementGroup): BulletinCode[] {
  const rule = group.rule;
  switch (rule.kind) {
    case "all_of":
    case "n_of":
      return rule.courses;
    case "sequence_choice":
      return rule.sequences.flatMap((sequence) => sequence.courses);
    default:
      return [];
  }
}

function namedIds(program: Program): Set<string> {
  const ids = new Set<string>();
  for (const group of program.groups) {
    for (const code of namedCodes(group)) {
      const id = toCourseId(code);
      if (id) ids.add(id);
    }
  }
  return ids;
}

describe("the Core and the major do not both claim the same course", () => {
  /*
   * THE OVERLAP, generalised. A course named by `seas-core` and by the major a
   * student is enrolled in produces two groups for one requirement. They are
   * evaluated independently — different rules, different candidate lists — so
   * they can disagree, and a student reading an audit has no way to tell which
   * of the two contradictory answers is the degree's.
   *
   * `seas-major-computer-science` was written this way from the start, with
   * `ENGI E1102` alone in its foundations group and a note pointing at the
   * Core. The other three were made to match it.
   */
  const coreIds = namedIds(SEAS_CORE);

  it.each(SEAS_MAJORS)("%s repeats nothing from seas-core", (_id, major) => {
    const repeated = [...namedIds(major)].filter((id) => coreIds.has(id));
    expect(repeated).toEqual([]);
  });

  it("still names ECON UN1105 exactly once, on the Core", () => {
    // The specific instance, pinned separately: a future edit that drops the
    // course from `seas-core` would satisfy the general test above by removing
    // the requirement from the degree entirely, which is the worse failure.
    const econ = toCourseId("ECON UN1105");
    expect(coreIds.has(econ!)).toBe(true);
    for (const [id, major] of SEAS_MAJORS) {
      expect(namedIds(major).has(econ!), `${id} still names ECON UN1105`).toBe(false);
    }
  });
});

describe("every SEAS major carries the science the Core delegates to it", () => {
  /*
   * THE HOLE, generalised. `seas-core` carries the nontechnical requirement and
   * says outright that mathematics, science, computing and the major's own
   * track "belong on the department's own program". Nothing enforced that, and
   * for computer science nothing picked it up.
   *
   * Physics is the cheapest probe: every SEAS Degree Track grid publishes a
   * physics sequence, none of them is on `seas-core`, and a major that has lost
   * its science block will have lost this first.
   */
  it.each(SEAS_MAJORS)("%s requires a physics sequence", (_id, major) => {
    const physics = major.groups.find((group) => group.id === "physics");
    expect(physics).toBeDefined();
    expect(physics!.rule.kind).toBe("sequence_choice");
  });

  it.each(SEAS_MAJORS)("%s requires The Art of Engineering", (_id, major) => {
    // ENGI E1102 is required of every engineering undergraduate and the School's
    // own page says so — but it is encoded on each major, never on `seas-core`,
    // precisely so that it is claimed once rather than twice.
    const artOfEngineering = toCourseId("ENGI E1102");
    expect(namedIds(major).has(artOfEngineering!)).toBe(true);
  });

  it.each(SEAS_MAJORS)("%s requires a chemistry or biology lecture", (_id, major) => {
    /*
     * The group is not called the same thing everywhere, and that is the point:
     * computer science accepts environmental biology where mechanical
     * engineering and operations research accept only chemistry, and biomedical
     * engineering runs chemistry as a two-term sequence with biology required
     * separately. Copying one degree's list into another would refuse a course
     * that degree explicitly allows.
     */
    const group = major.groups.find((candidate) =>
      ["chemistry", "chemistry-or-biology"].includes(candidate.id),
    );
    expect(group).toBeDefined();
    expect(namedCodes(group!).length).toBeGreaterThan(0);
  });

  it.each(SEAS_MAJORS)("%s requires a laboratory somewhere", (_id, major) => {
    /*
     * Three of the four have a laboratory group of their own. Biomedical
     * engineering does not, and correctly so: its grid puts CHEM UN1500 inside
     * chemistry sequence 1 and CHEM UN1507 inside sequence 2. So this asserts
     * that a laboratory course is required *somewhere* rather than that a
     * particular group exists.
     */
    const laboratories = ["PHYS UN1494", "PHYS UN3081", "CHEM UN1500", "CHEM UN1507", "CHEM UN3085"]
      .map((code) => toCourseId(code as BulletinCode))
      .filter((id): id is string => Boolean(id));
    const ids = namedIds(major);
    expect(laboratories.some((id) => ids.has(id))).toBe(true);
  });

  it.each(SEAS_MAJORS)("%s requires an introductory computing course", (_id, major) => {
    const computing = ["ENGI E1006", "COMS W1004", "COMS W1005", "COMS W1007"]
      .map((code) => toCourseId(code as BulletinCode))
      .filter((id): id is string => Boolean(id));
    const ids = namedIds(major);
    expect(computing.some((id) => ids.has(id))).toBe(true);
  });
});

describe("Global Core is an alternative to the Core sequence, not an addition", () => {
  /*
   * `seas-core` used to carry a standalone two-course `global-core` group
   * alongside the Lit Hum/CC sequence, copied from `cc-core` where it belongs.
   * A Columbia College student takes Lit Hum AND CC AND Global Core; an
   * engineering student takes ONE of the three.
   *
   * The Bulletin fixes List A at "16 to 18 points of credit": ENGL CC1010 (3) +
   * one sequence (6–8) + Art or Music Hum (3–4) + ECON UN1105 (4) is 16–19.
   * Two more Global Core courses would put List A alone at 22–27, and List A
   * plus List B's 9–11 at 31–38 against a published total of 27. Every
   * department grid agrees: "Choose one of the following Required Nontechnical
   * Electives: HUMA CC1001 / COCI CC1101 / Global Core (3–4)".
   */
  it("does not require Global Core on top of a sequence", () => {
    expect(SEAS_CORE.groups.map((group) => group.id)).not.toContain("global-core");
    const flagged = SEAS_CORE.groups.filter(
      (group) =>
        (group.rule.kind === "n_matching" || group.rule.kind === "points_matching") &&
        group.rule.select.flag === "globalCore",
    );
    expect(flagged).toEqual([]);
  });

  it("tells the student about the Global Core route on the sequence group", () => {
    // Removing the group without saying why would hide a route the Bulletin
    // offers. The rule language cannot hold "these courses, or two carrying a
    // flag", so the note carries it.
    const sequence = SEAS_CORE.groups.find((group) => group.id === "core-sequence")!;
    expect(sequence.rule.kind).toBe("sequence_choice");
    expect(sequence.note).toMatch(/Global Core/);
  });
});

describe("mechanical engineering's third physics term has two substitutes", () => {
  it("accepts EEEB UN2001 or BIOL UN2005 in place of the third term", () => {
    /*
     * Footnote 3 hangs on both third-term cells: "May substitute EEEB UN2001,
     * BIOL UN2005, or higher." Missed on the first transcription, so a student
     * who finished PHYS UN1401–UN1402 and then took Environmental Biology was
     * shown this requirement unmet. "Or higher" is deliberately not encoded.
     */
    const physics = SEAS_MAJOR_MECHANICAL_ENGINEERING.groups.find(
      (group) => group.id === "physics",
    )!;
    expect(physics.rule.kind).toBe("sequence_choice");
    if (physics.rule.kind !== "sequence_choice") return;

    const paths = physics.rule.sequences.map((sequence) => sequence.courses.map(toCourseId));
    expect(paths).toContainEqual(["PHYS1401UN", "PHYS1402UN", "EEEB2001UN"]);
    expect(paths).toContainEqual(["PHYS1601UN", "PHYS1602UN", "BIOL2005UN"]);
    // And the substitution never turns a sequence into a mix of two.
    for (const sequence of physics.rule.sequences) {
      expect(sequence.courses.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("courses the Bulletin names but our catalog lacks are kept, not dropped", () => {
  /*
   * All four resolve to a valid `BulletinCode` and to nothing in our catalog,
   * which covers four terms. Each was checked against the live Bulletin on
   * 2026-08-24 and each is really printed there, so the gap is ours, not a
   * transcription error. Deleting an option the Bulletin offers would tell a
   * student who took it that it did not count — the one failure mode this whole
   * module exists to avoid — so they stay, unmatched and noted.
   */
  it.each([
    ["seas-major-mechanical-engineering", SEAS_MAJOR_MECHANICAL_ENGINEERING, "COMS W1005"],
    ["seas-major-mechanical-engineering", SEAS_MAJOR_MECHANICAL_ENGINEERING, "MATH UN3027"],
    ["seas-major-biomedical-engineering", SEAS_MAJOR_BIOMEDICAL_ENGINEERING, "BMEN E2910"],
    ["seas-major-operations-research", SEAS_MAJOR_OPERATIONS_RESEARCH, "COMS W3251"],
  ] as const)("%s still offers %s", (_id, program, code) => {
    const courseId = toCourseId(code);
    expect(courseId, `${code} is not even a parseable code`).toBeTruthy();
    expect(namedIds(program).has(courseId!)).toBe(true);
  });
});
