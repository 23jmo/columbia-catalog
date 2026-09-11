/**
 * The Barnard College major in Urban Studies.
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/urban-studies/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── Which curriculum this is, and the one cohort it is wrong for ──────────
 *
 * "This curriculum is mandatory for majors who will graduate in 2028. Majors
 * graduating in 2027 may choose either this curriculum or the old curriculum,
 * found here."
 *
 * This file is the new curriculum: 12 courses, minimum 39 credits. The old one
 * is linked off-page and is not encoded. A student graduating in 2027 who
 * elected to stay on the old curriculum will see requirements that are not
 * hers — that is stated in the introduction group's note, because it is the
 * one population this file can mislead and there is exactly one graduating
 * class of them.
 *
 * ── URBS is a Columbia-coded program that Barnard runs ────────────────────
 *
 * Every named course here is `URBS UN`, not `URBS BC` — Introduction to Urban
 * Studies is `URBS UN1515`, the junior seminar `URBS UN3545`, the senior
 * seminar `URBS UN3992` and `URBS UN3993`. That is the program's own
 * numbering, not an error, and it is why a Barnard Urban Studies major's
 * transcript looks Columbia-shaped. Do not "correct" these to `BC`.
 *
 * ── The senior seminar is `all_of`, not a choice ──────────────────────────
 *
 * "Two semesters to design and execute a research project. Year-long course
 * taken in Senior Year." Both halves are required and there is no alternative
 * route in the table — "Students who, for some reason, will not be able to
 * complete the Fall-Spring Senior Seminar sequence should consult with the
 * Director about alternatives", which is a petition, not a published option.
 * So this is `all_of` over both, and it is exact.
 *
 * ── Breadth and Depth are the two things we cannot check ──────────────────
 *
 * **Breadth**: "One urban-focused course in each area; social, spatial,
 * historical, ecological, cultural. Four courses, with one course fulfilling
 * two areas (or five courses otherwise)."
 *
 * Two separate problems. The five areas are not recorded on any course record —
 * there is no flag and no number band for "spatial" — and the requirement is
 * *four courses covering five areas by way of one course double-counting*,
 * which is a statement about the assignment rather than about any course. The
 * approved list is linked off-page ("A list of courses that fulfill the
 * Breadth Courses requirement can be found here") and is not in the catalogue.
 *
 * **Depth**: "Three courses in an area that you propose; two must be
 * urban-focused. Proposal for courses in consultation with the major advisor
 * submitted by end of junior year. Depth courses may not double-count with
 * Breadth courses." The area is proposed by the student. There is nothing to
 * check it against, by construction — the program says so itself: "The Urban
 * Studies Program envisions the development of the Depth Cluster Proposal as a
 * conversation between major and advisor, not as a submission to be approved
 * or denied."
 *
 * Both are `attested`, and the Depth note carries the no-double-count rule
 * because a student who does not know it can lose a course.
 *
 * ── Research Methods names examples, not a list ───────────────────────────
 *
 * "One course that explores research practices (example: URBS UN2200
 * INTRODUCTION TO GIS METHODS; URBS UN3308 INTRO TO URBAN ETHNOGRAPHIES).
 * Taken in Sophomore or Junior year."
 *
 * The word is "example". An `n_of` over the two named courses would reject
 * every other qualifying methods course, so this is `attested` with both
 * examples in the note.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 39-credit minimum. The year in which each course should be taken
 * (research methods in sophomore or junior year, junior seminar in junior
 * year, senior seminar in senior year) — the audit sees a set of courses, not
 * terms. "Appropriate substitutions may be made for courses listed above with
 * the approval of the Program Director." There is no minor and no
 * concentration in Urban Studies, so neither is registered.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/urban-studies/";

export const BC_MAJOR_URBAN_STUDIES: Program = {
  id: "bc-major-urban-studies",
  kind: "major",
  school: "BC",
  name: "Urban Studies",
  department: "Urban Studies",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "introduction",
      label: "Introduction to Urban Studies",
      note:
        "URBS UN1515. This audit encodes the curriculum that is mandatory for " +
        "majors graduating in 2028 and later. If you graduate in 2027 and " +
        "elected to stay on the old curriculum, these requirements are not " +
        "yours — check with the Director.",
      rule: { kind: "all_of", courses: ["URBS UN1515"] },
      sourceUrl: SOURCE,
    },
    {
      id: "breadth",
      label: "Breadth courses",
      note:
        "One urban-focused course in each of five areas — social, spatial, " +
        "historical, ecological, cultural — which is four courses if one of " +
        "them covers two areas, or five otherwise. Certified rather than " +
        "checked: no course record carries these areas, the approved list " +
        "lives off-catalogue on the program website, and the double-coverage " +
        "is a statement about how your courses are assigned rather than about " +
        "any one of them.",
      rule: {
        kind: "attested",
        note:
          "I have completed breadth courses covering all five areas (social, " +
          "spatial, historical, ecological, cultural).",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "depth-cluster",
      label: "Depth cluster",
      note:
        "Three courses in an area you propose, at least two of them " +
        "urban-focused, agreed with your major adviser by the end of junior " +
        "year. Watch this one: depth courses may NOT double-count with your " +
        "breadth courses. The program describes the proposal as a conversation " +
        "with your adviser rather than something approved or denied, so there " +
        "is nothing here for us to check it against.",
      rule: {
        kind: "attested",
        note:
          "I have an agreed depth cluster of three courses that do not " +
          "double-count with my breadth courses.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "research-methods",
      label: "Research methods",
      note:
        "One course exploring research practices, taken in sophomore or " +
        "junior year. The catalogue gives URBS UN2200 Introduction to GIS " +
        "Methods and URBS UN3308 Intro to Urban Ethnographies as EXAMPLES, not " +
        "as the list — which is why this is certified rather than checked " +
        "against those two.",
      rule: {
        kind: "attested",
        note: "I have completed a research methods course.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "junior-seminar",
      label: "Junior seminar",
      note:
        "URBS UN3545, taken in junior year. Multiple sections run each " +
        "semester under different faculty and topics; they are all this course.",
      rule: { kind: "all_of", courses: ["URBS UN3545"] },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-seminar",
      label: "Senior seminar",
      note:
        "URBS UN3992 and URBS UN3993 — a year-long, two-semester sequence in " +
        "senior year in which you design and execute a research project. Both " +
        "are required; there is no published alternative, only a conversation " +
        "with the Director.",
      rule: { kind: "all_of", courses: ["URBS UN3992", "URBS UN3993"] },
      sourceUrl: SOURCE,
    },
  ],
};
