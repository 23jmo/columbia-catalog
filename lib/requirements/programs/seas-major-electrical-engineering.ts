/**
 * The Columbia Engineering B.S. in Electrical Engineering.
 *
 * Transcribed by hand from the Degree Track tab of
 * https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/electrical-engineering/undergraduate-programs/electrical-engineering-bs/
 * (2026–2027 edition), with the technical-elective policy read off the same
 * page's Curriculum tab and the block arithmetic checked against the
 * Bulletin-hosted PDF chart `2026-2027_Engineering_Bulletin_Charts_ELEN.pdf`.
 *
 * ── How the page is published ──────────────────────────────────────────────
 *
 * Like IEOR, MechE and BME, this page publishes **no `sc_courselist` tables at
 * all**. Its Degree Track tab is two eight-semester `sc_plangrid` schedules —
 * *Early-Starting Students* and *Traditional-Starting Students* — that require
 * the same courses in a different order, so the tested CourseLeaf parser
 * returns nothing here and every group below was read by hand.
 *
 * Only the Traditional-Starting grid is encoded. The two were diffed cell by
 * cell and their course sets are identical; they differ solely in when
 * `ELEN E1201`, the EE core and the third physics term are taken, and the audit
 * has no notion of term ordering — encoding both would produce two
 * byte-identical programs. Same call `seas-major-mechanical-engineering` makes
 * for its Standard / Early Decision tracks.
 *
 * ── Footnote digits fused to course codes ──────────────────────────────────
 *
 * The plan-grid trap, worse here than anywhere else in the SEAS set: the
 * rendered cells read `ELEN E30812`, `ELEN E30842`, `APMA E21013`,
 * `ELEN E30832`, `ELEN E30822`, `CSEE W411910`, `ELEN E339011`. Those are
 * `ELEN E3081`, `ELEN E3084`, `APMA E2101`, `ELEN E3083`, `ELEN E3082`,
 * `CSEE W4119` and `ELEN E3390` with markers 2, 2, 3, 2, 2, 10 and 11 welded
 * on. Every code in this file was recovered from the page's `bubblelink`
 * anchor text rather than from the rendered digits.
 *
 * ── What must NOT be copied from the sibling SEAS files ────────────────────
 *
 * Four groups look like their MechE / IEOR counterparts and are not:
 *
 *   `applied-mathematics` has **three** branches, not MechE's five. EE's
 *   footnote does not offer `MATH UN3027`.
 *
 *   `physics` runs to a **third** term, like MechE and BME and unlike
 *   `seas-major-computer-science` and `seas-major-operations-research`.
 *   Copying the CS or IEOR two-term group here would drop `PHYS UN1403` /
 *   `PHYS UN2601` from the degree. And there is no biology substitution: MechE's
 *   footnote 3 (`EEEB UN2001` / `BIOL UN2005` in place of the third term) does
 *   not exist anywhere on the EE page.
 *
 *   `science-laboratory` lists **three** courses, not the shared five.
 *   `CHEM UN1507` and `CHEM UN3085` appear nowhere on this page.
 *
 *   `probability` excludes `STAT GU4001`, which this page names only in order
 *   to say it does not count. The Computer Engineering page allows it — the two
 *   groups must not be unified.
 *
 * ── The arithmetic, and what it confirms ───────────────────────────────────
 *
 * The EE page publishes no per-block total of its own (the PDF chart's
 * per-semester "TOTAL POINTS" line is explicitly an illustrative scheduling
 * sum: it "assumes that 20 points of nontechnical electives and other courses
 * are included"). So the reconciliation is against the 128-point B.S. degree
 * total, and on the baseline branch it closes **exactly**: 99.0 here + 27
 * nontechnical + 2 physical education = 128.0.
 *
 * That arithmetic also cross-checks two independent readings. Taking the
 * two-course applied-mathematics route adds 3 points, and footnote 10
 * *simultaneously* drops the technical electives from 18 to 15. Net change:
 * zero. The Bulletin's two numbers are engineered to compensate, which is
 * strong evidence both were read correctly. Other physics branches land
 * between 127.0 and 129.5, which is expected — 128 is a floor and several
 * blocks are published as point ranges.
 *
 * ── Which requirements live on `seas-core` instead ──────────────────────────
 *
 * `ENGL CC1010`, the Lit Hum / CC / Global Core sequence, Art or Music
 * Humanities, the List B nontechnical electives and physical education are all
 * `seas-core`. So is **`ECON UN1105`**, even though it is printed on this
 * grid — it is already the `principles-of-economics` group there, and
 * duplicating it is the exact bug removed from three SEAS files on 2026-08-24:
 * two groups evaluated independently can disagree about the same course.
 *
 * `ENGI E1102` goes the other way. Every engineering student takes it, but it
 * is encoded per major so that no course lives in two independently-evaluated
 * groups.
 *
 * NOT ENCODED, and why:
 *
 *   The depth constraint — "at least two technical electives in one depth
 *   area" — is a constraint *across* the student's chosen set, and the four
 *   areas are prose topic labels whose course lists live at `ee.columbia.edu`.
 *   The breadth constraint is worse: "outside the chosen depth area" is a
 *   predicate defined relative to how another requirement was satisfied, and
 *   `excludeGroups` excludes courses, not topical areas.
 *
 *   The conditional elective total (18 points, or 15 if `APMA E2101` was
 *   replaced) — a requirement whose size depends on how a different
 *   requirement was satisfied.
 *
 *   The combined-plan linear-algebra/ODE waiver: transfer equivalency plus a
 *   grade minimum plus a petition.
 *
 *   The capstone substitution, which is conditional on "special arrangements"
 *   made inside `ELEN E3399` and lists its substitutes as "courses such as" —
 *   an open list. Recorded verbatim in that group's note instead.
 *
 *   Transfer Plan 1 / Plan 2, and every "(taken Semester V, Vl, …)" ordering
 *   note. The audit has no notion of term ordering.
 *
 *   0-point recitations welded to a lecture with an ampersand (`APMA E2001`,
 *   `ECON UN1155`), named in notes rather than required — matching all four
 *   sibling SEAS files.
 *
 * NOT IN OUR CATALOG, and kept anyway: `COMS W3137` DATA STRUCTURES IN JAVA
 * (honors), printed beside `COMS W3134` in the data-structures cell. The code
 * is right and the gap is ours; dropping an option the Bulletin offers would
 * tell a student who took it that it did not count. `ELEN E4350` is also
 * missing from our catalog but appears only inside the unencodable capstone
 * substitution, so it is not in any group.
 *
 * ── Two things left open ───────────────────────────────────────────────────
 *
 * Physics sequence 2 has **no laboratory printed anywhere on this page**. The
 * grid labels the laboratory `PHYS UN1494 (Track 1)` and the PDF chart's row
 * alignment confirms it: `Lab UN1494 (3)` sits on the sequence-1 row,
 * `Lab UN3081 (2)` on the sequence-3 row, and the sequence-2 row's laboratory
 * cell is empty. The Computer Engineering page, whose physics block is
 * otherwise identical, gives its Track-2 row the same option as Track 1, which
 * is good evidence a cell was lost here. Either way the `n_of { n: 1 }` below
 * is safe: it accepts every course any track could use and invents nothing.
 *
 * No SEAS degree track prints an honors-calculus alternative to
 * `MATH UN1101` + `MATH UN1102` + `APMA E2000`, yet SEAS honors students exist
 * and `MATH UN1207`/`UN1208` are in our catalog. This is the shape of the
 * `cc-major-economics` honors bug — except that here the Bulletin genuinely
 * does not publish an alternative, so encoding one would be a guess. It is
 * transcribed as printed; a SEAS honors-calculus student will see a red
 * requirement until the department publishes an equivalency.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/electrical-engineering/undergraduate-programs/electrical-engineering-bs/#degreetracktextcontainer";

/** The technical-elective policy is prose on the Curriculum tab, not the grid. */
const CURRICULUM =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/electrical-engineering/undergraduate-programs/electrical-engineering-bs/#curriculumtextcontainer";

export const SEAS_MAJOR_ELECTRICAL_ENGINEERING: Program = {
  id: "seas-major-electrical-engineering",
  kind: "major",
  school: "SEAS",
  name: "Electrical Engineering",
  department: "Electrical Engineering",
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
       * One course versus two, so the branches are atomic and of different
       * lengths. Flattened to `n_of { n: 1 }` a lone `MATH UN2030` would pass
       * while satisfying nothing; flattened to `n_of { n: 2 }`, `APMA E2101`
       * alone would fail while satisfying everything.
       *
       * MechE encodes the structurally same rule with the branch direction
       * reversed — it prints `APMA E2101` as the branch that costs you extra
       * work, EE prints it as the default and makes the two-course route the
       * one that changes your elective load. Three branches here, not MechE's
       * five: EE's footnote does not offer `MATH UN3027`.
       */
      note: "APMA E2101, or Ordinary Differential Equations together with a linear algebra course. Taking the two-course route reduces your technical elective total from 18 points to 15 — a consequence that depends on how you satisfied this requirement, which this audit cannot represent.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          { label: "APMA E2101", courses: ["APMA E2101"] },
          {
            label: "MATH UN2030 + APMA E3101",
            courses: ["MATH UN2030", "APMA E3101"],
          },
          {
            label: "MATH UN2030 + MATH UN2010",
            courses: ["MATH UN2030", "MATH UN2010"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physics",
      label: "Physics",
      /*
       * Sequence 3 is transcribed with two courses, as printed. Its third-term
       * cell is `PHYS UN3081` INTERMEDIATE LABORATORY WORK — a laboratory, not
       * a lecture — so it belongs in `science-laboratory` below. Putting it
       * inside the sequence would leave a Track-3 student's laboratory group
       * permanently unmet.
       */
      note: "One complete physics sequence — every term of whichever you pick. Sequences 1 and 2 run three terms; the grid gives sequence 3 two lecture terms and a laboratory, and that laboratory is the next requirement.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Sequence 1",
            courses: ["PHYS UN1401", "PHYS UN1402", "PHYS UN1403"],
          },
          {
            label: "Sequence 2",
            courses: ["PHYS UN1601", "PHYS UN1602", "PHYS UN2601"],
          },
          { label: "Sequence 3", courses: ["PHYS UN2801", "PHYS UN2802"] },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemistry",
      label: "Chemistry",
      note: "One one-semester chemistry lecture. The EE page offers no biology route, unlike the computer science page.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["CHEM UN1403", "CHEM UN1404", "CHEM UN2045", "CHEM UN1604"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "science-laboratory",
      label: "Science Laboratory",
      /*
       * Three courses, not the five that the sibling SEAS files share.
       * `CHEM UN1507` and `CHEM UN3085` are printed nowhere on the EE page.
       * `PHYS UN3081` is here rather than in the physics sequence because it is
       * the third-term cell of sequence 3 and it is a laboratory.
       */
      note: "One laboratory. Track 1 is pointed at PHYS UN1494, track 3 at PHYS UN3081 as the third term of its sequence, and the chemistry laboratory counts for either. The grid prints no laboratory at all on the track-2 row, so if that is your sequence, confirm which one your adviser expects.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["PHYS UN1494", "PHYS UN3081", "CHEM UN1500"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "engineering-foundations",
      label: "Engineering Foundations",
      note: "All three. ELEN E1201 is the gateway to the EE core; transfer students without an equivalent take it in the junior year, which pushes the core courses back a year.",
      rule: {
        kind: "all_of",
        courses: ["ENGI E1006", "ENGI E1102", "ELEN E1201"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "probability",
      label: "Probability",
      /*
       * `STAT GU4001` is named on this page only to say it does not count:
       * "cannot generally be used". It is deliberately absent. The Computer
       * Engineering page does allow it — do not unify the two groups.
       */
      note: "One. The Bulletin notes that STAT GU4001 cannot generally be used to satisfy this requirement, so it is not accepted here.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["IEOR E3658", "STAT GU4203"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "data-structures",
      label: "Data Structures",
      note: "One. COMS W3137 is offered by the Bulletin but is not in our catalog, so it will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["COMS W3136", "COMS W3134", "COMS W3137"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "ee-core",
      label: "Electrical Engineering Core",
      note: "All six.",
      rule: {
        kind: "all_of",
        courses: [
          "ELEN E3201",
          "ELEN E3801",
          "ELEN E3331",
          "CSEE W3827",
          "ELEN E3106",
          "ELEN E3401",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "communications-or-networks",
      label: "Communications or Networks",
      /*
       * Its own group rather than folded into `ee-core`, because `ee-core` is
       * an `all_of` and this cell is a choice.
       */
      note: "One of the two.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["ELEN E3701", "CSEE W4119"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "ee-laboratories",
      label: "Electrical Engineering Laboratories",
      note: "All five. The first four pair with the core lecture courses and the Bulletin asks that you take them in the same term where possible.",
      rule: {
        kind: "all_of",
        courses: [
          "ELEN E3081",
          "ELEN E3082",
          "ELEN E3083",
          "ELEN E3084",
          "ELEN E3043",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-design",
      label: "Engineering Practice and Senior Design",
      /*
       * Footnote 11's substitution is deliberately not a `sequence_choice`. It
       * is conditional — "if special arrangements are made in ELEN E3399" —
       * i.e. permission granted inside another course, and its list is hedged
       * ("courses such as"). Both are outside the rule language, so it lives in
       * the note.
       */
      note: "Both. With special arrangements made inside ELEN E3399, the Bulletin allows courses such as ELEN E3998, ELEN E4350, ELEN E4998, EECS E4340 or CSEE W4840 in place of the senior design project — a substitution that depends on an arrangement no course record shows, so it is not checked. Tick it with your adviser if that is your route.",
      rule: {
        kind: "all_of",
        courses: ["ELEN E3399", "ELEN E3390"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "technical-electives",
      label: "Technical Electives",
      /*
       * One attested group covering all three components, and each fails the
       * selector test differently. Depth is a constraint across the chosen set
       * ("in ONE depth area") over topic labels whose course lists live
       * off-Bulletin at `ee.columbia.edu`. Breadth is a predicate relative to
       * how depth was satisfied. Only "other" is checkable, and checking a
       * floor while the ceiling stays unchecked would report the group
       * satisfied at 6 of 18 — the same call
       * `seas-major-operations-research` makes for a structurally identical
       * rule, and for the same stated reason.
       *
       * `ELEN E3990` FIELDWORK is barred from every EE requirement by the
       * department's course listing. Since this group is attested there is
       * nothing to exclude it from; it is named in the note.
       */
      rule: {
        kind: "attested",
        note: "18 points, in three parts: at least 6 points of depth (two courses in one of four areas — photonics/solid-state/electromagnetics, circuits and electronics, signals and systems, or communications and networking), at least 6 points of breadth (two courses outside your depth area, with significant engineering content), and the rest technical but not necessarily engineering. All must be at the 3000 level or above and must not overlap significantly with other courses taken for the major; ELEN E3990 Fieldwork counts for nothing here. The total drops to 15 points if you replaced APMA E2101 with Ordinary Differential Equations plus linear algebra. The approved course lists for each depth area are published at ee.columbia.edu rather than in the Bulletin, and \"one depth area\" is a constraint across your whole set of choices, so this one is yours to confirm.",
      },
      sourceUrl: CURRICULUM,
    },
  ],
};
