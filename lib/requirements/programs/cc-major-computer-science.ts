/**
 * The Columbia College major in Computer Science.
 *
 * Transcribed by hand from the six `sc_courselist` tables under "Major in
 * Computer Science" on the CS department page, captured verbatim in
 * `lib/ingest/__fixtures__/bulletin-cs.html`. This is the golden program that
 * `lib/ingest/parsers/requirements.test.ts` checks the CourseLeaf parser
 * against, so it is worth being exact rather than approximate.
 *
 * ── What the source page looks like, and why the groups split the way they do ─
 *
 * The page nests requirements two levels deep. One `<h*>` heading —
 * "Mathematics Requirement (6-11 points)" — owns THREE separate tables, each
 * with its own `areaheader` row naming a sub-requirement:
 *
 *   Mathematics Requirement (6-11 points)          ← heading, carries the points
 *     table 1  "Calculus Requirement: Select one of the following courses:"
 *     table 2  "Linear Algebra Requirement: Select one of the following:"
 *     table 3  "Probability / Statistics Requirement: Select one of the…"
 *
 * So the audit unit is the *areaheader*, not the heading and not the table.
 * Flattening to one "Mathematics" group would let a student satisfy it three
 * times over with three calculus courses.
 *
 * ── Traps transcribed deliberately ──────────────────────────────────────────
 *
 * 1. **`MATH UN2015` is in two groups on purpose.** The Bulletin's own note:
 *    "Math 2015 Linear Algebra and Probability may simultaneously satisfy both
 *    linear algebra and probability requirements". This is the one place the
 *    department publishes an explicit double-count permission, so it is the one
 *    place `crossCountedCourseIds` reporting a cross-count is expected rather
 *    than a warning. The note is carried on both groups so the UI can say so.
 *
 * 2. **`or COMS W1007` rows.** The Bulletin renders alternatives as a following
 *    row prefixed "or". `COMS W1004` / `COMS W1007` and `COMS W3134` /
 *    `COMS W3137` are each one requirement with two ways to satisfy it, not two
 *    requirements — hence `n_of` with `n: 1` rather than `all_of`.
 *
 * 3. **The pre-intro course is not a requirement.** `ENGI E1006` is printed
 *    "(recommended but not required)". It is not encoded at all. A requirement
 *    that does not exist is the easiest kind to get wrong.
 *
 * 4. **Cross-listed codes are kept as the Bulletin prints them.** `CSEE W3827`,
 *    `CSOR E4231`, `CBMF W4761` are not COMS courses and normalizing them to
 *    COMS would make them unmatchable.
 *
 * NOT ENCODED: the "Overlapping courses", "Double Counting" and "D Grades"
 * restriction sections. They are prose rules about how the groups below
 * interact, they need grades and a declared second major to apply, and we have
 * neither. The UI links to them instead.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/computer-science/";

/**
 * The Area Foundation list, verbatim from the Bulletin's table. Shared by the
 * foundation group and the elective group, because electives are drawn from
 * the same pool plus anything else at the right level.
 */
const AREA_FOUNDATION = [
  "COMS W4111",
  "COMS W4113",
  "COMS W4115",
  "COMS W4118",
  "COMS W4119",
  "COMS W4152",
  "COMS W4156",
  "COMS W4160",
  "COMS W4167",
  "COMS W4170",
  "COMS W4181",
  "CSOR E4231",
  "COMS W4236",
  "COMS W4701",
  "COMS W4705",
  "COMS W4731",
  "COMS W4733",
  "CBMF W4761",
  "COMS W4771",
  "CSEE W4824",
  "CSEE W4868",
];

export const CC_MAJOR_COMPUTER_SCIENCE: Program = {
  id: "cc-major-computer-science",
  kind: "major",
  school: "CC",
  name: "Computer Science",
  department: "Computer Science",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "calculus",
      label: "Calculus",
      note: "Select one. MATH UN1201 requires Calculus I but not Calculus II; MATH UN1205 and APMA E2000 require both.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["MATH UN1201", "MATH UN1205", "APMA E2000"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "linear-algebra",
      label: "Linear Algebra",
      note: "Select one. COMS W3251 is the department's recommendation.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: [
          "COMS W3251",
          "MATH UN2010",
          "MATH UN2015",
          "MATH UN2020",
          "APMA E2101",
          "APMA E3101",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "probability-statistics",
      label: "Probability / Statistics",
      note: "Select one. MATH UN2015 may satisfy this and the linear algebra requirement at the same time — the department says so explicitly.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["MATH UN2015", "IEOR E3658", "STAT UN1201", "STAT GU4001"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "intro-programming",
      label: "Introductory Programming",
      note: "COMS W1004, or COMS W1007 for students with prior experience.",
      rule: { kind: "n_of", n: 1, courses: ["COMS W1004", "COMS W1007"] },
      sourceUrl: SOURCE,
    },
    {
      id: "data-structures",
      label: "Data Structures",
      note: "COMS W3134, or the honors sequence COMS W3137.",
      rule: { kind: "n_of", n: 1, courses: ["COMS W3134", "COMS W3137"] },
      sourceUrl: SOURCE,
    },
    {
      id: "core-sequence",
      label: "Computer Science Core",
      note: "Advanced Programming, Discrete Mathematics, Computer Science Theory, and Fundamentals of Computer Systems. All four required.",
      rule: {
        kind: "all_of",
        courses: ["COMS W3157", "COMS W3203", "COMS W3261", "CSEE W3827"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "area-foundation",
      label: "Area Foundation",
      note: "Three courses (9–12 points) from the department's area foundation list.",
      rule: { kind: "n_of", n: 3, courses: AREA_FOUNDATION },
      sourceUrl: SOURCE,
    },
    {
      id: "electives",
      label: "Computer Science Electives",
      /*
       * `points_matching`, not `n_of`, and the difference is not cosmetic. The
       * Bulletin states this one in points (9–12) precisely because the courses
       * that satisfy it are variable-credit: a 1-point COMS W3998 project and a
       * 3-point seminar are both electives and counting them as "one course"
       * each would let a student reach the requirement three points short.
       *
       * The selector is deliberately wide — any COMS/CSEE/CSOR/CBMF course at
       * 3000 or above — because the Bulletin's elective rule is a level rule,
       * not a list. The 1000- and 2000-level exclusion is what keeps intro
       * courses from counting twice.
       */
      note: "9–12 points of COMS, CSEE, CSOR or CBMF coursework at the 3000 level or above, beyond the courses used for the core and area foundation.",
      rule: {
        kind: "points_matching",
        points: 9,
        select: {
          subjects: ["COMS", "CSEE", "CSOR", "CBMF"],
          numberRange: [3000, 9999],
        },
      },
      sourceUrl: SOURCE,
    },
  ],
};
