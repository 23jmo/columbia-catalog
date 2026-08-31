/**
 * The Barnard College major in Sociology.
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/sociology/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── The Foundations block is Columbia-coded, and that is not a mistake ─────
 *
 * The three required courses are `SOCI UN1000`, `SOCI UN3000` and
 * `SOCI UN3010` — `UN`, not `BC`. Barnard's Sociology department genuinely
 * requires the Columbia-numbered versions, and says so: "With the exception of
 * the senior thesis or designated research seminar the Foundations and
 * Elective courses may be taken at either Barnard or Columbia."
 *
 * Do not "correct" these to `SOCI BC` codes. There are 36 `SOCI BC` rows in
 * our catalog and none of them is The Social World, Social Theory or Methods
 * for Social Research. Rewriting them would make the major's three exactly
 * checkable requirements permanently unsatisfiable.
 *
 * ── The senior requirement is `attested`, and a sequence would be wrong ────
 *
 * There are two routes and only one of them can be named:
 *
 *   Thesis Option          SOCI BC3087 + SOCI BC3088, a two-semester sequence.
 *   Research Paper Option  "a designated research seminar (3900 level) in the
 *                          Barnard Sociology Department that requires a 25- to
 *                          30-page paper" plus "any additional upper level
 *                          seminar (3900 or 4000 level)".
 *
 * The obvious encoding is `sequence_choice` over the thesis pair. That is
 * exactly wrong: it would report every student on the Research Paper Option —
 * the option the department describes as the default, for "majors who are
 * interested in graduating with a broader exposure to the discipline" — as
 * having failed her senior requirement in her final semester.
 *
 * And the research seminar cannot be named. "Each semester the department
 * offers 2-3 designated research seminars, which are listed on the
 * department's website prior to the Spring program planning period." Which
 * 3900-level seminars are designated changes every year and is published
 * somewhere we do not read. A `numberRange` of [3900, 3999] would accept any
 * 3900-level seminar, designated or not, which is a different requirement.
 *
 * So the group is `attested`, both routes are spelled out in its note, and the
 * thesis course codes are named there so a student on that path can see them.
 *
 * ── The electives block, and the two caps it carries ───────────────────────
 *
 * Five electives, "no more than one can be at the 2000 level and at least one
 * must be a seminar at the 3900 (or 4000) level."
 *
 * The 3900-level seminar floor IS checkable and is split out as its own group,
 * with `excludeGroups` so it does not also count as one of the remaining four.
 * The "no more than one at the 2000 level" CAP is not: the rule language
 * counts up to a floor and has no vocabulary for a ceiling. `n_matching`
 * cannot say "at most". It is in the note.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 35-point minimum. The P/D/F prohibition — "Courses taken Pass/D/Fail
 * cannot count toward the sociology major requirements ... There are no
 * departmental exceptions to this policy" — which needs the grading basis a
 * student registered under. The prerequisites for the designated research
 * seminar and for the thesis. The thesis proposal and faculty endorsement
 * deadline. The "no more than one elective at the 2000 level" ceiling.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/sociology/";

export const BC_MAJOR_SOCIOLOGY: Program = {
  id: "bc-major-sociology",
  kind: "major",
  school: "BC",
  name: "Sociology",
  department: "Sociology",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "foundations",
      label: "Foundations",
      note:
        "SOCI UN1000 The Social World (recommended no later than sophomore " +
        "year), SOCI UN3000 Social Theory, and SOCI UN3010 Methods for Social " +
        "Research (no later than junior year). These are the Columbia-numbered " +
        "courses, which is what the Barnard department requires; they may be " +
        "taken at either Barnard or Columbia.",
      rule: {
        kind: "all_of",
        courses: ["SOCI UN1000", "SOCI UN3000", "SOCI UN3010"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "elective-seminar",
      label: "Upper-level seminar elective",
      note:
        "At least one of your five electives must be a seminar at the 3900 " +
        "(or 4000) level.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: { subjects: ["SOCI"], numberRange: [3900, 4999] },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "electives",
      label: "Four further electives",
      note:
        "The remaining four of the five electives. A cap we cannot check: no " +
        "more than ONE elective may be at the 2000 level. The rule language " +
        "counts toward a floor and has no way to express a ceiling, so check " +
        "that one yourself.",
      rule: {
        kind: "n_matching",
        n: 4,
        select: {
          subjects: ["SOCI"],
          numberRange: [2000, 4999],
          excludeGroups: ["foundations", "elective-seminar"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-requirement",
      label: "Senior requirement",
      note:
        "Two courses, by one of two routes. RESEARCH PAPER: a designated " +
        "3900-level research seminar in the Barnard Sociology Department " +
        "requiring a 25-30 page paper with primary research, plus any " +
        "additional 3900- or 4000-level seminar. Which seminars are " +
        "'designated' is published on the department website each year and " +
        "changes, so we cannot name them. THESIS: SOCI BC3087 and SOCI BC3088, " +
        "a two-semester sequence, by application with a faculty endorsement. " +
        "Unlike the electives, the senior requirement must be done at Barnard.",
      rule: {
        kind: "attested",
        note:
          "I have completed the senior requirement — either a designated " +
          "research seminar plus an upper-level seminar, or SOCI BC3087 and " +
          "SOCI BC3088.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
