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
import { SEAS_MAJOR_APPLIED_MATHEMATICS } from "./seas-major-applied-mathematics";
import { SEAS_MAJOR_BIOMEDICAL_ENGINEERING } from "./seas-major-biomedical-engineering";
import { SEAS_MAJOR_CHEMICAL_ENGINEERING } from "./seas-major-chemical-engineering";
import { SEAS_MAJOR_COMPUTER_ENGINEERING } from "./seas-major-computer-engineering";
import { SEAS_MAJOR_COMPUTER_SCIENCE } from "./seas-major-computer-science";
import { SEAS_MAJOR_ELECTRICAL_ENGINEERING } from "./seas-major-electrical-engineering";
import { SEAS_MAJOR_MECHANICAL_ENGINEERING } from "./seas-major-mechanical-engineering";
import { SEAS_MAJOR_OPERATIONS_RESEARCH } from "./seas-major-operations-research";

/** Every SEAS major. A student holds exactly one of these plus `seas-core`. */
const SEAS_MAJORS = [
  ["seas-major-computer-science", SEAS_MAJOR_COMPUTER_SCIENCE],
  ["seas-major-biomedical-engineering", SEAS_MAJOR_BIOMEDICAL_ENGINEERING],
  ["seas-major-mechanical-engineering", SEAS_MAJOR_MECHANICAL_ENGINEERING],
  ["seas-major-operations-research", SEAS_MAJOR_OPERATIONS_RESEARCH],
  ["seas-major-electrical-engineering", SEAS_MAJOR_ELECTRICAL_ENGINEERING],
  ["seas-major-computer-engineering", SEAS_MAJOR_COMPUTER_ENGINEERING],
  ["seas-major-chemical-engineering", SEAS_MAJOR_CHEMICAL_ENGINEERING],
  ["seas-major-applied-mathematics", SEAS_MAJOR_APPLIED_MATHEMATICS],
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
    // Added 2026-08-26 with the four new majors, on the same reasoning.
    ["seas-major-electrical-engineering", SEAS_MAJOR_ELECTRICAL_ENGINEERING, "COMS W3137"],
    ["seas-major-computer-engineering", SEAS_MAJOR_COMPUTER_ENGINEERING, "COMS W1007"],
    ["seas-major-computer-engineering", SEAS_MAJOR_COMPUTER_ENGINEERING, "SIEO W3600"],
    /*
     * `COMS W3561` is a harder case than the rest and is kept for a different
     * reason. It is not merely absent from our four-term catalog — it returns an
     * empty record from the Bulletin's OWN course endpoint, so it is not a
     * course anywhere in the Bulletin. Both the HTML page and the PDF chart
     * print it, so the error is upstream of CourseLeaf, and it is almost
     * certainly a typo for `COMS W3251` COMPUTATIONAL LINEAR ALGEBRA — which is
     * the linear-algebra option on two other SEAS pages. Kept as printed;
     * `COMS W3251` deliberately NOT added, because that would be an inference
     * dressed as a transcription.
     */
    ["seas-major-applied-mathematics", SEAS_MAJOR_APPLIED_MATHEMATICS, "COMS W3561"],
  ] as const)("%s still offers %s", (_id, program, code) => {
    const courseId = toCourseId(code);
    expect(courseId, `${code} is not even a parseable code`).toBeTruthy();
    expect(namedIds(program).has(courseId!)).toBe(true);
  });

  it("seas-major-chemical-engineering still offers CHEM UN2543", () => {
    /*
     * Asserted separately rather than in the table above, because this one is
     * named inside a `points_matching` selector's `include` list and `namedIds`
     * deliberately only reads codes a rule names outright — that helper exists
     * to spot duplicates between the Core and a major, and a selector is not
     * where a duplicate hides.
     */
    const laboratory = SEAS_MAJOR_CHEMICAL_ENGINEERING.groups.find(
      (candidate) => candidate.id === "advanced-natural-science-laboratory",
    )!;
    if (laboratory.rule.kind !== "points_matching") throw new Error("expected points_matching");
    expect(laboratory.rule.select.include).toContain("CHEM UN2543");
  });
});

describe("Electrical and Computer Engineering are twins that differ in eight places", () => {
  /*
   * The two pages are structurally almost identical and the temptation to
   * unify them — or to write the second by copying the first — is exactly what
   * these tests exist to stop. Every divergence below was read off both live
   * Bulletin pages on 2026-08-26, and each is printed on both pages rather than
   * absent from one, so none of them is an editing slip.
   */

  it("Electrical Engineering runs three physics terms and Computer Engineering two", () => {
    /*
     * `PHYS UN1403` and `PHYS UN2601` appear nowhere on the Computer
     * Engineering page — not in either grid, not in the PDF chart, not among
     * its course anchors. Where EE puts a third physics lecture in the third
     * slot, Computer Engineering puts the laboratory.
     */
    const ee = SEAS_MAJOR_ELECTRICAL_ENGINEERING.groups.find((g) => g.id === "physics")!;
    const compe = SEAS_MAJOR_COMPUTER_ENGINEERING.groups.find((g) => g.id === "physics")!;
    expect(ee.rule.kind).toBe("sequence_choice");
    expect(compe.rule.kind).toBe("sequence_choice");
    if (ee.rule.kind !== "sequence_choice" || compe.rule.kind !== "sequence_choice") return;

    expect(ee.rule.sequences.map((s) => s.courses)).toContainEqual([
      "PHYS UN1401",
      "PHYS UN1402",
      "PHYS UN1403",
    ]);
    for (const sequence of compe.rule.sequences) {
      expect(sequence.courses).toHaveLength(2);
    }
    expect(namedIds(SEAS_MAJOR_COMPUTER_ENGINEERING).has(toCourseId("PHYS UN1403")!)).toBe(false);
  });

  it("Electrical Engineering bars STAT GU4001 from probability and Computer Engineering allows it", () => {
    /*
     * EE's footnote: "A course such as STAT GU4001 cannot generally be used to
     * replace IEOR E3658 or STAT GU4203." Computer Engineering's, on the same
     * requirement: STAT GU4001 "can be used instead of IEOR E3658", with only a
     * warning about later prerequisites. Both are correct as printed; do not
     * reconcile them.
     */
    const stat4001 = toCourseId("STAT GU4001")!;
    const ee = SEAS_MAJOR_ELECTRICAL_ENGINEERING.groups.find((g) => g.id === "probability")!;
    const compe = SEAS_MAJOR_COMPUTER_ENGINEERING.groups.find((g) => g.id === "probability")!;
    expect(namedCodes(ee).map(toCourseId)).not.toContain(stat4001);
    expect(namedCodes(compe).map(toCourseId)).toContain(stat4001);
  });

  it("neither degree accepts the shared five-course laboratory list", () => {
    /*
     * `seas-major-computer-science` and `seas-major-operations-research` use
     * ["PHYS UN1494", "PHYS UN3081", "CHEM UN1500", "CHEM UN1507",
     * "CHEM UN3085"]. `CHEM UN1507` and `CHEM UN3085` are printed on neither of
     * these two pages, and widening the list would accept courses the
     * departments never offered.
     */
    for (const major of [SEAS_MAJOR_ELECTRICAL_ENGINEERING, SEAS_MAJOR_COMPUTER_ENGINEERING]) {
      const laboratory = major.groups.find((g) => g.id === "science-laboratory")!;
      const codes = namedCodes(laboratory);
      expect(codes).toHaveLength(3);
      expect(codes).not.toContain("CHEM UN1507");
      expect(codes).not.toContain("CHEM UN3085");
    }
  });

  it("Computer Engineering requires ENGI E1006 AND a Java course; every other major treats them as alternatives", () => {
    /*
     * The PDF chart's computer science row is unambiguous: ENGI E1006 in
     * semester I, COMS W1004 or W1007 in semester II, COMS W3203 later. Three
     * separate computing requirements. Fold the Java course into
     * `engineering-foundations` as an alternative — the way MechE and IEOR do —
     * and a complete student is shown two unmet requirements.
     */
    const foundations = SEAS_MAJOR_COMPUTER_ENGINEERING.groups.find(
      (g) => g.id === "engineering-foundations",
    )!;
    const java = SEAS_MAJOR_COMPUTER_ENGINEERING.groups.find((g) => g.id === "intro-programming")!;
    expect(namedCodes(foundations)).toContain("ENGI E1006");
    expect(java.rule.kind).toBe("n_of");
    expect(namedCodes(java)).toEqual(["COMS W1004", "COMS W1007"]);
    expect(namedCodes(java)).not.toContain("ENGI E1006");
  });

  it("Electrical Engineering has five laboratories and a capstone; Computer Engineering has four and none", () => {
    const eeLabs = SEAS_MAJOR_ELECTRICAL_ENGINEERING.groups.find((g) => g.id === "ee-laboratories")!;
    const compeLabs = SEAS_MAJOR_COMPUTER_ENGINEERING.groups.find((g) => g.id === "ce-laboratories")!;
    expect(namedCodes(eeLabs)).toHaveLength(5);
    expect(namedCodes(eeLabs)).toContain("ELEN E3043");
    expect(namedCodes(compeLabs)).toHaveLength(4);
    expect(namedCodes(compeLabs)).not.toContain("ELEN E3043");

    expect(SEAS_MAJOR_ELECTRICAL_ENGINEERING.groups.map((g) => g.id)).toContain("senior-design");
    expect(SEAS_MAJOR_COMPUTER_ENGINEERING.groups.map((g) => g.id)).not.toContain("senior-design");
  });

  it("Computer Engineering's applied-mathematics footnote is one branch wider than Electrical Engineering's", () => {
    // The two footnotes read almost word for word the same. Computer
    // Engineering adds COMS W3251; EE does not offer it.
    const ee = SEAS_MAJOR_ELECTRICAL_ENGINEERING.groups.find(
      (g) => g.id === "applied-mathematics",
    )!;
    const compe = SEAS_MAJOR_COMPUTER_ENGINEERING.groups.find(
      (g) => g.id === "applied-mathematics",
    )!;
    expect(namedCodes(ee)).not.toContain("COMS W3251");
    expect(namedCodes(compe)).toContain("COMS W3251");
    // And neither carries MechE's MATH UN3027 branch, which is MechE's alone.
    expect(namedCodes(ee)).not.toContain("MATH UN3027");
    expect(namedCodes(compe)).not.toContain("MATH UN3027");
  });
});

describe("Applied Mathematics hides four one-for-one substitutions in one footnote", () => {
  /*
   * The single biggest error available on that page. The grid prints six
   * APMA/MATH core courses as flat rows; footnote 5 substitutes a Mathematics
   * Department course for four of them. Transcribed as one `all_of` over the
   * six — which is exactly what the grid looks like — a student who took
   * MATH UN2010, MATH UN3028, MATH UN3007 and MATH UN2500, every one of them
   * explicitly blessed by the Bulletin, fails FOUR requirements at once.
   */
  it.each([
    ["linear-algebra", "MATH UN2010"],
    ["partial-differential-equations", "MATH UN3028"],
    ["complex-variables", "MATH UN3007"],
    ["analysis", "MATH UN2500"],
  ] as const)("%s accepts %s in place of the APAM course", (groupId, substitute) => {
    const requirement = SEAS_MAJOR_APPLIED_MATHEMATICS.groups.find((g) => g.id === groupId)!;
    expect(requirement.rule.kind).toBe("n_of");
    expect(namedCodes(requirement)).toContain(substitute);
  });

  it("keeps APMA E4300 and APMA E4101 as an all_of, because footnote 5 does not touch them", () => {
    // The tell that the four above are real: the two core rows beside them
    // carry no footnote marker at all.
    const core = SEAS_MAJOR_APPLIED_MATHEMATICS.groups.find(
      (g) => g.id === "applied-mathematics-core",
    )!;
    expect(core.rule.kind).toBe("all_of");
    expect(namedCodes(core)).toEqual(["APMA E4300", "APMA E4101"]);
  });

  it("excludes every named group from the MATH/APMA/STAT elective, or it is vacuous", () => {
    /*
     * Every required course in this major except ENGI E1006, ENGI E1102, the
     * physics block and the chemistry-or-biology course is a MATH, APMA or STAT
     * course. Without exclusions, a student who took exactly the prescribed
     * curriculum and not one extra course scores 3 of 3 — the `cs-electives` bug
     * of 2026-08-24, reproduced. `probability` and `applied-probability` are the
     * two that were missed on the first pass of that fix.
     */
    const elective = SEAS_MAJOR_APPLIED_MATHEMATICS.groups.find(
      (g) => g.id === "math-apma-stat-elective",
    )!;
    expect(elective.rule.kind).toBe("points_matching");
    if (elective.rule.kind !== "points_matching") return;

    const excluded = new Set(elective.rule.select.excludeGroups ?? []);
    const mathish = SEAS_MAJOR_APPLIED_MATHEMATICS.groups.filter((candidate) =>
      namedCodes(candidate).some((code) => /^(MATH|APMA|STAT) /.test(code)),
    );
    for (const candidate of mathish) {
      expect(excluded.has(candidate.id), `${candidate.id} is not excluded`).toBe(true);
    }
  });

  it("keeps PHYS UN3081 in the laboratory group and out of physics sequence 3", () => {
    // It sits in the sequence-3 slot of semester III, but it is a laboratory.
    // Listing it in both would be one course paying for two requirements
    // evaluated independently, inside a single file.
    const physics = SEAS_MAJOR_APPLIED_MATHEMATICS.groups.find((g) => g.id === "physics")!;
    const laboratory = SEAS_MAJOR_APPLIED_MATHEMATICS.groups.find(
      (g) => g.id === "physics-laboratory",
    )!;
    expect(namedCodes(physics)).not.toContain("PHYS UN3081");
    expect(namedCodes(laboratory)).toContain("PHYS UN3081");
  });

  it("encodes the transfer student's PHYS BC3001 route as its own branch", () => {
    // Footnote 2. A per-term alternative has no home in a rule whose branches
    // are whole course lists — the same handling MechE gives its footnote 3.
    const physics = SEAS_MAJOR_APPLIED_MATHEMATICS.groups.find((g) => g.id === "physics")!;
    if (physics.rule.kind !== "sequence_choice") throw new Error("expected sequence_choice");
    expect(physics.rule.sequences.map((s) => s.courses)).toContainEqual([
      "PHYS UN1401",
      "PHYS UN1402",
      "PHYS BC3001",
    ]);
  });

  it("requires both seminars, including the 0-point junior one", () => {
    /*
     * A deliberate departure from how the other SEAS files treat 0-point
     * courses. APMA E2001 and ECON UN1155 are recitations welded to a lecture
     * with an ampersand and are noted rather than required; APMA E4901 is a
     * standalone course registered for in a different year, and the Curriculum
     * tab says students are "required to register for … during both".
     */
    const seminars = SEAS_MAJOR_APPLIED_MATHEMATICS.groups.find((g) => g.id === "seminars")!;
    expect(seminars.rule.kind).toBe("all_of");
    expect(namedCodes(seminars)).toEqual(["APMA E4901", "APMA E4903"]);
  });
});

describe("Chemical Engineering's chemistry is a sequence, and its laboratories are three", () => {
  it("runs chemistry as a three-branch sequence into organic chemistry", () => {
    /*
     * Eight codes across three semesters. Written as `n_of { n: 3 }` it would
     * accept CHEM UN1403 + CHEM UN1507 + CHEM UN2046 — the first term of
     * sequence 1 welded to two terms of sequence 3, a registrable schedule that
     * completes no sequence — and CHEM UN1604 + CHEM UN2443 + CHEM UN1500,
     * which skips the intensive laboratory entirely.
     */
    const chemistry = SEAS_MAJOR_CHEMICAL_ENGINEERING.groups.find((g) => g.id === "chemistry")!;
    expect(chemistry.rule.kind).toBe("sequence_choice");
    if (chemistry.rule.kind !== "sequence_choice") return;
    expect(chemistry.rule.sequences.map((s) => s.courses)).toEqual([
      ["CHEM UN1403", "CHEM UN1500", "CHEM UN1404", "CHEM UN2443"],
      ["CHEM UN1604", "CHEM UN1507", "CHEM UN2443"],
      ["CHEM UN2045", "CHEM UN2046", "CHEM UN1507"],
    ]);
  });

  it("keeps the chemistry laboratory out of the physics laboratory group", () => {
    /*
     * Copying the five-option `science-laboratory` list here would let a
     * student satisfy this requirement with the very chemistry laboratory their
     * chemistry sequence already required — one course paying for two.
     */
    const laboratory = SEAS_MAJOR_CHEMICAL_ENGINEERING.groups.find(
      (g) => g.id === "physics-laboratory",
    )!;
    expect(namedCodes(laboratory)).toEqual(["PHYS UN1494", "PHYS UN3081"]);
  });

  it("prices the advanced natural-science laboratory in points, not courses", () => {
    /*
     * Two of the seven options are 1.5-point half-laboratories against a
     * 3-point total. `n_of { n: 1 }` would go green on half a requirement;
     * `n_of { n: 2 }` would refuse a student who took the single 3-point
     * CHEM UN3085.
     */
    const laboratory = SEAS_MAJOR_CHEMICAL_ENGINEERING.groups.find(
      (g) => g.id === "advanced-natural-science-laboratory",
    )!;
    expect(laboratory.rule.kind).toBe("points_matching");
    if (laboratory.rule.kind !== "points_matching") return;
    expect(laboratory.rule.points).toBe(3);
    // Include-only: the selector matches its include list and nothing else.
    expect(laboratory.rule.select.subjects).toBeUndefined();
    expect(laboratory.rule.select.numberRange).toBeUndefined();
    expect(laboratory.rule.select.include).toHaveLength(7);
  });

  it("does not require a linear algebra course twice", () => {
    // MechE's five-branch `applied-mathematics` group trades APMA E2101 against
    // a PAIR of courses. ChemE's ODE requirement is a flat one-of-two, and its
    // linear algebra lives in the separate math elective.
    const ode = SEAS_MAJOR_CHEMICAL_ENGINEERING.groups.find(
      (g) => g.id === "differential-equations",
    )!;
    expect(namedCodes(ode)).toEqual(["MATH UN2030", "APMA E2101"]);
    const elective = SEAS_MAJOR_CHEMICAL_ENGINEERING.groups.find((g) => g.id === "math-elective")!;
    expect(namedCodes(elective)).toContain("MATH UN2010");
  });

  it("does not require ELEN E1201", () => {
    // MechE and BME do; this degree's grid never prints it.
    expect(namedIds(SEAS_MAJOR_CHEMICAL_ENGINEERING).has(toCourseId("ELEN E1201")!)).toBe(false);
  });
});
