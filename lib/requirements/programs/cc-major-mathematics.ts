/**
 * The Columbia College major in Mathematics — the plain 40–42-point major.
 *
 * Transcribed by hand from the Requirements tab of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/mathematics/
 * (2026–2027 edition), read live on 2026-08-26, with two sentences taken from
 * the Overview tab of the same page — see `electives` below.
 *
 * ── One of seven programs on one tab ───────────────────────────────────────
 *
 * The Mathematics department publishes seven programs of study under a single
 * `#requirementstextcontainer`: this major, Applied Mathematics, Computer
 * Science–Mathematics, Economics-Mathematics, Mathematics-Statistics, a minor,
 * a minor in Mathematical Probability, and a legacy concentration. Only the
 * plain "Major in Mathematics" is transcribed here. A later transcriber must
 * not merge two of those tables — and if they encode the concentration, note
 * that it sits under an `<h2>` reading "For students who entered Columbia in or
 * before the 2023-24 academic year", which is a hard eligibility gate the rule
 * language cannot express (the same restriction `cc-concentration-economics`
 * carries in its note).
 *
 * ── The calculus block has seven alternatives, not three ───────────────────
 *
 * The Bulletin prints three sequences, all beginning `MATH UN1101` +
 * `MATH UN1102`, and prices the block at "13-15 points INCLUDING Advanced
 * Placement Credit". The Placement section on the same tab then tells a BC-5
 * student to BEGIN at `MATH UN1205` or `MATH UN1207`. Those two statements
 * cannot both hold under a literal four-course transcription: a BC-5 honors
 * student's record holds `UN1207` and `UN1208` and nothing else, which against
 * sequence 3 alone reads 2 of 4 — a complete student told to go back and take
 * Calculus I. That is `cc-major-economics`'s shipped bug, reproduced on the
 * department that owns calculus, and on the route the Overview tab calls
 * "especially designed for mathematics majors".
 *
 * So each printed sequence also appears in its AP-truncated form. This is the
 * one judgement in this file that is an inference from the Bulletin rather than
 * a transcription of it, and it is worth naming: the residual risk is
 * over-counting a student who reached Calculus III with neither AP credit nor
 * Calculus I–II, a schedule the registrar's own prerequisites make unbuildable.
 * Corroboration already in hand: the same department's Mathematics-Statistics
 * major prints `MATH UN1207 & MATH UN1208 & MATH UN2500` as a complete sequence
 * with no Calculus I/II in it.
 *
 * `sequence_choice` and never `n_of { n: 4 }` — `UN1101` + `UN1102` + `UN1205`
 * + `UN1202` is four calculus courses that complete nothing, and it is a
 * schedule a real student can build.
 *
 * ── Why the algebra/analysis block is split in two ─────────────────────────
 *
 * The Bulletin prints one 12-point block of four courses, but footnote 2
 * governs only half of it: "Students who are not contemplating graduate study
 * in mathematics may replace one or both of the two terms of MATH GU4061 -
 * MATH GU4062 by one or two of the following courses: MATH UN2500, MATH UN3007,
 * MATH UN3028, or MATH GU4032." Splitting keeps the algebra half `all_of` and
 * lets the analysis half carry the substitution honestly.
 *
 * Keeping the page's own shape would mean `n_of { n: 4 }` over six courses,
 * which would accept `GU4041 + UN2500 + UN3007 + GU4032` — a student with no
 * algebra at all. The analysis half is `n_of { n: 2 }` rather than a sequence
 * because footnote 2's "one or both" makes every 2-subset legal; that was
 * checked, not assumed.
 *
 * ── The arithmetic closes, and that is what proves the blocks are disjoint ──
 *
 * 13–15 (calculus) + 12 (algebra and analysis) + 3 (seminar) + 12 (electives) =
 * 40–42, exactly the published range, on both endpoints. The three sequences
 * price at 15, 13 and 14 points, which is precisely the printed 13–15.
 *
 * That reconciliation is not a formality: it is the only evidence that the four
 * blocks must be disjoint. The Bulletin never says "these must be different
 * courses" — if the 12-point elective block could be filled by the same courses
 * that filled the 12-point algebra/analysis block the real floor would be 28
 * points, not 40. Hence `excludeGroups` on the electives, without which a
 * student who has taken exactly the named requirements and zero electives
 * scores 18 points against a 12-point block and finishes the major a year
 * early. That is the vacuity bug `vacuity.test.ts` exists to catch, and it
 * shipped once on both computer science majors.
 *
 * ── Two exclusions visible only on the Overview tab ────────────────────────
 *
 * Neither is mentioned anywhere on the Requirements tab, and both are MATH
 * courses numbered above 2000, so a selector built from the requirements table
 * alone counts them:
 *
 *   "Supervising Readings do NOT count towards major requirements, with the
 *   exception of an advanced written approval by the Director of Undergraduate
 *   Studies."  → `MATH UN3901`, `MATH UN3902`.
 *
 *   "Sections of Senior Thesis in Mathematics I and II do NOT count towards the
 *   major requirements, unless prior written approval is obtained…"
 *   → `MATH UN3994`, `MATH UN3995`.
 *
 * Footnote 3 — "Only one Undergraduate Seminar may count towards the major
 * requirements" — hangs on TWO rows: on `MATH UN3951` in the seminar group, and
 * on the elective row. The second attachment is the one a skimmer loses, and it
 * is why both seminar codes are excluded by code rather than left to
 * `excludeGroups` (which removes only what the seminar group actually consumed,
 * i.e. one of the two).
 *
 * Footnote 1 keeps `MATH UN2015` out of every sequence and out of the elective
 * pool: "MATH UN2015 does NOT replace MATH UN2010 … Students will not receive
 * full credit for both courses."
 *
 * ── Cognates are enumerated, never approximated ────────────────────────────
 *
 * The elective block is "Courses offered by the department numbered 2000 or
 * higher" OR "Courses from the list of approved cognate courses below", and
 * footnote 4 says anything else needs the DUS's prior written approval. The
 * department's floor is the Bulletin's own words, so `numberRange` transcribes
 * it. The cognate half is closed, so its 79 codes are enumerated by name — no
 * numeric floor is invented over PHIL or COMS. `PHIL UN3411` counts because it
 * is on the list, not because PHIL 3000+ was swept in.
 *
 * The cognate table is a plain three-column HTML table rather than an
 * `sc_courselist`, so `parseRequirementTables` returns nothing for it.
 *
 * `points_matching` and not `n_matching` because the Bulletin counts this block
 * in points and the cognate list mixes 3- and 4-point courses (`COMS W3157`,
 * `COMS W3203`, `PHIL UN3411`, `CHEM UN3079`/`UN3080` are 4; `IEOR E6613` is
 * 4.5). A student two 4-point cognates and one 3-point MATH course in holds 11
 * points and is not finished; an `n_matching { n: 4 }` transcription would say
 * otherwise.
 *
 * NOT IN OUR CATALOG, and kept anyway — seven of the 79 cognates:
 * `CBMF W4761`, `COMS W4162`, `COMS W4762`, `COMS W4773`, `CSPH G4801`,
 * `CSPH G4802`, `PHYS GU4011`. Each is really printed on the page, none has a
 * near-miss row under another qualifier (which is what a misspelt code looks
 * like), and our catalog covers four terms. Dropping an option the Bulletin
 * offers would tell a student who took it that it did not count. The same call
 * `seas-major-mechanical-engineering` makes for `COMS W1005` and `MATH UN3027`.
 *
 * NOT ENCODED: "A maximum of 6 credits may be taken from courses outside the
 * department" — a cap across the set the student picks rather than a property
 * of any one course, which `points_matching` cannot express and which narrowing
 * the selector to MATH-only would get wrong in the other direction; footnote 4's
 * DUS petition; the "no grade of D or lower" rule; footnote 2's ELIGIBILITY half
 * ("students who are not contemplating graduate study in mathematics"), which no
 * data source records — the substitution itself is encoded, only who may use it
 * is not; the written approvals that reverse the Supervised Readings and Senior
 * Thesis exclusions; the double-counting allowances across programs, which
 * `evaluate.ts` surfaces through `crossCountedCourseIds` rather than resolving;
 * the 16-credit transfer cap; the AP credit award itself (its consequence is
 * encoded as the truncated sequences, the conditional-on-grade point award is
 * not); departmental honors, which is a 3.63 major GPA plus a thesis; and the
 * planning form, whose wording is "should" rather than "must" with no stated
 * graduation consequence — `cc-major-psychology` encodes its equivalent as an
 * `attested` group and a transcriber who prefers that has the precedent.
 *
 * OPEN, both named rather than guessed at. (1) Whether "numbered 2000 or higher"
 * reaches the 5000/6000-level rows: our catalog holds 46 `MATH GR5xxx`/`GR6xxx`/
 * `GR8xxx` rows (the MAFN master's programme), `[2000, 9999]` is the literal
 * reading and admits them, and the department recommends `MATH GR5010` by name
 * to its own Mathematics-Statistics majors. (2) Whether Barnard `MATH ...BC`
 * rows count toward the MAJOR — the Overview tab says only that they count
 * toward "degree requirements", but the Computer Science–Mathematics major on
 * the same page lists `MATH BC2006` as an explicit elective, and unlike
 * `cc-major-economics` this department bars no Barnard course by name.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/mathematics/#requirementstextcontainer";

/**
 * The department's pre-approved cognate courses, all 79, in the Bulletin's own
 * three-column order.
 *
 * Enumerated rather than approximated by subject and level. The Overview tab
 * describes what qualifies — "at least two semesters of calculus as a stated
 * prerequisite", or "mathematics beyond an elementary level" — but that is a
 * description of how the department built the list, not a rule anybody else may
 * apply: footnote 4 requires prior written approval for anything not printed
 * here.
 */
const APPROVED_COGNATES = [
  // Column 1.
  "APMA E2101",
  "APMA E3102",
  "APMA E4300",
  "APMA E4302",
  "APPH E6102",
  "CBMF W4761",
  "CHEM UN3079",
  "CHEM UN3080",
  "COMS W3134",
  "COMS W3157",
  "COMS W3203",
  "COMS W3261",
  "COMS W4111",
  "COMS W4160",
  "COMS W4162",
  "COMS W4203",
  "COMS W4261",
  "COMS W4460",
  "COMS W4701",
  "COMS W4705",
  "COMS W4762",
  "COMS W4771",
  "COMS W4773",
  "CSEE W3827",
  "CSOR W4231",
  "CSOR W4246",
  "CSPH G4801",
  "CSPH G4802",
  // Column 2.
  "ECON UN3025",
  "ECON BC3035",
  "ECON BC3038",
  "ECON UN3211",
  "ECON UN3213",
  "ECON UN3265",
  "ECON UN3412",
  "ECON GU4020",
  "ECON GU4230",
  "ECON GU4280",
  "ECON GU4415",
  "ECON GU4710",
  "EEOR E6616",
  "EESC UN3400",
  "EESC GU4008",
  "EESC GU4090",
  "EESC GU4924",
  "IEOR E3106",
  "IEOR E3658",
  "IEOR E4700",
  "IEOR E6613",
  "MSAE E3010",
  "MSAE E3111",
  "PHIL UN3411",
  "PHIL GU4424",
  "PHIL GU4431",
  "PHIL GU4561",
  "PHIL GU4810",
  // Column 3.
  "PHYS UN2601",
  "PHYS UN2801",
  "PHYS UN2802",
  "PHYS UN3003",
  "PHYS UN3007",
  "PHYS UN3008",
  "PHYS GU4011",
  "PHYS GU4018",
  "PHYS GU4019",
  "PHYS GU4021",
  "PHYS GU4022",
  "PHYS GU4023",
  "PHYS GU4040",
  "PHYS GR6047",
  "PHYS GR6080",
  "POLS GU4700",
  "STAT UN3106",
  "STAT GU4001",
  "STAT GU4203",
  "STAT GU4204",
  "STAT GU4205",
  "STAT GU4206",
  "STAT GU4207",
];

export const CC_MAJOR_MATHEMATICS: Program = {
  id: "cc-major-mathematics",
  kind: "major",
  school: "CC",
  name: "Mathematics",
  department: "Mathematics",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "calculus-sequence",
      label: "Calculus and Linear Algebra",
      /*
       * Seven alternatives: the Bulletin's three, plus each one's
       * AP-truncated form. See the header for why, and for the residual risk.
       */
      note: "One complete sequence, every term of whichever you pick. Advanced Placement credit can stand in for Calculus I, or for Calculus I and II — the Bulletin prices this block at \"13-15 points including Advanced Placement Credit\", so a course you tested out of will not appear on your record and does not need to. Credit is allowed for only one calculus and linear algebra sequence. MATH UN2015 Linear Algebra and Probability does not replace MATH UN2010, and you will not receive full credit for both. Consult the Calculus Director about placement.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Calculus I–IV and Linear Algebra",
            courses: [
              "MATH UN1101",
              "MATH UN1102",
              "MATH UN1201",
              "MATH UN1202",
              "MATH UN2010",
            ],
          },
          {
            label: "Calculus I–IV and Linear Algebra, Calculus I by AP",
            courses: ["MATH UN1102", "MATH UN1201", "MATH UN1202", "MATH UN2010"],
          },
          {
            label: "Calculus I–IV and Linear Algebra, Calculus I–II by AP",
            courses: ["MATH UN1201", "MATH UN1202", "MATH UN2010"],
          },
          {
            label: "Accelerated Multivariable Calculus and Linear Algebra",
            courses: ["MATH UN1101", "MATH UN1102", "MATH UN1205", "MATH UN2010"],
          },
          {
            label:
              "Accelerated Multivariable Calculus and Linear Algebra, Calculus I–II by AP",
            courses: ["MATH UN1205", "MATH UN2010"],
          },
          {
            label: "Honors Mathematics A and B",
            courses: ["MATH UN1101", "MATH UN1102", "MATH UN1207", "MATH UN1208"],
          },
          {
            label: "Honors Mathematics A and B, Calculus I–II by AP",
            courses: ["MATH UN1207", "MATH UN1208"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "modern-algebra",
      label: "Modern Algebra",
      note: "Both terms. Six of the major's twelve points of algebra and analysis. No footnote offers a substitute for either term.",
      rule: { kind: "all_of", courses: ["MATH GU4041", "MATH GU4042"] },
      sourceUrl: SOURCE,
    },
    {
      id: "modern-analysis",
      label: "Modern Analysis",
      /*
       * `n_of { n: 2 }` over six is exactly what footnote 2 says and nothing
       * more: keep both terms, replace one, or replace both. Not a
       * `sequence_choice` — once either term may be swapped independently
       * there is no pairing left to protect.
       */
      note: "Two courses. The Bulletin's default is Introduction to Modern Analysis I and II; if you are not contemplating graduate study in mathematics you may replace one or both terms with Analysis and Optimization, Complex Variables, Partial Differential Equations, or Fourier Analysis. Whichever two you use here cannot also count as electives.",
      rule: {
        kind: "n_of",
        n: 2,
        courses: [
          "MATH GU4061",
          "MATH GU4062",
          "MATH UN2500",
          "MATH UN3007",
          "MATH UN3028",
          "MATH GU4032",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "seminar",
      label: "Undergraduate Seminar",
      note: "One undergraduate seminar, usually in the junior or senior year. Only one seminar can count toward the major, so a second one will not fill an elective slot either.",
      rule: { kind: "n_of", n: 1, courses: ["MATH UN3951", "MATH UN3952"] },
      sourceUrl: SOURCE,
    },
    {
      id: "electives",
      label: "Electives",
      /*
       * Two of the seven `exclude` codes come from a different page than this
       * group's `sourceUrl`: the Supervised Readings and Senior Thesis
       * sentences are published only on the Overview tab,
       * https://bulletin.columbia.edu/columbia-college/departments-instruction/mathematics/
       *
       * `excludeGroups` is mandatory here, not defensive. Every named
       * requirement above except the calculus block is a MATH course numbered
       * 2000 or higher; without the exclusion the major's 40-point floor
       * collapses to 28. The Bulletin never states disjointness in prose — its
       * arithmetic states it, which is why the header shows the arithmetic.
       *
       * The seminar codes are excluded BY CODE rather than left to
       * `excludeGroups`, because footnote 3 bars a SECOND seminar and
       * `excludeGroups` would only remove the one the seminar group consumed.
       */
      note: "Twelve points. Anything the Mathematics Department offers at the 2000 level or above, plus the department's list of approved cognate courses — but at most 6 credits may come from outside the department, a cap this audit does not enforce, so count it yourself. Courses that already satisfied the sequence, the algebra requirement or the analysis requirement do not count again. Supervised Readings, Senior Thesis and a second Undergraduate Seminar do not count at all without the Director of Undergraduate Studies' prior written approval. A cognate that is not on the approved list needs that approval too, and will not be matched here.",
      rule: {
        kind: "points_matching",
        points: 12,
        select: {
          subjects: ["MATH"],
          numberRange: [2000, 9999],
          include: APPROVED_COGNATES,
          exclude: [
            // Footnote 3: only one Undergraduate Seminar counts, ever.
            "MATH UN3951",
            "MATH UN3952",
            // Overview tab: Supervised Readings do not count.
            "MATH UN3901",
            "MATH UN3902",
            // Overview tab: Senior Thesis I and II do not count.
            "MATH UN3994",
            "MATH UN3995",
            // Footnote 1: no full credit alongside MATH UN2010.
            "MATH UN2015",
          ],
          excludeGroups: ["calculus-sequence", "modern-algebra", "modern-analysis"],
        },
      },
      sourceUrl: SOURCE,
    },
  ],
};
