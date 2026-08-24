/**
 * The requirements a Columbia College English, History or Psychology student
 * has that an earlier transcription could not see.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 *
 * On 2026-08-24 a SEAS computer science student was shown a degree with no
 * science in it — no physics, no chemistry, no lab, no Art of Engineering.
 * Nothing about either source file looked wrong. `seas-core` said the technical
 * requirements "belong on the department's own program"; the department's
 * program was three hundred well-commented lines that read as complete. The
 * gap was in the seam, and it was invisible from inside either file.
 *
 * The same seam runs through the humanities, in a different place. These three
 * departments publish very little in `sc_courselist` tables and a great deal in
 * prose, and the prose is not all under the heading "Major Requirements". The
 * definition a requirement depends on routinely sits two tabs away from the
 * requirement itself: History numbers its seminars on the Overview tab and
 * counts them on the Requirements tab; Psychology prints `PSYC UN1001` in its
 * requirement block and says three paragraphs earlier that `PSYC UN1021` and
 * `PSYC BC1001` do the same job.
 *
 * So each assertion below pins one row of one Bulletin page that a
 * table-shaped reading of that page missed, and names the page it came from.
 * They are not shape tests. `programs.test.ts` already checks that ids are
 * unique and codes resolve; the point here is that specific *content* survives
 * the next edit.
 */

import { describe, expect, it } from "vitest";

import { toCourseId } from "../code";
import type { Program, RequirementGroup } from "../types";

import { CC_MAJOR_ENGLISH } from "./cc-major-english";
import { CC_MAJOR_HISTORY } from "./cc-major-history";
import { CC_MAJOR_PSYCHOLOGY } from "./cc-major-psychology";

function groupOf(program: Program, id: string): RequirementGroup {
  const group = program.groups.find((candidate) => candidate.id === id);
  expect(group, `${program.id} has no group "${id}"`).toBeDefined();
  return group!;
}

/** Every sentence a group shows a student, wherever the rule kind keeps it. */
function proseOf(group: RequirementGroup): string {
  return [group.note ?? "", group.rule.kind === "attested" ? group.rule.note : ""].join(" ");
}

// ---------------------------------------------------------------------------
// Psychology
// ---------------------------------------------------------------------------

describe("cc-major-psychology covers what is not in the requirement block", () => {
  it("accepts all three introductory courses, not only PSYC UN1001", () => {
    /*
     * "PSYC UN1021 ... is an alternative version of PSYC UN1001 and fulfills
     * the same requirements", and a student without approved transfer credit
     * "must enroll in PSYC UN1001 or PSYC BC1001 to complete this major
     * requirement". Both sentences are on the Requirements tab, above the
     * block that names UN1001 alone. Encoded as `all_of` over UN1001 this
     * group reported UNMET for a student who had finished it.
     */
    const intro = groupOf(CC_MAJOR_PSYCHOLOGY, "introductory-psychology");
    expect(intro.rule.kind).toBe("n_of");
    if (intro.rule.kind !== "n_of") return;
    expect(intro.rule.n).toBe(1);
    expect(intro.rule.courses.map(toCourseId)).toEqual([
      "PSYC1001UN",
      "PSYC1021UN",
      "PSYC1001BC",
    ]);
  });

  it("keeps the two Bulletin courses our catalog has no row for", () => {
    /*
     * PSYC UN1660 and PSYC UN1490 are both real on the Bulletin and both
     * missing from our four covered terms. Dropping an option the Bulletin
     * offers tells a student who took it that it did not count, so they stay —
     * and this test is what stops a future pass from "cleaning them up".
     *
     * The second half of each assertion is the part that makes keeping them
     * safe: neither is the only way to satisfy its group, so the catalog gap
     * cannot make a requirement unsatisfiable.
     */
    const statistics = groupOf(CC_MAJOR_PSYCHOLOGY, "statistics");
    expect(statistics.rule.kind).toBe("n_of");
    if (statistics.rule.kind === "n_of") {
      expect(statistics.rule.courses.map(toCourseId)).toContain("PSYC1660UN");
      expect(statistics.rule.courses.length).toBeGreaterThan(statistics.rule.n + 1);
    }

    const methods = groupOf(CC_MAJOR_PSYCHOLOGY, "research-methods");
    expect(methods.rule.kind).toBe("n_of");
    if (methods.rule.kind === "n_of") {
      expect(methods.rule.courses.map(toCourseId)).toContain("PSYC1490UN");
      expect(methods.rule.courses.length).toBeGreaterThan(methods.rule.n + 1);
    }

    // And the note says so, so the student is not left staring at a course
    // that never turns green with no explanation.
    expect(proseOf(statistics)).toContain("PSYC UN1660");
    expect(proseOf(methods)).toContain("PSYC UN1490");
  });

  it("shows the Columbia-department rule and the checklist deadline", () => {
    /*
     * "At least 6 of the 11 courses must be in the Columbia Psychology
     * Department" and "all students must submit a Major Requirement Checklist
     * prior to the start of their final semester". Neither is coursework, so
     * neither was visible in an audit built from course lists — and a student
     * can fail either one.
     */
    const residency = groupOf(CC_MAJOR_PSYCHOLOGY, "columbia-department-residency");
    expect(residency.rule.kind).toBe("attested");
    expect(proseOf(residency)).toMatch(/6 of the 11/);

    const checklist = groupOf(CC_MAJOR_PSYCHOLOGY, "major-requirement-checklist");
    expect(checklist.rule.kind).toBe("attested");
    expect(proseOf(checklist)).toMatch(/final semester/);
  });

  it("leaves the eleven-course total cumulative", () => {
    /*
     * `vacuity.test.ts` allowlists this group because the Bulletin's eleven are
     * "including everything above". Adding `excludeGroups` here would be a fix
     * to a requirement that is genuinely a total, and would report every
     * psychology major several courses short of a degree they had finished.
     */
    const total = groupOf(CC_MAJOR_PSYCHOLOGY, "eleven-courses");
    expect(total.rule.kind).toBe("n_matching");
    if (total.rule.kind !== "n_matching") return;
    expect(total.rule.n).toBe(11);
    expect(total.rule.select.excludeGroups).toBeUndefined();
    /*
     * Cumulative, but not unbounded: the doctoral programme's PSYC 6000s and
     * 9000s and the School of Professional Studies' PSYC 104 carry the same
     * subject and count toward no undergraduate degree.
     */
    expect(total.rule.select.numberRange).toEqual([1000, 4999]);
  });
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

describe("cc-major-history covers what is not on the Requirements tab", () => {
  it("makes the Plan of Study a requirement rather than a footnote", () => {
    /*
     * "All program course plans are organized through a student's Plan of
     * Study, which is approved by an UNDED advisor." Nine HIST courses without
     * one do not complete this major, and every other group in the file is
     * defined relative to it.
     */
    const plan = groupOf(CC_MAJOR_HISTORY, "plan-of-study");
    expect(plan.rule.kind).toBe("attested");
    expect(proseOf(plan)).toMatch(/UNDED/);
  });

  it("tells the student the seminar number band the Bulletin publishes", () => {
    /*
     * The note used to assert the opposite — that no band exists — which is
     * contradicted twice on the department's own page: "Seminars are numbered
     * at the 3000-level and 4000-level", and "History seminars are numbered at
     * the 3000-level (all undergraduate) or 4000-level (undergraduate and
     * graduate)".
     *
     * The group is still `attested`, deliberately. The same paragraph warns
     * that "some summer courses listed at the 3000 level may be lectures and do
     * not qualify as seminars", and one of the two seminars must be inside the
     * student's specialization, which no course number can express. A counted
     * rule over the band would report both of those students finished.
     */
    const seminars = groupOf(CC_MAJOR_HISTORY, "seminars");
    expect(seminars.rule.kind).toBe("attested");
    const prose = proseOf(seminars);
    expect(prose).toMatch(/3000/);
    expect(prose).toMatch(/4000/);
    expect(prose).not.toMatch(/publishes no number band/);
  });

  it("keeps the nine-course total and the rows that partition it in agreement", () => {
    // 4 specialization + 1 removed in time + 2 removed in space + 2 additional.
    const total = groupOf(CC_MAJOR_HISTORY, "nine-history-courses");
    expect(total.rule.kind).toBe("n_matching");
    if (total.rule.kind === "n_matching") expect(total.rule.n).toBe(9);

    for (const id of [
      "specialization",
      "breadth-removed-in-time",
      "breadth-removed-in-space",
      "additional-history-courses",
    ]) {
      expect(groupOf(CC_MAJOR_HISTORY, id).rule.kind).toBe("attested");
    }
  });
});

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

describe("cc-major-english covers every row of the 2024-5-and-after major", () => {
  it("has a group for each of the Bulletin's nine rows", () => {
    /*
     * The whole published requirement, in the Bulletin's own order. This is the
     * assertion that would have caught the SEAS science block: it fails when a
     * row of the page has no group at all, which is the failure that no amount
     * of reading one file can see.
     */
    expect(CC_MAJOR_ENGLISH.groups.map((group) => group.id)).toEqual([
      "introductory-course",
      "ten-courses",
      "distribution-genres",
      "distribution-geographies",
      "distribution-ethnicity-race",
      "distribution-pre-1700",
      "distribution-1700-1900",
      "distribution-1900-present",
      "capstone",
    ]);
  });

  it("encodes the newer major's period split, not the older major's", () => {
    /*
     * The page prints two English majors. The 2023-4-and-prior one asks for
     * "three courses focused on literature pre-1800"; this one asks for two
     * pre-1700 plus one 1700-1900 plus one 1900-present. Reading the wrong
     * heading is the single easiest mistake available on this page, and it
     * produces a file that looks entirely reasonable.
     */
    expect(proseOf(groupOf(CC_MAJOR_ENGLISH, "distribution-pre-1700"))).toMatch(/Two courses/);
    expect(proseOf(groupOf(CC_MAJOR_ENGLISH, "distribution-pre-1700"))).not.toMatch(/1800/);
    expect(groupOf(CC_MAJOR_ENGLISH, "distribution-ethnicity-race")).toBeDefined();
  });

  it("keeps the ten-course selector inside the undergraduate number band", () => {
    /*
     * Subject alone counted the department's graduate CLEN seminars (CLEN 6475
     * and others in the 6000s) and the School of Professional Studies' ENGL 850
     * toward an undergraduate major that accepts none of them. Barnard's
     * ENGL BC courses sit inside 1000–4999, so the range costs nothing.
     */
    const ten = groupOf(CC_MAJOR_ENGLISH, "ten-courses");
    expect(ten.rule.kind).toBe("n_matching");
    if (ten.rule.kind !== "n_matching") return;
    expect(ten.rule.n).toBe(10);
    expect(ten.rule.select.subjects).toEqual(["ENGL", "CLEN"]);
    expect(ten.rule.select.numberRange).toEqual([1000, 4999]);
    /*
     * And still cumulative — ENGL UN2000 is the first of the ten, not an
     * eleventh course beside them, which is why `vacuity.test.ts` allowlists
     * this group.
     */
    expect(ten.rule.select.excludeGroups).toBeUndefined();
  });
});
