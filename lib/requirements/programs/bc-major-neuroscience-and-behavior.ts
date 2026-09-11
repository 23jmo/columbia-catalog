/**
 * The Barnard College major in Neuroscience and Behavior (NSBV).
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/neuroscience-behavior/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── Not Columbia College's Neuroscience and Behavior major ────────────────
 *
 * `cc-major-neuroscience-and-behavior` is a joint programme run by Columbia's
 * Biological Sciences and Psychology departments, and its own file explains
 * that the two halves disagree with each other about how many courses it is.
 *
 * Barnard's is a DEPARTMENT — NSBV, with its own subject code and 36 courses
 * in our catalog. Its five core courses are `NSBV BC` codes that do not appear
 * anywhere in the College's programme. The two are not variants of one degree.
 *
 * ── The senior research seminar is two two-course sequences ────────────────
 *
 * "Seniors can choose among two options: Senior Research Seminar (NSBV
 * BC3593-4) and Neuroscience Guided Research (NSBV BC3591-2)."
 *
 * The hyphenated form is the catalogue's shorthand for a year-long pair:
 * BC3593 then BC3594, or BC3591 then BC3592. This is `sequence_choice` and not
 * `n_of { n: 2 }`, for the reason trap #1 in the research brief exists — an
 * `n_of` over all four courses would accept BC3591 plus BC3593, which is the
 * first half of each sequence and the completion of neither. It is a schedule
 * a student could actually register for, since both sequences start in the
 * fall.
 *
 * The page's own arithmetic confirms the pairing: "a minimum of 13 courses (5
 * core neuroscience courses; 3 introductory courses from cognate disciplines;
 * 3 elective courses; a year-long research seminar counting as 2 courses)".
 * 5 + 3 + 3 + 2 = 13.
 *
 * ── The introductory block, and the one course inside it we can name ───────
 *
 * "One course must be Introduction to Cellular and Molecular Biology (BIOL
 * BC1502 + lab BIOL BC1503); the other courses (1 lecture; 1 lecture + lab)
 * from cognate disciplines (Biology, Chemistry, Computer Science, Physics, or
 * Psychology)."
 *
 * So the block splits cleanly in two: a named `all_of` for the cell and
 * molecular biology lecture and its lab, and a selector over the five cognate
 * subjects for the remaining two courses. The "1 lecture; 1 lecture + lab"
 * shape inside those two is NOT checked — our course records carry no
 * lecture/lab distinction, which is the same limit `bc-major-psychology` hits
 * on its outside-science block.
 *
 * ── The core is five courses, and two of them may come from elsewhere ──────
 *
 * "All NSBV majors must take 5 core neuroscience courses ... No more than 2/5
 * core neuroscience courses can be taken outside the NSBV Department,
 * including Columbia University or other institutions."
 *
 * That is a residency CAP — "no more than two" — and the rule language has no
 * ceiling. It also cuts the other way from how it reads: it means the five
 * core courses named below are the default but two of them may be satisfied by
 * equivalents. A student who took a Columbia equivalent of one core course
 * will show UNMET here and be right to ignore it. That is stated in the note,
 * because it is the most likely false negative in this file.
 *
 * ── One elective must be a 3000-level seminar ─────────────────────────────
 *
 * Split into its own group so the condition is genuinely enforced, with
 * `excludeGroups` so it is not double-counted against the other two. The
 * approved elective list itself "is listed on the department webpage" — not in
 * the catalogue — so the selector is NSBV plus the cognate sciences rather
 * than a named list. That is an approximation and the note says so.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The senior thesis, which the page requires alongside the 13 courses without
 * naming a course for it beyond the research seminar sequences. The three
 * suggested elective tracks (cognitive/behavioral, computational, molecular),
 * which the page describes as optional shaping rather than requirements. The
 * 2-of-5 residency cap on the core. The department's own approved elective
 * list, which lives off-catalogue.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/neuroscience-behavior/";

export const BC_MAJOR_NEUROSCIENCE_AND_BEHAVIOR: Program = {
  id: "bc-major-neuroscience-and-behavior",
  kind: "major",
  school: "BC",
  name: "Neuroscience and Behavior",
  department: "Neuroscience and Behavior",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "core-neuroscience",
      label: "Five core neuroscience courses",
      note:
        "Introduction to Neuroscience, Laboratory in Neuroscience, Systems " +
        "and Behavioral Neuroscience, Molecular & Cellular Neuroscience, and " +
        "Statistics and Experimental Design. Note BIOL BC3362 is a BIOL code " +
        "and is core all the same. A cap we cannot check: no more than two of " +
        "these five may be taken outside the NSBV Department — so if you " +
        "satisfied one with a Columbia equivalent it will show as unmet here " +
        "and your adviser will still count it.",
      rule: {
        kind: "all_of",
        courses: [
          "NSBV BC1001",
          "NSBV BC2001",
          "NSBV BC3001",
          "BIOL BC3362",
          "NSBV BC2002",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "introductory-biology",
      label: "Introduction to Cellular and Molecular Biology",
      note:
        "BIOL BC1502 and its laboratory BIOL BC1503. Required of every NSBV " +
        "major, and the one named course among the three introductory courses.",
      rule: { kind: "all_of", courses: ["BIOL BC1502", "BIOL BC1503"] },
      sourceUrl: SOURCE,
    },
    {
      id: "introductory-cognate",
      label: "Two introductory courses from cognate disciplines",
      note:
        "One lecture and one lecture + lab, from Biology, Chemistry, Computer " +
        "Science, Physics or Psychology. We do not check the lecture/lab shape " +
        "— our course records do not distinguish them.",
      rule: {
        kind: "n_matching",
        n: 2,
        select: {
          subjects: ["BIOL", "CHEM", "COMS", "PHYS", "PSYC"],
          numberRange: [1000, 2999],
          excludeGroups: ["introductory-biology"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "elective-seminar",
      label: "One 3000-level seminar elective",
      note:
        "One of the three electives must be a 3000-level seminar. The " +
        "department's approved elective list lives on its webpage rather than " +
        "in the catalogue, so this counts NSBV and the cognate sciences rather " +
        "than a named list — an approximation, and a generous one.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: {
          subjects: ["NSBV", "BIOL", "PSYC"],
          numberRange: [3000, 3999],
          excludeGroups: ["core-neuroscience", "senior-research-seminar"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "electives",
      label: "Two further electives",
      note:
        "The remaining two of the three electives. Approved electives are " +
        "listed on the department webpage; this counts NSBV and cognate " +
        "science courses at the 2000 level or above.",
      rule: {
        kind: "n_matching",
        n: 2,
        select: {
          subjects: ["NSBV", "BIOL", "CHEM", "COMS", "PHYS", "PSYC"],
          numberRange: [2000, 4999],
          excludeGroups: [
            "core-neuroscience",
            "introductory-biology",
            "introductory-cognate",
            "elective-seminar",
            "senior-research-seminar",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-research-seminar",
      label: "Senior research seminar",
      note:
        "A year-long sequence counting as two courses, by one of two routes: " +
        "Senior Research Seminar (NSBV BC3593 then BC3594) or Neuroscience " +
        "Guided Research (NSBV BC3591 then BC3592). Both start in the fall, " +
        "which is why this is a sequence choice — taking the first half of " +
        "each completes neither.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Senior Research Seminar",
            courses: ["NSBV BC3593", "NSBV BC3594"],
          },
          {
            label: "Neuroscience Guided Research",
            courses: ["NSBV BC3591", "NSBV BC3592"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-thesis",
      label: "Senior thesis",
      note:
        "The major requires a senior thesis alongside the thirteen courses. " +
        "The page names no separate course for it beyond the research seminar " +
        "sequence in which it is written, so you certify it.",
      rule: { kind: "attested", note: "I have completed a senior thesis." },
      sourceUrl: SOURCE,
    },
  ],
};
