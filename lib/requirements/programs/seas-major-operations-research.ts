/**
 * The Columbia Engineering B.S. in Operations Research (BSOR).
 *
 * Transcribed by hand from the Degree Track tab of
 * https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/industrial-engineering-operations-research/undergraduate-programs/operations-research-bs/
 * (2026–2027 edition).
 *
 * ── This page publishes a PLAN GRID, not requirement tables ─────────────────
 *
 * The IEOR department does not use `sc_courselist` at all for its degree
 * requirements. It uses `sc_plangrid` — an eight-semester schedule, one table
 * per year-pair, where a requirement is a cell in a term. Rows look like:
 *
 *   Semester I    MATH UN1101   CALCULUS I
 *                 Choose one of the following Physics courses depending on
 *                 sequence:
 *                 PHYS UN1401 (Sequence 1)
 *                 PHYS UN1601 (Sequence 2)
 *                 PHYS UN2801 (Sequence 3)
 *
 * `parseRequirementTables` selects `table.sc_courselist` and therefore returns
 * nothing for this page. Everything below was read off the grid by hand, with
 * the term structure dropped: the audit has no notion of "by semester IV" and
 * the Bulletin's "Taking required courses later than the prescribed semester is
 * not permitted" is not encodable, so it is noted rather than checked.
 *
 * ── Where the grid genuinely needs `sequence_choice` ────────────────────────
 *
 * Physics is three parallel two-term sequences and the grid pairs them by
 * number: sequence 1 is `PHYS UN1401`+`PHYS UN1402`, sequence 2 is
 * `PHYS UN1601`+`PHYS UN1602`, sequence 3 is `PHYS UN2801`+`PHYS UN2802`. As
 * `n_of { n: 2 }` over the six, a student could satisfy it with UN1401 and
 * UN1602 — a first term of one sequence and a second term of another, which is
 * a schedule a real student could build and which satisfies no sequence at all.
 * That is exactly the case the comment on `sequence_choice` in `types.ts`
 * describes.
 *
 * `IEOR E2000` gets the same treatment for a different reason: the footnote
 * says it "can be replaced by COMS W3134 Data Structures in Java **and**
 * COMS W4111 Introduction to Databases" — one course or two, so the
 * alternatives are atomic and of different lengths.
 *
 * ── This is the base BSOR, not one of its tracks ────────────────────────────
 *
 * The page also carries three track grids — Analytics, Engineering Management
 * Systems, Financial Engineering — each with a different third/fourth-year
 * course set and a different technical/management elective split. They are
 * available only to the classes of 2027 and 2028 and are closed to the class of
 * 2030, so they are separate programs with an expiry rather than variants of
 * this one, and none of them is encoded here.
 *
 * ── The two elective blocks are `attested` ──────────────────────────────────
 *
 * "15 points total. At least 6 points need to be at least 3000 level with the
 * prefix IEOR, ORCS, or CSOR. The complete list is available at
 * ieor.columbia.edu/undergraduate/electives." The governing list is off-Bulletin
 * and the 15-point block draws on it, so only the 6-point IEOR/ORCS/CSOR floor
 * is a shape we could check — and checking a floor while leaving the ceiling
 * unchecked would report the group satisfied at 6 of 15 points. The management
 * elective block has no list in the Bulletin at all.
 *
 * ── Degree Track coverage, re-verified 2026-08-24 ──────────────────────────
 *
 * Every row of the first/second-year grid and of the third/fourth-year BSOR
 * grid is now accounted for, on this file or on `seas-core` — the Bulletin
 * splits a SEAS degree across two tables and a student does not care which one
 * a requirement came from. Here: `MATH UN1101`, `MATH UN1102`,
 * `APMA E2000`, linear algebra, physics, the chemistry lecture, the
 * chemistry-or-physics laboratory, computing, `IEOR E2000`, `ENGI E1102`,
 * `IEOR E3658`, the eight required operations research courses, and the two
 * elective blocks. On `seas-core`: `ENGL CC1010`, the nontechnical
 * requirement, Art or Music Humanities, `ECON UN1105`, physical education,
 * the nontechnical electives.
 *
 * `ECON UN1105` used to be in `engineering-foundations` below and was removed:
 * `seas-core` already carries it, and two independently evaluated copies of one
 * requirement can disagree on screen.
 *
 * NOT ENCODED: the 128-point degree total (recorded on `seas-core`), the
 * semester ordering, the technical/management elective lists, and the
 * 27-point nontechnical requirement, which is `seas-core` and is deliberately
 * not repeated here. 0-point recitations that the grid welds to their lecture
 * with an ampersand — `APMA E2001` beside `APMA E2000`, `ECON UN1155` beside
 * `ECON UN1105` — are named in notes rather than required, because a record
 * that shows only the graded lecture is the normal case and requiring the
 * recitation would report a finished requirement as unmet.
 *
 * NOT IN OUR CATALOG, and kept anyway: `COMS W3251` COMPUTATIONAL LINEAR
 * ALGEBRA, which footnote 1 offers as one of the three ways to satisfy linear
 * algebra. The Bulletin prints that code — `seas-major-computer-science` offers
 * it too — so the gap is ours: our catalog covers four terms and this course
 * ran in none of them. Dropping an option the Bulletin offers would tell a
 * student who took it that it did not count.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/industrial-engineering-operations-research/undergraduate-programs/operations-research-bs/#degreetracktextcontainer";

export const SEAS_MAJOR_OPERATIONS_RESEARCH: Program = {
  id: "seas-major-operations-research",
  kind: "major",
  school: "SEAS",
  name: "Operations Research",
  department: "Industrial Engineering and Operations Research",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "calculus",
      label: "Calculus",
      note: "All three. APMA E2000 carries a required 0-point recitation, APMA E2001, which is not matched here.",
      rule: {
        kind: "all_of",
        courses: ["MATH UN1101", "MATH UN1102", "APMA E2000"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "linear-algebra",
      label: "Linear Algebra",
      note: "One of the three, taken in semester IV. COMS W3251 is offered by the Bulletin's footnote but is not in our catalog, so it will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["MATH UN2010", "APMA E3101", "COMS W3251"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physics",
      label: "Physics",
      /*
       * `sequence_choice`, not `n_of { n: 2 }`. See the header — mixing the
       * first term of one sequence with the second of another is a schedule a
       * student can actually build and it satisfies nothing.
       */
      note: "One complete two-term physics sequence, both terms of whichever you pick.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          { label: "Sequence 1", courses: ["PHYS UN1401", "PHYS UN1402"] },
          { label: "Sequence 2", courses: ["PHYS UN1601", "PHYS UN1602"] },
          { label: "Sequence 3", courses: ["PHYS UN2801", "PHYS UN2802"] },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemistry",
      label: "Chemistry",
      note: "One chemistry lecture, taken in semester I or II.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["CHEM UN1403", "CHEM UN1404", "CHEM UN1604", "CHEM UN2045"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "science-laboratory",
      label: "Chemistry or Physics Laboratory",
      note: "One laboratory course, taken in semester III.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: [
          "PHYS UN1494",
          "PHYS UN3081",
          "CHEM UN1500",
          "CHEM UN1507",
          "CHEM UN3085",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "computing",
      label: "Introductory Computing",
      note: "The grid prints ENGI E1006; a footnote says COMS W1004 may replace it.",
      rule: { kind: "n_of", n: 1, courses: ["ENGI E1006", "COMS W1004"] },
      sourceUrl: SOURCE,
    },
    {
      id: "data-engineering",
      label: "Data Engineering",
      /*
       * The alternatives are one course or two, so they are atomic sequences
       * of different lengths — `n_of` cannot say that. The department also
       * warns that IEOR E2000 earns no credit if taken AFTER COMS W3134 and
       * COMS W4111, an ordering rule the audit has no way to see.
       */
      note: "IEOR E2000, or COMS W3134 and COMS W4111 together. Taking IEOR E2000 after those two earns no credit for it — an ordering rule this audit cannot check.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          { label: "IEOR E2000", courses: ["IEOR E2000"] },
          {
            label: "COMS W3134 + COMS W4111",
            courses: ["COMS W3134", "COMS W4111"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "engineering-foundations",
      label: "The Art of Engineering",
      /*
       * ECON UN1105 was here until 2026-08-24 and has been removed. It is
       * already the `principles-of-economics` group on `seas-core`, so an
       * operations research student saw Principles of Economics twice, in two
       * groups evaluated independently of one another — which can put the same
       * requirement on screen green and red at once. The group id is kept so
       * that a student's stored audit state survives the change.
       */
      note: "Principles of Economics is also required, and is tracked on the Liberal Arts Core rather than repeated here.",
      rule: { kind: "all_of", courses: ["ENGI E1102"] },
      sourceUrl: SOURCE,
    },
    {
      id: "probability",
      label: "Probability for Engineers",
      note: "Taken in semester III or IV.",
      rule: { kind: "all_of", courses: ["IEOR E3658"] },
      sourceUrl: SOURCE,
    },
    {
      id: "or-required-courses",
      label: "Operations Research required courses",
      note: "All eight, in the prescribed terms. The Bulletin states that taking a required course later than its prescribed semester is not permitted — an ordering rule this audit does not check.",
      rule: {
        kind: "all_of",
        courses: [
          "IEOR E3106",
          "IEOR E3608",
          "IEOR E4307",
          "IEOR E3402",
          "IEOR E3404",
          "IEOR E3609",
          "IEOR E4407",
          "IEOR E4405",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "technical-electives",
      label: "Technical Electives",
      /*
       * Attested. The governing list lives at ieor.columbia.edu, not in the
       * Bulletin. Only the 6-point IEOR/ORCS/CSOR floor has a checkable shape,
       * and checking a floor while the 15-point total stays unchecked would
       * report the group finished at 6 of 15.
       */
      rule: {
        kind: "attested",
        note: "15 points, of which at least 6 must be at the 3000 level or above with an IEOR, ORCS or CSOR prefix. The complete approved list is published at ieor.columbia.edu/undergraduate/electives rather than in the Bulletin.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "management-electives",
      label: "Management Electives",
      rule: {
        kind: "attested",
        note: "3 points. These may not double-count as nontechnical electives. The approved list is published at ieor.columbia.edu/undergraduate/electives rather than in the Bulletin.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
