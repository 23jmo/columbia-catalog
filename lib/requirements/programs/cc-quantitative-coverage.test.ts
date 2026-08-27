/**
 * Coverage pins for the three quantitative Columbia College majors transcribed
 * on 2026-08-26: Mathematics, Physics and Statistics.
 *
 * ── What these tests are for ───────────────────────────────────────────────
 *
 * `vacuity.test.ts` screens every program for one failure — an open-ended
 * group counting coursework a closed rule already claimed. `programs.test.ts`
 * pins shapes across all programs. This file holds the things that were
 * specifically at risk in these three transcriptions, so a future edit that
 * reintroduces one fails here with a message naming the Bulletin sentence it
 * violates.
 *
 * Two hazards recur across all three pages and are the reason this file exists:
 *
 *   **The honors route hidden somewhere non-obvious.** In Mathematics it is a
 *   comment row pricing the block at "13-15 points including Advanced Placement
 *   Credit"; in Physics it is a bare `<sup>` glued inside a course title; in
 *   Statistics it is a bullet under the table with no footnote marker at all.
 *   Each one, missed, costs an honors student their largest block — which is
 *   exactly the shipped `cc-major-economics` bug.
 *
 *   **The open-ended elective block that eats a closed one.** Every one of
 *   these majors publishes a point total whose arithmetic only works if the
 *   elective block is disjoint from the named requirements. The Bulletin never
 *   says so in prose; its numbers say so.
 */

import { describe, expect, it } from "vitest";

import { toCourseId } from "../code";
import type { Program, RequirementGroup } from "../types";

import { CC_MAJOR_MATHEMATICS } from "./cc-major-mathematics";
import { CC_MAJOR_PHYSICS } from "./cc-major-physics";
import { CC_MAJOR_STATISTICS } from "./cc-major-statistics";

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

describe("Mathematics", () => {
  it("accepts all three printed sequences and each one's AP-truncated form", () => {
    /*
     * The block is priced "13-15 points including Advanced Placement Credit",
     * while the department's Placement page tells a BC-5 student to *begin* at
     * MATH UN1205 or UN1207 — so the two-course and three-course forms are what
     * a real honors record looks like. Encode only the printed three and every
     * student who placed out of Calculus I fails their largest requirement.
     */
    const sequences = group(CC_MAJOR_MATHEMATICS, "calculus-sequence").rule;
    expect(sequences.kind).toBe("sequence_choice");
    if (sequences.kind !== "sequence_choice") return;

    const paths = sequences.sequences.map((sequence) => sequence.courses);
    expect(paths).toHaveLength(7);
    // The three printed routes, in full.
    expect(paths).toContainEqual([
      "MATH UN1101",
      "MATH UN1102",
      "MATH UN1201",
      "MATH UN1202",
      "MATH UN2010",
    ]);
    expect(paths).toContainEqual([
      "MATH UN1101",
      "MATH UN1102",
      "MATH UN1205",
      "MATH UN2010",
    ]);
    expect(paths).toContainEqual([
      "MATH UN1101",
      "MATH UN1102",
      "MATH UN1207",
      "MATH UN1208",
    ]);
    // And the AP entry points the Placement page sends students to.
    expect(paths).toContainEqual(["MATH UN1207", "MATH UN1208"]);
    expect(paths).toContainEqual(["MATH UN1205", "MATH UN2010"]);
  });

  it("keeps the 12-point elective block out of the algebra and analysis blocks", () => {
    /*
     * Modern Algebra and Modern Analysis are twelve points of MATH courses
     * above 2000. Without `excludeGroups` the 12-point elective selector
     * matches them outright, and a 40-point major reports complete at 28.
     */
    const electives = group(CC_MAJOR_MATHEMATICS, "electives").rule;
    expect(electives.kind).toBe("points_matching");
    if (electives.kind !== "points_matching") return;

    const excluded = new Set(electives.select.excludeGroups ?? []);
    for (const id of ["calculus-sequence", "modern-algebra", "modern-analysis"]) {
      expect(excluded.has(id), `${id} is not excluded from the elective block`).toBe(true);
    }
  });

  it("excludes the courses the footnotes and the Overview tab bar from the electives", () => {
    /*
     * Four separate exclusions from three places, each one a course a student
     * can really register for: footnote 3 says only one seminar counts, footnote
     * 1 bars MATH UN2015, and the Overview tab bars Supervised Readings and the
     * Senior Thesis pair.
     */
    const electives = group(CC_MAJOR_MATHEMATICS, "electives").rule;
    if (electives.kind !== "points_matching") throw new Error("expected points_matching");
    const excluded = electives.select.exclude ?? [];
    for (const code of [
      "MATH UN3951",
      "MATH UN3952",
      "MATH UN3901",
      "MATH UN3902",
      "MATH UN3994",
      "MATH UN3995",
      "MATH UN2015",
    ]) {
      expect(excluded).toContain(code);
    }
  });

  it("keeps the approved cognates the Bulletin lists but our catalog lacks", () => {
    // Seven of the seventy-nine have not run in any term our catalog covers.
    // Dropping an option the Bulletin offers would tell a student who took it
    // that it did not count.
    const electives = group(CC_MAJOR_MATHEMATICS, "electives").rule;
    if (electives.kind !== "points_matching") throw new Error("expected points_matching");
    const included = electives.select.include ?? [];
    for (const code of ["CBMF W4761", "COMS W4162", "CSPH G4801", "PHYS GU4011"]) {
      expect(included, `${code} was dropped from the approved cognates`).toContain(code);
    }
  });
});

describe("Physics", () => {
  it("ends sequence A at PHYS UN2601, not PHYS UN1403", () => {
    /*
     * The single most consequential line on the page. PHYS UN1403 is the third
     * term of the *engineering* sequence; the physics major's own sequences A
     * and B both converge on PHYS UN2601. Transcribe UN1403 here and a student
     * following the Bulletin is told to take a course the major does not want.
     */
    const introductory = group(CC_MAJOR_PHYSICS, "introductory-sequence").rule;
    expect(introductory.kind).toBe("sequence_choice");
    if (introductory.kind !== "sequence_choice") return;

    const paths = introductory.sequences.map((sequence) => sequence.courses);
    expect(paths).toContainEqual(["PHYS UN1401", "PHYS UN1402", "PHYS UN2601"]);
    expect(paths).toContainEqual(["PHYS UN1601", "PHYS UN1602", "PHYS UN2601"]);
    expect(namedCodes(group(CC_MAJOR_PHYSICS, "introductory-sequence"))).not.toContain(
      "PHYS UN1403",
    );
  });

  it("selects electives by an include list, never by a numeric shape", () => {
    /*
     * The elective block's escape hatch is "4000- or 6000-level courses in this
     * or another science department, with the DUS's permission". Written as a
     * numberRange over PHYS it swallows the required PHYS GU4021, GU4022 and
     * GU4023 — the quantum core — and the elective block goes green on
     * coursework the core already claimed.
     */
    const electives = group(CC_MAJOR_PHYSICS, "physics-electives").rule;
    expect(electives.kind).toBe("n_matching");
    if (electives.kind !== "n_matching") return;

    expect(electives.select.subjects).toBeUndefined();
    expect(electives.select.numberRange).toBeUndefined();
    expect(electives.select.include).toBeDefined();
    for (const required of ["PHYS GU4021", "PHYS GU4022", "PHYS GU4023"]) {
      expect(electives.select.include).not.toContain(required);
    }
  });

  it("keeps the intermediate laboratory attested", () => {
    // Two independent reasons, either of which is enough: the requirement is
    // stated as a points floor the page never prices, and `student_courses` can
    // hold a repeatable laboratory course only once ever.
    expect(group(CC_MAJOR_PHYSICS, "intermediate-laboratory").rule.kind).toBe("attested");
  });

  it("keeps differential equations, linear algebra and complex variables as three groups", () => {
    // Three separate one-of-two choices, not one pooled n_of: a student who
    // took two linear algebra courses and no ODE course would otherwise be
    // shown two requirements satisfied.
    for (const id of ["differential-equations", "linear-algebra", "complex-variables"]) {
      const rule = group(CC_MAJOR_PHYSICS, id).rule;
      expect(rule.kind).toBe("n_of");
      if (rule.kind !== "n_of") continue;
      expect(rule.n).toBe(1);
      expect(rule.courses).toHaveLength(2);
    }
  });
});

describe("Statistics", () => {
  it("accepts Honors Mathematics A and B as a complete prerequisite route", () => {
    /*
     * The honors route is a bullet UNDER the table with no footnote marker —
     * the page has zero <sup> elements — so it is invisible to anyone reading
     * the table alone. An `all_of` over the printed four fails every honors
     * student; an `n_of { n: 4 }` over the union passes UN1101 + UN1102 +
     * UN1207 + UN1201, which is four courses and no completed route.
     */
    const prerequisite = group(CC_MAJOR_STATISTICS, "mathematics-prerequisite").rule;
    expect(prerequisite.kind).toBe("sequence_choice");
    if (prerequisite.kind !== "sequence_choice") return;
    expect(prerequisite.sequences.map((sequence) => sequence.courses)).toContainEqual([
      "MATH UN1207",
      "MATH UN1208",
    ]);
  });

  it("does not offer MATH UN1205, which this major's page never names", () => {
    // The department accepts Accelerated Multivariable Calculus for Data
    // Science, Economics-Statistics and Mathematics-Statistics. Not for this
    // major, on this page. Importing it from a neighbouring program would
    // invent a route.
    expect(namedCodes(group(CC_MAJOR_STATISTICS, "mathematics-prerequisite"))).not.toContain(
      "MATH UN1205",
    );
  });

  it("asks for three advanced electives, not five", () => {
    /*
     * The 2026-2027 edition prints a contradictory row reading "Five courses
     * chosen from Statistics courses numbered from GU4207 through GU4293". Four
     * independent things say three: the block's own header, the major's
     * 14-course total, the Overview tab, and the 2025-2026 archived edition,
     * which lacks the offending row entirely.
     */
    const electives = group(CC_MAJOR_STATISTICS, "advanced-electives").rule;
    expect(electives.kind).toBe("attested");
    if (electives.kind !== "attested") return;
    expect(electives.note).toMatch(/Three advanced courses/);
    expect(electives.note).toMatch(/three is what this audit asks for/);
  });

  it("checks the one decidable clause of the elective sentence", () => {
    // "At least one … numbered between 4221 and 4291" is a transcribed floor
    // with both endpoints from the Bulletin, and it is disjoint from every
    // other group in the program — so it is checkable where the rest is not.
    const elective = group(CC_MAJOR_STATISTICS, "statistics-elective").rule;
    expect(elective.kind).toBe("n_matching");
    if (elective.kind !== "n_matching") return;
    expect(elective.select.subjects).toEqual(["STAT"]);
    expect(elective.select.numberRange).toEqual([4221, 4291]);
  });

  it("requires STAT UN1201 outright, with no 'or higher' imported from Economics", () => {
    // The Economics department's "STAT UN1201, or a higher level course"
    // phrasing does not appear on this page, and a 5 on the AP Statistics exam
    // explicitly does not exempt a student here.
    const prerequisite = group(CC_MAJOR_STATISTICS, "statistics-prerequisite");
    expect(prerequisite.rule.kind).toBe("all_of");
    expect(namedCodes(prerequisite)).toEqual(["STAT UN1201"]);
    expect(toCourseId("STAT UN1201")).not.toBeNull();
  });
});
