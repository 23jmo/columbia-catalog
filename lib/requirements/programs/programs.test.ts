/**
 * Tests for the programs transcribed in this directory.
 *
 * These import the program modules directly rather than going through
 * `./index`, because the registry is wired up in another lane and a program
 * that is correct but not yet registered should still be under test.
 *
 * The load-bearing test here is `resolves every course code`. A typo in a
 * `BulletinCode` does not throw, does not fail type-checking and does not look
 * wrong on the page — it silently produces a requirement no student can ever
 * satisfy. `toCourseId` returning null is the only signal available, and this
 * file is the only thing watching for it.
 */

import { describe, expect, it } from "vitest";

import { toCourseId } from "../code";
import type { BulletinCode } from "../code";
import { verificationOf, type Program, type RequirementGroup } from "../types";

import { CC_CONCENTRATION_ECONOMICS } from "./cc-concentration-economics";
import { CC_MAJOR_BIOLOGY } from "./cc-major-biology";
import { CC_MAJOR_ENGLISH } from "./cc-major-english";
import { CC_MAJOR_HISTORY } from "./cc-major-history";
import { CC_MAJOR_POLITICAL_SCIENCE } from "./cc-major-political-science";
import { CC_MAJOR_PSYCHOLOGY } from "./cc-major-psychology";
import { CC_MINOR_COMPUTER_SCIENCE } from "./cc-minor-computer-science";
import { SEAS_MAJOR_BIOMEDICAL_ENGINEERING } from "./seas-major-biomedical-engineering";
import { SEAS_MAJOR_COMPUTER_SCIENCE } from "./seas-major-computer-science";
import { SEAS_MAJOR_MECHANICAL_ENGINEERING } from "./seas-major-mechanical-engineering";
import { SEAS_MAJOR_OPERATIONS_RESEARCH } from "./seas-major-operations-research";

/** Every program transcribed in this lane, in the order they were written. */
const TRANSCRIBED_PROGRAMS: Program[] = [
  CC_MAJOR_POLITICAL_SCIENCE,
  CC_MAJOR_PSYCHOLOGY,
  CC_MAJOR_BIOLOGY,
  CC_MAJOR_HISTORY,
  CC_MAJOR_ENGLISH,
  SEAS_MAJOR_COMPUTER_SCIENCE,
  SEAS_MAJOR_OPERATIONS_RESEARCH,
  SEAS_MAJOR_MECHANICAL_ENGINEERING,
  SEAS_MAJOR_BIOMEDICAL_ENGINEERING,
  CC_MINOR_COMPUTER_SCIENCE,
  CC_CONCENTRATION_ECONOMICS,
];

/**
 * Every course code a group names, wherever the rule kind hides one — including
 * `CourseSelector.include` and `.exclude`, which are the two places a typo is
 * easiest to miss because they read as configuration rather than as courses.
 */
function codesIn(group: RequirementGroup): BulletinCode[] {
  const rule = group.rule;
  switch (rule.kind) {
    case "all_of":
    case "n_of":
      return rule.courses;
    case "sequence_choice":
      return rule.sequences.flatMap((sequence) => sequence.courses);
    case "n_matching":
    case "points_matching":
      return [...(rule.select.include ?? []), ...(rule.select.exclude ?? [])];
    case "attested":
      return [];
  }
}

describe("transcribed programs", () => {
  it.each(TRANSCRIBED_PROGRAMS.map((program) => [program.id, program] as const))(
    "%s has groups, sources and resolvable codes",
    (_id, program) => {
      expect(program.groups.length).toBeGreaterThan(0);
      expect(program.sourceUrl).toMatch(/^https:\/\/bulletin\.columbia\.edu\//);
      expect(program.edition).toBe("2026-2027");

      for (const group of program.groups) {
        expect(group.sourceUrl, `${program.id}/${group.id} sourceUrl`).toMatch(
          /^https:\/\/bulletin\.columbia\.edu\//,
        );

        for (const code of codesIn(group)) {
          /*
           * The whole point of this file. A code that does not resolve is a
           * requirement with no satisfying course, and nothing else in the
           * system will ever notice.
           */
          expect(
            toCourseId(code),
            `${program.id}/${group.id}: "${code}" does not resolve to a course id`,
          ).not.toBeNull();
        }
      }
    },
  );

  it("gives every program a unique id", () => {
    const ids = TRANSCRIBED_PROGRAMS.map((program) => program.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every group an id unique within its program", () => {
    for (const program of TRANSCRIBED_PROGRAMS) {
      const ids = program.groups.map((group) => group.id);
      expect(new Set(ids).size, `${program.id} has duplicate group ids`).toBe(
        ids.length,
      );
    }
  });

  it("never asks for more courses than an n_of rule lists", () => {
    for (const program of TRANSCRIBED_PROGRAMS) {
      for (const group of program.groups) {
        if (group.rule.kind !== "n_of") continue;
        expect(
          group.rule.courses.length,
          `${program.id}/${group.id} asks for ${group.rule.n} of ${group.rule.courses.length}`,
        ).toBeGreaterThanOrEqual(group.rule.n);
      }
    }
  });

  it("gives every sequence_choice at least two non-empty alternatives", () => {
    // A one-alternative sequence_choice is an `all_of` wearing a costume, and
    // an empty sequence is satisfied by taking nothing.
    for (const program of TRANSCRIBED_PROGRAMS) {
      for (const group of program.groups) {
        if (group.rule.kind !== "sequence_choice") continue;
        expect(
          group.rule.sequences.length,
          `${program.id}/${group.id}`,
        ).toBeGreaterThan(1);
        for (const sequence of group.rule.sequences) {
          expect(sequence.courses.length, `${program.id}/${group.id}`).toBeGreaterThan(0);
          expect(sequence.label, `${program.id}/${group.id}`).toBeTruthy();
        }
      }
    }
  });

  it("gives every attested rule a note the student can act on", () => {
    // An attested group is a request that a person confirm something. Without
    // a note it is a checkbox with no question attached.
    for (const program of TRANSCRIBED_PROGRAMS) {
      for (const group of program.groups) {
        if (group.rule.kind !== "attested") continue;
        expect(verificationOf(group.rule)).toBe("attested");
        expect(group.rule.note.length, `${program.id}/${group.id}`).toBeGreaterThan(20);
      }
    }
  });

  it("marks every program authored, because a person read every page", () => {
    for (const program of TRANSCRIBED_PROGRAMS) {
      expect(program.origin, program.id).toBe("authored");
    }
  });
});

// ---------------------------------------------------------------------------
// The specific misreads these transcriptions exist to avoid
// ---------------------------------------------------------------------------

describe("SEAS computer science is not the College computer science", () => {
  it("requires all three calculus courses rather than one of them", () => {
    /*
     * The College page heads its calculus table "Select one of the following
     * courses"; the SEAS page heads its "Calculus Requirement" and lists three
     * required courses. Assuming the two pages agree turns a three-course
     * requirement into a one-course one.
     */
    const calculus = SEAS_MAJOR_COMPUTER_SCIENCE.groups.find(
      (group) => group.id === "calculus",
    )!;
    expect(calculus.rule.kind).toBe("all_of");
    if (calculus.rule.kind === "all_of") {
      expect(calculus.rule.courses.map(toCourseId)).toEqual([
        "MATH1101UN",
        "MATH1102UN",
        "APMA2000E",
      ]);
    }
  });

  it("requires ENGI E1006, which the College major only recommends", () => {
    const prerequisite = SEAS_MAJOR_COMPUTER_SCIENCE.groups.find(
      (group) => group.id === "prerequisite",
    )!;
    expect(prerequisite.rule.kind).toBe("all_of");
    if (prerequisite.rule.kind === "all_of") {
      expect(prerequisite.rule.courses.map(toCourseId)).toEqual(["ENGI1006E"]);
    }
  });

  it("uses the SEAS page's spelling of the two disputed cross-listings", () => {
    // The College page writes COMS W4119 and CSOR E4231 for the courses this
    // page writes CSEE W4119 and CSOR W4231. Each file follows its own source.
    const area = SEAS_MAJOR_COMPUTER_SCIENCE.groups.find(
      (group) => group.id === "area-foundation",
    )!;
    expect(area.rule.kind).toBe("n_of");
    if (area.rule.kind === "n_of") {
      const ids = area.rule.courses.map(toCourseId);
      expect(ids).toContain("CSEE4119W");
      expect(ids).toContain("CSOR4231W");
      expect(area.rule.n).toBe(4);
    }
  });
});

describe("two-term sequences stay atomic", () => {
  it.each([
    ["seas-major-operations-research", SEAS_MAJOR_OPERATIONS_RESEARCH],
    ["seas-major-mechanical-engineering", SEAS_MAJOR_MECHANICAL_ENGINEERING],
    ["seas-major-biomedical-engineering", SEAS_MAJOR_BIOMEDICAL_ENGINEERING],
  ] as const)("%s expresses physics as a sequence_choice", (_id, program) => {
    /*
     * The rule `types.ts` spells out: as `n_of { n: 2 }` over the six physics
     * courses, PHYS UN1401 plus PHYS UN1602 would pass — the first term of one
     * sequence and the second term of another, which completes neither and is
     * a schedule a real student could build.
     */
    const physics = program.groups.find((group) => group.id === "physics")!;
    expect(physics.rule.kind).toBe("sequence_choice");
    if (physics.rule.kind === "sequence_choice") {
      for (const sequence of physics.rule.sequences) {
        expect(sequence.courses.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps the Economics mathematics sequences whole, honors path included", () => {
    const mathematics = CC_CONCENTRATION_ECONOMICS.groups.find(
      (group) => group.id === "mathematics",
    )!;
    expect(mathematics.rule.kind).toBe("sequence_choice");
    if (mathematics.rule.kind === "sequence_choice") {
      const honors = mathematics.rule.sequences.find((sequence) =>
        sequence.courses.map(toCourseId).includes("MATH1207UN"),
      );
      expect(honors?.courses.map(toCourseId)).toEqual(["MATH1207UN", "MATH1208UN"]);
    }
  });

  it("keeps the four Biology chemistry options from being mixed", () => {
    const chemistry = CC_MAJOR_BIOLOGY.groups.find(
      (group) => group.id === "chemistry",
    )!;
    expect(chemistry.rule.kind).toBe("sequence_choice");
    if (chemistry.rule.kind === "sequence_choice") {
      expect(chemistry.rule.sequences).toHaveLength(4);
    }
  });
});

describe("elective selectors do not swallow required coursework", () => {
  it("excludes the Economics core from the concentration's elective slots", () => {
    const electives = CC_CONCENTRATION_ECONOMICS.groups.find(
      (group) => group.id === "econ-electives",
    )!;
    expect(electives.rule.kind).toBe("n_matching");
    if (electives.rule.kind === "n_matching") {
      expect(electives.rule.select.exclude?.map(toCourseId)).toContain("ECON3211UN");
    }
  });

  it("excludes the required BMEN core from the BMEN elective floor", () => {
    const electives = SEAS_MAJOR_BIOMEDICAL_ENGINEERING.groups.find(
      (group) => group.id === "bme-technical-electives",
    )!;
    expect(electives.rule.kind).toBe("points_matching");
    if (electives.rule.kind === "points_matching") {
      const excluded = electives.rule.select.exclude?.map(toCourseId) ?? [];
      expect(excluded).toContain("BMEN3010E");
      expect(excluded).toContain("BMEN4001E");
    }
  });
});

describe("the computer science minor's sixth slot is a union, not half of one", () => {
  it("accepts either an upper-level CS course or a named mathematics course", () => {
    const slot = CC_MINOR_COMPUTER_SCIENCE.groups.find(
      (group) => group.id === "upper-level-elective-or-math",
    )!;
    expect(slot.rule.kind).toBe("n_matching");
    if (slot.rule.kind === "n_matching") {
      expect(slot.rule.select.numberRange).toEqual([3000, 4999]);
      const included = slot.rule.select.include?.map(toCourseId) ?? [];
      expect(included).toContain("STAT4203GU");
      expect(included).toContain("MATH2010UN");
      expect(included).toHaveLength(8);
    }
  });
});

describe("programs whose Bulletin page cannot be checked say so", () => {
  it("leaves the Psychology distribution groups attested", () => {
    // Group I is 2200s/3200s/4200s — three non-contiguous bands, and
    // CourseSelector.numberRange is one. Approximated as [2200, 4299] it would
    // swallow Groups II and III whole.
    for (const id of ["group-i", "group-ii", "group-iii", "seminar"]) {
      const group = CC_MAJOR_PSYCHOLOGY.groups.find((candidate) => candidate.id === id)!;
      expect(group.rule.kind, id).toBe("attested");
    }
  });

  it("leaves every History distribution row attested but still counts the nine", () => {
    const counted = CC_MAJOR_HISTORY.groups.filter(
      (group) => group.rule.kind !== "attested",
    );
    expect(counted).toHaveLength(1);
    expect(counted[0]!.id).toBe("nine-history-courses");
  });

  it("leaves every English distribution row attested", () => {
    const distribution = CC_MAJOR_ENGLISH.groups.filter((group) =>
      group.id.startsWith("distribution-"),
    );
    expect(distribution.length).toBe(6);
    for (const group of distribution) {
      expect(group.rule.kind, group.id).toBe("attested");
    }
  });

  it("keeps the Political Science subfield rows attested", () => {
    for (const id of ["primary-subfield", "secondary-subfield", "seminars"]) {
      const group = CC_MAJOR_POLITICAL_SCIENCE.groups.find(
        (candidate) => candidate.id === id,
      )!;
      expect(group.rule.kind, id).toBe("attested");
    }
  });

  it("carries both the pre- and post-Fall-2025 Political Science intro numbers", () => {
    // A junior's record legitimately shows POLS UN1201. Dropping the old
    // numbers reports a finished requirement as unmet.
    const intro = CC_MAJOR_POLITICAL_SCIENCE.groups.find(
      (group) => group.id === "introductory-courses",
    )!;
    expect(intro.rule.kind).toBe("n_of");
    if (intro.rule.kind === "n_of") {
      const ids = intro.rule.courses.map(toCourseId);
      expect(ids).toContain("POLS2201UN");
      expect(ids).toContain("POLS1201UN");
      expect(intro.rule.n).toBe(2);
    }
  });
});

describe("the Economics sub-major program is a concentration, not a minor", () => {
  it("is filed as a concentration because the department offers no minor", () => {
    // The Bulletin's Economics page has no "Minor in Economics" heading at all.
    // Filing this as a minor would offer students a program they cannot declare.
    expect(CC_CONCENTRATION_ECONOMICS.kind).toBe("concentration");
    expect(CC_CONCENTRATION_ECONOMICS.id).toBe("cc-concentration-economics");
  });

  it("keeps the Computer Science one a minor, because that one exists", () => {
    expect(CC_MINOR_COMPUTER_SCIENCE.kind).toBe("minor");
  });
});
