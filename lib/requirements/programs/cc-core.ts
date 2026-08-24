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
 * ── Three deliberate departures from the Bulletin's table shape ──────────────
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
 * **The Science Requirement is split in two, and this one is a bug fix.** See
 * the long comment on `science-b` below. The degree table's row — "two courses
 * from the list of approved courses" — is a summary of a rule the Science
 * Requirement's own page states differently and more strictly, and reading only
 * the degree table let a student satisfy the requirement with two courses the
 * College would refuse.
 *
 * NOT ENCODED, because no public source carries it: the C- minimum on major
 * coursework, the 124-point degree total's interaction with transfer credit,
 * residency, and the Core's own overlap rules. `degreePoints` records the total
 * as a number to display; nothing audits against it. Also not encoded: the
 * letter-grade rule on every Core course except Physical Education, the
 * requirement that Frontiers / Lit Hum / University Writing be finished in the
 * first year and Contemporary Civilization in the sophomore year, and the
 * 3-point-per-course floor on the Science Requirement — `CourseSelector` has no
 * minimum-points field, so a course's credit value cannot be part of a match.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/requirements-degree-bachelor-arts/";

/**
 * The Science Requirement has its own page, and it does not say what the degree
 * table says. This is the page the two science groups below are transcribed
 * from; the degree table's one-line summary is not enough to encode the rule.
 */
const SCIENCE_SOURCE =
  "https://bulletin.columbia.edu/columbia-college/core-curriculum/science-requirement/";

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
      /*
       * This is Science Category A. The Science Requirement page counts it as
       * one of the three science courses; the degree table prints it as its own
       * row and then says the other two are "in addition to" it. Same rule,
       * two presentations — the groups below are B and C.
       */
      note: "Category A of the Science Requirement. Taken in the first or second semester, whichever term you are not taking University Writing.",
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
    /*
     * ── The Science Requirement, corrected 2026-08-24 ────────────────────────
     *
     * This group used to be a single `n_matching { n: 2, flag:
     * "scienceRequirement" }`, transcribed from the degree table's summary row:
     * "In addition to Frontiers of Science, two courses from the list of
     * approved courses that meet the guidelines of the Science Requirement".
     *
     * The Science Requirement's own page states the rule the College actually
     * enforces, and it is stricter:
     *
     *   "All students in Columbia College must complete three courses in
     *    fulfillment of the science requirement. The three courses must be
     *    distributed across the three categories detailed below: Science A,
     *    Science B, and Science C."
     *
     * Science A is Frontiers of Science. Science B is "at least one course
     * offered by one of the following seven Columbia University science
     * departments" — Astronomy, Biology, Chemistry, Earth and Environmental
     * Sciences, Ecology/Evolution/Environmental Biology, Physics, Psychology.
     * Science C is a wider list that CONTAINS all of Science B plus courses
     * from other departments: Mathematics, Linguistics, Philosophy, Computer
     * Science, Food Studies and several engineering departments.
     *
     * The two counts agree — one plus one plus Frontiers is three — so the old
     * encoding asked for the right NUMBER of courses and the wrong ones. A
     * student who took MATH UN1003 and PHIL UN3411 holds two courses on the
     * approved list, neither of which is from a science department, and was
     * told the Science Requirement was DONE. It is not: they still owe a
     * Science B course, and the audit's job is to say so before they register
     * for a last semester without one.
     *
     * The `scienceB` / `scienceC` flags this now selects on were already being
     * written to the catalog. `lib/ingest/core-flags.ts` recorded them
     * deliberately, saying in its own header that "tightening that rule later
     * is an edit to one program file rather than a re-crawl". This is that
     * edit. Verified against the catalog on 2026-08-24: 44 courses carry
     * `scienceB` and 57 carry `scienceC`, and every `scienceB` course also
     * carries `scienceC` — so a student who takes two Science B courses spends
     * one on each group, which is what the Bulletin permits.
     *
     * NOTE ON THE GROUP IDS. The Category C group keeps the plain id `science`
     * rather than being renamed to `science-c`, because `lib/requirements/
     * golden.ts` pins that id on four records and is shared with other work in
     * flight. The asymmetry is deliberate and is the smaller cost.
     */
    {
      id: "science-b",
      label: "Science Requirement (Category B)",
      note: "At least one course offered by one of the seven Columbia science departments — Astronomy, Biology, Chemistry, Earth and Environmental Sciences, Ecology/Evolution/Environmental Biology, Physics, Psychology. Each science course must carry at least 3 points and be taken for a letter grade; neither is checked here. Barnard courses generally do not count, though the Bulletin's own list names a few that do.",
      rule: { kind: "n_matching", n: 1, select: { flag: "scienceB" } },
      sourceUrl: SCIENCE_SOURCE,
    },
    {
      id: "science",
      label: "Science Requirement (Category C)",
      note: "One further course from the wider Category C list, which includes every Category B course plus approved courses in mathematics, philosophy, linguistics, computer science and several engineering departments. It must be a different course from the one used for Category B.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: {
          flag: "scienceC",
          /*
           * Without this, one course satisfies both halves and the audit
           * reports a three-course requirement finished with two. Category C's
           * list is a superset of Category B's, so the overlap is total rather
           * than incidental — every course that can satisfy B can also satisfy
           * C, and the only thing separating the two groups is that they may
           * not be the same course.
           */
          excludeGroups: ["science-b"],
        },
      },
      sourceUrl: SCIENCE_SOURCE,
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
        note: "Completion of Intermediate II (or the equivalent) in a single language, or exemption by approved exam or placement scores. This is the one Core requirement the College allows to be satisfied at Barnard, when the relevant Columbia department agrees.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physical-education",
      label: "Physical Education",
      /*
       * PHED only, knowingly narrower than the rule. The Physical Education
       * Requirement page adds one sentence the degree table does not: "Dance
       * courses at Barnard College can be taken to fulfill the two-semester
       * Physical education requirement." Barnard's dance department carries
       * both studio technique courses and academic ones — DNCE BC2565 World
       * Dance History and DNCE BC3567 Dances of India, which is on the Global
       * Core list — and the page does not say which of them it means. Widening
       * the selector to the whole DNCE subject would count a lecture course as
       * physical education; guessing at the technique courses by number would
       * be a guess. So the dance path is named in the note and matched by hand,
       * which under-counts a student who took it rather than over-counting one
       * who did not.
       */
      note: "Two Physical Education courses. Dance courses at Barnard College also satisfy this requirement, but are not matched automatically — only PHED courses are. Only one PE course may be taken per semester, and PE is the one part of the Core not taken for a letter grade.",
      rule: { kind: "n_matching", n: 2, select: { subjects: ["PHED"] } },
      sourceUrl:
        "https://bulletin.columbia.edu/columbia-college/core-curriculum/physical-education-requirement/",
    },
    {
      id: "swim-test",
      label: "Swimming test",
      rule: {
        kind: "attested",
        note: "The Columbia College swimming test, a one-semester PHED swimming course for beginners, or a waiver approved for disability or religious observance.",
      },
      sourceUrl:
        "https://bulletin.columbia.edu/columbia-college/core-curriculum/physical-education-requirement/",
    },
  ],
};
