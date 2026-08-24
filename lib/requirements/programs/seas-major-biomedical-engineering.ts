/**
 * The Columbia Engineering B.S. in Biomedical Engineering.
 *
 * Transcribed by hand from the Curriculum and Degree Track tabs of
 * https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/biomedical-engineering/undergraduate-programs/biomedical-engineering-bs/
 * (2026–2027 edition). The degree track is an `sc_plangrid`, invisible to
 * `parseRequirementTables`; the curriculum tab does carry thirteen
 * `sc_courselist` tables, but none of them is a requirement — they are the
 * suggested course groupings for the six optional elective concentrations
 * (Biomechanics, Biomaterials, Cell and Tissue Engineering, Biosignals and
 * Biomedical Imaging, Bioinformatics and Machine Learning, BioMEMS and
 * Nanotechnology). Running the parser over this page produces thirteen
 * requirement groups that are not requirements, which is a good demonstration
 * of why parsed output is never trusted without a person reading the page.
 *
 * ── The chemistry sequences are sequences, and pair across terms ────────────
 *
 * The grid gives three chemistry paths and splits each across two semesters:
 *
 *   Sequence 1  CHEM UN1403 then CHEM UN1404, with CHEM UN1500 either term
 *   Sequence 2  CHEM UN1604 then CHEM UN1507
 *   Sequence 3  CHEM UN2045 then CHEM UN2046
 *
 * Written as `n_of` over all seven codes a student could pair the first term of
 * sequence 1 with the second of sequence 3 and satisfy neither — the case
 * `sequence_choice` exists for. Physics is the same shape and gets the same
 * treatment; sequences 1 and 2 run to a third term (`PHYS UN1403`,
 * `PHYS UN2601`), sequence 3 is printed with two.
 *
 * ── The technical electives are split, deliberately ─────────────────────────
 *
 * The rule is one sentence with three numbers in it: "Students are required to
 * take 18 points of technical electives. Of these, at least 12 points must be
 * clearly engineering in nature … at least 6 points of the Engineering Content
 * electives must be from courses in the Department of Biomedical Engineering."
 *
 * Only the last of the three is checkable. "Technical elective" is defined as
 * "a 3000-level or above course taught in SEAS or 3000-level or above course in
 * biology, chemistry, biochemistry, or biotechnology" plus some 2000-level
 * exceptions — a definition over departments and content, not subject codes.
 * "Engineering content" is defined by ABET accreditation of the listing
 * department, which is not in any course record we have.
 *
 * So this splits the way Physical Education splits on `cc-core`: the BMEN
 * 6-point floor becomes a `points_matching` group that goes green on evidence,
 * and the 18-point total becomes an `attested` group the student confirms. One
 * group covering both would have dragged the checkable half down to attested
 * and thrown it away.
 *
 * The BMEN selector excludes the nine required BMEN core courses by name. Left
 * in, a student's `BMEN E3010`, `BMEN E3020` and `BMEN E4001` would fill the
 * elective floor with courses they were required to take anyway — which is the
 * same mistake `cc-major-economics` guards against by excluding the economics
 * core from the elective selector.
 *
 * ── Degree Track coverage, re-verified 2026-08-24 ──────────────────────────
 *
 * Every row of the eight-semester grid is now accounted for, on this file or on
 * `seas-core`, because the Bulletin splits a SEAS degree across two tables and
 * a student does not care which one a requirement came from. Row by row:
 * calculus (`MATH UN1102`, `APMA E2000`), physics, chemistry, `BIOL UN2005`–
 * `BIOL UN2006`, `APMA E2101`, `ENGI E1006`, `ENGI E1102`, `ELEN E1201` and
 * the ten BMEN core courses are here; `ENGL CC1010`, the nontechnical
 * requirement, Art or Music Humanities, `ECON UN1105` and physical education
 * are on `seas-core`. Nothing in the grid is unencoded.
 *
 * Note there is no separate laboratory group. Unlike the other SEAS degrees,
 * biomedical engineering carries its laboratory inside the chemistry sequence:
 * `CHEM UN1500` in sequence 1 and `CHEM UN1507` in sequence 2. Sequence 3
 * (`CHEM UN2045`–`CHEM UN2046`) is printed with no laboratory at all, and is
 * transcribed as printed rather than as guessed.
 *
 * `ECON UN1105` used to be in `engineering-foundations` below and was removed:
 * `seas-core` already carries it, and two independently evaluated copies of one
 * requirement can disagree on screen.
 *
 * NOT ENCODED: the 18-point and 12-point elective totals as checkable rules
 * (see above); the six optional concentrations, which are designations a
 * student may declare rather than degree requirements ("It is not necessary to
 * declare a concentration for the B.S. program"); the premedical additions; and
 * the 27-point nontechnical requirement, which is `seas-core`. `APMA E2001` and
 * `ECON UN1155` are 0-point co-requisite recitations and are named in notes
 * rather than required, matching the other SEAS programs in this module.
 *
 * NOT IN OUR CATALOG: `BMEN E2910` Introduction to Biomedical Engineering
 * Design. The Bulletin prints it on this grid and again in the School's
 * professional-development list, so it is a real course and the code is right —
 * our catalog covers four terms and this one did not run in any of them. It is
 * kept in `bme-core`, because dropping a course the Bulletin requires would
 * tell a student who took it that it did not count.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/biomedical-engineering/undergraduate-programs/biomedical-engineering-bs/#degreetracktextcontainer";

const CURRICULUM_SOURCE =
  "https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/biomedical-engineering/undergraduate-programs/biomedical-engineering-bs/#curriculumtextcontainer";

/**
 * The required BMEN courses at the 3000 level or above. Excluded from the
 * elective selector so that required coursework cannot fill an elective slot.
 */
const BMEN_CORE_AT_ELECTIVE_LEVEL = [
  "BMEN E3010",
  "BMEN E3020",
  "BMEN E3810",
  "BMEN E3820",
  "BMEN E3910",
  "BMEN E3920",
  "BMEN E4001",
  "BMEN E4002",
  "BMEN E4110",
];

export const SEAS_MAJOR_BIOMEDICAL_ENGINEERING: Program = {
  id: "seas-major-biomedical-engineering",
  kind: "major",
  school: "SEAS",
  name: "Biomedical Engineering",
  department: "Biomedical Engineering",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "calculus",
      label: "Calculus",
      note: "The grid starts biomedical engineering students at Calculus II. APMA E2000 carries a required 0-point recitation, APMA E2001, which is not matched here.",
      rule: { kind: "all_of", courses: ["MATH UN1102", "APMA E2000"] },
      sourceUrl: SOURCE,
    },
    {
      id: "applied-mathematics",
      label: "Applied Mathematics",
      note: "Taken in semester IV. Required of all biomedical engineering students, with no alternative offered.",
      rule: { kind: "all_of", courses: ["APMA E2101"] },
      sourceUrl: SOURCE,
    },
    {
      id: "physics",
      label: "Physics",
      /*
       * `sequence_choice`. See the header: mixing terms across sequences is a
       * buildable schedule that satisfies none of them.
       */
      note: "One complete physics sequence. Sequences 1 and 2 run three terms; the grid gives sequence 3 no third term.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Sequence 1",
            courses: ["PHYS UN1401", "PHYS UN1402", "PHYS UN1403"],
          },
          {
            label: "Sequence 2",
            courses: ["PHYS UN1601", "PHYS UN1602", "PHYS UN2601"],
          },
          { label: "Sequence 3", courses: ["PHYS UN2801", "PHYS UN2802"] },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemistry",
      label: "Chemistry",
      note: "One complete chemistry sequence, both terms of whichever you pick. Sequence 1 also carries the general chemistry laboratory, taken in either term.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Sequence 1",
            courses: ["CHEM UN1403", "CHEM UN1404", "CHEM UN1500"],
          },
          { label: "Sequence 2", courses: ["CHEM UN1604", "CHEM UN1507"] },
          { label: "Sequence 3", courses: ["CHEM UN2045", "CHEM UN2046"] },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "biology",
      label: "Introductory Biology",
      note: "The full two-term sequence, taken in the second year. The curriculum tab calls this out as a requirement specific to biomedical engineering.",
      rule: { kind: "all_of", courses: ["BIOL UN2005", "BIOL UN2006"] },
      sourceUrl: CURRICULUM_SOURCE,
    },
    {
      id: "engineering-foundations",
      label: "Engineering Foundations",
      /*
       * ECON UN1105 was here until 2026-08-24 and has been removed. It is
       * already the `principles-of-economics` group on `seas-core`, so a
       * biomedical engineering student saw Principles of Economics twice —
       * and the two copies are evaluated independently, so one could go green
       * while the other stayed red. `seas-major-computer-science` was written
       * the right way round from the start; these three files have been made
       * to match it.
       */
      note: "Computing, The Art of Engineering, and Introduction to Electrical Engineering. The curriculum tab specifies ENGI E1006 and ELEN E1201 by name for biomedical engineering students, with no alternatives. Principles of Economics is also required and is tracked on the Liberal Arts Core rather than repeated here.",
      rule: {
        kind: "all_of",
        courses: ["ENGI E1006", "ENGI E1102", "ELEN E1201"],
      },
      sourceUrl: CURRICULUM_SOURCE,
    },
    {
      id: "bme-core",
      label: "Biomedical Engineering Core",
      note: "All ten. The curriculum tab says these core requirements cannot be waived nor substituted.",
      rule: {
        kind: "all_of",
        courses: [
          "BMEN E2910",
          "BMEN E3010",
          "BMEN E3020",
          "BMEN E3810",
          "BMEN E3820",
          "BMEN E4001",
          "BMEN E4002",
          "BMEN E4110",
          "BMEN E3910",
          "BMEN E3920",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "bme-technical-electives",
      label: "Biomedical Engineering technical electives",
      /*
       * The one checkable third of the elective rule. Points rather than a
       * course count because the requirement is stated in points and BMEN
       * courses vary in credit. The ten core BMEN courses are excluded by name
       * so required coursework cannot fill an elective slot.
       */
      note: "At least 6 of the 18 elective points must be Biomedical Engineering courses. A cross-listed course at the 3000 level or above with BMEN in its call letters qualifies. The ten required core courses do not count toward this.",
      rule: {
        kind: "points_matching",
        points: 6,
        select: {
          subjects: ["BMEN"],
          numberRange: [3000, 9999],
          exclude: BMEN_CORE_AT_ELECTIVE_LEVEL,
        },
      },
      sourceUrl: CURRICULUM_SOURCE,
    },
    {
      id: "technical-electives",
      label: "Technical Electives",
      /*
       * Attested. "Technical elective" is defined by teaching department and
       * subject area, and "engineering content" by whether a listing
       * department is ABET-accredited. Neither is in a course record.
       */
      rule: {
        kind: "attested",
        note: "18 points total, of which at least 12 must be engineering content. A technical elective is any 3000-level or above SEAS course, or a 3000-level or above biology, chemistry, biochemistry or biotechnology course; some 2000-level organic chemistry and biochemistry courses count with an adviser's approval. Engineering content is judged by whether a listing department is ABET-accredited, which no course record carries.",
      },
      sourceUrl: CURRICULUM_SOURCE,
    },
  ],
};
