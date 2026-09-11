/**
 * The Columbia Engineering B.S. in Chemical Engineering.
 *
 * Transcribed by hand from
 * https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/chemical-engineering/undergraduate-programs/chemical-engineering-bs/
 * (2026–2027 edition) — the Degree Track tab for the course rows, the
 * Curriculum tab for the technical-elective policy, and the Bulletin-hosted
 * chart `2026-2027_Engineering_Bulletin_Charts_CHEN.pdf` for the point values,
 * which is the only place they are published: every `hourscol` cell in the HTML
 * table is empty.
 *
 * ── This degree breaks the shared SEAS shape in five places ────────────────
 *
 * Four of the five would be silently wrong if one of the existing SEAS files
 * were used as a template, so they are worth stating before anything else:
 *
 *   **Chemistry is a three-branch sequence running into organic chemistry**,
 *   not the one-lecture `n_of` that Mechanical Engineering, Operations Research
 *   and SEAS Computer Science use, and not Biomedical Engineering's two-term
 *   pair. Eight codes across three semesters.
 *
 *   **There are three separate laboratory obligations** — the general chemistry
 *   laboratory, which lives *inside* each chemistry branch; a physics
 *   laboratory; and a 3-point advanced natural-science laboratory — where the
 *   other files have one `science-laboratory` group.
 *
 *   **Physics is two terms.** The third-year physics slot holds a laboratory,
 *   not a lecture, and MechE's footnote-3 `EEEB UN2001` / `BIOL UN2005`
 *   substitutions have no counterpart here.
 *
 *   **`ELEN E1201` is not required at all.**
 *
 *   **Linear algebra is not its own group.** It is folded into a six-option
 *   math elective taken in semester VI.
 *
 * And one thing that is absent despite looking mandatory: **physical chemistry
 * is not required.** The only p-chem course anywhere on the page is
 * `CHEM UN3085`, and it appears as one of seven options in the advanced
 * natural-science laboratory footnote. `CHEE E3010` Principles of Chemical
 * Engineering Thermodynamics is a CHEE course, not a CHEM one.
 *
 * ── Why the chemistry group must be a sequence ─────────────────────────────
 *
 * Written as `n_of { n: 3 }`, the eight codes would accept `CHEM UN1403` +
 * `CHEM UN1507` + `CHEM UN2046` — the first term of sequence 1 welded to two
 * terms of sequence 3. That is a registrable schedule and it completes no
 * sequence. It would also accept `CHEM UN1604` + `CHEM UN2443` + `CHEM UN1500`,
 * which skips the intensive laboratory entirely.
 *
 * Sequence 3 is also the `cc-major-economics` shape: a student on the *harder*
 * path — intensive organic chemistry in the first year — holds no
 * `CHEM UN1403`, no `CHEM UN1404` and no `CHEM UN2443`, and a one-lecture rule
 * would tell them to go back and take general chemistry.
 *
 * ── The arithmetic ─────────────────────────────────────────────────────────
 *
 * Reconciled semester by semester against the PDF chart's own per-semester
 * totals, on the chart's stated convention (first track in each row,
 * `ENGI E1102` in semester II): 17 + 17 + 17 + 17 in the first two years and
 * 15 + 16 + 16 + 13 in the last two. **68 + 60 = 128**, the published SEAS B.S.
 * total, with no residual anywhere. Two cross-checks close as well: the
 * technical-elective rows sum to 3 + 3 + 6 + 9 = 21 points, exactly the
 * Curriculum tab's "Twenty-one points (7 courses)"; and the nontechnical rows
 * sum to 26–27 against `seas-core`'s 27, which is why that file publishes List B
 * as a 9-to-11-point range rather than a flat 9.
 *
 * That arithmetic is also what settles two questions the prose leaves open. The
 * Curriculum tab calls `CHEN E1000` "the professional elective" and says
 * students "should take" it — odd language for a required course — but the
 * grid prints it as a plain required row and semester I does not close without
 * its point (3 + 3 + 4 + 3 + 3 = 16, not 17). And the semester III physics-lab
 * cell carries a heading naming sequences it does not list, which is the exact
 * shape of a lost CourseLeaf label; semester III closes at 17 with
 * `PHYS UN1494` at 3, so nothing is missing and the heading is recycled
 * boilerplate.
 *
 * ── Four catalog rows disagree with the Bulletin ───────────────────────────
 *
 * Found while reconciling, and only one of them matters to a rule:
 * `CHEM UN2493` is 1.5 points in the Bulletin and **0.0** in our catalog;
 * `EEEB UN3015` is 3 and **0.0**; `PHED UN1001` is 1 and 0.0; `ENGI E1102` is 4
 * and **null**. The last two are harmless — they feed `all_of` and `n_matching`
 * rules that count courses. The first two feed the one `points_matching` rule
 * in this file, which will under-report for students on the organic-half-lab
 * and EEEB routes until those rows are fixed. Under-reporting sends a student
 * to their adviser rather than to the registrar after add/drop, so it ships
 * with the gap named in the group's note rather than with the requirement
 * weakened to hide it.
 *
 * ── Which requirements live on `seas-core` instead ─────────────────────────
 *
 * `ENGL CC1010`, the Lit Hum / CC / Global Core sequence, Art or Music
 * Humanities, the List B nontechnical electives and physical education. So is
 * **`ECON UN1105`**, which this page prints in its footnote 1 and which is
 * already `seas-core`'s `principles-of-economics` group — duplicating it is the
 * bug removed from three SEAS files on 2026-08-24, where two independently
 * evaluated copies of one course can disagree. `ENGI E1102` goes the other way,
 * encoded per major for the same reason.
 *
 * NOT ENCODED, and why: both "or another course approved by the major adviser"
 * escape hatches (the math elective and the advanced natural-science
 * laboratory) — an adviser petition, and widening either into a numeric floor
 * over APMA/MATH/STAT or over CHEM would sweep in courses the department has
 * not approved. The whole technical-elective taxonomy, whose categories are
 * content judgements ("50% or more content related to thermodynamics") and
 * whose governing list is off-Bulletin. The designator floor — "at least one …
 * must have the designators BMCH, CHEN, CHEE, CHAP, or MECH" — where three of
 * the five have zero rows in our catalog, so a rule over them would be
 * checkable for some students and structurally unmeetable for others. The
 * `CHEN E3900` research cap and its thesis trigger. Term ordering. The Combined
 * Plan accommodation.
 *
 * The four **elective specializations** — Advanced Materials, Biotechnology and
 * Biopharmaceuticals, Climate/Environment/Energy Solutions, Data and
 * Computational Science, each four courses and 12 points — are deliberately
 * absent. They are optional, not degree requirements, and encoding them would
 * put four 12-point blocks on every student's audit. (The same call BME's file
 * makes for its concentrations.) Three of the four tables also contain a
 * literal `CHEN XXXX` row for a course that has not been given a number yet.
 *
 * NOT IN OUR CATALOG, and kept anyway: `CHEM UN2543` ORGANIC CHEMISTRY
 * LABORATORY, in the advanced natural-science laboratory list. It renders with
 * a title on the Bulletin page, so the code is right and the gap is ours —
 * the `COMS W1005` / `MATH UN3027` precedent from
 * `seas-major-mechanical-engineering`.
 *
 * ── Two things left open ───────────────────────────────────────────────────
 *
 * The Curriculum tab's footnote 1 sits on the `ORCA E2500` row alone but reads
 * "**These courses** cannot be counted as technical electives, but they may be
 * used for the math elective." The last four rows of that table are
 * `ORCA E2500`, `STAT GU4001`, `COMS W4721` and `COMS W4771`, and
 * `STAT GU4001` is already in the math-elective footnote, which reads as
 * corroboration that the footnote covers all four. None of them has been added
 * to `math-elective`: guessing the scope of a footnote invents a requirement.
 *
 * `cheme.columbia.edu` returns HTTP 403 to every client, so no source
 * independent of the Bulletin was obtainable. The PDF chart agrees with the
 * HTML grid cell for cell, but it has the same publisher.
 *
 * ── One note for a sibling file ────────────────────────────────────────────
 *
 * `seas-major-biomedical-engineering` records its chemistry sequence 3
 * (`CHEM UN2045`–`CHEM UN2046`) as "printed with no laboratory at all, and …
 * transcribed as printed rather than as guessed". On *this* page the same
 * sequence explicitly carries `CHEM UN1507` as its laboratory. That is not a
 * BME bug — each file is faithful to its own page — but it makes the BME
 * omission look much more like a Bulletin slip than a real curricular
 * difference.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/chemical-engineering/undergraduate-programs/chemical-engineering-bs/#degreetracktextcontainer";

/** The technical-elective policy is prose on the Curriculum tab, not the grid. */
const CURRICULUM =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/chemical-engineering/undergraduate-programs/chemical-engineering-bs/#curriculumtextcontainer";

export const SEAS_MAJOR_CHEMICAL_ENGINEERING: Program = {
  id: "seas-major-chemical-engineering",
  kind: "major",
  school: "SEAS",
  name: "Chemical Engineering",
  department: "Chemical Engineering",
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
      id: "differential-equations",
      label: "Differential Equations",
      /*
       * A flat one-of-two, and deliberately not MechE's five-branch
       * `sequence_choice`. There MechE's `APMA E2101` branch trades against a
       * *pair* of courses; here there is no linear-algebra branch and no
       * follow-on obligation — linear algebra is the separate math elective
       * below. Reusing MechE's group would make a chemical engineering student
       * take linear algebra twice.
       */
      note: "One of the two, taken in semester IV.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["MATH UN2030", "APMA E2101"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "math-elective",
      label: "Math Elective",
      note: "One math elective, taken in semester VI. The Bulletin's list is open-ended — \"or another course approved by the major adviser\" — so a course your adviser approved that is not one of these six will not match here.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: [
          "APMA E3101",
          "MATH UN2010",
          "APMA E3102",
          "APMA E4150",
          "APMA E4300",
          "STAT GU4001",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physics",
      label: "Physics",
      /*
       * Two terms. The grid's semester III physics cell holds only
       * laboratories, so there is no third lecture to import from the
       * Mechanical or Biomedical Engineering files.
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
      id: "physics-laboratory",
      label: "Physics Laboratory",
      /*
       * Two options, not the five-option `science-laboratory` group that
       * `seas-major-operations-research` and `seas-major-computer-science`
       * share. Copying that list here would let a student satisfy this
       * requirement with the very chemistry laboratory their chemistry sequence
       * already required — one course paying for two requirements.
       */
      note: "One physics laboratory, taken in semester III. Unlike the other engineering degrees this one does not accept a chemistry laboratory here — your general chemistry laboratory is already inside the chemistry sequence.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["PHYS UN1494", "PHYS UN3081"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemistry",
      label: "Chemistry",
      note: "One complete chemistry sequence, every course of whichever you pick. Sequences 1 and 2 run on into Organic Chemistry I in semester III; sequence 3 covers organic chemistry in the first year instead and does not take CHEM UN2443. Each sequence carries its own general chemistry laboratory — CHEM UN1500 in sequence 1, CHEM UN1507 in sequences 2 and 3 — so there is no separate general chemistry laboratory requirement.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Sequence 1",
            courses: [
              "CHEM UN1403",
              "CHEM UN1500",
              "CHEM UN1404",
              "CHEM UN2443",
            ],
          },
          {
            label: "Sequence 2",
            courses: ["CHEM UN1604", "CHEM UN1507", "CHEM UN2443"],
          },
          {
            label: "Sequence 3",
            courses: ["CHEM UN2045", "CHEM UN2046", "CHEM UN1507"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "advanced-natural-science-laboratory",
      label: "Advanced Natural Science Laboratory",
      /*
       * `points_matching`, not `n_of`, and the reason is arithmetic: two of the
       * seven options are 1.5-point half-laboratories against a 3-point total.
       * `n_of { n: 1 }` would go green on half a requirement; `n_of { n: 2 }`
       * would refuse a student who took the single 3-point `CHEM UN3085`.
       *
       * The selector is include-only, which is legal and exact — `compileSelector`
       * sets `hasShape: false` and the selector then matches its include list
       * and nothing else.
       *
       * The Bulletin writes the last two options as bare "BIOL 2501" and
       * "EEEB 3015", in plain text rather than as course links and with no
       * level letters. The registrar's codes are `BIOL UN2501` and
       * `EEEB UN3015`, which is what is encoded.
       */
      note: "3 points total, taken in semester V. Two of the options are 1.5-point half-laboratories that pair to make the 3 points. CHEM UN2493 and EEEB UN3015 are stored in our catalog with no point value, so they will under-count here until that is fixed. The Bulletin also allows \"another course approved by the major adviser\", which is not checked, and CHEM UN2543 is offered by the Bulletin but is not in our catalog.",
      rule: {
        kind: "points_matching",
        points: 3,
        select: {
          include: [
            "CHEM UN2493",
            "CHEM UN2496",
            "CHEM UN2543",
            "CHEM UN2545",
            "CHEM UN3085",
            "BIOL UN2501",
            "EEEB UN3015",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemical-engineering-core",
      label: "Chemical Engineering Core",
      /*
       * One group, not the PDF chart's three rows ("CHEM. ENG. REQUIREMENT",
       * "REQUIRED COURSES", "REQUIRED LABS"). The HTML Degree Track table is the
       * primary source and carries no row labels at all, and the chart's
       * placement of `CHEN E4300` — Chemical Process Control and Safety — under
       * "REQUIRED LABS" looks like a layout accident.
       *
       * `CHEN E4510` PROCESS & PRODUCT DESIGN II is deliberately absent. It is
       * in our catalog and most peer programs require a two-term capstone, so
       * its absence looks like a lost row — but the HTML grid and the PDF chart
       * independently print `CHEN E4500` alone, and semester VII closes at 16
       * without it. It is a natural technical elective, nothing more.
       */
      note: "All ten. CHEE E3010 is the one course in the core that is not a CHEN course — Principles of Chemical Engineering Thermodynamics is listed under CHEE. CHEN E3810 is the chemical engineering laboratory, taken in the final semester.",
      rule: {
        kind: "all_of",
        courses: [
          "CHEN E1000",
          "CHEN E2100",
          "CHEN E3020",
          "CHEN E3110",
          "CHEE E3010",
          "CHEN E3230",
          "CHEN E4140",
          "CHEN E4500",
          "CHEN E4300",
          "CHEN E3810",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "engineering-foundations",
      label: "Engineering Foundations",
      note: "Computing and The Art of Engineering. ENGI E1006 is named with no alternative for chemical engineering students — unlike Mechanical Engineering and Operations Research, this page offers no COMS W1004 substitute. ELEN E1201 is not required for this degree. Principles of Economics is also required and is tracked on the Liberal Arts Core rather than repeated here.",
      rule: {
        kind: "all_of",
        courses: ["ENGI E1006", "ENGI E1102"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "technical-electives",
      label: "Technical Electives",
      /*
       * Attested rather than partly checkable, which is the one place this file
       * diverges from `seas-major-biomedical-engineering`'s treatment of the
       * same shape. BME can carry a `points_matching` floor because BMEN is a
       * real, populated subject code. ChemE's equivalent floor is "at least one
       * … with the designators BMCH, CHEN, CHEE, CHAP, or MECH", and three of
       * those five have zero rows in our catalog — a requirement that would be
       * checkable for some students and structurally unmeetable for others
       * depending on which designator their course happened to carry.
       */
      rule: {
        kind: "attested",
        note: "21 points — 7 courses — of technical electives in the third and fourth years, split by the department into one thermodynamics elective, one transport elective, three engineering technical electives (at least one with a BMCH, CHEN, CHEE, CHAP or MECH designator) and two advanced STEM electives. Technical electives are generally 3000 level or above, with a few named exceptions including PHYS UN1403, PHYS UN2601, BIOL UN2005, BIOL UN2006, BIOL UN2501 and CHEM UN2444. Every category is defined as \"qualifying courses are determined by Chemical Engineering advisors\", and the full approved list is on the departmental website rather than in the Bulletin, so this one is yours to confirm. Up to 6 points of CHEN E3900 may count; more than 3 points of research requires a thesis.",
      },
      sourceUrl: CURRICULUM,
    },
  ],
};
