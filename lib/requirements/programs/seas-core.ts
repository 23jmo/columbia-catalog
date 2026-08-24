/**
 * The Columbia Engineering liberal-arts Core — the 27-point nontechnical
 * requirement.
 *
 * Transcribed from "The First Year/Sophomore Program" on the Engineering
 * bulletin, 2026–2027 edition. This page is a useful counter-example to the CS
 * department page: its List A is written as **prose with inline course links**
 * rather than as `sc_courselist` tables, and its List B is one enormous table
 * of rules a parser cannot read.
 *
 * ── Why List B is `attested`, and why that is the right answer ───────────────
 *
 * List B — the 9–11 elective points — is published as ~120 rows of departmental
 * policy, not of courses:
 *
 *   "Anthropology: All courses in sociocultural anthropology"
 *   "All courses in archaeology except fieldwork"
 *   "Music: All courses except performance courses, instrument instruction
 *    courses, and workshops"
 *   "Visual Arts: No more than one course, which must be at the 3000-level or
 *    higher"
 *   "Courses in logic"
 *
 * None of that is decidable from a course code. "All courses except performance
 * courses" needs a per-course judgement the registrar's flags do not encode,
 * and "no more than one" is a constraint across the student's whole record.
 * A selector that approximated this — say, every ANTH course — would mark a
 * student's requirement satisfied by a course their adviser will reject.
 *
 * So the elective block is `attested`: we show the point target, link the
 * actual list, and let the student confirm. That is a worse feature than an
 * automatic check and a much better one than a wrong automatic check.
 *
 * ── What IS checkable ───────────────────────────────────────────────────────
 *
 * List A is entirely explicit courses, including the one place in the whole
 * catalog where the language needed a `sequence_choice`: an engineering student
 * takes the Lit Hum sequence **or** the CC sequence, both terms of whichever
 * they pick. And Global Core rides on the same registrar flag Columbia College
 * uses, so it checks exactly as it does there.
 *
 * NOT ENCODED: the technical requirements (math, science, computing, the
 * major's own track), which vary per department and belong on the department's
 * own program rather than on the shared Core. Professional Development. The AP
 * credit chart, which can satisfy ECON UN1105 without any course appearing on
 * a record — noted on the group so a student is not told they are missing
 * something they tested out of.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/undergraduate-studies/undergraduate-programs/first-year-sophomore-program/";

export const SEAS_CORE: Program = {
  id: "seas-core",
  kind: "core",
  school: "SEAS",
  name: "Liberal Arts Core",
  degreePoints: 128,
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "university-writing",
      label: "University Writing",
      note: "Must be taken at Columbia.",
      rule: { kind: "all_of", courses: ["ENGL CC1010"] },
      sourceUrl: SOURCE,
    },
    {
      id: "core-sequence",
      label: "Core sequence",
      note: "One full two-semester sequence — Literature Humanities or Contemporary Civilization. Both terms of whichever you choose.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Literature Humanities",
            courses: ["HUMA CC1001", "HUMA CC1002"],
          },
          {
            label: "Contemporary Civilization",
            courses: ["COCI CC1101", "COCI CC1102"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "global-core",
      label: "Global Core",
      note: "Two courses from the approved Global Core list (6–8 points), for a letter grade.",
      rule: { kind: "n_matching", n: 2, select: { flag: "globalCore" } },
      sourceUrl:
        "https://bulletin.columbia.edu/columbia-college/core-curriculum/global-core-requirement/",
    },
    {
      id: "art-or-music-hum",
      label: "Art or Music Humanities",
      note: "One of the two.",
      rule: { kind: "n_of", n: 1, courses: ["HUMA UN1121", "HUMA UN1123"] },
      sourceUrl: SOURCE,
    },
    {
      id: "principles-of-economics",
      label: "Principles of Economics",
      note: "May be satisfied by Advanced Placement credit, which leaves no course on your record — tick it manually if that is your route. Barnard economics courses are not accepted as a substitute.",
      rule: { kind: "all_of", courses: ["ECON UN1105"] },
      sourceUrl: SOURCE,
    },
    {
      id: "nontechnical-electives",
      label: "Nontechnical electives",
      /*
       * See the header. This is `attested` on purpose: List B is departmental
       * policy prose, not a course list, and the total is a points target
       * across it. Neither half survives contact with a course-code selector.
       */
      rule: {
        kind: "attested",
        note: "9–11 points from List B, bringing the nontechnical total to 27. List B is published as departmental policy rather than a course list, so this one is yours to confirm.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physical-education",
      label: "Physical Education",
      rule: { kind: "n_matching", n: 2, select: { subjects: ["PHED"] } },
      sourceUrl: SOURCE,
    },
  ],
};
