/**
 * The Columbia College major in Sociology.
 *
 * Transcribed by hand from the Requirements tab of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/sociology/
 * (2026–2027 edition), read from the raw CourseLeaf HTML on 2026-08-26.
 *
 * ── Two hazards this page does NOT have, stated so nobody encodes them ──────
 *
 * There is no distribution requirement. No areas, no subfields, no "one course
 * from each of N fields" — the whole major is three core courses and six more
 * courses in the department. The entire Requirements tab is three tables (the
 * major, the minor, and a legacy concentration) and none of them names an area
 * list. Approximating one would be inventing a requirement.
 *
 * There is also no methods-course indirection. `SOCI UN3010` is printed as one
 * of the three required core courses, so it is `all_of`, not a selector and not
 * `attested`. `SOCI UN3020 Social Statistics` is an EXAMPLE elective, not a
 * second methods option.
 *
 * ── The real hazard is the word "examples" ─────────────────────────────────
 *
 * The elective block reads "Some examples of electives include:" and then names
 * twelve courses. Transcribing those twelve as `n_of { n: 6 }` would be the
 * largest possible error on this page: our catalog holds roughly ninety SOCI
 * rows in the 1000–4999 band, a real sociology major routinely takes six that
 * appear on none of the twelve, and such a student would be reported as having
 * done nothing at all. So the rule is `n_matching` over the subject — the same
 * call `cc-major-history` made for its nine-course rule.
 *
 * Seven of the twelve example codes have no row in our catalog at all
 * (`SOCI UN3020`, `UN3213`, `UN3490`, `UN3264`, `UN3900`, `UN3931`, `UN3974`).
 * Because the rule is a shape rather than an enumeration this makes no
 * requirement unsatisfiable — it only means those courses did not run in a term
 * we cover — but it is worth knowing before anyone "fixes" the list.
 *
 * ── Why the electives exclude the core, and six more codes ─────────────────
 *
 * `excludeGroups: ["soci-core"]` because the three core courses carry the SOCI
 * subject and sit inside the band, so without it every student's required core
 * fills half the elective block and a nine-course major reads as a six-course
 * one. This is the `cc-major-biology` elective bug, headed off rather than
 * shipped: the Bulletin's own arithmetic settles that the six are additional to
 * the three (10-or-12 core points PLUS 20–21 elective points sums to the
 * published total).
 *
 * The six excluded codes — `SOCI UN1100`, `UN2211`, `UN3001`, `UN3011`,
 * `UN3103`, `UN3676` — are 0-point discussion sections welded to lectures, the
 * same shape as `APMA E2001` on the mechanical engineering plan grid. Every
 * student who takes The Social World, Social Theory and Methods is
 * automatically registered for three of them, and a bare subject selector would
 * hand that student three free electives. They are excluded by code rather than
 * by range because they are scattered across the band and no contiguous
 * `numberRange` separates them. Each of the six carries 0 or null points in our
 * catalog, verified individually on 2026-08-26, and every elective slot is
 * specified at 3 or 4 points — so none of them can satisfy any slot.
 *
 * `numberRange: [1000, 4999]` cuts the graduate program: thirty-odd `SOCI ...GR`
 * rows at 5000+ (Proseminar, Field Work, MPhil Thesis Writing) that an
 * undergraduate takes none of. The same guard `cc-major-psychology` added on
 * 2026-08-24 for the same reason. The GU 4000 band stays in — the Bulletin's own
 * Sociology course listing prints `SOCI GU4043` and `SOCI GU4801` — and so does
 * the 1000 level, because the department's minor list offers `SOCI UN1203` as an
 * elective example.
 *
 * ── The published point total does not reconcile, and the gap is theirs ────
 *
 * The page says the three core courses are "10 points" and the major is "a
 * minimum of 30-31 points". The Bulletin's own course listings price all three
 * core courses at 4 points, which is 12, and our catalog agrees. The real total
 * is 32–33. The General Studies edition of the same page and its PDF repeat "10
 * points" verbatim, so this is one stale figure in both editions rather than a
 * typo on one — most likely a leftover from when The Social World and Social
 * Theory ran at 3 points (3 + 3 + 4 = 10), which is also why the elective
 * sentence still calls lecture courses "3 points each" while the department's
 * own required lectures run at 4.
 *
 * The elective block's arithmetic does reconcile exactly: 3 lectures × 3 plus 2
 * seminars × 4 plus a sixth course at 3 or 4 is 20 or 21, and the page names
 * both resulting totals. No rule below depends on any of these numbers — every
 * group counts courses — so the discrepancy is carried in the core note, where
 * a student who compares the Bulletin against their transcript will find it.
 *
 * ── Why two of the four groups are attested ────────────────────────────────
 *
 * "at least three lecture courses (2000- or 3000-level, 3 points each) and at
 * least two seminars (4 points each)". Whether a Sociology course is a lecture
 * or a seminar is not a property of its number: `SOCI UN3235` Social Movements
 * (3 pt) is a lecture and `SOCI UN3914` Inequality, Poverty & Mobility (4 pt) is
 * a seminar, and both are UN39xx. There is no band, no flag and no CourseLeaf
 * attribute that separates them. The only signal is the point value, and
 * `CourseSelector` has no points field — the same limitation
 * `cc-major-psychology` records for its "3 or more points" floor. A
 * `numberRange: [2000, 3999]` approximation would be worse than nothing: it
 * matches every seminar too, and would report a student with three seminars and
 * no lectures as having met the lecture requirement.
 *
 * NOT ENCODED: the lecture/seminar split (attested, above); "for students taking
 * the two-semester Senior Seminar, the sixth course must be a seminar", which is
 * a requirement conditional on how another requirement was satisfied and the
 * language has no conditionals; the 3-or-4-point floor per elective, which lets
 * 1-point `SOCI GU4043` and the 1–6-point Individual Study courses count; the
 * Senior Seminar itself, which is optional and appears only among the elective
 * examples and in the honors paragraph, so encoding it would put a red
 * requirement on every non-honors student's screen; departmental honors, which
 * is a GPA threshold plus a thesis and is not a graduation requirement; and the
 * Senior Seminar's admission gate, which is prerequisite ordering plus a faculty
 * decision.
 *
 * OPEN, and deliberately not guessed at: whether Barnard `SOCI ...BC` courses
 * count toward the six. The Bulletin says only "in the Department of Sociology"
 * and never mentions Barnard, but its own Sociology course tab lists five
 * Barnard courses among the department's offerings and its faculty roster
 * intermixes Barnard sociologists. `subjects: ["SOCI"]` therefore includes them,
 * which is the same choice `cc-major-history` and `cc-major-psychology` made.
 * The department's own undergraduate page would settle it and returns HTTP 403
 * to every automated fetch. If the answer turns out to be no, the selector needs
 * a mechanism it does not have — `CourseSelector` cannot filter on the school
 * qualifier, which is exactly why `cc-major-psychology`'s residency rule is
 * `attested`.
 *
 * ⚠ A catalog/Bulletin conflict worth settling before anyone encodes honors:
 * the Bulletin's course search returns `SOCI UN3995` as "Senior Seminar", 4
 * points; our catalog's `SOCI3995UN` row is titled "INDIVIDL STUDY I" with null
 * points, and we separately hold `SOCI UN3988`/`UN3989` "Senior Thesis Seminar
 * I/II" which the Bulletin never mentions. No rule here names `UN3995`.
 *
 * The same Bulletin page also publishes a minor and a legacy concentration (the
 * latter under a heading restricting it to students who entered in or before
 * 2023–24). Neither is encoded. If either ever is, the three core courses must
 * become a shared const — the `ECON_CORE` pattern in `cc-major-economics.ts` —
 * rather than a third copy of the same list.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/sociology/#requirementstextcontainer";

export const CC_MAJOR_SOCIOLOGY: Program = {
  id: "cc-major-sociology",
  kind: "major",
  school: "CC",
  name: "Sociology",
  department: "Sociology",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "soci-core",
      label: "Core Courses",
      note: "All three, and all three gate the rest of the major: Social Theory and Methods both want The Social World first, and the Senior Seminar cannot be taken until Methods is finished. Each carries a required 0-point discussion section (SOCI UN1100, SOCI UN3001, SOCI UN3011) that is not matched here. The Bulletin calls this block 10 points; its own course listings put all three at 4 points, which is 12 — so the major runs 32-33 points rather than the published 30-31.",
      rule: {
        kind: "all_of",
        courses: ["SOCI UN1000", "SOCI UN3000", "SOCI UN3010"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "soci-electives",
      label: "Elective Courses",
      /*
       * `n_matching` over the subject, never `n_of` over the twelve courses the
       * Bulletin prints. See the header: "Some examples of electives include"
       * is an open list, and closing it would report a finished major as not
       * started.
       */
      note: "Six more courses in the Department of Sociology, on top of the three core courses. At least three must be lecture courses at the 2000 or 3000 level and at least two must be seminars — a split this audit cannot check, so the two groups below are yours to confirm. The twelve courses the Bulletin prints are examples, not the whole list: any Sociology course counts. The 0-point discussion sections attached to lecture courses are not counted here. If you take the two-semester Senior Seminar, your sixth course must be a seminar.",
      rule: {
        kind: "n_matching",
        n: 6,
        select: {
          subjects: ["SOCI"],
          numberRange: [1000, 4999],
          excludeGroups: ["soci-core"],
          exclude: [
            // 0-point discussion sections welded to their lectures. Scattered
            // across the band, so excluded by code rather than by range.
            "SOCI UN1100", // The Social World
            "SOCI UN2211", // AI in Society
            "SOCI UN3001", // Social Theory
            "SOCI UN3011", // Methods for Social Research
            "SOCI UN3103", // Power, Politics & Society
            "SOCI UN3676", // Organizing Innovation
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "soci-lecture-courses",
      label: "Lecture Courses",
      /*
       * Attested. "Lecture" is not a property of a course number in this
       * department and `CourseSelector` has no points field — the two
       * independent reasons given in the header, either one sufficient.
       */
      rule: {
        kind: "attested",
        note: "At least three of your six electives must be lecture courses at the 2000 or 3000 level, normally 3 points each. Whether a Sociology course is a lecture or a seminar is not something its number tells you — the department's 3000-level range holds both — so this one is yours to confirm.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "soci-seminars",
      label: "Seminars",
      rule: {
        kind: "attested",
        note: "At least two of your six electives must be seminars, normally 4 points each. If you take the two-semester Senior Seminar (SOCI UN3995-SOCI UN3996), your sixth elective must also be a seminar — a condition on how another requirement was satisfied, which this audit cannot express. As with the lecture requirement, no course number tells you whether a Sociology course is a seminar, so this one is yours to confirm.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
