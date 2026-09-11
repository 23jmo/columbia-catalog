/**
 * The Barnard College major in Economics — the Political Economy track.
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/economics/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── Why this is a separate program from `bc-major-economics` ───────────────
 *
 * The Economics department publishes two tracks, "equal in rigor, but
 * different in scope and focus", and a student declares one of them: "The
 * track in Economics emphasizes modern economic theory along with associated
 * analytical and mathematical tools. The track in Political Economy emphasizes
 * the roots of modern economics in the history of economic thought and the
 * interconnections between social forces, political institutions, and economic
 * power."
 *
 * They are not the same degree with a different label. Three differences, each
 * of which would produce a wrong audit if the tracks were merged:
 *
 *   1. **Econometrics.** `ECON BC3018` is required on the Economics track and
 *      is NOT on Political Economy's table at all. A merged program would tell
 *      every Political Economy major she owed a course she does not.
 *   2. **The mathematics course.** Economics takes `ECON BC1007` or
 *      `MATH UN1201` Calculus III. Political Economy takes `ECON BC1007` or
 *      `MATH UN1101` Calculus **I**. A Political Economy major who took
 *      Calculus I would be reported as unmet against the other track's rule.
 *   3. **Two interdisciplinary electives**, which the Economics track does not
 *      have at all.
 *
 * Net: 13 courses and 42 points here against 12 and 36 there.
 *
 * ── The interdisciplinary electives, and why they are `attested` ───────────
 *
 * "Two interdisciplinary electives (see further conditions below)." The
 * conditions are that each must be *linked* to one of the student's economics
 * electives: "If a course is 'linked,' this means that it addresses subject
 * matter that is related to the subject matter of the economics elective to
 * which it is paired ... Whether a course qualifies as a linked course must be
 * approved by the student's major adviser."
 *
 * That is a pairwise relation between two of the student's own courses,
 * adjudicated by a person. There is no rule kind for it and there should not
 * be. The department publishes a list of related areas of study — Anthropology,
 * Asian and Middle Eastern Cultures, Environmental Science, History,
 * Philosophy, Political Science, Psychology, Sociology, Spanish and Latin
 * American Cultures, Women's Studies, plus Africana Studies, American Studies,
 * Human Rights Studies, Jewish Studies, Science and Public Policy and Urban
 * Studies — but it says explicitly that the suggestions are "NOT an exhaustive
 * list" and that alternatives may be proposed. A selector over those subjects
 * would be both too narrow (it rejects a proposed alternative) and too broad
 * (it accepts an unlinked course). The subjects are listed in the note where a
 * student can use them as the suggestion they are.
 *
 * ── Everything else follows `bc-major-economics` ───────────────────────────
 *
 * The senior requirement is the same `sequence_choice` for the same reason —
 * see that file's header for why a half-finished thesis must not satisfy it,
 * and for the unnameable extra elective the Senior Seminar option carries.
 * The statistics requirement is the same four-way choice.
 *
 * ── One thing this track's prose adds ─────────────────────────────────────
 *
 * "Students who have received advanced placement college credit for calculus
 * have satisfied the mathematics requirement for the political economy track,
 * however they must take an additional economics elective as a substitute for
 * the AP credit so that the total number of courses taken for the major
 * remains the same." Transfer and AP credit is outside what the rule language
 * can see (`lib/profile/types.ts`), so this is in the mathematics note.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 42-point minimum; the upper-level condition on two of the three
 * economics electives (defined by prerequisite, not number band); the linking
 * of interdisciplinary electives to economics electives; the AP substitution
 * above; the Major Requirements Declaration form. Also the note that
 * statistics became a Political Economy requirement only for the class of 2021
 * and later, replacing one of three formerly-required interdisciplinary
 * electives — every student the app serves is on the current rule.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/economics/";

export const BC_MAJOR_POLITICAL_ECONOMY: Program = {
  id: "bc-major-political-economy",
  kind: "major",
  school: "BC",
  name: "Political Economy",
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
        "ECON BC1007 Math Methods for Economics, or MATH UN1101 Calculus I. " +
        "Note this is Calculus I — the Economics track requires Calculus III " +
        "instead. If you have AP college credit for calculus you have already " +
        "satisfied this, but you must take an additional economics elective in " +
        "its place so the course total is unchanged; we cannot see AP credit, " +
        "so this group will show unmet for you.",
      rule: { kind: "n_of", n: 1, courses: ["ECON BC1007", "MATH UN1101"] },
      sourceUrl: SOURCE,
    },
    {
      id: "statistics",
      label: "Statistics",
      note:
        "ECON BC2411 Statistics for Economics, or STAT UN1101, or STAT UN1201, " +
        "or PSYC BC1101. Required for the class of 2021 and later; it replaced " +
        "one of the three interdisciplinary electives the older curriculum had.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["ECON BC2411", "STAT UN1101", "STAT UN1201", "PSYC BC1101"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "intermediate-theory",
      label: "Intermediate theory",
      note:
        "ECON BC3033 Intermediate Macroeconomic Theory and ECON BC3035 " +
        "Intermediate Microeconomics. Both. Note that unlike the Economics " +
        "track, Political Economy does NOT require ECON BC3018 Econometrics.",
      rule: { kind: "all_of", courses: ["ECON BC3033", "ECON BC3035"] },
      sourceUrl: SOURCE,
    },
    {
      id: "theoretical-foundations",
      label: "Theoretical Foundations of Political Economy",
      note: "ECON BC3041. The course the track is built around.",
      rule: { kind: "all_of", courses: ["ECON BC3041"] },
      sourceUrl: SOURCE,
    },
    {
      id: "electives",
      label: "Three economics electives",
      note:
        "Three economics electives, two of which must be upper-level — that " +
        "is, they must have intermediate micro- or macroeconomic theory as a " +
        "prerequisite. We count three ECON courses at the 2000 level or above " +
        "that the requirements above and the senior requirement below have not " +
        "consumed, and do not check the upper-level condition: it is defined " +
        "by prerequisite, not by course number.",
      rule: {
        kind: "n_matching",
        n: 3,
        select: {
          subjects: ["ECON"],
          numberRange: [2000, 4999],
          excludeGroups: [
            "mathematics",
            "statistics",
            "intermediate-theory",
            "theoretical-foundations",
            "senior-requirement",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "interdisciplinary-electives",
      label: "Two interdisciplinary electives",
      note:
        "Two courses outside economics, each LINKED to one of your economics " +
        "electives — addressing related subject matter, and approved as such " +
        "by your major adviser. That pairing is a relation between two of your " +
        "own courses that a person adjudicates, so you certify it. The " +
        "department's suggested areas are Anthropology, Asian and Middle " +
        "Eastern Cultures, Environmental Science, History, Philosophy, " +
        "Political Science, Psychology, Sociology, Spanish and Latin American " +
        "Cultures, Women's Studies, Africana Studies, American Studies, Human " +
        "Rights Studies, Jewish Studies, Science and Public Policy, and Urban " +
        'Studies — but the list is explicitly "NOT an exhaustive list" and you ' +
        "may propose alternatives.",
      rule: {
        kind: "attested",
        note:
          "I have completed two interdisciplinary electives, each linked to an " +
          "economics elective and approved by my major adviser.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-requirement",
      label: "Senior requirement",
      note:
        "One of two options. The thesis is a year-long sequence — ECON BC3061 " +
        "then ECON BC3062 — and half of it satisfies nothing, which is why " +
        "this is a sequence choice. Choosing ECON BC3063 Senior Seminar " +
        "instead also requires an ADDITIONAL upper-level economics elective " +
        "beyond the three above, which the rule cannot show.",
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
