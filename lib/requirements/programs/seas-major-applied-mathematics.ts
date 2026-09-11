/**
 * The Columbia Engineering B.S. in Applied Mathematics.
 *
 * Transcribed by hand from
 * https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/applied-physics-applied-mathematics/undergraduate-programs/applied-mathematics-bs/
 * (2026–2027 edition) — the Degree Track tab for the course rows and the two
 * Group A / Group B tables, the Curriculum tab for the seminar and
 * technical-elective policy, and the Bulletin-hosted chart
 * `2026-2027_Engineering_Bulletin_Charts_APAM.pdf` for the point values.
 *
 * Every code was checked twice: against our catalog, and against the Bulletin's
 * own course-inventory endpoint. That second check found two codes the Bulletin
 * prints that do not exist in the Bulletin's own database — see the bottom of
 * this header.
 *
 * ── One program, not a track, and not a shared APAM file ───────────────────
 *
 * The department index says it in one sentence: "The Department of Applied
 * Physics and Applied Mathematics offers three undergraduate programs: applied
 * physics, applied mathematics, and materials science." Each has its own page,
 * its own eight-semester grid, its own footnote set and its own PDF chart, and
 * there is a fourth page for the double major precisely because they are two
 * programs.
 *
 * The first two years look shared and are not. The Bulletin *duplicates* the
 * block rather than sharing it, and the copies differ: Applied Physics carries
 * a Python-proficiency waiver footnote on `ENGI E1006` that this page does not,
 * and this page carries physics footnotes 2 and 3 that Applied Physics does
 * not. A shared file would have to pick one page's footnotes and be wrong for
 * the other program — and it would make two programs both claim
 * `MATH UN1101`, which `crossCountedCourseIds` would then report to the student
 * as a course counting toward two requirements when it is one. `excludeGroups`
 * also cannot cross a program boundary, and the elective group below is
 * vacuous without it.
 *
 * ── The four hidden substitutions are the whole risk on this page ──────────
 *
 * The grid prints six APMA/MATH core courses as flat rows and hides four
 * one-for-one substitutions in a single footnote. Transcribed as
 * `all_of [APMA E3101, APMA E3102, APMA E4204, APMA E4300, APMA E4101,
 * MATH GU4061]` — which is exactly what the grid looks like — a student who
 * took `MATH UN2010`, `MATH UN3028`, `MATH UN3007` and `MATH UN2500`, every one
 * of them explicitly blessed by the Bulletin, is shown **four unmet
 * requirements** and told to retake four courses they have already covered.
 * That is the MechE footnote-3 failure, four times over on one page.
 *
 * The tell is that footnote 5 hangs on four cells and not on the two beside
 * them: `APMA E4300` and `APMA E4101` carry no marker, and they are the two
 * core courses the Bulletin offers no substitute for.
 *
 * ── How this degree differs from the other SEAS majors here ────────────────
 *
 *   Physics runs **three** terms for sequences 1 and 2 and two for sequence 3,
 *   and the third-year laboratory is sequence-dependent.
 *
 *   The laboratory is `PHYS UN1494` or `PHYS UN3081` only — not the five-option
 *   list `seas-major-operations-research` and `seas-major-computer-science`
 *   share — plus an open-ended "or a lab course in Astronomy, Astrophysics,
 *   Biology, or Chemistry" that names no course and is not encoded.
 *
 *   Chemistry is **one** course of chemistry *or* biology, with "or higher" on
 *   two of the three options.
 *
 *   `ELEN E1201` is not required.
 *
 * ── The point arithmetic, and why it is supposed to come up short ──────────
 *
 * The published track sums to about 119, and to about 121–122 taking the most
 * expensive branch everywhere, against a degree requirement of 128. That is not
 * a missing block. The SEAS *Junior and Senior Programs* page says the degree
 * requires "the completion of a **minimum of 128 academic credits**" and then
 * enumerates the program requirements as a separate list of things the degree
 * *includes*. 128 is a credit floor the student tops up with their own elective
 * credit; nothing claims the prescribed track equals it.
 *
 * Three things corroborate that reading. APAM's chart omits a first/second-year
 * total where ChemE's prints one, and the reason is visible on the page — APAM
 * prescribes about 14 points a term in years 1–2 where ChemE prescribes 17,
 * because ChemE loads three department courses and an 11-point elective block
 * into the same two years that this program leaves as a single 3-point
 * technical elective. ChemE's "TOTAL POINTS 17 17 17 17" is itself footnoted as
 * one illustrative branch. And the two totals this page *does* publish both
 * close exactly: the third and fourth years carry 27 points of elective content
 * of which 15 are technical, and the nontechnical requirement reaches its 27
 * with 3 points to spare, which is precisely what the Curriculum tab describes.
 *
 * So this file carries no `degreePoints`. `seas-core` already holds the 128.
 *
 * ── Which requirements live on `seas-core` instead ─────────────────────────
 *
 * `ENGL CC1010`, the Lit Hum / CC / Global Core sequence, Art or Music
 * Humanities, the List B nontechnical electives and physical education. So is
 * **`ECON UN1105`**, printed on this grid in semester IV and already
 * `seas-core`'s `principles-of-economics` group — the 2026-08-24
 * de-duplication. `ENGI E1102` goes the other way, encoded per major so no
 * course is evaluated twice.
 *
 * One thing this page settles for `seas-core`: its semesters III and IV render
 * the nontechnical choice as **three** labelled alternatives — `HUMA CC1001`,
 * `COCI CC1101`, and a third row reading "Global Core (3-4)". That is the third
 * alternative whose heading CourseLeaf drops on the SEAS core page, and it is a
 * fourth independent confirmation of the reasoning in that file's header. The
 * naming is not stable across departments: the SEAS Computer Science page
 * renders the same row as "Major Cultures (3–4)".
 *
 * NOT ENCODED, and why: "or higher" on `CHEM UN1403` and on `BIOL UN2005`, and
 * "or a lab course in Astronomy, Astrophysics, Biology, or Chemistry" — three
 * open-ended substitutions naming no courses, where a numeric floor would sweep
 * in courses the department has not approved. Advanced-standing calculus
 * placement, which leaves no course on a record. The adviser's-permission
 * substitution for `APMA E3900`. The technical-elective definition, where "any
 * course in science, math, or engineering" is a prose department category and
 * the exclusion is defined by membership of a *minor*, which no course record
 * carries. The 3.0-GPA gate on transferring into the major, and the double
 * major's 3.75 GPA, seminar waiver and 143-point floor. Term ordering.
 *
 * The department's "Elective Specializations in APAM" lists are also
 * deliberately absent: the index page says outright that "there is no
 * requirement to focus electives". They are the reason the CourseLeaf parser
 * must not be pointed at `…/undergraduate-programs/` — it would emit a dozen
 * requirement groups that are not requirements.
 *
 * ── Two codes the Bulletin prints that do not exist ────────────────────────
 *
 * `COMS W3561`, offered in footnote 5 as a substitute for `APMA E3101`, returns
 * an empty record from the Bulletin's own course endpoint. It is not a course
 * anywhere in the Bulletin, not merely absent from our four-term catalog, and
 * both the HTML page and the PDF chart print it — so the error is upstream of
 * CourseLeaf. It is almost certainly a typo for `COMS W3251` COMPUTATIONAL
 * LINEAR ALGEBRA, which does exist and is the linear-algebra option on both the
 * Operations Research and the SEAS Computer Science pages. It is kept as
 * printed and `COMS W3251` has **not** been added: that would be an inference,
 * and the group is not made worse by waiting for the department to confirm it.
 *
 * `MATH W4155`, in the PDF chart's Group A footnote, is likewise empty from the
 * course endpoint. The HTML page prints `MATH GU4155`, which is real and is in
 * our catalog; the page wins.
 *
 * `BIOL UN2001` and `EEEB UN2001` are a different problem: **both** are real
 * Bulletin records with the identical title "ENVIRONMENTAL BIOLOGY I", at 4.00
 * and 3.00 points respectively, and only `EEEB UN2001` has a description, a
 * Core designation and a row in our catalog. This page prints `BIOL UN2001`;
 * the SEAS Computer Science page prints `EEEB UN2001` for the same requirement.
 * Both are included — the first because it is what this page prints, the second
 * because it is what a student's transcript will say. That is a judgement, not
 * a transcription.
 *
 * Six catalog point values also disagree with the Bulletin (`ENGI E1102` and
 * `STAT GU4207` are null, `PHED UN1001` is 0, `BIOL UN2001` is missing
 * entirely). All of them feed `all_of` or `n_of` rules that count courses
 * rather than points, so none of them changes an answer here.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/applied-physics-applied-mathematics/undergraduate-programs/applied-mathematics-bs/#degreetracktextcontainer";

/** The seminar and technical-elective policy is prose on the Curriculum tab. */
const CURRICULUM =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/applied-physics-applied-mathematics/undergraduate-programs/applied-mathematics-bs/#curriculumtextcontainer";

export const SEAS_MAJOR_APPLIED_MATHEMATICS: Program = {
  id: "seas-major-applied-mathematics",
  kind: "major",
  school: "SEAS",
  name: "Applied Mathematics",
  department: "Applied Physics and Applied Mathematics",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "calculus",
      label: "Calculus",
      note: "All three. APMA E2000 carries a required 0-point recitation, APMA E2001, which is not matched here. Students with advanced standing may start the calculus sequence higher up on Advanced Placement credit, which leaves nothing on your record to match.",
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
       * The grid cell carries no course code at all — just "ODE" and two
       * footnote markers. Footnote 4 supplies both courses, and makes
       * `APMA E2101` conditional: it counts only if taken before the major was
       * declared and with the adviser's permission. The language has no
       * conditionals, so it is counted without checking, which is the
       * recoverable direction — an adviser can rule a course out, but a rule
       * that refuses a course the Bulletin names sends a finished student back
       * to the registrar.
       */
      note: "Ordinarily MATH UN2030. APMA E2101 counts only if you took it before declaring the major and your faculty adviser permits it — a condition this audit cannot see, so it is counted here without checking it.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["MATH UN2030", "APMA E2101"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "linear-algebra",
      label: "Linear Algebra",
      note: "Applied Math I, or one of the two substitutes the Bulletin names. COMS W3561 is printed by the Bulletin but does not exist in the Bulletin's own course database or in our catalog, so it will not match.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["APMA E3101", "MATH UN2010", "COMS W3561"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "partial-differential-equations",
      label: "Partial Differential Equations",
      note: "Applied Math II, or either of the two PDE courses the Bulletin accepts in its place.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["APMA E3102", "MATH UN3028", "APMA E4200"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "complex-variables",
      label: "Complex Variables",
      note: "Functions of a Complex Variable, or the Mathematics Department's Complex Variables in its place.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["APMA E4204", "MATH UN3007"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "analysis",
      label: "Modern Analysis",
      note: "Introduction to Modern Analysis I, or Analysis and Optimization in its place.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["MATH GU4061", "MATH UN2500"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "applied-mathematics-core",
      label: "Applied Mathematics Core",
      /*
       * The two rows footnote 5 does NOT touch. Checked cell by cell: the four
       * neighbouring core rows carry the marker and these two do not.
       */
      note: "Numerical Methods and Dynamical Systems. These are the two core courses the Bulletin offers no substitute for.",
      rule: {
        kind: "all_of",
        courses: ["APMA E4300", "APMA E4101"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "seminars",
      label: "Applied Mathematics Seminar",
      /*
       * A deliberate departure from the SEAS convention on 0-point courses.
       * MechE, BME and Operations Research all decline to require their 0-point
       * companions (`APMA E2001`, `ECON UN1155`), because those are recitations
       * welded to a lecture with an ampersand and a record showing only the
       * lecture is the normal case. `APMA E4901` is not like that: it is a
       * standalone course registered for in a different year from
       * `APMA E4903`, and the Curriculum tab says students are "required to
       * register for the Applied Mathematics Seminar during both".
       *
       * The double-major page waives the junior seminar. There is no
       * double-major program in this repo and no way to express the waiver.
       */
      note: "Both seminars — the junior-year seminar for 0 points and the senior-year seminar for 3 or 4.",
      rule: {
        kind: "all_of",
        courses: ["APMA E4901", "APMA E4903"],
      },
      sourceUrl: CURRICULUM,
    },
    {
      id: "probability",
      label: "Probability (Group A)",
      note: "One course from Group A. The Bulletin renders IEOR E4150 as an or-alternative to IEOR E3658; either satisfies this.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["IEOR E3658", "IEOR E4150", "STAT GU4203", "MATH GU4155"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "applied-probability",
      label: "Applied Probability / Statistics (Group B)",
      note: "One course from Group B, taken in semester VII.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: [
          "IEOR E3106",
          "IEOR E4106",
          "STAT GU4204",
          "STAT GU4207",
          "COMS W4771",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physics",
      label: "Physics",
      /*
       * Footnote 2 lets a transfer student replace the third term of sequence 1
       * with the Barnard classical-waves course. A per-term alternative has no
       * home in a rule whose branches are whole course lists, so it becomes its
       * own branch — the same handling MechE gives its footnote 3.
       *
       * `PHYS UN3081` is deliberately NOT a third term of sequence 3. It sits
       * in the sequence-3 slot of semester III, but it is a laboratory and it is
       * the sequence-3 half of `physics-laboratory` below. Listing it in both
       * groups would be one course paying for two independently-evaluated
       * requirements inside a single file.
       */
      note: "One complete physics sequence. Sequences 1 and 2 run three terms; sequence 3 is Accelerated Physics and the grid gives it a laboratory rather than a third lecture, which is the next requirement. Transfer students who did not finish the physics requirement before enrolling may substitute PHYS BC3001 for the third term of sequence 1, and that path is encoded.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Sequence 1",
            courses: ["PHYS UN1401", "PHYS UN1402", "PHYS UN1403"],
          },
          {
            label: "Sequence 1, third term PHYS BC3001",
            courses: ["PHYS UN1401", "PHYS UN1402", "PHYS BC3001"],
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
      id: "physics-laboratory",
      label: "Physics Laboratory",
      /*
       * A vocabulary slip worth recording so nobody goes hunting for a track
       * structure: the semester IV cell reads "(Tracks 1 and 2)" where every
       * other cell on the page says "Sequence". The Applied Physics page says
       * "(Sequences 1 and 2)" in the same cell.
       */
      note: "One physics laboratory. PHYS UN1494 goes with sequences 1 and 2 and PHYS UN3081 with sequence 3 — the audit does not tie the laboratory to the sequence you chose, so check the pairing with your adviser. A footnote also allows \"a lab course in Astronomy, Astrophysics, Biology, or Chemistry\" in place of either, which names no courses and is not encoded.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["PHYS UN1494", "PHYS UN3081"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemistry-or-biology",
      label: "Chemistry or Biology",
      /*
       * Both `BIOL UN2001` and `EEEB UN2001` are here. See the header: they are
       * two real Bulletin records with the same title, this page prints the
       * first and the registrar schedules the second.
       */
      note: "One lecture course in chemistry or biology, taken in semester I or II. The Bulletin allows \"CHEM UN1403 or higher\" and \"BIOL UN2005 or higher\"; only the named courses are matched, so a higher course will not go green automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["CHEM UN1403", "BIOL UN2001", "EEEB UN2001", "BIOL UN2005"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "computing",
      label: "Introductory Computing",
      note: "Required, with no alternative and no waiver on this page. The Applied Physics page carries a Python-proficiency waiver footnote on the same course; the Applied Mathematics page does not.",
      rule: {
        kind: "all_of",
        courses: ["ENGI E1006"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "engineering-foundations",
      label: "The Art of Engineering",
      note: "Principles of Economics is also required, and is tracked on the Liberal Arts Core rather than repeated here.",
      rule: {
        kind: "all_of",
        courses: ["ENGI E1102"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "undergraduate-research",
      label: "Undergraduate Research",
      note: "3 points of undergraduate research in the final semester. The Bulletin allows an approved technical elective in its place with an adviser's permission, which names no course and is not checked.",
      rule: {
        kind: "all_of",
        courses: ["APMA E3900"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "math-apma-stat-elective",
      label: "MATH, APMA or STAT elective",
      /*
       * `excludeGroups` is mandatory here or the group is vacuous. Every
       * required course in this major except `ENGI E1006`, `ENGI E1102`, the
       * physics block and the chemistry-or-biology course is a MATH, APMA or
       * STAT course — so without exclusions a student who had taken exactly the
       * prescribed curriculum and not one extra course scores 3 of 3 and is
       * told a senior-year requirement is finished before they have started it.
       * That is the `cs-electives` bug found on 2026-08-24, reproduced.
       *
       * `probability` and `applied-probability` are in the list because
       * `STAT GU4203`, `MATH GU4155`, `STAT GU4204` and `STAT GU4207` are all
       * matched by this selector — the half of the CS fix that was missed on
       * the first pass and caught by the vacuity audit.
       *
       * Points rather than a course count, because `APMA E3900` and
       * `APMA E4903` are variable-credit and the row is published as a point
       * figure.
       *
       * The Bulletin puts no level floor on this row, unlike every other
       * elective row on the page. Transcribed as printed rather than with an
       * invented `numberRange`, and said plainly in the note.
       */
      note: "3 points of MATH, APMA or STAT coursework beyond the courses that already satisfy your other requirements. The Bulletin states no level floor on this row, so a lower-level course counts here as printed.",
      rule: {
        kind: "points_matching",
        points: 3,
        select: {
          subjects: ["MATH", "APMA", "STAT"],
          excludeGroups: [
            "calculus",
            "differential-equations",
            "linear-algebra",
            "partial-differential-equations",
            "complex-variables",
            "analysis",
            "applied-mathematics-core",
            "seminars",
            "probability",
            "applied-probability",
            "undergraduate-research",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "technical-electives",
      label: "Technical Electives",
      /*
       * Footnote 6 looks encodable — "3000 level or above" is a `numberRange` —
       * and it is not. "Any course in science, math, or engineering" is a prose
       * department category, precisely the case `seas-major-computer-science`
       * reasoned through for its General Technical Electives. Two further
       * blockers specific to this page: the exclusion is defined by membership
       * of a *minor*, which no course record carries, and the governing
       * standard is "approved by the adviser".
       *
       * The grid prints a technical-elective row in each of the first four
       * semesters; the chart shows that is a single 3-point block spanning the
       * first two years, printed once per eligible term exactly as
       * `ENGL CC1010` and `ENGI E1006` are.
       */
      rule: {
        kind: "attested",
        note: "18 points of technical electives — 3 in the first two years and at least 15 of the 27 elective points in the third and fourth years. A technical elective is any science, math or engineering course at the 3000 level or above, approved by your adviser; courses in the minor in entrepreneurship and innovation do not count unless your adviser authorises them. \"Science, math, or engineering\" is a category of departments rather than a set of subject codes, so this one is yours to confirm.",
      },
      sourceUrl: CURRICULUM,
    },
  ],
};
