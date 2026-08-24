/**
 * Coverage pins for the four Columbia College programs audited on 2026-08-24:
 * the Economics major and concentration, Political Science, and Biology.
 *
 * ── What these tests are for ───────────────────────────────────────────────
 *
 * `vacuity.test.ts` screens every program for one failure — an open-ended
 * group counting coursework a closed rule already claimed — and it is a
 * screen, not a transcription check. `programs.test.ts` pins shapes across all
 * programs and is shared. This file holds the things that were specifically
 * wrong in these four files, so that a future edit that reintroduces one fails
 * here with a message naming the Bulletin sentence it violates.
 *
 * Every assertion below corresponds to a line of the live Bulletin, quoted in
 * the test name or the comment above it. Nothing here pins an implementation
 * detail for its own sake — a rule kind is asserted only where the kind is the
 * thing that was wrong.
 */

import { describe, expect, it } from "vitest";

import { toCourseId, type CourseId } from "../code";
import { evaluateProgram, type CourseFacts, type TakenCourseInput } from "../evaluate";
import { CC_CONCENTRATION_ECONOMICS } from "./cc-concentration-economics";
import { CC_MAJOR_BIOLOGY } from "./cc-major-biology";
import { CC_MAJOR_ECONOMICS } from "./cc-major-economics";
import { CC_MAJOR_POLITICAL_SCIENCE } from "./cc-major-political-science";
import type { Program, RequirementGroup } from "../types";

/** Three points for everything and no flags — see `vacuity.test.ts`. */
const facts = (courseId: CourseId): CourseFacts => ({
  courseId,
  title: courseId,
  points: 3,
  requirementFlags: {},
});

function record(codes: string[]): TakenCourseInput[] {
  return codes
    .map((code) => toCourseId(code))
    .filter((courseId): courseId is CourseId => courseId !== null)
    .map((courseId) => ({ courseId, termCode: null, planned: false, points: 3 }));
}

function audit(program: Program, codes: string[]) {
  const result = evaluateProgram(program, { taken: record(codes), lookup: facts });
  return (groupId: string) => {
    const group = result.groups.find((candidate) => candidate.group.id === groupId);
    expect(group, `${program.id} has no group "${groupId}"`).toBeDefined();
    return group!;
  };
}

function group(program: Program, groupId: string): RequirementGroup {
  const found = program.groups.find((candidate) => candidate.id === groupId);
  expect(found, `${program.id} has no group "${groupId}"`).toBeDefined();
  return found!;
}

/** Every course a rule names, whatever its kind. */
function namedCodes(requirement: RequirementGroup): string[] {
  const rule = requirement.rule;
  if (rule.kind === "all_of" || rule.kind === "n_of") return rule.courses;
  if (rule.kind === "sequence_choice") {
    return rule.sequences.flatMap((sequence) => sequence.courses);
  }
  if (rule.kind === "n_matching" || rule.kind === "points_matching") {
    return [...(rule.select.include ?? [])];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Biology
// ---------------------------------------------------------------------------

describe("cc-major-biology", () => {
  /*
   * The bug: "Select two ADDITIONAL courses" was written as `n_of` over a list
   * that includes all seven `core-courses` options, so the two core courses a
   * student is required to take also filled both elective slots. Reproduced
   * against the live evaluator before the fix.
   */
  it('"two additional courses" are additional to the core courses', () => {
    const get = audit(CC_MAJOR_BIOLOGY, [
      "BIOL UN2005",
      "BIOL UN2006",
      "BIOL UN3022",
      "BIOL UN3031",
    ]);

    expect(get("core-courses").status).toBe("satisfied");
    expect(
      get("upper-level-electives").completed,
      "a student with two core courses and no electives has taken zero electives",
    ).toBe(0);
    expect(get("upper-level-electives").status).toBe("unmet");
  });

  /*
   * The other half of `excludeGroups`: it removes what a group CONSUMED, not
   * everything it could have drawn from. Four overlapping courses is two core
   * plus two electives, which is what the department intends.
   */
  it("a fifth and sixth core-eligible course count as the electives", () => {
    const get = audit(CC_MAJOR_BIOLOGY, [
      "BIOL UN3022",
      "BIOL UN3031",
      "BIOL UN3041",
      "BIOL GU4512",
    ]);

    expect(get("core-courses").completed).toBe(2);
    expect(get("upper-level-electives").completed).toBe(2);
    expect(get("upper-level-electives").status).toBe("satisfied");
  });

  /*
   * The elective list must stay the Bulletin's enumeration. A selector over
   * `{ subjects: ["BIOL"], numberRange: [3000, 4999] }` would count the Barnard
   * BIOL...BC courses (the Bulletin's non-major list says "All Barnard
   * Courses"), the project labs, the 0-point recitations and BIOL UN3500,
   * which the page bars by name.
   */
  it("upper-level electives name their courses rather than matching a shape", () => {
    const rule = group(CC_MAJOR_BIOLOGY, "upper-level-electives").rule;
    expect(rule.kind).toBe("n_matching");
    if (rule.kind !== "n_matching") return;

    expect(rule.select.excludeGroups).toContain("core-courses");
    expect(rule.select.subjects).toBeUndefined();
    expect(rule.select.numberRange).toBeUndefined();
    expect(rule.select.include?.length).toBeGreaterThan(30);
    expect(rule.select.include, "BIOL UN3500 cannot be used").not.toContain(
      "BIOL UN3500",
    );
  });

  /*
   * The chemistry, physics and mathematics requirements come from OTHER
   * departments, and they are the kind of requirement that went missing from
   * the SEAS computer science major. Pinned so nobody prunes them as
   * "not biology".
   */
  it("carries the requirements from outside the department", () => {
    for (const groupId of ["chemistry", "physics", "mathematics", "laboratory"]) {
      expect(
        CC_MAJOR_BIOLOGY.groups.some((candidate) => candidate.id === groupId),
        `the biology degree includes ${groupId}`,
      ).toBe(true);
    }
  });

  /*
   * "One of the following three groups of chemistry courses is required."
   * A mix of four courses drawn from three options completes none of them, so
   * this must never become `n_of` over the union.
   */
  it("chemistry is one whole option, not a mix", () => {
    const rule = group(CC_MAJOR_BIOLOGY, "chemistry").rule;
    expect(rule.kind).toBe("sequence_choice");

    const get = audit(CC_MAJOR_BIOLOGY, [
      "CHEM UN1403",
      "CHEM UN1404",
      "CHEM UN1604",
      "CHEM UN2045",
    ]);
    expect(get("chemistry").status).not.toBe("satisfied");
  });
});

// ---------------------------------------------------------------------------
// Economics — the major and the concentration transcribe one shared section
// ---------------------------------------------------------------------------

const ECONOMICS_PROGRAMS = [CC_MAJOR_ECONOMICS, CC_CONCENTRATION_ECONOMICS];

describe("economics: the shared 'Required Coursework for all Programs' section", () => {
  /*
   * "All students must take STAT UN1201, or a higher level course, such as
   * STAT GU4204, or STAT GU4001." The major required STAT UN1201 by name, so a
   * student who took the harder course was reported as not having met the
   * requirement at all.
   */
  it.each(ECONOMICS_PROGRAMS)(
    "$id: a higher-level statistics course satisfies statistics",
    (program) => {
      const get = audit(program, ["STAT GU4204"]);
      expect(get("statistics").status).toBe("satisfied");
    },
  );

  /*
   * "Select one of the following sequences: MATH UN1101 & MATH UN1201 /
   * MATH UN1101 & MATH UN1205 / MATH UN1207 & MATH UN1208." The honors path is
   * a whole sequence, and a mix of two sequences completes neither.
   */
  it.each(ECONOMICS_PROGRAMS)("$id: the honors mathematics path counts", (program) => {
    expect(audit(program, ["MATH UN1207", "MATH UN1208"])("mathematics").status).toBe(
      "satisfied",
    );
  });

  it.each(ECONOMICS_PROGRAMS)("$id: half of two sequences counts as neither", (program) => {
    expect(audit(program, ["MATH UN1101", "MATH UN1207"])("mathematics").status).not.toBe(
      "satisfied",
    );
  });

  /*
   * "Seminars do not count as electives" — the page says it under Economics
   * Electives and again under Seminars. Both files carried the sentence as a
   * note; neither enforced it, so ECON GU4911 was quietly filling an elective
   * slot.
   */
  it.each(ECONOMICS_PROGRAMS)("$id: a seminar is not an elective", (program) => {
    const get = audit(program, ["ECON GU4911", "ECON GU4913", "ECON GU4918"]);
    expect(get("econ-electives").completed).toBe(0);
  });

  /*
   * "Students may not take the Barnard core economics, math, statistics, or
   * seminar courses for credit towards the completion of major requirements."
   * The `ECON` subject code covers Barnard rows, so this needs an exclusion.
   */
  it.each(ECONOMICS_PROGRAMS)(
    "$id: Barnard's core, statistics and seminar courses are not electives",
    (program) => {
      const get = audit(program, [
        "ECON BC3063", // Senior Seminar
        "ECON BC2411", // Statistics for Economics
        "ECON BC3018", // Econometrics
        "ECON BC3033", // Intermediate Macroeconomics
        "ECON BC3035", // Intermediate Microeconomics
      ]);
      expect(get("econ-electives").completed).toBe(0);
    },
  );

  /* The core courses are not electives either — the older half of the fix. */
  it.each(ECONOMICS_PROGRAMS)("$id: the core courses are not electives", (program) => {
    const get = audit(program, [
      "ECON UN1105",
      "ECON UN3211",
      "ECON UN3213",
      "ECON UN3412",
    ]);
    expect(get("econ-core").status).toBe("satisfied");
    expect(get("econ-electives").completed).toBe(0);
  });

  /* A genuine Barnard elective still counts. The exclusions must be narrow. */
  it.each(ECONOMICS_PROGRAMS)("$id: an ordinary Barnard elective still counts", (program) => {
    expect(audit(program, ["ECON BC3029"])("econ-electives").completed).toBe(1);
  });
});

describe("economics: the two programs are genuinely different sizes", () => {
  /*
   * The transfer-credit table on the same page: "Economics major — 9 required
   * economics lecture courses"; "Economics concentration — 7". Four core plus
   * five electives, against four core plus three. The concentration has no
   * seminar requirement, which is why it has four groups and the major five —
   * both counts are the Bulletin's, not an abandoned transcription.
   */
  it("the major asks for five electives and a seminar", () => {
    const rule = group(CC_MAJOR_ECONOMICS, "econ-electives").rule;
    expect(rule.kind).toBe("n_matching");
    if (rule.kind === "n_matching") expect(rule.n).toBe(5);
    expect(group(CC_MAJOR_ECONOMICS, "econ-seminar").rule.kind).toBe("attested");
  });

  it("the concentration asks for three electives and no seminar", () => {
    const rule = group(CC_CONCENTRATION_ECONOMICS, "econ-electives").rule;
    expect(rule.kind).toBe("n_matching");
    if (rule.kind === "n_matching") expect(rule.n).toBe(3);
    expect(
      CC_CONCENTRATION_ECONOMICS.groups.some((candidate) => candidate.id === "econ-seminar"),
      "the Bulletin's concentration table has no seminar row",
    ).toBe(false);
  });

  /*
   * Mathematics and statistics are requirements from other departments. They
   * are on the program rather than delegated to `cc-core`, which is the seam
   * that hid an entire science block from the SEAS computer science major.
   */
  it.each(ECONOMICS_PROGRAMS)("$id: carries mathematics and statistics", (program) => {
    for (const groupId of ["mathematics", "statistics"]) {
      expect(
        program.groups.some((candidate) => candidate.id === groupId),
        `${program.id} includes ${groupId}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Political science
// ---------------------------------------------------------------------------

describe("cc-major-political-science", () => {
  /*
   * "Political Science Electives — minimum one course" is its own row of the
   * requirement table. Before `excludeGroups` it was satisfied by the
   * introductory course the student was already required to take, so the major
   * read as complete one course early.
   */
  it("the elective row is not filled by the required introductory courses", () => {
    const get = audit(CC_MAJOR_POLITICAL_SCIENCE, [
      "POLS UN2201",
      "POLS UN2601",
      "POLS UN3704",
    ]);

    expect(get("introductory-courses").status).toBe("satisfied");
    expect(get("research-methods").status).toBe("satisfied");
    expect(get("political-science-electives").completed).toBe(0);
  });

  /*
   * The other direction, and the Bulletin's own sentence: "Introductory courses
   * taken that do not fit into the Primary or Secondary Subfield will be
   * counted in the Political Science Elective category." `excludeGroups`
   * removes the two the intro group consumed, never a third.
   */
  it("a third introductory course lands in the electives", () => {
    const get = audit(CC_MAJOR_POLITICAL_SCIENCE, [
      "POLS UN2101",
      "POLS UN2201",
      "POLS UN2601",
    ]);

    expect(get("introductory-courses").completed).toBe(2);
    expect(get("political-science-electives").completed).toBe(1);
  });

  it("the elective selector still excludes the closed groups", () => {
    const rule = group(CC_MAJOR_POLITICAL_SCIENCE, "political-science-electives").rule;
    expect(rule.kind).toBe("n_matching");
    if (rule.kind !== "n_matching") return;
    expect(rule.select.excludeGroups).toContain("introductory-courses");
    expect(rule.select.excludeGroups).toContain("research-methods");
  });

  /*
   * "Introductory courses completed at Barnard or Columbia before the Fall 2025
   * semester may be offered to fulfill the introductory course requirement." A
   * junior's record legitimately carries the old numbers.
   */
  it("the pre-Fall-2025 introductory numbers still count", () => {
    const get = audit(CC_MAJOR_POLITICAL_SCIENCE, ["POLS UN1201", "POLS UN1501"]);
    expect(get("introductory-courses").status).toBe("satisfied");
  });

  /*
   * The subfield and seminar requirements turn on a declaration the audit
   * cannot see — which subfield the student claimed. `attested` is the honest
   * answer and turning any of them into a course rule would report a finished
   * degree that the department will refuse.
   */
  it.each(["primary-subfield", "secondary-subfield", "seminars"])(
    "%s stays attested",
    (groupId) => {
      expect(group(CC_MAJOR_POLITICAL_SCIENCE, groupId).rule.kind).toBe("attested");
    },
  );
});

// ---------------------------------------------------------------------------
// Shared hygiene
// ---------------------------------------------------------------------------

const AUDITED = [
  CC_MAJOR_ECONOMICS,
  CC_CONCENTRATION_ECONOMICS,
  CC_MAJOR_POLITICAL_SCIENCE,
  CC_MAJOR_BIOLOGY,
];

describe("the four audited programs", () => {
  it.each(AUDITED)("$id: every named course is a well-formed code", (program) => {
    const bad = program.groups
      .flatMap(namedCodes)
      .filter((code) => toCourseId(code) === null);
    expect(bad, `${program.id} names codes that cannot be parsed`).toEqual([]);
  });

  it.each(AUDITED)("$id: every group links to the Bulletin", (program) => {
    const missing = program.groups.filter((g) => !g.sourceUrl).map((g) => g.id);
    expect(missing).toEqual([]);
  });

  /*
   * Group ids are audit storage keys and `excludeGroups` targets. A duplicate
   * would silently make one of the two unreachable.
   */
  it.each(AUDITED)("$id: group ids are unique", (program) => {
    const ids = program.groups.map((g) => g.id);
    expect(ids).toEqual([...new Set(ids)]);
  });

  /*
   * `excludeGroups` is resolved by id against the SAME program. A typo does not
   * throw — it silently excludes nothing, which is exactly the vacuous state
   * these fixes exist to prevent.
   */
  it.each(AUDITED)("$id: every excludeGroups target exists", (program) => {
    const ids = new Set(program.groups.map((g) => g.id));
    for (const requirement of program.groups) {
      const rule = requirement.rule;
      if (rule.kind !== "n_matching" && rule.kind !== "points_matching") continue;
      for (const target of rule.select.excludeGroups ?? []) {
        expect(
          ids.has(target),
          `${program.id}.${requirement.id} excludes unknown group "${target}"`,
        ).toBe(true);
      }
    }
  });
});
