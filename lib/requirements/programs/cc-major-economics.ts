/**
 * The Columbia College major in Economics.
 *
 * Included because it is the department page that breaks the naive parser, and
 * it is worth having a hand-authored counter-example on file.
 *
 * ── The indirection problem ─────────────────────────────────────────────────
 *
 * "Major in Economics" is published as a `sc_courselist` table whose rows carry
 * **no course codes at all**:
 *
 *   Economics Core Courses   →  "All economics core courses"
 *   Mathematics              →  "Select a mathematics sequence"
 *   Statistics               →  "Select a statistics course"
 *   Economics Electives      →  "Select at least five electives, of which no
 *                                more than one may be taken at the 2000-level"
 *   Economics Seminar        →  "Select one economics seminar course"
 *
 * Every row is a pointer to prose elsewhere on the page. A parser that reads
 * this table produces five groups containing zero courses — an audit that can
 * never be satisfied and never says why. This is why `origin` exists on
 * `Program` and why the parser's output is never silently trusted.
 *
 * The definitions below were resolved by hand from two other sections of the
 * same page: the "Required Coursework for all Programs" course list, and the
 * prerequisite table under it, which is where the math and statistics courses
 * are actually named.
 *
 * ── Two rules that stay unenforced, on purpose ──────────────────────────────
 *
 * **"No more than one elective at the 2000-level."** This is a constraint
 * *across* the set the student picks, not a property of any one course. The
 * rule language counts courses matching a shape; it has no way to say "and at
 * most one of them may look like this". Encoding it as a narrower selector
 * (3000-level only) would under-count a student who legitimately used their one
 * 2000-level elective. It is carried as a note.
 *
 * **The seminar.** Economics seminars are not identifiable from a course code —
 * the department publishes an eligible-seminar list per major per year, and the
 * numbers are scattered across UN39xx and GU49xx alongside non-seminar courses.
 * `attested`.
 *
 * ── Five groups really is the whole degree (re-verified 2026-08-24) ─────────
 *
 * Five groups looks thin for a 44-point major and it was checked rather than
 * assumed. The Bulletin's "Major in Economics" table has exactly five rows, and
 * the department's own transfer-credit table gives the arithmetic that confirms
 * it: "Economics major — 9 required economics lecture courses". Four core plus
 * five electives is nine, and the same table notes that "lecture courses do not
 * include seminars", which is the sixth row. Mathematics (6 points) and
 * statistics (3 points) are the requirements from OTHER departments, and both
 * are here — the seam that hid an entire science block from the SEAS computer
 * science major does not exist on this page, because economics states its
 * outside coursework in its own "Required Coursework for all Programs" section
 * rather than delegating it to the Core.
 *
 * Two things were wrong rather than missing, and both are fixed below: the
 * statistics group required STAT UN1201 by name when the Bulletin says "or a
 * higher level course", and the elective block counted the department's own
 * seminars, which the page twice says are not electives.
 *
 * Every course id in this file resolves against the live catalog — economics is
 * one of the two programs in the project with no unmatched codes at all.
 *
 * NOT ENCODED: the D-grade rule ("no course with a grade of D or lower can
 * count toward the major"), the requirement that core courses be finished by
 * junior spring, and the "must be taken at Columbia" residency clause. All
 * three need grades or a term-by-term transcript we do not have.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/economics/";

/**
 * The four core courses, shared by every program the department publishes.
 * Named once so `econ-core` and the elective exclusion cannot drift apart —
 * `cc-concentration-economics.ts` uses the same list for the same reason.
 */
const ECON_CORE = ["ECON UN1105", "ECON UN3211", "ECON UN3213", "ECON UN3412"];

/**
 * The department's own seminar numbers, as the Bulletin's prerequisite table
 * spells them. Excluded from the elective block because the page says twice
 * that "Seminars do not count as electives" — not used as the seminar
 * requirement itself, which is eligibility-listed per major per year.
 */
const ECON_SEMINARS = ["ECON GU4911", "ECON GU4913", "ECON GU4918"];

/**
 * Barnard's own core, statistics and seminar courses, which the `ECON` subject
 * code reaches and the department refuses.
 *
 * "Students may not take the Barnard core economics, math, statistics, or
 * seminar courses for credit towards the completion of major requirements",
 * and, in the transfer-credit notes, "At least two of the three 3000-level
 * economics core courses must be taken in the department and no corresponding
 * Barnard courses are accepted."
 *
 * Barnard's principles course (ECON BC1003) and its math methods course
 * (ECON BC1007) are barred by the same sentence but sit below the elective
 * selector's 2000-level floor, so they need no entry. Barnard's ordinary
 * electives — ECON BC3029, BC3038, BC3019 and the rest of the overlap table —
 * are NOT here: those the department does accept, subject to a content-overlap
 * check it performs by hand.
 *
 * Verified against the catalog on 2026-08-24.
 */
const BARNARD_NON_ELECTIVES = [
  "ECON BC2411", // Statistics for Economics — Barnard's statistics course
  "ECON BC3018", // Econometrics — corresponds to ECON UN3412
  "ECON BC3033", // Intermediate Macroeconomics — corresponds to ECON UN3213
  "ECON BC3035", // Intermediate Microeconomics — corresponds to ECON UN3211
  "ECON BC3135", // the recitation attached to Barnard's intermediate micro
  "ECON BC3063", // Senior Seminar — the Barnard seminar
];

export const CC_MAJOR_ECONOMICS: Program = {
  id: "cc-major-economics",
  kind: "major",
  school: "CC",
  name: "Economics",
  department: "Economics",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "econ-core",
      label: "Economics Core",
      note: "All four. The department requires these to be taken at Columbia and finished by the spring of junior year. Only ECON UN1105 may be taken Pass/D/Fail, and only with a grade of P.",
      rule: { kind: "all_of", courses: ECON_CORE },
      sourceUrl: SOURCE,
    },
    {
      id: "mathematics",
      label: "Mathematics",
      /*
       * One group, not two, and a `sequence_choice` rather than a required
       * course plus a choice.
       *
       * This previously read as `all_of ["MATH UN1101"]` (id `calculus-i`) plus
       * `n_of { n: 1 }` over `["MATH UN1201", "MATH UN1205"]` (id
       * `multivariable-calculus"`). That shape has no room for the third
       * sequence the Bulletin publishes: a student who took MATH UN1207 and
       * MATH UN1208 has satisfied the department in full, and the audit
       * reported them as failing BOTH groups. Honors students got the worst
       * possible answer — two red requirements for having taken the harder
       * path — and the only way to clear them was to retake calculus they had
       * already surpassed.
       *
       * `sequence_choice` is also the only rule kind that gets this right.
       * Flattened to `n_of { n: 2 }` over the five distinct courses, MATH
       * UN1101 + MATH UN1207 would pass while completing no sequence at all.
       *
       * Verified against the live Bulletin on 2026-08-24, which prints exactly:
       * "Select one of the following sequences: MATH UN1101 & MATH UN1201 /
       * MATH UN1101 & MATH UN1205 / MATH UN1207 & MATH UN1208".
       *
       * Note the department's OTHER math table on the same page — the four-course
       * one ending in MATH UN2010 — belongs to a different program and must not
       * be pulled in here.
       */
      note: "One complete sequence, both terms of whichever you pick. Consult the Mathematics Department for placement.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Calculus I and Calculus III",
            courses: ["MATH UN1101", "MATH UN1201"],
          },
          {
            label: "Calculus I and Accelerated Multivariable Calculus",
            courses: ["MATH UN1101", "MATH UN1205"],
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
      id: "statistics",
      label: "Statistics",
      /*
       * `n_of`, not `all_of ["STAT UN1201"]`, which is what this group used to
       * say.
       *
       * The Bulletin's Statistics paragraph under "Required Coursework for all
       * Programs" — the section that governs this major, the concentration and
       * every interdepartmental major — reads: "all students must take
       * STAT UN1201 CALC-BASED INTRO TO STATISTICS, **or a higher level
       * course**, such as STAT GU4204 STATISTICAL INFERENCE, or STAT GU4001."
       * Requiring UN1201 by name reported a student who had taken the harder
       * course as having not met the requirement at all, and the only way for
       * them to clear it was to go back and take the introductory course they
       * had already surpassed.
       *
       * `cc-concentration-economics.ts` already encoded the same sentence
       * correctly; this file did not, and the two are transcriptions of one
       * paragraph on one page. Verified against the live Bulletin 2026-08-24.
       *
       * "such as" means the three named courses are examples, not the closed
       * set — so another higher-level statistics course legitimately satisfies
       * the department and will not match here. That under-counts, which is the
       * recoverable direction; a `numberRange` over all of STAT would accept
       * courses the department does not, which is not.
       */
      note: "STAT UN1201, or a higher-level course. The Bulletin gives STAT GU4204 and STAT GU4001 as examples rather than as the whole list, so another higher-level statistics course may also count and will not be matched here. Take it before Econometrics.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["STAT UN1201", "STAT GU4204", "STAT GU4001"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "econ-electives",
      label: "Economics Electives",
      note: "At least five. No more than one may be at the 2000 level, including Barnard courses — a limit this audit does not enforce, so check it yourself. Seminars are not electives, and neither are Barnard's core economics, mathematics or statistics courses; both are excluded here.",
      rule: {
        kind: "n_matching",
        n: 5,
        select: {
          subjects: ["ECON"],
          numberRange: [2000, 9999],
          exclude: [
            // The core courses are not electives. Excluding them here is what
            // stops a student's four core courses from silently filling four of
            // the five elective slots.
            ...ECON_CORE,
            /*
             * The Bulletin says it twice, in the Economics Electives paragraph
             * and again under Seminars: "Seminars do not count as electives."
             * `econ-seminar` below is `attested`, so it consumes nothing and
             * `excludeGroups` would have nothing to remove — the exclusion has
             * to be by code.
             *
             * These are the department's own seminar course numbers, confirmed
             * against the catalog on 2026-08-24. ECPS GU4921 and ECPH GU4950
             * are seminars too but carry different subject codes, so this
             * selector never reached them.
             */
            ...ECON_SEMINARS,
            // Barnard's core, statistics and seminar courses. See above — the
            // `ECON` subject code covers Barnard rows, so this needs codes.
            ...BARNARD_NON_ELECTIVES,
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "econ-seminar",
      label: "Economics Seminar",
      /*
       * Attested rather than `n_of` over ECON_SEMINARS.
       *
       * The three courses excluded from the elective block above are the ones
       * the Bulletin's prerequisite table names as seminars, but they are not
       * the requirement: the department publishes an eligible-seminar list PER
       * MAJOR PER YEAR, and ECPS GU4921 and ECPH GU4950 are on it for some
       * majors and not others. Encoding the three we can see would report a
       * student who took an eligible seminar outside them as unmet, and a
       * student who took one not eligible for their major as done. Excluding a
       * known seminar from the electives is safe in the under-counting
       * direction; asserting the seminar requirement is finished is not.
       */
      rule: {
        kind: "attested",
        note: "One seminar from the department's eligible-seminar list for your major, published per year on the Senior Seminars page. Seminars may be taken only after all core courses are complete. The department's own seminar numbers include ECON GU4911, ECON GU4913 and ECON GU4918, plus ECPS GU4921 and ECPH GU4950 for the interdepartmental majors, but eligibility is set per major per year and cannot be read off a course number.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
