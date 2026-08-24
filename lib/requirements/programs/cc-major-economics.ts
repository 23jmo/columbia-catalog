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
 * NOT ENCODED: the D-grade rule ("no course with a grade of D or lower can
 * count toward the major"), the requirement that core courses be finished by
 * junior spring, and the "must be taken at Columbia" residency clause. All
 * three need grades or a term-by-term transcript we do not have.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/economics/";

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
      note: "All four. The department requires these to be taken at Columbia and finished by the spring of junior year.",
      rule: {
        kind: "all_of",
        courses: ["ECON UN1105", "ECON UN3211", "ECON UN3213", "ECON UN3412"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "calculus-i",
      label: "Calculus I",
      note: "Named in the department's prerequisite table rather than in the major table.",
      rule: { kind: "all_of", courses: ["MATH UN1101"] },
      sourceUrl: SOURCE,
    },
    {
      id: "multivariable-calculus",
      label: "Multivariable Calculus",
      note: "Calculus III, or the accelerated MATH UN1205. Required before Intermediate Micro and Econometrics.",
      rule: { kind: "n_of", n: 1, courses: ["MATH UN1201", "MATH UN1205"] },
      sourceUrl: SOURCE,
    },
    {
      id: "statistics",
      label: "Statistics",
      note: "Calculus-based introduction to statistics, taken before Econometrics.",
      rule: { kind: "all_of", courses: ["STAT UN1201"] },
      sourceUrl: SOURCE,
    },
    {
      id: "econ-electives",
      label: "Economics Electives",
      note: "At least five. No more than one may be at the 2000 level, including Barnard courses — a limit this audit does not enforce, so check it yourself.",
      rule: {
        kind: "n_matching",
        n: 5,
        select: {
          subjects: ["ECON"],
          numberRange: [2000, 9999],
          // The core courses are not electives. Excluding them here is what
          // stops a student's four core courses from silently filling four of
          // the five elective slots.
          exclude: ["ECON UN1105", "ECON UN3211", "ECON UN3213", "ECON UN3412"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "econ-seminar",
      label: "Economics Seminar",
      rule: {
        kind: "attested",
        note: "One seminar from the department's eligible-seminar list for your major. The list is published per year and the courses are not identifiable from their numbers.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
