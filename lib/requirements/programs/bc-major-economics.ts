/**
 * The Barnard College major in Economics (the Economics track).
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/economics/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── This is not Columbia College's Economics major ─────────────────────────
 *
 * `cc-major-economics` already exists and this is a genuinely different
 * degree, not an alias — the same relationship SEAS Computer Science has to
 * the College's. Barnard's is built almost entirely out of `ECON BC` courses
 * that the College's major does not name at all: `ECON BC1003` rather than
 * `ECON UN1105`, `ECON BC3033`/`BC3035` rather than `ECON UN3211`/`UN3213`,
 * `ECON BC3018` rather than `ECON UN3412`. It also requires `ECON BC3041`
 * Theoretical Foundations of Political Economy, which has no College
 * counterpart, and it accepts a mathematics course the College's does not.
 *
 * A Barnard economics major pointed at the College's encoding would be told
 * she had satisfied none of it.
 *
 * ── The department publishes two tracks ────────────────────────────────────
 *
 * "There are two tracks for the major in Economics equal in rigor, but
 * different in scope and focus." This file is the Economics track, 12 courses
 * / 36 points minimum. The Political Economy track is 13 courses / 42 points
 * and is `bc-major-political-economy` — a separate program rather than a
 * variant group, because the two tables differ in the mathematics course they
 * accept, in whether econometrics is required at all, and by two whole
 * requirements. Modelling them as one program would mean every student saw
 * three requirements they do not have.
 *
 * ── The senior requirement is a `sequence_choice`, and this matters ────────
 *
 * The Bulletin prints it as "One of the following two options:"
 *
 *   ECON BC3061 & ECON BC3062   Senior Thesis I and Senior Thesis II
 *   ECON BC3063                 Senior Seminar (and an additional upper-level
 *                               elective in economics)
 *
 * Written as `n_of { n: 1 }` over all three courses, a student who took Senior
 * Thesis I in the fall and did not continue would be reported as having
 * finished her senior requirement. She has not — the thesis is a year-long
 * sequence and half of it satisfies nothing. `sequence_choice` refuses exactly
 * that, which is why trap #1 in `.plans/requirements-research/BRIEF.md` names
 * it.
 *
 * The parenthetical on the second option — Senior Seminar carries "and an
 * additional upper-level elective in economics" — is the reason the major is
 * "a minimum of 12 courses" rather than exactly 12. It cannot go in the
 * sequence, because the elective is unnamed and `sequence_choice` takes
 * courses. It is stated in the group's note, and it is the one place this
 * encoding under-counts a real requirement.
 *
 * ── ECON BC1007, which a student can be barred from ────────────────────────
 *
 * The mathematics requirement is `ECON BC1007` or `MATH UN1201`, with a
 * footnote: "Students will not receive credit for ECON BC1007 if they have
 * already taken ECON BC3035 INTERMEDIATE MICROECONOMICS. Such students must
 * instead complete the mathematics requirement by taking MATH UN1201."
 *
 * That is a rule about the ORDER two courses were taken in. Nothing in
 * `CourseSelector` or in any rule kind can see order — the audit is handed a
 * set of course ids, not a sequence of terms. Encoding it would require the
 * rule language to grow a concept it deliberately does not have. It is in the
 * note, where a student who is about to make this mistake can read it.
 *
 * The prose section further down the page adds a third route the requirements
 * table does not print: "Majors in the economics track may complete the
 * mathematics requirement by taking ECON BC1007, or MATH UN1101 CALCULUS I and
 * MATH UN1201 CALCULUS III." Calculus I alone does not satisfy it, so it is
 * not a fourth `n_of` option; the table's two options are what the rule
 * carries, and the Calculus I + Calculus III path is noted. A student on that
 * path is matched by `MATH UN1201` either way.
 *
 * ── The statistics requirement is four-way ─────────────────────────────────
 *
 * `ECON BC2411` or `STAT UN1101` or `STAT UN1201` or `PSYC BC1101`. All four
 * are transcribed. `PSYC BC1101` is Barnard's psychology statistics course and
 * it is genuinely on this list — it is not a stray from the Psychology page.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 36-point minimum (the rule language counts courses, not points, for
 * `n_of`); "two of which must be upper-level (that is, they must have
 * intermediate micro- or macroeconomic theory as a prerequisite)" — a
 * prerequisite predicate, not a number band, and `ECON BC` numbering does not
 * separate the two cleanly enough to approximate it; the Major Requirements
 * Declaration form due by the end of sophomore year; the advice to finish both
 * intermediate theory courses by the start of junior year.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/economics/";

export const BC_MAJOR_ECONOMICS: Program = {
  id: "bc-major-economics",
  kind: "major",
  school: "BC",
  name: "Economics",
  department: "Economics",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "introduction",
      label: "Introduction to Economic Reasoning",
      note: "ECON BC1003. 3 points.",
      rule: { kind: "all_of", courses: ["ECON BC1003"] },
      sourceUrl: SOURCE,
    },
    {
      id: "mathematics",
      label: "Mathematics",
      note:
        "ECON BC1007 Math Methods for Economics, or MATH UN1201 Calculus III. " +
        "Two things the table does not show: you will NOT receive credit for " +
        "ECON BC1007 if you have already taken ECON BC3035 Intermediate " +
        "Microeconomics — in that case the requirement must be met with " +
        "MATH UN1201. And the department's prose allows MATH UN1101 Calculus I " +
        "together with MATH UN1201 as a third route. Neither is checkable here: " +
        "the first depends on the order you took two courses in, the second is " +
        "already matched by MATH UN1201.",
      rule: { kind: "n_of", n: 1, courses: ["ECON BC1007", "MATH UN1201"] },
      sourceUrl: SOURCE,
    },
    {
      id: "statistics",
      label: "Statistics",
      note:
        "ECON BC2411 Statistics for Economics, or STAT UN1101, or STAT UN1201, " +
        "or PSYC BC1101 (Barnard's psychology statistics lecture and recitation, " +
        "which the Economics department accepts).",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["ECON BC2411", "STAT UN1101", "STAT UN1201", "PSYC BC1101"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "econometrics",
      label: "Econometrics",
      note: "ECON BC3018. Required on the Economics track and not on Political Economy.",
      rule: { kind: "all_of", courses: ["ECON BC3018"] },
      sourceUrl: SOURCE,
    },
    {
      id: "intermediate-theory",
      label: "Intermediate theory",
      note:
        "ECON BC3033 Intermediate Macroeconomic Theory and ECON BC3035 " +
        "Intermediate Microeconomics. Both. The department expects them " +
        "finished by the beginning of junior year, because they are the " +
        "prerequisite that makes an elective count as upper-level.",
      rule: { kind: "all_of", courses: ["ECON BC3033", "ECON BC3035"] },
      sourceUrl: SOURCE,
    },
    {
      id: "theoretical-foundations",
      label: "Theoretical Foundations of Political Economy",
      note:
        "ECON BC3041. Required on both tracks, and one of the clearest places " +
        "the Barnard major differs from Columbia College's, which has no " +
        "counterpart to it.",
      rule: { kind: "all_of", courses: ["ECON BC3041"] },
      sourceUrl: SOURCE,
    },
    {
      id: "electives",
      label: "Three economics electives",
      note:
        '"Three electives in economics, two of which must be upper-level (that ' +
        'is, they must have intermediate micro- or macroeconomic theory as a ' +
        'prerequisite)." We count three ECON courses at the 2000 level or above ' +
        "and exclude the courses the requirements above and the senior " +
        "requirement below already consume. We do NOT check the upper-level " +
        "condition: it is defined by prerequisite, not by course number, and " +
        "ECON BC numbering does not separate the two.",
      rule: {
        kind: "n_matching",
        n: 3,
        select: {
          subjects: ["ECON"],
          numberRange: [2000, 4999],
          excludeGroups: [
            "mathematics",
            "statistics",
            "econometrics",
            "intermediate-theory",
            "theoretical-foundations",
            "senior-requirement",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-requirement",
      label: "Senior requirement",
      note:
        "One of two options. The thesis is a year-long sequence — ECON BC3061 " +
        "in the fall and ECON BC3062 in the spring — and half of it satisfies " +
        "nothing, which is why this is a sequence choice rather than a pick-one " +
        "over three courses. Note that the Senior Seminar option carries a cost " +
        "the rule cannot show: choosing ECON BC3063 also requires an ADDITIONAL " +
        "upper-level economics elective beyond the three above, which is why the " +
        "major is published as a minimum of 12 courses rather than exactly 12.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Senior Thesis I and II",
            courses: ["ECON BC3061", "ECON BC3062"],
          },
          {
            label: "Senior Seminar (plus an additional upper-level elective)",
            courses: ["ECON BC3063"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
  ],
};
