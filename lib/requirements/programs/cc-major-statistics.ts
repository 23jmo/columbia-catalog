/**
 * The Columbia College major in Statistics.
 *
 * Transcribed by hand from the Requirements tab of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/statistics/
 * (2026–2027 edition), read on 2026-08-26, with two sentences taken from the
 * Overview tab of the same page.
 *
 * ── One of seven programs on one tab ───────────────────────────────────────
 *
 * The department publishes the Statistics major alongside Data Science,
 * Economics-Statistics, Mathematics-Statistics, Political Science–Statistics, a
 * minor and a legacy concentration, all under one
 * `#requirementstextcontainer`. Only the plain "Major in Statistics" is here.
 *
 * This major is counted in COURSES, not points — "The major requires 14
 * courses" — and every `hourscol` cell in its table is empty.
 *
 * ── The honors mathematics route is a bullet with no marker ────────────────
 *
 * The mathematics block prints four rows and looks like an `all_of`. The
 * sentence that replaces all four sits BELOW the table, in a plain `<ul>`, with
 * no footnote marker of any kind:
 *
 *   "The mathematics prerequisite can also be satisfied by taking the Honors
 *   Mathematics A and B sequence, MATH UN1207 and MATH UN1208."
 *
 * There is not a single `<sup>` element anywhere on this Requirements tab, so
 * the usual footnote sweep finds nothing and a transcriber loses this. Encoded
 * as `all_of` over the four, a student who took Honors Mathematics A and B
 * reads 0 of 4 on the largest block of the major, and the only way to clear it
 * is to go back and take four courses they have surpassed.
 *
 * The bullet says "the mathematics PREREQUISITE", singular — the whole
 * four-course block, not just its calculus part. Two confirmations from tables
 * the same department publishes on the same page: Economics-Statistics prints
 * `MATH UN1207 & MATH UN1208` as a complete two-course alternative to a
 * four-course sequence, and Mathematics-Statistics prints
 * `MATH UN1207 & MATH UN1208 & MATH UN2500` — Honors A/B standing in for
 * Calculus I–III AND Linear Algebra with only the analysis course added. The
 * Mathematics department says why: Honors A/B "covers multivariable calculus …
 * and linear algebra … with an emphasis on theory."
 *
 * `MATH UN1205` is deliberately ABSENT, and the absence is conspicuous. The
 * department accepts Accelerated Multivariable Calculus in three of the four
 * other majors on this same page, and the Mathematics department accepts it in
 * every one of its own — but it is printed nowhere in the Statistics major's
 * table or bullets. This file transcribes what is printed and says so in the
 * note, rather than adding a route the page does not offer or pretending the
 * gap is not there. AP-truncated calculus is left out on the same reasoning:
 * `cc-major-mathematics` encodes truncated sequences because ITS block prints
 * "including Advanced Placement Credit", and this one prints no such licence.
 *
 * ── Three electives, not five: the Bulletin contradicts itself ─────────────
 *
 * The Electives block prints "(three courses)" in its header and then, as its
 * first row, "Five courses chosen from Statistics courses numbered from GU4207
 * through GU4293." Four independent confirmations say three:
 *
 *   1. The block's own header, and its second row — "an approved selection of
 *      THREE advanced courses".
 *   2. The arithmetic. 4 + 1 + 1 + 5 + 3 = 14, the published total. With five it
 *      is 16.
 *   3. The Overview tab, describing the same major in prose: "…five core courses
 *      in probability and theoretical and applied statistics, PLUS THREE
 *      ELECTIVES."
 *   4. The 2025–2026 edition of this page, where the Electives block has one row
 *      and no "Five courses…" row at all, the header still reads "(three
 *      courses)" and the total still reads 14. The row is new in 2026–2027.
 *      Archived at web.archive.org/web/20250803113957/…/statistics/
 *
 * Two further tells that the inserted row is not a considered edit: it opens its
 * band at `GU4207`, which is already a required core course in the block
 * directly above it, and the same revision broke "Choose one of the following"
 * into "Chose one of the following" in the computing block. It reads like a
 * paste from a sibling program that was never reconciled.
 *
 * Worth naming the direction of the failure, because the brief's trap works both
 * ways: on `seas-core` a sum that did not close meant a DROPPED heading; here it
 * means an INSERTED row, and only the edition diff distinguishes them.
 *
 * The same contradiction appears byte for byte on the General Studies rendering
 * of this major — the two schools share one CourseLeaf block — so any GS
 * encoding inherits it.
 *
 * ── Why the electives are split into a checked group and an attested one ───
 *
 * "An approved selection of three advanced courses in mathematics, statistics,
 * applied mathematics, industrial engineering and operations research, computer
 * science, or an advanced quantitative course in a social science. At least one
 * elective must be a Statistics Department course numbered between 4221 and
 * 4291."
 *
 * The last sentence names a decidable set with both endpoints printed by the
 * Bulletin, and that band is disjoint from every other group here — the core
 * stops at `GU4207` and the prerequisite is `UN1201` — so it cannot be satisfied
 * by coursework another group already claimed. It is `n_matching`, and a student
 * gets an automatic check on a third of their elective requirement.
 *
 * The rest defeats every selector we have, three times over: "an approved
 * selection" is a DUS petition; "an advanced quantitative course in a social
 * science" is a per-course judgement no `requirement_flags` field records; and
 * "advanced" is applied to five subjects with no numeric floor given for any of
 * them, so any floor would be ours rather than the department's. That half is
 * `attested` — the `seas-core` List B shape.
 *
 * The cost of splitting is that one course can legitimately appear in the
 * checked group and inside the attested one. That is harmless — `attested`
 * groups consume nothing and the two report different things — but it is a
 * modelling choice, and the single-group alternative is
 * `seas-major-mechanical-engineering`'s `technical-electives`.
 *
 * ── What the computing block is NOT ────────────────────────────────────────
 *
 * A closed list of three named courses, so `n_of` and the exact tier. The "or an
 * advanced computer science offering in programming" escape hatch — which would
 * have forced `attested` — appears in the Mathematics-Statistics and
 * Economics-Statistics tables on this same page and is absent from this one.
 * `COMS W1005` and `COMS W1007`, offered as computing options in three sibling
 * majors, are likewise not listed here.
 *
 * NOT ENCODED: the Pass/D/Fail and grade-of-D bar; the DUS approval and the
 * social-science predicate behind `advanced-electives`; the contradictory "Five
 * courses…" row, quoted in that group's note so a student who reads the Bulletin
 * is not left thinking the audit is broken; the residency rule; the
 * transfer-credit caps ("no more than two DUS-approved STAT courses toward a
 * Statistics major may be fulfilled with transfer credit"), carried in the
 * elective note because that is the block a transfer course lands in; the
 * study-abroad petition; department honors, which is GPA plus editorial
 * judgement; and "the major should be planned with the director of undergraduate
 * studies", which unlike Psychology's checklist carries no deadline and no
 * stated graduation consequence, so it is not an `attested` group here.
 *
 * NO 14-COURSE ROLL-UP, and it is not encodable even in principle: the fourteen
 * span MATH, STAT and COMS so no selector describes them, and a student on the
 * honors route takes twelve rather than fourteen — a consequence the Bulletin
 * publishes both halves of without reconciling.
 *
 * Every code this program's rules name resolves against our catalog; there are
 * no missing-course caveats on this page. (For a transcriber of the sibling
 * majors: `COMS W1005`, `COMS W1007`, `COMS W3137`, `COMS W4130` and
 * `STAT GU4262` are named elsewhere on this tab and have no catalog row. None is
 * reachable from this major.)
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/statistics/#requirementstextcontainer";

export const CC_MAJOR_STATISTICS: Program = {
  id: "cc-major-statistics",
  kind: "major",
  school: "CC",
  name: "Statistics",
  department: "Statistics",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "mathematics-prerequisite",
      label: "Mathematics Prerequisites",
      /*
       * `sequence_choice`, and both wrong answers cost a real student a real
       * amount of work: `all_of` over the printed four fails every honors
       * student, and `n_of { n: 4 }` over the union passes
       * `UN1101 + UN1102 + UN1207 + UN1201` — four courses, no completed route.
       */
      note: "One complete sequence, every term of whichever you pick. The Bulletin prints the four-course calculus and linear algebra route and, in a bullet under the table, accepts Honors Mathematics A and B instead. It does not name Accelerated Multivariable Calculus (MATH UN1205) for this major, although the department accepts it for Data Science, Economics-Statistics and Mathematics-Statistics — if you took it, ask the Director of Undergraduate Studies before you count it. If Advanced Placement credit covered Calculus I or II for you, this group will read short; that is us being cautious, not the department saying no.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Calculus I–III and Linear Algebra",
            courses: ["MATH UN1101", "MATH UN1102", "MATH UN1201", "MATH UN2010"],
          },
          {
            label: "Honors Mathematics A and B",
            courses: ["MATH UN1207", "MATH UN1208"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "computing",
      label: "Computer Science Requirement",
      note: "One. Applied Statistical Computing counts as the computing course; if you use it here it is not also one of the electives.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["COMS W1004", "ENGI E1006", "STAT UN2102"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "statistics-prerequisite",
      label: "Statistics Prerequisite",
      /*
       * One named course and no alternative anywhere on the page. Checked in
       * the opposite direction too: the Economics department's "STAT UN1201, or
       * a higher level course" phrasing does NOT appear here, so no
       * substitution was imported from a neighbouring file.
       */
      note: "Calculus-Based Introduction to Statistics, taken at Columbia. A 5 on the AP Statistics exam does not exempt you — the department says so explicitly. Take it before Probability Theory.",
      rule: { kind: "all_of", courses: ["STAT UN1201"] },
      sourceUrl: SOURCE,
    },
    {
      id: "statistics-core",
      label: "Core Courses in Probability and Statistics",
      note: "All five. The Bulletin advises taking STAT UN1201, GU4203, GU4204 and GU4205 in sequence, and GU4206 then GU4241 then GU4242 in sequence; courses in stochastic analysis should follow GU4203.",
      rule: {
        kind: "all_of",
        courses: [
          "STAT GU4203",
          "STAT GU4204",
          "STAT GU4205",
          "STAT GU4206",
          "STAT GU4207",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "statistics-elective",
      label: "Statistics Elective",
      /*
       * The one decidable clause in the elective sentence. Both endpoints are
       * the Bulletin's own, and the band is disjoint from every other group in
       * this program, so this is a transcribed floor rather than an invented
       * one.
       */
      note: "At least one of your three electives must be a Statistics Department course numbered between 4221 and 4291.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: { subjects: ["STAT"], numberRange: [4221, 4291] },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "advanced-electives",
      label: "Advanced Electives",
      rule: {
        kind: "attested",
        note: "Three advanced courses, approved by the Director of Undergraduate Studies, in mathematics, statistics, applied mathematics, industrial engineering and operations research, or computer science — or an advanced quantitative course in a social science. At least one of the three must be a Statistics Department course numbered between 4221 and 4291, which is the one part of this we check for you. Courses used for the mathematics prerequisite, the computing requirement, the statistics prerequisite or the five core courses are not among these three. If you are preparing for graduate study in statistics, the department encourages replacing two of the three with MATH GU4061 and MATH GU4062. No more than two of the STAT courses you count toward this major may be transfer credit. The 2026-2027 Bulletin also prints a contradictory row here reading \"Five courses chosen from Statistics courses numbered from GU4207 through GU4293\"; the block's own header, the major's 14-course total, the Overview tab and the previous edition all say three, so three is what this audit asks for.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
