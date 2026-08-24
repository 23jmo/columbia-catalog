/**
 * The Columbia College concentration in Economics.
 *
 * ── There is no Economics minor, and this file is why ──────────────────────
 *
 * This program was requested as "the CC Economics minor". The Economics
 * department does not offer one. Its Requirements tab has exactly one
 * sub-major program, "Concentration in Economics", filed under the heading
 * "For students who entered Columbia in or before the 2023-24 academic year",
 * and the word "minor" appears on the page only in the phrase "minor subfield"
 * belonging to the political science interdepartmental major. So this is
 * `kind: "concentration"`, not `kind: "minor"`, and it carries an entry
 * condition the audit cannot check: the student has to have matriculated in
 * 2023-24 or earlier.
 *
 * Calling it a minor would have been the easy thing and would have put a
 * program in front of students that they cannot declare.
 *
 * Transcribed by hand from
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/economics/
 * (2026–2027 edition).
 *
 * ── The same indirection problem as the major, resolved the same way ────────
 *
 * The concentration's own table has five rows and names no courses:
 * "All economics core courses", "Select a mathematics sequence", "Select a
 * Statistics course", "Select at least three electives …". Every one points at
 * the "Required Coursework for all Programs" section higher up the page, which
 * is where the courses actually live. All four groups below were resolved from
 * that section by hand, which is the same failure `cc-major-economics`
 * documents for the major.
 *
 * ── Four groups really is the whole concentration (verified 2026-08-24) ─────
 *
 * Four groups is thin enough to look like a transcription that stopped early,
 * so it was checked rather than assumed. The Bulletin's "Concentration in
 * Economics" table has exactly four rows, and the department's transfer-credit
 * table gives the arithmetic that confirms it: "Economics concentration — 7
 * required economics lecture courses". Four core plus three electives is seven.
 * The same table's footnote — "lecture courses do not include seminars" — is
 * how you can tell the absence of a seminar row is real and not an omission:
 * the major's own line in that table reads 9, which is its four core plus five
 * electives, and its seminar sits outside the count in both cases. The
 * concentration simply has no seminar requirement.
 *
 * Mathematics (6 points) and statistics (3 points) are the requirements from
 * other departments, and both are here rather than delegated to `cc-core`.
 *
 * ── The discrepancy with the major file, now resolved ───────────────────────
 *
 * This file used to record that `cc-major-economics.ts` split the shared
 * `sequence_choice` mathematics requirement into a required MATH UN1101 plus a
 * choice, losing the honors path. That has since been fixed there, and the two
 * files now encode the one paragraph identically. The same thing had happened
 * to the shared Statistics paragraph in the opposite direction — this file had
 * it right as an `n_of` and the major hard-coded STAT UN1201 — and that is
 * fixed too. Both requirements come from one section of one page that governs
 * every economics program, so a future edit to either file should be made to
 * both.
 *
 * ── The 2000-level cap, again unenforced ────────────────────────────────────
 *
 * "No more than one may be taken at the 2000-level (including Barnard
 * courses)." As in the major, this is a constraint across the set the student
 * picks rather than a property of any course, and the language counts courses
 * matching a shape. Narrowing the selector to 3000-and-above would under-count
 * the student's one legitimate 2000-level elective. It stays a note.
 *
 * NOT ENCODED: the entry condition on matriculation year; the D-grade rule; the
 * requirement that core courses be taken at Columbia and finished by the spring
 * of junior year; the strictly-enforced prerequisites; the Barnard-elective
 * overlap table; and the five-Columbia-lecture-course residency minimum.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/economics/#requirementstextcontainer";

const ECON_CORE = [
  "ECON UN1105",
  "ECON UN3211",
  "ECON UN3213",
  "ECON UN3412",
];

/**
 * The department's own seminar numbers. The concentration has no seminar
 * requirement of its own — see the header — but the Bulletin says twice that
 * "Seminars do not count as electives", so they are kept out of the elective
 * block. Confirmed against the catalog on 2026-08-24; ECPS GU4921 and
 * ECPH GU4950 are seminars too but carry other subject codes, which this
 * selector never reaches.
 */
const ECON_SEMINARS = ["ECON GU4911", "ECON GU4913", "ECON GU4918"];

/**
 * Barnard's own core, statistics and seminar courses, which the `ECON` subject
 * code reaches and the department refuses: "Students may not take the Barnard
 * core economics, math, statistics, or seminar courses for credit towards the
 * completion of major requirements."
 *
 * Barnard's ordinary electives are deliberately absent — those the department
 * does accept. Kept identical to the list in `cc-major-economics.ts`, because
 * both files transcribe the one paragraph that governs every program.
 */
const BARNARD_NON_ELECTIVES = [
  "ECON BC2411", // Statistics for Economics
  "ECON BC3018", // Econometrics — corresponds to ECON UN3412
  "ECON BC3033", // Intermediate Macroeconomics — corresponds to ECON UN3213
  "ECON BC3035", // Intermediate Microeconomics — corresponds to ECON UN3211
  "ECON BC3135", // the recitation attached to Barnard's intermediate micro
  "ECON BC3063", // Senior Seminar
];

export const CC_CONCENTRATION_ECONOMICS: Program = {
  id: "cc-concentration-economics",
  kind: "concentration",
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
      note: "All four. Only ECON UN1105 may be taken Pass/D/Fail, and only with a grade of P. The department requires these to be taken at Columbia and finished by the spring of junior year. Open only to students who entered Columbia in or before 2023-24 — a condition this audit cannot check.",
      rule: { kind: "all_of", courses: ECON_CORE },
      sourceUrl: SOURCE,
    },
    {
      id: "mathematics",
      label: "Mathematics",
      /*
       * A real `sequence_choice`, transcribed as the Bulletin prints it. As
       * `n_of { n: 2 }` over the five distinct courses, MATH UN1101 plus
       * MATH UN1207 would pass — a schedule that completes no sequence. Six
       * points, per the concentration's own point breakdown.
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
      note: "STAT UN1201, or a higher-level course. The Bulletin gives STAT GU4204 and STAT GU4001 as examples rather than as the whole list, so another higher-level statistics course may also count and will not be matched here.",
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
      note: "At least three. No more than one may be at the 2000 level, including Barnard courses — a limit this audit does not enforce, so check it yourself. Seminars do not count as electives, and neither do Barnard's core economics, mathematics or statistics courses; both are excluded here.",
      rule: {
        kind: "n_matching",
        n: 3,
        select: {
          subjects: ["ECON"],
          numberRange: [2000, 9999],
          exclude: [
            // The core courses are not electives. Without this, a student's four
            // core courses would silently fill three elective slots.
            ...ECON_CORE,
            // "Seminars do not count as electives." The note said so; the rule
            // did not, so a concentrator who took ECON GU4911 was quietly
            // credited an elective for it (fixed 2026-08-24).
            ...ECON_SEMINARS,
            // Barnard's core, statistics and seminar courses. See above.
            ...BARNARD_NON_ELECTIVES,
          ],
        },
      },
      sourceUrl: SOURCE,
    },
  ],
};
