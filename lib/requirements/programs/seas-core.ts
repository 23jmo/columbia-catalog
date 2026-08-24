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
 * they pick.
 *
 * ── Global Core is an ALTERNATIVE here, not an addition (fixed 2026-08-24) ───
 *
 * This file used to carry a standalone `global-core` group — two flagged
 * courses — *alongside* the Lit Hum/CC sequence, copied from `cc-core` where
 * that is right. For a Columbia College student it is: they take Lit Hum AND
 * CC AND Global Core. An engineering student takes **one** of the three. The
 * old encoding showed every SEAS student two requirements and roughly seven
 * points they do not owe.
 *
 * Three independent confirmations, all on the live 2026–2027 Bulletin:
 *
 *  1. The arithmetic. The page fixes List A at "16 to 18 points of credit".
 *     ENGL CC1010 (3) + one sequence (6–8) + Art or Music Hum (3–4) +
 *     ECON UN1105 (4) is 16–19, which is the stated range. Adding two Global
 *     Core courses (6–8) would make List A 22–27 on its own, and List A plus
 *     List B's 9–11 would come to 31–38 against a published total of 27.
 *
 *  2. The list item itself. List A's second entry is ONE item headed "One of
 *     the following two-semester sequences" and it contains three
 *     alternatives, not two — CourseLeaf loses the third one's label, so it
 *     renders as "…COCI CC1101-COCI CC1102: Any two courses from approved list
 *     (6–8 points). If electing Global Core, students must take two courses
 *     from the List of Approved Courses for a letter grade." That trailing
 *     description belongs to a third alternative, Global Core, whose heading
 *     was eaten.
 *
 *  3. Every department degree track prints it as a choice. Biomedical
 *     Engineering, Mechanical Engineering and Operations Research all publish
 *     the same plan-grid row: "Choose one of the following Required
 *     Nontechnical Electives: HUMA CC1001 / COCI CC1101 / Global Core (3–4)",
 *     and its second-term twin one semester later.
 *
 * The rule language cannot say "this sequence, that sequence, or two courses
 * carrying a registrar flag" — `sequence_choice` alternatives are explicit
 * course lists and Global Core is a `flag` selector, and inventing a rule kind
 * for one requirement is not worth it. So the Global Core route is named in the
 * group's note and linked, rather than checked. A student who took that route
 * sees the sequence unmet and reads why, which is the recoverable direction:
 * under-counting sends someone to their adviser, over-counting sends them to
 * the registrar after add/drop.
 *
 * NOT ENCODED: the technical requirements (math, science, computing, the
 * major's own track), which vary per department and belong on the department's
 * own program rather than on the shared Core. **This is a real seam and it has
 * failed once** — `seas-major-computer-science` never picked up the science
 * block the Core delegated to it, and a SEAS CS student was shown a degree with
 * no physics, no chemistry and no laboratory in it. Anyone adding a SEAS major
 * here should read the department's whole Degree Track table, not just its
 * "Major Requirements" block. ENGI E1102 The Art of Engineering is required of
 * every engineering student and this page says so, but it is encoded on each
 * major rather than here, because a course held in both places is evaluated
 * twice and the two copies can disagree — see the ECON UN1105 duplication that
 * was removed from three major files on 2026-08-24.
 *
 * Also NOT ENCODED: Professional Development, which the page lists as courses
 * "that may be taken" and that only some departments require; and the AP credit
 * chart, which can satisfy ECON UN1105 without any course appearing on a
 * record — noted on the group so a student is not told they are missing
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
      /*
       * The Bulletin offers a third route here that this rule cannot hold: two
       * Global Core courses in place of a sequence. See the header — it is an
       * alternative, not an addition, and the flag-based half of a disjunction
       * has nowhere to live in `sequence_choice`. Named in the note instead.
       */
      note: "One full two-semester sequence — Literature Humanities or Contemporary Civilization, both terms of whichever you choose — OR two courses from the Global Core list, taken for a letter grade, which the Bulletin accepts in place of a sequence. The Global Core route is not checked automatically: bulletin.columbia.edu/columbia-college/core-curriculum/global-core-requirement",
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
