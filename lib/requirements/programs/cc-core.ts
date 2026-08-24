/**
 * The Columbia College Core Curriculum.
 *
 * Transcribed by hand from the single `sc_courselist` table on
 * https://bulletin.columbia.edu/columbia-college/requirements-degree-bachelor-arts/
 * (2026–2027 edition). The table has ten `areaheader` rows and they are the ten
 * groups below, in the Bulletin's own order.
 *
 * The transcription is verbatim where the Bulletin names courses, and every
 * group carries `sourceUrl` so a student can check us in one click.
 *
 * ── Two deliberate departures from the Bulletin's table shape ────────────────
 *
 * **Physical Education is split in two.** The Bulletin prints one row: "Two
 * courses and a swimming test". Those are not the same kind of claim — we can
 * see two PHED courses on a record, and we can never see a swim test. Keeping
 * them in one group would force the whole requirement down to `attested` and
 * throw away the half we can actually check. Splitting them lets the PE courses
 * go green on evidence and the swim test go green on the student's word, each
 * labelled with which it was.
 *
 * **Art Humanities appears once.** The source table lists `HUMA UN1121` twice —
 * once as a linked code row and once as a bare text row, an editing artifact in
 * the Bulletin itself. Transcribed once. A parser reading this page will emit
 * it twice, which is one of the differences `requirements.test.ts` asserts on.
 *
 * NOT ENCODED, because no public source carries it: the C- minimum on major
 * coursework, the 124-point degree total's interaction with transfer credit,
 * residency, and the Core's own overlap rules. `degreePoints` records the total
 * as a number to display; nothing audits against it.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/requirements-degree-bachelor-arts/";

export const CC_CORE: Program = {
  id: "cc-core",
  kind: "core",
  school: "CC",
  name: "The Core Curriculum",
  degreePoints: 124,
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "lit-hum",
      label: "Literature Humanities",
      note: "Masterpieces of Western Literature and Philosophy — a full year, both terms.",
      rule: { kind: "all_of", courses: ["HUMA CC1001", "HUMA CC1002"] },
      sourceUrl: SOURCE,
    },
    {
      id: "frontiers",
      label: "Frontiers of Science",
      rule: { kind: "all_of", courses: ["SCNC CC1000"] },
      sourceUrl: SOURCE,
    },
    {
      id: "university-writing",
      label: "University Writing",
      rule: { kind: "all_of", courses: ["ENGL CC1010"] },
      sourceUrl: SOURCE,
    },
    {
      id: "contemporary-civilization",
      label: "Contemporary Civilization",
      note: "Introduction to Contemporary Civilization in the West — a full year, both terms.",
      rule: { kind: "all_of", courses: ["COCI CC1101", "COCI CC1102"] },
      sourceUrl: SOURCE,
    },
    {
      id: "art-hum",
      label: "Art Humanities",
      rule: { kind: "all_of", courses: ["HUMA UN1121"] },
      sourceUrl: SOURCE,
    },
    {
      id: "music-hum",
      label: "Music Humanities",
      rule: { kind: "all_of", courses: ["HUMA UN1123"] },
      sourceUrl: SOURCE,
    },
    {
      id: "science",
      label: "Science Requirement",
      note: "Two courses from the approved Science Requirement list, in addition to Frontiers of Science.",
      rule: { kind: "n_matching", n: 2, select: { flag: "scienceRequirement" } },
      sourceUrl:
        "https://bulletin.columbia.edu/columbia-college/core-curriculum/science-requirement/",
    },
    {
      id: "global-core",
      label: "Global Core",
      note: "Two courses from the approved Global Core list.",
      rule: { kind: "n_matching", n: 2, select: { flag: "globalCore" } },
      sourceUrl:
        "https://bulletin.columbia.edu/columbia-college/core-curriculum/global-core-requirement/",
    },
    {
      id: "foreign-language",
      label: "Foreign Language",
      /*
       * Attested, and it has to be. The requirement is satisfied EITHER by
       * coursework through Intermediate II OR by an exemption from placement or
       * AP scores — and the exemption path leaves no trace on a course record
       * at all. A student who tested out has nothing for us to match, so any
       * course-based rule would render their finished requirement as unmet.
       */
      rule: {
        kind: "attested",
        note: "Completion of Intermediate II in a single language, or exemption by approved exam or placement scores.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physical-education",
      label: "Physical Education",
      note: "Two Physical Education courses.",
      rule: { kind: "n_matching", n: 2, select: { subjects: ["PHED"] } },
      sourceUrl: SOURCE,
    },
    {
      id: "swim-test",
      label: "Swimming test",
      rule: {
        kind: "attested",
        note: "The Columbia College swimming test, or a documented exemption.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
