/**
 * The Columbia College major in Physics.
 *
 * Transcribed by hand from the Requirements tab of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/physics/
 * (2026–2027 edition), read from the raw table markup on 2026-08-26.
 *
 * ── Two tables, not one ────────────────────────────────────────────────────
 *
 * `Major in Physics` has two sub-tables under two `<h4>` headings: `Physics
 * Courses` and `Mathematics Courses`. Both are requirements of the major and
 * both are transcribed here. A reader who stops at the first table loses six
 * courses and nineteen points.
 *
 * ── Sequence A ends in PHYS UN2601, NOT PHYS UN1403 ────────────────────────
 *
 * The highest-value correction on this page. The department publishes two
 * different Sequence A tables on two tabs of the same page: the Overview tab's
 * general-purpose sequence, aimed at engineers, ends in `PHYS UN1403`; the
 * Requirements tab's `Major in Physics` sequence ends in `PHYS UN2601`. The
 * department resolves its own conflict in prose on the Overview tab — "physics
 * majors who begin their studies with PHYS UN1401 - PHYS UN1402 should take
 * PHYS UN2601 as the third-semester course."
 *
 * `seas-major-mechanical-engineering` and `seas-major-biomedical-engineering`
 * both encode `UN1401`/`UN1402`/`UN1403`, and both are right about THEIR pages.
 * Do not copy the SEAS physics sequence into this file — it is the same
 * "each file follows its own source" situation as `COMS W4119` vs
 * `CSEE W4119`.
 *
 * `sequence_choice` bites harder here than anywhere else in this directory,
 * because `PHYS UN2601` is the third term of BOTH Sequence A and Sequence B. As
 * `n_of { n: 3 }` over the union, a student holding `UN1401` + `UN1602` +
 * `UN2601` reads satisfied having completed neither sequence — and that is not
 * a hypothetical schedule, it is precisely what the department warns against:
 * "Mixing courses across the sequences is strongly discouraged."
 *
 * No laboratory accompanies the introductory sequence for this major. The
 * Overview tab's version of the table is headed "Select one of the following
 * sequences with accompanying laboratory course:" and then lists no laboratory
 * rows under A, B or C — a lost-label suspect that the arithmetic dismisses
 * (see below). The major's laboratory requirement is at the intermediate level.
 *
 * ── The honors calculus route is hidden inside a course title ──────────────
 *
 * The `Mathematics Courses` table prints three calculus rows. The substitution
 * that replaces all three is not prose and not a numbered footnote: it is a
 * bare `<sup>` glued to the end of the `MATH UN1205` row's TITLE cell, so it
 * renders as part of the course title —
 *
 *   MATH UN1205 | ACCELERATED MULTIVARIABLE CALC In place of the 1100 and 1200
 *   numbered courses, students may elect instead to take MATH UN1207 and
 *   MATH UN1208.
 *
 * A transcriber skimming the rendered page sees a three-course `all_of` and a
 * strange title. Its own words settle its scope: "in place of the 1100 and 1200
 * numbered COURSES" is plural, and `UN1101`, `UN1102` and `UN1205` are exactly
 * the 1100- and 1200-numbered courses in the table. The honors route replaces
 * the whole block with two courses; it does not replace one course with two.
 *
 * This is the `econ-honors-math` bug in a department where honors mathematics
 * is more common, not less.
 *
 * ── Both published totals reconcile exactly ────────────────────────────────
 *
 * "A minimum of 41 points in physics courses." The cheapest complete path is
 * Sequence C (9.0) + core (18.0) + electives (6.0) + laboratory Option 2 (6.0)
 * + senior seminar (2.0) = 41.0, on the nose. The other seven combinations run
 * 41.5 to 43.5, which is what "minimum" means. Dropping the senior seminar
 * would have given 39; reading laboratory Option 1 as one term of `UN3081`
 * plus `UN3083` would have given 40; dropping the elective block would have
 * given 35. The exact hit is a real check.
 *
 * "Required Mathematics courses (6 courses; 19 points)": 3 + 3 + 4 + 3 + 3 + 3,
 * exact on both the count and the total — and every `or` branch is 3 points, so
 * the total does not depend on which branch a student takes. That is what
 * confirms the three `orclass` pairs are three requirements rather than six.
 *
 * ── Why differential equations, linear algebra and complex variables are ───
 * ── three groups ──────────────────────────────────────────────────────────
 *
 * The Bulletin prints three independent `orclass` pairs, each a choice between
 * two courses teaching the same subject, with no coupling: a student may take
 * `APMA E2101`, `MATH UN2010` and `APMA E4204` and be entirely correct. One
 * `n_of { n: 3 }` over all six would accept `APMA E2101` + `MATH UN2030` +
 * `APMA E3101` — two differential-equations courses and no complex variables.
 * A `sequence_choice` would need 2×2×2 = 8 alternatives to say three
 * independent binary choices, which is what `sequence_choice` is not for.
 *
 * ── The laboratory is attested, and it is not a preference ─────────────────
 *
 * Option 1 is `PHYS UN3081` for TWO semesters plus `PHYS UN3083`; Option 2 is
 * `PHYS UN3081` for THREE semesters. Two independent walls:
 *
 *   The rule language cannot name the same course twice — `n_of { n: 2,
 *   courses: ["PHYS UN3081"] }` fails this directory's own invariant test. Same
 *   wall `cc-major-biology`'s laboratory hit with "two terms of BIOL UN3500".
 *
 *   The data model cannot hold the same course twice either. `student_courses`
 *   is declared `primary key (user_id, course_id)` in migration 0028, so no
 *   student record could ever evidence a repeated term. Verified 2026-08-26.
 *
 * The obvious wrong encoding is `n_of { n: 2, courses: ["PHYS UN3081",
 * "PHYS UN3083"] }`. It looks like Option 1 and it is not: Option 1 is three
 * semesters of work, and that rule reports a student who has done two as
 * finished. The page's one footnote makes it worse still — "approved
 * experimental work with a faculty research group may satisfy one semester of
 * the laboratory requirement" leaves no course on a record at all, the same
 * problem SURF creates on `cc-major-biology`.
 *
 * ── The elective block stays include-only, deliberately ────────────────────
 *
 * "With the permission of the Director of Undergraduate Studies, 4000- or
 * 6000-level courses offered in this or other science departments" is the
 * open-ended-substitution trap. Written as a shape — `numberRange: [4000, 6999]`
 * over PHYS, or worse over every science subject — it would immediately sweep in
 * `PHYS GU4021`, `GU4022` and `GU4023`, which are the REQUIRED core courses
 * below. A student who had finished the core and taken zero electives would
 * read the electives done. That is the `cc-major-biology` elective bug and both
 * computer science majors' elective bug, in one line. The permission clause
 * lives in the note.
 *
 * `n_matching { n: 2 }` rather than the Bulletin's own unit of points, for a
 * reason specific to our data. The two are equivalent on this list — every one
 * of the seven enumerated courses is 3 points or more, so two are always at
 * least six — but `evaluate.ts` computes points as `entry.points ?? facts?.points
 * ?? 0`, and the lookup returns nothing for a course we hold no row for. Two of
 * the seven are absent from our catalog, so a student whose electives were
 * exactly those two would be credited 0 of 6 points under `points_matching` and
 * 2 of 2 courses under `n_matching`; `include` is matched by course id before
 * any catalog shape is consulted. Both kinds are the `flagged` tier, so nothing
 * is lost. If the department ever adds a 2-point course to this list, `n: 2`
 * becomes wrong and `points_matching` becomes right — re-check at the next
 * edition.
 *
 * NOT IN OUR CATALOG, and kept anyway: `PHYS UN3002` From Quarks To the Cosmos
 * (3.5 pt) and `PHYS GU4011` Particle Astrophysics & Cosmology (3 pt), both on
 * the elective list. The Bulletin prints both with full titles and point values,
 * so the codes are right and the gap is ours — our catalog covers four terms and
 * neither ran in any of them.
 *
 * NOT ON THIS PAGE, and deliberately absent: `MATH UN3027` Ordinary
 * Differential Equations. The Physics major's differential-equations choice is
 * `APMA E2101` or `MATH UN2030`. `MATH UN3027` belongs to the Chemistry page
 * and to `seas-major-mechanical-engineering`'s footnote 6. Named here so the
 * next reader does not helpfully add it.
 *
 * NO BARNARD COURSES. "No Barnard courses are accepted as requirements for the
 * Physics major." That rule is self-enforcing as written — every group here is
 * `all_of`, `n_of`, `sequence_choice`, or an `include`-only `n_matching`, and no
 * `PHYS ...BC` code appears in any of them. It stops being self-enforcing the
 * moment anyone "improves" a group into a `{ subjects: ["PHYS"] }` shape, which
 * would start accepting them silently. (The Astrophysics major on the Astronomy
 * page does accept `PHYS BC3006`; this one does not.)
 *
 * NOT ENCODED: the repeated laboratory terms and the research substitution
 * (attested, above); the DUS elective permission; "students may place out of
 * some of these calculus courses", which can leave a complete requirement with
 * fewer courses on a record than the rule names and which no course-count rule
 * can tell apart from being one short; the residency rule; transfer review by
 * the DUS; the unstated cap on study-abroad courses; Sequence C's
 * placement-by-exam eligibility; the term ordering of the two required
 * two-semester pairs; and the suggestion of `APMA E3102`, which is suggested
 * rather than required.
 *
 * Physics AP credit is worth recording for what it does NOT do: the department
 * grants credit but "you are not entitled to any exemptions", and the credit
 * drops to zero if the student takes `PHYS UN1001`, `UN1201`, `UN1401` or
 * `UN1601`. So unlike Chemistry, no requirement here can be satisfied without a
 * course on the record, and no group needs an "AP may have covered this" caveat.
 *
 * Expected, and not a defect: `PHYS UN1401`, `UN1402`, `UN1601`, `UN1602` and
 * `UN2801` carry `scienceB`/`scienceC`/`scienceRequirement` flags in our
 * catalog, so a physics major's introductory sequence also matches `cc-core`'s
 * science groups. `crossCountedCourseIds` surfaces that. `PHYS UN2601` and
 * `PHYS UN2802` carry no flags at all, so a Sequence B student cross-counts two
 * courses of three and a Sequence C student one of two. That is the flag data,
 * not the transcription.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/physics/#requirementstextcontainer";

export const CC_MAJOR_PHYSICS: Program = {
  id: "cc-major-physics",
  kind: "major",
  school: "CC",
  name: "Physics",
  department: "Physics",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "introductory-sequence",
      label: "Introductory Sequences",
      note: "One complete introductory sequence, every term of whichever you pick. Sequences A and B run three terms and share their third course, PHYS UN2601; Sequence C runs two. If you started with PHYS UN1401-PHYS UN1402, the Bulletin says your third term is PHYS UN2601, not PHYS UN1403 — that is the engineering sequence, not the physics major's. Enrollment in Sequence C is by placement only. No laboratory course accompanies the introductory sequence for this major; the laboratory requirement is at the intermediate level.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Sequence A",
            courses: ["PHYS UN1401", "PHYS UN1402", "PHYS UN2601"],
          },
          {
            label: "Sequence B",
            courses: ["PHYS UN1601", "PHYS UN1602", "PHYS UN2601"],
          },
          { label: "Sequence C", courses: ["PHYS UN2801", "PHYS UN2802"] },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "core-physics",
      label: "Core Physics Courses",
      /*
       * `all_of`, not `sequence_choice`. The Bulletin names two two-semester
       * pairs inside this block, but there is no CHOICE between them — both
       * pairs are required, so nothing needs protecting from being mixed.
       */
      note: "All six. The Bulletin flags two of these as two-semester pairs that should be taken in the fall and spring of one year: PHYS UN3007-PHYS UN3008, and PHYS GU4021-PHYS GU4022. The audit has no notion of term order, so that is yours to plan.",
      rule: {
        kind: "all_of",
        courses: [
          "PHYS UN3003",
          "PHYS UN3007",
          "PHYS UN3008",
          "PHYS GU4021",
          "PHYS GU4022",
          "PHYS GU4023",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physics-electives",
      label: "Elective Courses",
      /*
       * `include`-only, on purpose. See the header: any numeric shape here
       * swallows the required core courses above and makes the block vacuous.
       */
      note: "At least six points — in practice two courses, since every course on this list carries three points or more. With the Director of Undergraduate Studies' permission, 4000- or 6000-level courses in this or another science department also count; those are not checked here, so tick them with your adviser. PHYS UN3002 and PHYS GU4011 are offered by the Bulletin but have not run in any term our catalog covers, so they will not match automatically. Students heading for graduate study are advised to use one of these slots on PHYS GU4003 Advanced Mechanics.",
      rule: {
        kind: "n_matching",
        n: 2,
        select: {
          include: [
            "PHYS UN3002",
            "PHYS GU4003",
            "PHYS GU4011",
            "PHYS GU4018",
            "PHYS GU4019",
            "PHYS GU4040",
            "PHYS GU4050",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "intermediate-laboratory",
      label: "Laboratory Work at the Intermediate Level",
      /*
       * Attested for two independent reasons, either one sufficient: the rule
       * language cannot name a course twice, and `student_courses` is keyed
       * `(user_id, course_id)` so a record could not evidence it if it could.
       * See the header for the wrong encoding this replaces.
       */
      rule: {
        kind: "attested",
        note: "One of two options. Option 1: PHYS UN3081 Intermediate Laboratory Work for two semesters, plus PHYS UN3083 Electronics Laboratory. Option 2: PHYS UN3081 for three semesters. A footnote also allows approved experimental work with a faculty research group to stand in for one semester. Neither option can be checked here — your record holds each course once, and research with a faculty group leaves no course on it at all — so this one is yours to confirm.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-seminar",
      label: "Senior Seminar",
      /*
       * A single named course, so `all_of` is exact. Contrast the Economics
       * seminar, which is `attested` because eligibility is published per major
       * per year rather than as a course.
       */
      note: "One course, two points.",
      rule: { kind: "all_of", courses: ["PHYS UN3072"] },
      sourceUrl: SOURCE,
    },
    {
      id: "calculus",
      label: "Calculus",
      note: "One complete calculus route: Calculus I, Calculus II and Accelerated Multivariable Calculus, or the two-term honors sequence MATH UN1207-MATH UN1208 in place of all three. The Bulletin also says students may place out of some of these calculus courses depending on prior preparation — which can leave a complete requirement with fewer courses on your record than this rule asks for, and no course-count rule can tell that apart from being one short.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Calculus I, II and Accelerated Multivariable",
            courses: ["MATH UN1101", "MATH UN1102", "MATH UN1205"],
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
      id: "differential-equations",
      label: "Differential Equations",
      note: "One of the two. APMA E2101 is a Columbia Engineering course; the Bulletin offers it as a full equal to the Mathematics department's own.",
      rule: { kind: "n_of", n: 1, courses: ["APMA E2101", "MATH UN2030"] },
      sourceUrl: SOURCE,
    },
    {
      id: "linear-algebra",
      label: "Linear Algebra",
      note: "One of the two, three points either way.",
      rule: { kind: "n_of", n: 1, courses: ["APMA E3101", "MATH UN2010"] },
      sourceUrl: SOURCE,
    },
    {
      id: "complex-variables",
      label: "Complex Variables",
      note: "One of the two, three points either way. APMA E3102 Applied Mathematics II: PDEs is suggested by the department but not required, so it is not listed here.",
      rule: { kind: "n_of", n: 1, courses: ["APMA E4204", "MATH UN3007"] },
      sourceUrl: SOURCE,
    },
  ],
};
