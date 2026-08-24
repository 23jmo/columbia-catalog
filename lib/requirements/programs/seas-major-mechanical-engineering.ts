/**
 * The Columbia Engineering B.S. in Mechanical Engineering (standard track).
 *
 * Transcribed by hand from the Degree Track tab of
 * https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/mechanical-engineering/undergraduate-programs/mechanical-engineering-bs/
 * (2026–2027 edition). Like the IEOR pages this one publishes an eight-semester
 * `sc_plangrid` and no `sc_courselist` tables at all, so the tested CourseLeaf
 * parser returns nothing for it and every group below was read by hand.
 *
 * ── Two tracks on one page; this file is the standard one ───────────────────
 *
 * The page prints "Mechanical Engineering Program Standard Track" and
 * "Mechanical Engineering Program Early Decision Track". They require the same
 * courses but in a different order — the Early Decision track pulls
 * `ENME E3105`, `MECE E3301` and `MECE E3408` forward into the first two years.
 * Since the audit has no notion of term ordering, encoding both would produce
 * two byte-identical programs, so only the standard track is encoded and the
 * difference is recorded here.
 *
 * ── Footnote digits fused to course codes ───────────────────────────────────
 *
 * A trap specific to plan grids: CourseLeaf renders a footnote marker as a bare
 * digit immediately after the code, with no separator. The raw cells read
 * `CHEM UN15001`, `APMA E21014`, `ELEN E12019`, `IEOR E20003`. Those are
 * `CHEM UN1500`, `APMA E2101`, `ELEN E1201` and `IEOR E2000` with footnote
 * markers 1, 4, 9 and 3 stuck to them. `parseBulletinCode` reads a five-digit
 * run as no course at all, which is the safe failure — but a transcriber
 * skimming the rendered page will happily copy the wrong number.
 *
 * ── The one requirement that genuinely branches ─────────────────────────────
 *
 * Semester IV reads "Choose one of the following Mathematics: APMA E2101, or
 * Linear Algebra and ODE", where linear algebra is `APMA E3101` or
 * `MATH UN2010` and ODE is `MATH UN2030` or `MATH UN3027`. So the choice is
 * one course versus two, and the two-course branch is itself a 2×2 product.
 * `sequence_choice` takes it as five explicit alternatives — one for
 * `APMA E2101` and four for the linear-algebra/ODE pairs. Expanded rather than
 * nested because the rule language has no nesting, and enumerated rather than
 * flattened into `n_of` because a flattened rule would accept `APMA E3101`
 * alone, which satisfies nothing.
 *
 * The `APMA E2101` branch also carries a real consequence the audit drops:
 * "Students who take APMA E2101 must complete an additional 3-point course in
 * math or basic science" from MATH/PHYS/CHEM/BIOL/STAT/APMA/EEEB. That is a
 * requirement conditional on how another requirement was satisfied, which the
 * language cannot express at all. It is in the note.
 *
 * ── The physics sequence, and why it is a `sequence_choice` ─────────────────
 *
 * Three parallel sequences, and unlike the IEOR programs this one runs to a
 * third term: sequence 1 is `PHYS UN1401`/`UN1402`/`UN1403`, sequence 2 is
 * `PHYS UN1601`/`UN1602`/`UN2601`. Sequence 3 (`PHYS UN2801`/`UN2802`) is
 * offered for the first two terms and the grid gives it no third-term entry, so
 * it is transcribed with two courses — as printed, not as guessed.
 *
 * ── Degree Track coverage, re-verified 2026-08-24 ──────────────────────────
 *
 * Every row of the standard-track grid is now accounted for, on this file or on
 * `seas-core` — the Bulletin splits a SEAS degree across two tables and a
 * student does not care which one a requirement came from. Here: `MATH UN1101`,
 * `MATH UN1102`, `APMA E2000`, the applied-mathematics branch, physics,
 * the one-semester chemistry lecture, `CHEM UN1500`, the computing choice,
 * `ENGI E1102`, `ELEN E1201`, `ENME E3105`–`ENME E3106`, the ten MECE core
 * courses, the three-course design sequence, the technical electives. On
 * `seas-core`: `ENGL CC1010`, the nontechnical requirement, Art or Music
 * Humanities, `ECON UN1105`, physical education, the nontechnical electives.
 *
 * Two corrections made at the same time:
 *
 *   `ECON UN1105` was in `engineering-foundations` and has been removed. It is
 *   already the `principles-of-economics` group on `seas-core`, so a mechanical
 *   engineering student was shown Principles of Economics twice, in two groups
 *   evaluated independently — they can disagree.
 *
 *   Footnote 3 on the third-term physics cells was missed. It substitutes
 *   `EEEB UN2001` or `BIOL UN2005` for the third term, and those paths are now
 *   sequences of their own.
 *
 * NOT ENCODED: the technical elective totals, which the page states two ways
 * (see the group's note); the Combined Plan exemptions; and the 27-point
 * nontechnical requirement, which is `seas-core`. 0-point recitations welded to
 * a lecture with an ampersand (`APMA E2001`, `ECON UN1155`) are named in notes
 * rather than required.
 *
 * NOT IN OUR CATALOG, and kept anyway: `COMS W1005` INTRO-COMPUT SCI/PROG-MATLAB
 * and `MATH UN3027` Ordinary Differential Equations. Both are printed by this
 * page — `COMS W1005` in the Semester I/III computing cell beside `COMS W1004`
 * and `ENGI E1006`, `MATH UN3027` in footnote 6 beside `MATH UN2030` — so the
 * codes are right and the gap is ours: our catalog covers four terms and
 * neither course ran in any of them. Dropping an option the Bulletin offers
 * would tell a student who took it that it did not count, so they stay, and a
 * student holding one of them will simply not be matched automatically.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/mechanical-engineering/undergraduate-programs/mechanical-engineering-bs/#degreetracktextcontainer";

export const SEAS_MAJOR_MECHANICAL_ENGINEERING: Program = {
  id: "seas-major-mechanical-engineering",
  kind: "major",
  school: "SEAS",
  name: "Mechanical Engineering",
  department: "Mechanical Engineering",
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
      id: "applied-mathematics",
      label: "Applied Mathematics",
      /*
       * One course, or a linear-algebra course plus an ODE course. Five
       * explicit alternatives rather than a nested rule, because the language
       * does not nest — and rather than an `n_of` over the union, because that
       * would accept a lone linear algebra course.
       */
      note: "Either APMA E2101, or one linear algebra course together with one ODE course. Taking APMA E2101 obliges you to add a further 3-point MATH, PHYS, CHEM, BIOL, STAT, APMA or EEEB course — a follow-on requirement that depends on how you satisfied this one, which this audit cannot represent. MATH UN3027 is offered by the Bulletin but is not in our catalog, so branches using it will not match automatically.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          { label: "APMA E2101", courses: ["APMA E2101"] },
          {
            label: "APMA E3101 + MATH UN2030",
            courses: ["APMA E3101", "MATH UN2030"],
          },
          {
            label: "APMA E3101 + MATH UN3027",
            courses: ["APMA E3101", "MATH UN3027"],
          },
          {
            label: "MATH UN2010 + MATH UN2030",
            courses: ["MATH UN2010", "MATH UN2030"],
          },
          {
            label: "MATH UN2010 + MATH UN3027",
            courses: ["MATH UN2010", "MATH UN3027"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physics",
      label: "Physics",
      /*
       * The third term is not only physics. Footnote 3 hangs on both
       * third-term cells — `PHYS UN1403` and `PHYS UN2601` — and reads "May
       * substitute EEEB UN2001, BIOL UN2005, or higher." That footnote was
       * missed on the first transcription, so a student who finished
       * PHYS UN1401–UN1402 and then took Environmental Biology was shown this
       * requirement as unmet.
       *
       * The two named substitutes are enumerated as their own sequences: an
       * alternative for one term of a sequence has no other home in a rule
       * whose branches are whole course lists. "Or higher" is deliberately not
       * guessed at — a numeric floor over EEEB and BIOL would sweep in courses
       * the department has not approved, and this requirement is a checkable
       * one worth keeping honest.
       */
      note: "One complete physics sequence. Sequences 1 and 2 run three terms; the grid gives sequence 3 no third term. A footnote allows EEEB UN2001 or BIOL UN2005 — \"or higher\" — in place of the third term, and the two named courses are encoded; anything above them is not, so tick it with your adviser.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Sequence 1",
            courses: ["PHYS UN1401", "PHYS UN1402", "PHYS UN1403"],
          },
          {
            label: "Sequence 1, third term EEEB UN2001",
            courses: ["PHYS UN1401", "PHYS UN1402", "EEEB UN2001"],
          },
          {
            label: "Sequence 1, third term BIOL UN2005",
            courses: ["PHYS UN1401", "PHYS UN1402", "BIOL UN2005"],
          },
          {
            label: "Sequence 2",
            courses: ["PHYS UN1601", "PHYS UN1602", "PHYS UN2601"],
          },
          {
            label: "Sequence 2, third term EEEB UN2001",
            courses: ["PHYS UN1601", "PHYS UN1602", "EEEB UN2001"],
          },
          {
            label: "Sequence 2, third term BIOL UN2005",
            courses: ["PHYS UN1601", "PHYS UN1602", "BIOL UN2005"],
          },
          { label: "Sequence 3", courses: ["PHYS UN2801", "PHYS UN2802"] },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemistry",
      label: "Chemistry",
      note: "One one-semester chemistry lecture, taken in semester I. The laboratory that goes with it is the next requirement, which does encode the footnote's physics-laboratory alternatives.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["CHEM UN1403", "CHEM UN1404", "CHEM UN2045", "CHEM UN1604"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemistry-laboratory",
      label: "General Chemistry Laboratory",
      note: "CHEM UN1500, or by footnote the physics laboratory PHYS UN1494 or PHYS UN3081 instead.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["CHEM UN1500", "PHYS UN1494", "PHYS UN3081"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "computing",
      label: "Introductory Computing",
      note: "One, taken in semester I or III. COMS W1005 is offered by the Bulletin but is not in our catalog, so it will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["COMS W1004", "COMS W1005", "ENGI E1006"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "engineering-foundations",
      label: "Engineering Foundations",
      /*
       * ECON UN1105 was here until 2026-08-24 and has been removed. It is
       * already the `principles-of-economics` group on `seas-core`, so a
       * mechanical engineering student saw Principles of Economics twice, in
       * two groups evaluated independently of one another — which can put the
       * same requirement on screen green and red at once.
       */
      note: "The Art of Engineering and Introduction to Electrical Engineering. Principles of Economics is also required and is tracked on the Liberal Arts Core rather than repeated here. ELEN E1201 carries the footnote \"Not required for Combined Plan students\".",
      rule: {
        kind: "all_of",
        courses: ["ENGI E1102", "ELEN E1201"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "engineering-mechanics",
      label: "Engineering Mechanics",
      note: "Mechanics, and Dynamics and Vibrations.",
      rule: { kind: "all_of", courses: ["ENME E3105", "ENME E3106"] },
      sourceUrl: SOURCE,
    },
    {
      id: "mechanical-engineering-core",
      label: "Mechanical Engineering Core",
      note: "All ten. MECE E1008 Introduction to Machining is taken in semester V or VI. In the 2026–2027 edition the \"required for the class of 2025 and beyond\" footnote sits on the Nontech Elective rows rather than on MECE E1008.",
      rule: {
        kind: "all_of",
        courses: [
          "MECE E1008",
          "MECE E3018",
          "MECE E3028",
          "MECE E3100",
          "MECE E3301",
          "MECE E3311",
          "MECE E3408",
          "MECE E3414",
          "MECE E3610",
          "EEME E3601",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "design-sequence",
      label: "Design sequence",
      note: "Machine Design, then the two-term engineering design sequence.",
      rule: {
        kind: "all_of",
        courses: ["MECE E3409", "MECE E3420", "MECE E3430"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "technical-electives",
      label: "Technical Electives",
      /*
       * Attested. The Bulletin defines a Mechanical Engineering course by page
       * membership — "any course with a description in the Mechanical
       * Engineering section of this bulletin" — which is not a subject-code
       * rule. MECE is the bulk of that section but not all of it, and a
       * selector over MECE would also sweep in the ten core courses above.
       */
      rule: {
        kind: "attested",
        note: "The Bulletin gives two different totals on the same page: its prose says \"Of the 18 points of elective content in the third and fourth years, at least 9 points of technical elective courses, including at least 6 points from the Department of Mechanical Engineering, must be taken\", while the degree-track footnote says \"12 points required; 6 must be MECE courses\". Both agree on the 6-point Mechanical Engineering floor. A technical elective is any SEAS course at the 3000 level or above, and the Bulletin defines a Mechanical Engineering course as any course with a description in the Mechanical Engineering section of the bulletin — page membership, not a subject code. Confirm the total with your adviser.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
