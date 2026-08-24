/**
 * Coverage tests for the three Columbia College programs a CS student holds:
 * the Core, the major, and the minor.
 *
 * Every case below is a student who was previously told something false. They
 * are written as transcripts rather than as assertions about rule shapes,
 * because the shape is not the thing that hurts anyone — the answer is. A test
 * that asserts "the elective selector has an `exclude` array" goes green again
 * the moment someone rewrites the fix a different way; a test that asserts
 * "this student has not finished their electives" keeps meaning the same thing.
 *
 * Hand-verified against the live Bulletin on 2026-08-24:
 *   https://bulletin.columbia.edu/columbia-college/requirements-degree-bachelor-arts/
 *   https://bulletin.columbia.edu/columbia-college/core-curriculum/science-requirement/
 *   https://bulletin.columbia.edu/columbia-college/departments-instruction/computer-science/
 */

import { describe, expect, it } from "vitest";

import { toCourseId } from "../code";
import { evaluateProgram, type CourseFacts, type TakenCourseInput } from "../evaluate";
import type { Program } from "../types";

import { CC_CORE } from "./cc-core";
import { CC_MAJOR_COMPUTER_SCIENCE } from "./cc-major-computer-science";
import { CC_MINOR_COMPUTER_SCIENCE } from "./cc-minor-computer-science";

/* ==========================================================================
 * A synthetic catalog
 * ========================================================================== */

interface Fixture {
  points: number;
  flags: Record<string, boolean>;
}

/**
 * Only the courses these records depend on, with the flags the Bulletin's
 * approved lists actually give them.
 *
 * The science flags are the interesting ones and were read off the catalog on
 * 2026-08-24: `scienceB` is the seven-department list, `scienceC` is the wider
 * one, and every `scienceB` course also carries `scienceC` because Category C's
 * list contains Category B's.
 */
const CATALOG: Record<string, Fixture> = {
  // Science Category B (and therefore also C).
  "BIOL UN2005": { points: 3, flags: { scienceRequirement: true, scienceB: true, scienceC: true } },
  "CHEM UN1403": { points: 3, flags: { scienceRequirement: true, scienceB: true, scienceC: true } },
  // Science Category C only — approved for the requirement, not from a science
  // department. These are the two that used to close the whole requirement.
  "MATH UN1003": { points: 3, flags: { scienceRequirement: true, scienceC: true } },
  "PHIL UN3411": { points: 3, flags: { scienceRequirement: true, scienceC: true } },

  // Computer science, all flagless.
  "COMS W1004": { points: 3, flags: {} },
  "COMS W3134": { points: 3, flags: {} },
  "COMS W3136": { points: 4, flags: {} },
  "COMS W3157": { points: 4, flags: {} },
  "COMS W3203": { points: 4, flags: {} },
  "COMS W3261": { points: 3, flags: {} },
  "CSEE W3827": { points: 3, flags: {} },
  "COMS W4111": { points: 3, flags: {} },
  "COMS W4118": { points: 3, flags: {} },
  "CSEE W4119": { points: 3, flags: {} },
  "COMS W4701": { points: 3, flags: {} },
};

const lookup = (courseId: string): CourseFacts | undefined => {
  for (const [code, fixture] of Object.entries(CATALOG)) {
    if (toCourseId(code) === courseId) {
      return { courseId, title: code, points: fixture.points, requirementFlags: fixture.flags };
    }
  }
  return undefined;
};

function audit(program: Program, codes: string[]) {
  const taken: TakenCourseInput[] = codes.map((code) => {
    const courseId = toCourseId(code);
    if (!courseId) throw new Error(`unparseable code in this test: ${code}`);
    return { courseId, termCode: null, planned: false };
  });
  const result = evaluateProgram(program, { taken, lookup });
  return (groupId: string) => {
    const group = result.groups.find((candidate) => candidate.group.id === groupId);
    if (!group) {
      throw new Error(
        `${program.id} has no group "${groupId}". It has: ` +
          result.groups.map((candidate) => candidate.group.id).join(", "),
      );
    }
    return group;
  };
}

/* ==========================================================================
 * The Core
 * ========================================================================== */

describe("cc-core: the Science Requirement is three courses across three categories", () => {
  it("two Category C courses do not finish it", () => {
    /*
     * The bug. MATH UN1003 and PHIL UN3411 are both on the approved list and
     * neither is from one of the seven science departments, so before the
     * split this student was scored 2/2 and told the Science Requirement was
     * done. The Bulletin: "The three courses must be distributed across the
     * three categories" — they still owe a Science B course.
     */
    const group = audit(CC_CORE, ["MATH UN1003", "PHIL UN3411"]);
    expect(group("science-b").status).toBe("unmet");
    expect(group("science").status).toBe("satisfied");
  });

  it("one B course and one C course finish it", () => {
    const group = audit(CC_CORE, ["BIOL UN2005", "MATH UN1003"]);
    expect(group("science-b").status).toBe("satisfied");
    expect(group("science").status).toBe("satisfied");
  });

  it("one course cannot satisfy both halves", () => {
    /*
     * Every Category B course is also on the Category C list, so without
     * `excludeGroups` a single chemistry course closes both groups and a
     * three-course requirement is finished with two.
     */
    const group = audit(CC_CORE, ["CHEM UN1403"]);
    expect(group("science-b").status).toBe("satisfied");
    expect(group("science").status).toBe("unmet");
  });

  it("two B courses finish it, spending one on each half", () => {
    // Category C's list contains Category B's, so the second B course is a
    // legitimate Category C course. Refusing it would send this student back
    // for a fourth science class.
    const group = audit(CC_CORE, ["BIOL UN2005", "CHEM UN1403"]);
    expect(group("science-b").status).toBe("satisfied");
    expect(group("science").status).toBe("satisfied");
    expect(group("science").matched.map((match) => match.code)).not.toEqual(
      group("science-b").matched.map((match) => match.code),
    );
  });
});

describe("cc-core covers every row of the Bulletin's table", () => {
  it("has a group for each of the ten area headers", () => {
    /*
     * The degree page's Core table has exactly ten `areaheader` rows. Physical
     * Education and the Science Requirement each become two groups here, for
     * reasons the file documents, so the count is twelve — but the ten rows
     * must all be reachable, and a group quietly dropped in an edit is the
     * failure this catches.
     */
    const ids = new Set(CC_CORE.groups.map((group) => group.id));
    for (const id of [
      "lit-hum",
      "frontiers",
      "university-writing",
      "contemporary-civilization",
      "art-hum",
      "music-hum",
      "science-b",
      "science",
      "global-core",
      "foreign-language",
      "physical-education",
      "swim-test",
    ]) {
      expect(ids, `cc-core is missing ${id}`).toContain(id);
    }
  });
});

/* ==========================================================================
 * The major
 * ========================================================================== */

describe("cc-major-computer-science", () => {
  it("gives Area Foundation credit for Computer Networks", () => {
    /*
     * The Bulletin prints Computer Networks as COMS W4119, which is a code the
     * registrar does not use and our catalog does not hold. Transcribed
     * faithfully, the option was dead: a student who took the course got
     * nothing for it, and a dead option is indistinguishable from a course you
     * have not taken.
     */
    const group = audit(CC_MAJOR_COMPUTER_SCIENCE, ["CSEE W4119"]);
    expect(group("area-foundation").completed).toBe(1);
  });

  it("names no course code the parser cannot resolve", () => {
    for (const group of CC_MAJOR_COMPUTER_SCIENCE.groups) {
      const rule = group.rule;
      const codes =
        rule.kind === "all_of" || rule.kind === "n_of"
          ? rule.courses
          : rule.kind === "n_matching" || rule.kind === "points_matching"
            ? [...(rule.select.include ?? []), ...(rule.select.exclude ?? [])]
            : [];
      for (const code of codes) {
        expect(toCourseId(code), `${group.id} names an unparseable code: ${code}`).not.toBeNull();
      }
    }
  });

  it("does not count Essential Data Structures as an elective", () => {
    /*
     * "COMS W1005 and COMS W3136 cannot be counted towards the Computer
     * Science major, minor, and concentration." COMS W3136 is a 4-point
     * 3000-level COMS course sitting in our catalog, so it matched every part
     * of the elective shape and was worth a third of the block.
     */
    const group = audit(CC_MAJOR_COMPUTER_SCIENCE, ["COMS W3136"]);
    expect(group("electives").completed).toBe(0);
  });

  it("still refuses to count the required curriculum as electives", () => {
    // The 2026-08-24 regression guard, restated for the College major: this
    // student has finished the core and three area foundation courses and has
    // taken no elective at all.
    const group = audit(CC_MAJOR_COMPUTER_SCIENCE, [
      "COMS W1004",
      "COMS W3134",
      "COMS W3157",
      "COMS W3203",
      "COMS W3261",
      "CSEE W3827",
      "COMS W4111",
      "COMS W4118",
      "COMS W4701",
    ]);
    expect(group("core-sequence").status).toBe("satisfied");
    expect(group("area-foundation").status).toBe("satisfied");
    expect(group("electives").completed).toBe(0);
  });
});

/* ==========================================================================
 * The minor
 * ========================================================================== */

describe("cc-minor-computer-science", () => {
  it("does not count Essential Data Structures toward either elective slot", () => {
    const group = audit(CC_MINOR_COMPUTER_SCIENCE, ["COMS W3136"]);
    expect(group("upper-level-elective").completed).toBe(0);
    expect(group("upper-level-elective-or-math").completed).toBe(0);
  });

  it("does not fill both elective slots with one course", () => {
    /*
     * The two slots describe the same set of courses, so left alone they both
     * settle on whichever one the student holds — and the minor reports two of
     * its six requirements done for one class. Both slots also have to skip the
     * courses the minor already required by name.
     */
    const group = audit(CC_MINOR_COMPUTER_SCIENCE, [
      "COMS W1004",
      "COMS W3134",
      "COMS W3203",
      "COMS W3157",
      "COMS W4111",
    ]);
    expect(group("upper-level-elective").status).toBe("satisfied");
    expect(group("upper-level-elective-or-math").status).toBe("unmet");
  });

  it("counts a genuine sixth course in the second slot", () => {
    const group = audit(CC_MINOR_COMPUTER_SCIENCE, [
      "COMS W1004",
      "COMS W3134",
      "COMS W3203",
      "COMS W3157",
      "COMS W4111",
      "COMS W4701",
    ]);
    expect(group("upper-level-elective").status).toBe("satisfied");
    expect(group("upper-level-elective-or-math").status).toBe("satisfied");
    expect(group("upper-level-elective").matched[0]?.code).not.toBe(
      group("upper-level-elective-or-math").matched[0]?.code,
    );
  });
});
