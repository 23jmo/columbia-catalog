/**
 * The Columbia Engineering B.S. in Computer Engineering.
 *
 * Transcribed by hand from the Degree Track tab of
 * https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/computer-engineering-program/undergraduate-programs/computer-engineering-bs/
 * (2026–2027 edition), with the technical-elective policy read off the same
 * page's Curriculum tab and the arithmetic checked against the Bulletin-hosted
 * PDF chart `2026-2027_Engineering_Bulletin_Charts_CMEN.pdf`.
 *
 * ── One program, not a track of Electrical Engineering ─────────────────────
 *
 * The Bulletin gives Computer Engineering its own department-level node — a
 * sibling of Electrical Engineering and Computer Science, not a child of
 * either — containing exactly one degree. The department page says it is
 * "administered by both the Electrical Engineering and Computer Science
 * Departments through a joint Computer Engineering Committee", that "student
 * records are kept in the Electrical Engineering Department", and that students
 * "have two 'home' departments".
 *
 * Both parent departments defer to that third page and neither claims the
 * degree: EE's Undergraduate Programs index lists only the two Electrical
 * Engineering degrees, CS's lists only Computer Science (B.S.), and the EE
 * department page says outright that "details on those programs can be found in
 * the Computer Engineering section in this bulletin". So there is no
 * disagreement to record and no requirement split across pages — the whole
 * degree is published here and nowhere else.
 *
 * ── Why this file must not inherit from its two parents ────────────────────
 *
 * Six requirements differ from `seas-major-electrical-engineering`, and every
 * one of them is a real difference rather than an editing slip:
 *
 *   `physics` runs **two** terms, not three. `PHYS UN1403` and `PHYS UN2601`
 *   appear nowhere on this page — not in either grid, not in the PDF chart, not
 *   among the page's course anchors. Where EE puts a third physics lecture in
 *   the third slot, this degree puts the laboratory.
 *
 *   `probability` **allows** `STAT GU4001`; the EE page names the same course
 *   only to say it "cannot generally be used". Both are correct as printed.
 *
 *   `applied-mathematics` has a fourth branch, `COMS W3251`, that the
 *   near-identically-worded EE footnote does not offer.
 *
 *   Computing is **three** separate requirements here — `ENGI E1006`, a Java
 *   course, and `COMS W3203` — where every other SEAS file in this repo treats
 *   `ENGI E1006` and `COMS W1004` as alternatives.
 *
 *   `data-structures` is narrower: `COMS W3136` is not printed on this page.
 *
 *   Four laboratories, not five (`ELEN E3043` is EE's), no capstone at all, and
 *   15 elective points rather than 18.
 *
 * ── How the page is published ──────────────────────────────────────────────
 *
 * Two `sc_plangrid` eight-semester schedules — *Early Starting* and *Late
 * Starting* — and prose-only Curriculum and department tabs. **No
 * `sc_courselist` tables**, so the tested CourseLeaf parser returns nothing and
 * every group below was read by hand. The two grids were diffed cell by cell:
 * the course sets are identical and only the terms move, so only one is encoded
 * (the Late-Starting grid, which carries the points column), exactly as
 * `seas-major-mechanical-engineering` does for its two tracks.
 *
 * Footnote digits are fused to the codes, as on every plan grid: the rendered
 * cells read `APMA E21012`, `IEOR E36583`, `ELEN E30814`, `ELEN E30844`,
 * `ELEN E30834`, `ELEN E30824`, `COMS W32616`. All codes here were recovered
 * from the page's `bubblelink` anchor text.
 *
 * ── The published total is an artifact; ignore it ──────────────────────────
 *
 * This page prints `Total Points: 303-309`, which is a CourseLeaf plan-grid
 * roll-up, not a degree total: the 15-point technical-elective row and the
 * 27-point nontechnical row are printed once per semester in each of the four
 * junior and senior terms, so the sum counts each of them four times. The PDF
 * chart's per-semester "TOTAL POINTS" line is likewise illustrative — its own
 * footnote says it "assumes that 20 points of nontechnical electives and other
 * courses are included".
 *
 * Reconciled against the real 128-point B.S. total instead, the baseline branch
 * comes to 100.5 here + 27 nontechnical + 2 physical education = 129.5, and
 * every part of the 1.5-point residual is a published range (the chemistry
 * lecture is printed as 3–4 points; the PDF chart prices `COMS W3203` at 3
 * where the HTML grid and the registrar say 4). The degree total is a floor,
 * not an equality.
 *
 * That arithmetic also cross-checks two readings. The two-course
 * applied-mathematics route adds 3 points while footnote 5 drops the technical
 * electives from 15 to 12 — net zero, which is strong evidence both were read
 * correctly. And it is what settles the laboratory question below: two
 * laboratories would put the degree at 132.5 against a 128-point floor, in a
 * curriculum where every other block is pinned to the point.
 *
 * ── Which requirements live on `seas-core` instead ─────────────────────────
 *
 * `ENGL CC1010`, the Lit Hum / CC / Global Core sequence, Art or Music
 * Humanities, the List B nontechnical electives and physical education. So is
 * **`ECON UN1105`**, printed on this grid but already the
 * `principles-of-economics` group there — duplicating it is the bug removed
 * from three SEAS files on 2026-08-24. `ENGI E1102` goes the other way, encoded
 * per major so no course lives in two independently-evaluated groups.
 *
 * NOT ENCODED, and why: the technical-elective policy is a stack of
 * set-dependent constraints — a cap of "up to two from outside those
 * departments", approval that "may depend on the other electives chosen",
 * required adviser sign-off, a bar on "not-very-technical courses within the
 * school of engineering", and a 15/12 total conditional on how
 * `applied-mathematics` was satisfied. Also not encoded: the combined-plan
 * waiver (transfer equivalency + grade minimum + petition), the transfer Java
 * and discrete-math background expectations, the overlap rule, and every
 * "(taken Semester …)" ordering note. `ELEN E3990` FIELDWORK is barred from
 * every requirement of this major by the EE course listing; since the elective
 * block is attested there is nothing to exclude it from. 0-point recitations
 * welded to a lecture with an ampersand (`APMA E2001`, `ECON UN1155`) are named
 * in notes rather than required.
 *
 * NOT IN OUR CATALOG, and kept anyway: `COMS W3251` (applied mathematics),
 * `COMS W1007` (intro programming), `COMS W3137` (data structures) and
 * `SIEO W3600` (probability). All four are printed by this page, so the codes
 * are right and the gap is ours; dropping an option the Bulletin offers would
 * tell a student who took it that it did not count. `MATH UN1210` is a
 * *"formerly"* parenthetical rather than an option and is deliberately absent.
 *
 * ── Two things left open ───────────────────────────────────────────────────
 *
 * The laboratory is printed **twice** — once in the chemistry row and once in
 * the physics row — and it is encoded as one requirement. Four arguments: both
 * rows offer the same two courses (a student could not use `CHEM UN1500`
 * twice); no other SEAS degree here requires two laboratories; two laboratories
 * break the arithmetic by 4.5 points; and the structurally twin Electrical
 * Engineering page has exactly one. This is also the conservative direction —
 * if it turned out to be two, this under-counts, which sends a student to their
 * adviser rather than to the registrar after add/drop.
 *
 * No SEAS degree track prints an honors-calculus alternative to
 * `MATH UN1101` + `MATH UN1102` + `APMA E2000`, yet SEAS honors students exist
 * and `MATH UN1207`/`UN1208` are in our catalog. Same shape as the
 * `cc-major-economics` honors bug — except that here the Bulletin publishes no
 * alternative, so encoding one would be a guess.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/computer-engineering-program/undergraduate-programs/computer-engineering-bs/#degreetracktextcontainer";

/** The technical-elective policy is prose on the Curriculum tab, not the grid. */
const CURRICULUM =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/computer-engineering-program/undergraduate-programs/computer-engineering-bs/#curriculumtextcontainer";

export const SEAS_MAJOR_COMPUTER_ENGINEERING: Program = {
  id: "seas-major-computer-engineering",
  kind: "major",
  school: "SEAS",
  name: "Computer Engineering",
  department: "Computer Engineering Program",
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
       * Four branches, one wider than the near-identically-worded footnote on
       * the Electrical Engineering page: this one adds `COMS W3251`. The two
       * footnotes read almost word for word the same and they are not the same
       * rule — the same class of mistake as the SEAS-versus-College calculus
       * table.
       *
       * `sequence_choice` rather than `n_of` because it is one course versus
       * two: flattened, a lone `MATH UN2030` would pass while satisfying
       * nothing.
       */
      note: "APMA E2101, or Ordinary Differential Equations together with a linear algebra course. Taking the two-course route reduces your technical elective total from 15 points to 12 — a consequence that depends on how you satisfied this requirement, which this audit cannot represent. COMS W3251 is offered by the Bulletin but is not in our catalog, so branches using it will not match automatically.",
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
          {
            label: "MATH UN2030 + COMS W3251",
            courses: ["MATH UN2030", "COMS W3251"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physics",
      label: "Physics",
      /*
       * Two terms. Copying the Electrical or Mechanical Engineering physics
       * group across would add a third lecture this degree does not require.
       * The third slot of each track is the laboratory, which is the next
       * group.
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
      note: "One one-semester chemistry lecture, taken in semester I or II.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["CHEM UN1403", "CHEM UN1404", "CHEM UN2045", "CHEM UN1604"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "science-laboratory",
      label: "Chemistry or Physics Laboratory",
      /*
       * Three courses, not the five shared by `seas-major-computer-science` and
       * `seas-major-operations-research`. `CHEM UN1507` and `CHEM UN3085`
       * appear nowhere on this page.
       */
      note: "One laboratory. Tracks 1 and 2 take the introductory physics laboratory or the general chemistry laboratory; Track 3 may take Intermediate Laboratory Work instead. The Bulletin prints this requirement in both the chemistry and the physics row of the grid — it is one laboratory, not two.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["CHEM UN1500", "PHYS UN1494", "PHYS UN3081"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "engineering-foundations",
      label: "Engineering Foundations",
      note: "Computing, The Art of Engineering, and Introduction to Electrical Engineering. Principles of Economics is also required and is tracked on the Liberal Arts Core rather than repeated here.",
      rule: {
        kind: "all_of",
        courses: ["ENGI E1006", "ENGI E1102", "ELEN E1201"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "intro-programming",
      label: "Introductory Programming",
      /*
       * On top of `ENGI E1006`, not instead of it. The PDF chart's computer
       * science row is unambiguous: `ENGI E1006` in semester I, the Java course
       * in semester II, `COMS W3203` later — three separate requirements. This
       * is the only SEAS degree in the repo that requires both.
       */
      note: "One of the two, in addition to ENGI E1006 — this degree requires both. COMS W1007 is for students with prior experience; a 4 or 5 on the CS AP exam exempts you from COMS W1004 and leaves nothing on your record to match. COMS W1007 is offered by the Bulletin but is not in our catalog, so it will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["COMS W1004", "COMS W1007"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "discrete-mathematics",
      label: "Discrete Mathematics",
      note: "Required, with no alternative. The Electrical Engineering degree does not require it; this one does.",
      rule: {
        kind: "all_of",
        courses: ["COMS W3203"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "data-structures",
      label: "Data Structures",
      /*
       * Narrower than the Electrical Engineering list: `COMS W3136` appears
       * nowhere on this page. Do not widen it.
       */
      note: "COMS W3134, or the honors course COMS W3137. COMS W3137 is offered by the Bulletin but is not in our catalog, so it will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["COMS W3134", "COMS W3137"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "probability",
      label: "Probability",
      /*
       * The reverse of the Electrical Engineering group, and both are correct
       * as printed: EE's footnote says `STAT GU4001` "cannot generally be used",
       * this one says it can, with a warning about later prerequisites. Do not
       * reconcile the two.
       */
      note: "One of the four. The Bulletin warns that SIEO W3600 and STAT GU4001 may not give enough probability background for later electives such as ELEN E3701. SIEO W3600 is offered by the Bulletin but is not in our catalog, so it will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["IEOR E3658", "SIEO W3600", "STAT GU4203", "STAT GU4001"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "ce-core",
      label: "Computer Engineering Core",
      note: "All six — three from Computer Science and three from Electrical Engineering. COMS W3261 may be taken a semester later than the grid shows.",
      rule: {
        kind: "all_of",
        courses: [
          "COMS W3157",
          "COMS W3261",
          "CSEE W3827",
          "ELEN E3201",
          "ELEN E3801",
          "ELEN E3331",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "systems-software",
      label: "Operating Systems or Programming Languages",
      /*
       * A rendering trap: the HTML plan grid prints the pair under the single
       * title "OPERATING SYSTEMS I", so a transcriber skimming the rendered
       * page reads one course with a stray code beside it. The PDF chart spells
       * it out — "COMS W4118 Operating systems or COMS W4115 Programming lang."
       */
      note: "Operating Systems, or Programming Languages and Translators. One of the two.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["COMS W4118", "COMS W4115"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "ce-core-electives",
      label: "Computer Engineering Core: choose three",
      /*
       * An exact requirement — a named list of six with a count — despite
       * sitting at the 4000 level. The Bulletin calls these "Core Required
       * Courses", not electives.
       *
       * A student who takes four or five of the six has surplus courses that
       * are legitimately technical electives. There is nothing to guard here
       * because `technical-electives` is attested, but if that block ever
       * becomes checkable this group must be in its `excludeGroups`, for the
       * reason `seas-major-computer-science`'s `cs-electives` documents.
       */
      note: "Choose three of the six. The Bulletin calls these Core Required Courses, not electives.",
      rule: {
        kind: "n_of",
        n: 3,
        courses: [
          "CSEE W4119",
          "EECS E4321",
          "CSEE W4823",
          "CSEE W4824",
          "CSEE W4840",
          "CSEE W4868",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "ce-laboratories",
      label: "Electrical Engineering Laboratories",
      /* Four, not the Electrical Engineering degree's five: `ELEN E3043` is
       * not printed on this page. */
      note: "All four. Each pairs with a core lecture course and the Bulletin asks that you take them in the same term where possible.",
      rule: {
        kind: "all_of",
        courses: ["ELEN E3081", "ELEN E3082", "ELEN E3083", "ELEN E3084"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "technical-electives",
      label: "Technical Electives",
      /*
       * The tempting encoding is `points_matching` at 15 over COMS/CSEE/ELEN at
       * the 3000 level, and it is wrong on four counts: "up to two from outside
       * those departments" is a cap across the chosen set; "approval of some
       * courses may depend on the other electives chosen" makes one course's
       * eligibility a function of the rest; "not-very-technical courses within
       * the school of engineering" is a per-course judgement no record carries;
       * and the 15/12 total depends on how `applied-mathematics` was satisfied.
       *
       * Only the two floors — 3000 level, no significant overlap — are shapes,
       * and they are exactly the parts that would go green while everything
       * that actually gates approval stayed unchecked.
       */
      rule: {
        kind: "attested",
        note: "15 points, all at the 3000 level or above, all technical, none significantly overlapping other courses taken for the major. Most Computer Science and Electrical Engineering courses at that level qualify, and up to two courses from outside those two departments may be approved. Economics courses, COMS W3101/W3102, and not-very-technical engineering courses are excluded by name, as is ELEN E3990 Fieldwork. Adviser approval is required, and whether a course is approved can depend on the other electives you chose — so this one is yours to confirm. The total drops to 12 points if you replaced APMA E2101 with Ordinary Differential Equations plus linear algebra.",
      },
      sourceUrl: CURRICULUM,
    },
  ],
};
