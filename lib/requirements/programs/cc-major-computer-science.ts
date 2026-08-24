/**
 * The Columbia College major in Computer Science.
 *
 * Transcribed by hand from the six `sc_courselist` tables under "Major in
 * Computer Science" on the CS department page, captured verbatim in
 * `lib/ingest/__fixtures__/bulletin-cs.html`. This is the golden program that
 * `lib/requirements/requirements.test.ts` checks the CourseLeaf parser
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
 * 4. **Cross-listed codes are kept as the Bulletin prints them, with one
 *    exception.** `CSEE W3827`, `CSOR E4231` and `CBMF W4761` are not COMS
 *    courses and normalizing them to COMS would make them unmatchable. The
 *    exception is `COMS W4119`; see the Area Foundation list below.
 *
 * ── What the Bulletin's restrictions add, and what they cannot ──────────────
 *
 * The department's Restrictions section carries two sentences that ARE
 * decidable from a course code, and they are now encoded on the elective
 * selector: "COMS W1005 and COMS W3136 cannot be counted towards the Computer
 * Science major, minor, and concentration" and "COMS W3999 Fieldwork cannot be
 * used as a CS Elective". Without them a student's Essential Data Structures —
 * a 4-point 3000-level COMS course, and one the department will not accept
 * anywhere in the major — was counting for a third of the elective block.
 *
 * NOT ENCODED, because each is a constraint across a student's selections
 * rather than a property of any one course, and several need grades or a
 * declared second program we do not have: the "Overlapping courses" pairs
 * (W1004/W1005, W3134/W3136/W3137); the 6-point cap on project and thesis
 * courses (COMS W3902, W3998, W4901); the "no more than one course from each
 * set" rules (IEOR E3658/STAT UN1201/MATH UN2015; MATH UN2015/MATH UN2010/
 * APMA E3101/COMS W3251; COMS W4771/COMS W4721); the four-transfer-course cap;
 * the Double Counting list; and the one-D allowance. The UI links to them.
 *
 * Also not encoded: the elective rule's "worth at least 3 points" floor.
 * `CourseSelector` has no minimum-points field. The block is `points_matching`
 * rather than a course count, so a 1-point course contributes 1 point and not a
 * whole elective — which is the same protection by a different route. The CS
 * minor, whose slots are counted as courses, does not get that protection; see
 * the note there.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/computer-science/";

/**
 * The Area Foundation list, from the Bulletin's table.
 *
 * One code is NOT as the page prints it. The College page writes
 * `COMS W4119` for Computer Networks; the registrar — and the Engineering
 * school's own page for the same course — writes `CSEE W4119`, and `COMS W4119`
 * does not exist. Transcribing the misprint faithfully, which this file did
 * until 2026-08-24, made the option dead: a College computer science student
 * who took Computer Networks got no Area Foundation credit for it and no
 * explanation, because a named course that never matches is indistinguishable
 * from a course you have not taken.
 *
 * So the rule carries the spelling that matches and the note carries the
 * spelling the page prints. `sourceUrl` still points at the page, and a student
 * checking this file against it will find the discrepancy written down rather
 * than reproduced.
 */
const AREA_FOUNDATION = [
  "COMS W4111",
  "COMS W4113",
  "COMS W4115",
  "COMS W4118",
  // The Bulletin prints "COMS W4119". See the comment above.
  "CSEE W4119",
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
      note: "Three courses (9–12 points) from the department's area foundation list. The Bulletin prints Computer Networks as COMS W4119; the registrar's code is CSEE W4119, which is what is matched here. CBMF W4761 Computational Genomics is offered too rarely to appear in our catalog, so it will not match automatically.",
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
      note: "9–12 points of COMS, CSEE, CSOR or CBMF coursework at the 3000 level or above, beyond the courses used for the core and area foundation. Barnard's 3000-level COMS courses count, and are matched. COMS W3136 and COMS W3999 are excluded by the department's own restrictions. The Bulletin also accepts jointly-offered subjects beyond these four ('CSXX or XXCS, excluding CSER'), which is a naming pattern rather than a list, so a course under some other cross-listed prefix will not be matched automatically.",
      rule: {
        kind: "points_matching",
        points: 9,
        select: {
          subjects: ["COMS", "CSEE", "CSOR", "CBMF"],
          numberRange: [3000, 9999],
          /*
           * The department's Restrictions section, which the elective rule
           * itself does not repeat: "COMS W1005 and COMS W3136 cannot be
           * counted towards the Computer Science major, minor, and
           * concentration" and "COMS W3999 Fieldwork cannot be used as a CS
           * Elective."
           *
           * COMS W3136 is the one that mattered — a 4-point 3000-level COMS
           * course sitting in our catalog, matched by every part of the shape
           * above, and refused by the department. COMS W1005 is 1000-level and
           * out of range already; COMS W3999 is not currently in the catalog.
           * Both are named anyway, because the cost of naming a code that never
           * matches is nothing and the cost of the catalog gaining one later is
           * a silent over-count.
           */
          exclude: ["COMS W3136", "COMS W3999"],
          // Same vacuous-requirement bug as the SEAS major, same fix; see the
          // long note there. `cc-major-economics` already excluded its required
          // coursework, so this brings the two into agreement rather than
          // inventing a new rule.
          excludeGroups: [
            "data-structures",
            "core-sequence",
            "area-foundation",
            /*
             * `linear-algebra` and `probability-statistics` are here because
             * COMS W3251 is one of the linear-algebra options and IEOR E3658
             * one of the statistics options — both are matched by this
             * selector, so a student who satisfied linear algebra with the
             * COMS course was silently getting three elective points for it.
             * Missed on the first pass of this fix and found by the
             * program-wide vacuity audit (2026-08-24).
             */
            "linear-algebra",
            "probability-statistics",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
  ],
};
