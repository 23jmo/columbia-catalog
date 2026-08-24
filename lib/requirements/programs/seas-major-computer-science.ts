/**
 * The Columbia Engineering B.S. in Computer Science.
 *
 * **This is a different program from `cc-major-computer-science`.** Same
 * department, same building, different degree and materially different rules —
 * a SEAS computer science student and a Columbia College one do not take the
 * same major. Encoding only the College one, which is what this module did
 * until now, silently told every SEAS student the wrong thing.
 *
 * Transcribed by hand from the Curriculum tab of
 * https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/computer-science/undergraduate-programs/computer-science-bs/
 * (2026–2027 edition).
 *
 * NOTE ON THE URL PATTERN: engineering programs are NOT at
 * `/engineering/departments-instruction/<dept>/`. They are three levels deep at
 * `/columbia-engineering/academic-departments-programs/<dept>/undergraduate-programs/<program>-bs/`,
 * and the department page itself carries no requirement tables at all.
 *
 * ── The four differences from the College major, all real ───────────────────
 *
 * 1. **Calculus is `all_of`, not `n_of`.** The College page heads its calculus
 *    table "Select one of the following courses" over MATH UN1201 / MATH UN1205
 *    / APMA E2000. The SEAS page heads its table "Calculus Requirement" with no
 *    selection phrase and lists MATH UN1101, MATH UN1102 and APMA E2000 — three
 *    courses, all required. Treating the two pages as interchangeable turns a
 *    three-course requirement into a one-course one.
 *
 * 2. **`ENGI E1006` is required here.** The College page prints it
 *    "(recommended but not required)"; the SEAS page states the degree
 *    "requires at minimum 62 points (including ENGI E1006 as a prerequisite to
 *    the major)".
 *
 * 3. **Four area foundation courses and four CS electives**, against three and
 *    three at the College.
 *
 * 4. **Four General Technical Electives**, which the College major does not
 *    have at all.
 *
 * And one difference that is not about the major at all: a SEAS degree carries
 * physics, chemistry or biology, a laboratory and The Art of Engineering, none
 * of which a Columbia College computer science student takes. Those four groups
 * are below.
 *
 * ── The Bulletin contradicts itself on two course codes ─────────────────────
 *
 * The College page writes `COMS W4119` and `CSOR E4231`; this page writes
 * `CSEE W4119` and `CSOR W4231` for the same two courses. Both spellings are
 * transcribed as their own page prints them rather than reconciled, because the
 * point of `sourceUrl` is that a student can check this file against the page
 * it came from. `CSEE W4119` and `CSOR W4231` are the spellings the registrar
 * uses, so the SEAS page is the one that is right.
 *
 * ── Why the electives are `points_matching` and the GTEs are `attested` ─────
 *
 * The CS electives rule is "any four COMS courses, or jointly offered computer
 * science courses such as CSXX or XXCS courses (excluding CSER), worth at least
 * 3 points, at the 3000 level or above". "CSXX or XXCS" is a naming pattern
 * over subject codes, and the selector's `subjects` list is exact strings — so
 * the concrete cross-listed subjects are enumerated instead, which is what the
 * College file already does. Points rather than a course count, because the
 * satisfying courses are variable-credit.
 *
 * The General Technical Electives cannot be done the same way. "Any SEAS
 * department" is not a subject code — it is a dozen of them, and the list is
 * given as prose department names ("Biomedical Informatics", "Ecology,
 * Evolution, and Environmental Biology") that do not map to subjects one to
 * one. Guessing that mapping would produce a requirement satisfied by courses
 * the department will reject. `attested`, with the department list in the note.
 *
 * ── What this file covers ──────────────────────────────────────────────────
 *
 * The whole degree, not just the major. The Bulletin splits it in two — the
 * "CS Major Requirements" block (a minimum of 62 points: core, area foundation,
 * CS electives, general technical electives) and the Degree Track table above
 * it, which carries the mathematics, physics, chemistry/biology, laboratory and
 * Art of Engineering requirements every SEAS student has. Both are here,
 * because a student reading an audit does not care which of the Bulletin's two
 * tables a requirement came from; they care whether they can graduate.
 *
 * The one thing deliberately left out is the 27-point nontechnical requirement,
 * which lives on `seas-core` and is shared by every engineering degree.
 *
 * NOT ENCODED: the letter-grade rule and the one-D allowance; the transfer
 * caps; the "no more than one course from each set" restrictions
 * (IEOR E3658/STAT UN1201/STAT GU4001; MATH UN2015/MATH UN2010/APMA E3101/
 * COMS W3251; COMS W4771/COMS W4721/STAT GU4241), which are constraints across
 * the student's selections rather than properties of any course; the 6-point
 * cap on project and research courses; the thesis substitution for up to 6
 * points of CS electives; and the AP exemption from COMS W1004, which leaves no
 * course on a record. The 27-point nontechnical requirement lives on
 * `seas-core` and is deliberately not repeated here.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/computer-science/undergraduate-programs/computer-science-bs/#curriculumtextcontainer";

/**
 * The Area Foundation list, verbatim from the SEAS page's table. Note this is
 * NOT identical to the College page's list of the same name: `CSEE W4119` and
 * `CSOR W4231` appear here as `COMS W4119` and `CSOR E4231` there.
 */
const AREA_FOUNDATION = [
  "COMS W4111",
  "COMS W4113",
  "COMS W4115",
  "COMS W4118",
  "CSEE W4119",
  "COMS W4152",
  "COMS W4156",
  "COMS W4160",
  "COMS W4167",
  "COMS W4170",
  "COMS W4181",
  "CSOR W4231",
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

export const SEAS_MAJOR_COMPUTER_SCIENCE: Program = {
  id: "seas-major-computer-science",
  kind: "major",
  school: "SEAS",
  name: "Computer Science",
  department: "Computer Science",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "prerequisite",
      label: "Prerequisite to the major",
      note: "Introduction to Computing for Engineers and Applied Scientists. All CS majors should take it in their first or second semester. Unlike the Columbia College major, this one requires it.",
      rule: { kind: "all_of", courses: ["ENGI E1006"] },
      sourceUrl: SOURCE,
    },
    {
      id: "calculus",
      label: "Calculus",
      /*
       * `all_of`, not `n_of`. The SEAS table's areaheader is bare — "Calculus
       * Requirement" — with no "select one of the following", and the three
       * rows are three required courses. The College page's identically named
       * requirement IS a choice. This is the single easiest thing to get wrong
       * by assuming the two pages agree.
       */
      note: "All three. APMA E2000 also carries a required 0-point recitation, APMA E2001, which is not matched here.",
      rule: {
        kind: "all_of",
        courses: ["MATH UN1101", "MATH UN1102", "APMA E2000"],
      },
      sourceUrl: SOURCE,
    },
    /*
     * ── The science block, added 2026-08-24 ──────────────────────────────────
     *
     * Physics, Chemistry/Biology, the laboratory and The Art of Engineering are
     * degree requirements every SEAS student has, and they were missing from
     * this file entirely. They are NOT on `seas-core`, which deliberately
     * carries only the 27-point nontechnical Core and says so: "NOT ENCODED:
     * the technical requirements (math, science, computing, the major's own
     * track), which vary per department and belong on the department's own
     * program".
     *
     * Both sibling SEAS programs already followed that instruction —
     * `seas-major-mechanical-engineering` and `seas-major-operations-research`
     * each carry `physics`, `chemistry`, `science-laboratory` and
     * `engineering-foundations`. This file did not, so a SEAS computer science
     * student was shown a degree with no science in it at all: four whole
     * requirements, roughly 17 points, that simply never appeared.
     *
     * Transcribed from the Degree Track table on the same page as the rest of
     * this file and verified against the catalog on 2026-08-24. Every course
     * below resolves to a real row except `EEEB UN2005`, which the Bulletin
     * lists but which is not in our catalog — kept, because a named course that
     * never matches costs nothing, and silently dropping an option the Bulletin
     * offers would tell a student who took it that it did not count.
     */
    {
      id: "physics",
      label: "Physics",
      /*
       * `sequence_choice`, not `n_of { n: 2 }`, for the reason the IEOR file
       * gives: the first term of one sequence and the second of another is a
       * schedule a student can actually build, and it satisfies nothing.
       */
      note: "One complete two-term physics sequence — both terms of whichever you pick.",
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
      id: "chemistry-or-biology",
      label: "Chemistry or Biology",
      /*
       * Wider than the `chemistry` group on the other two SEAS programs, and named
       * differently on purpose: the CS degree track offers environmental
       * biology as an alternative to general chemistry, which MechE and IEOR
       * do not. Copying their group wholesale would have refused a course this
       * degree explicitly accepts.
       */
      note: "One lecture course, taken in semester I or II. EEEB UN2005 is listed by the Bulletin but is not in our catalog, so it will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["CHEM UN1403", "EEEB UN2001", "EEEB UN2005"],
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
      id: "engineering-foundations",
      label: "The Art of Engineering",
      /*
       * ENGI E1102 alone, where MechE and IEOR pair it with ECON UN1105.
       * Principles of Economics is already a group on `seas-core`, so
       * repeating it here would show a SEAS computer science student the same
       * requirement twice and let one of the two go green while the other
       * stayed red. The sibling files double-count it; that is their bug to
       * fix, not a pattern to copy.
       */
      note: "Principles of Economics is also required, and is tracked on the Liberal Arts Core rather than repeated here.",
      rule: { kind: "all_of", courses: ["ENGI E1102"] },
      sourceUrl: SOURCE,
    },
    {
      id: "linear-algebra",
      label: "Linear Algebra",
      note: "Choose one. MATH UN2015 may satisfy this and the probability/statistics requirement at the same time — the department says so explicitly.",
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
      note: "Choose one. MATH UN2015 may simultaneously satisfy this and the linear algebra requirement without any additional class.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["IEOR E3658", "STAT UN1201", "STAT GU4001", "MATH UN2015"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "intro-programming",
      label: "Introductory Programming",
      note: "COMS W1004, or COMS W1007 for students with prior experience. A 4 or 5 on the CS AP exam exempts you from this and leaves nothing on your record to match.",
      rule: { kind: "n_of", n: 1, courses: ["COMS W1004", "COMS W1007"] },
      sourceUrl: SOURCE,
    },
    {
      id: "data-structures",
      label: "Data Structures",
      note: "COMS W3134, or the honors course COMS W3137.",
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
      label: "Area Foundation Courses",
      note: "Choose four — one more than the Columbia College major asks for. A thesis may not be substituted for any of these.",
      rule: { kind: "n_of", n: 4, courses: AREA_FOUNDATION },
      sourceUrl: SOURCE,
    },
    {
      id: "cs-electives",
      label: "Computer Science Electives",
      /*
       * `points_matching`, for the same reason as the College major: the
       * satisfying courses are variable-credit, so counting them as one course
       * each would let a student finish four courses and several points short.
       * The subject list is the four cross-listed prefixes that actually occur
       * in the department's own area-foundation table. The Bulletin's phrasing
       * ("CSXX or XXCS") is a naming pattern, not an enumeration, so any
       * jointly-offered subject outside those four is missed rather than
       * guessed at — under-counting a student is recoverable, telling them a
       * requirement is done when it is not is not.
       */
      note: "Any four COMS or jointly-offered computer science courses (CSXX or XXCS, excluding CSER) worth at least 3 points at the 3000 level or above — 12 points. Only COMS, CSEE, CSOR and CBMF are matched here. A thesis may replace up to 6 of these points.",
      rule: {
        kind: "points_matching",
        points: 12,
        select: {
          subjects: ["COMS", "CSEE", "CSOR", "CBMF"],
          numberRange: [3000, 9999],
          /*
           * Without this the requirement is vacuous. Data Structures and all
           * four CS Core courses are COMS/CSEE at the 3000 level, so a student
           * who had taken exactly the required curriculum and not one elective
           * scored 12/12 here — the audit told them a requirement was finished
           * that they had not started. Verified against the live evaluator
           * before and after (2026-08-24).
           *
           * `area-foundation` is listed too, and it is the case that makes this
           * a group reference rather than a longer `exclude` list: the rule is
           * "choose four of twenty-one", so only the four that actually counted
           * are removed. A student who takes six area-foundation courses keeps
           * the other two as electives, which is correct and which a static
           * exclusion of all twenty-one would have got wrong.
           */
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
    {
      id: "general-technical-electives",
      label: "General Technical Electives",
      /*
       * Attested. "Any SEAS department" is not a subject code, and the rest of
       * the list is prose department names rather than subjects. Mapping them
       * by hand would be a guess, and the page says "There are no exceptions",
       * so a wrong guess is expensive.
       */
      rule: {
        kind: "attested",
        note: "Four courses, each at least 3 points and at the 3000 level or above, from: any SEAS department, Astronomy, Biomedical Informatics, Biological Science, Chemistry, Earth and Environmental Sciences, Ecology/Evolution/Environmental Biology, Mathematics, Physics, Psychology, Statistics, or Economics. The Bulletin says there are no exceptions to that list.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
