/**
 * The Barnard College major in Computer Science — the "trackless" curriculum.
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/computer-science/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── Which of the two curricula this is ─────────────────────────────────────
 *
 * The department publishes both:
 *
 *   "trackless"   — students who entered Barnard Fall 2023 or after.
 *                   14-15 courses, minimum 44 points. THIS FILE.
 *   track-based   — students who entered before Fall 2023. 13-14 courses,
 *                   minimum 41 points, and a choice of six tracks
 *                   (Foundations, Software Systems, Intelligent Systems,
 *                   Applications, Vision/Graphics/Interaction/Robotics, and a
 *                   Combination track).
 *
 * Only the trackless one is encoded. Every student the app can plausibly serve
 * entered in or after Fall 2023, and the catalogue says the old curriculum
 * survives only for students already on it — "though we can allow the new
 * version as an exception", i.e. movement is one-way, toward this file.
 *
 * Encoding the track-based major as a second program was considered and
 * rejected: six tracks, each with required courses plus a breadth course plus
 * two track electives drawn from lists that include open-ended "Any COMS W41xx"
 * and "Any COMS E61xx (with adviser approval)" rows. `CourseSelector` can say
 * "COMS, 4100-4199" but not "with adviser approval", and half the elective
 * rows carry that clause. The result would be a program that looks
 * authoritative to a student who is not on that curriculum anyway.
 *
 * ── The double-count exemption, which reverses the usual guard ─────────────
 *
 * Read this before adding `excludeGroups` to the mathematics groups.
 *
 * `MATH UN2015` Linear Algebra and Probability appears in BOTH requirement B
 * (linear algebra) and requirement C (probability), and the table says so
 * explicitly: "MATH UN2015 can double count for Linear Algebra and Probability
 * requirements. This is the ONLY instance a course can double count."
 *
 * Everywhere else in this directory an elective block names the core groups it
 * must not re-count, because reading "any four" as "including the four you
 * already took" makes a requirement vacuous. Here the department has
 * deliberately granted the opposite, in writing, for one course. So
 * `math-linear-algebra` and `math-probability` carry NO `excludeGroups`
 * pointing at each other. A student who took UN2015 has satisfied both, and an
 * exclusion would tell her she still owes a probability course.
 *
 * The two mathematics groups are excluded from the ELECTIVE block, though, for
 * the ordinary reason.
 *
 * ── "COMS/CSXX/XXCS" is a trap if you pattern-match it ────────────────────
 *
 * The elective row reads "3 courses from COMS/CSXX/XXCS that are at the 3000
 * level or higher". The obvious selector — subject codes starting or ending
 * with `CS` — is wrong in our catalog, twice:
 *
 *   CSER  38 courses. Center for Ethnicity and Race Studies. Not computer
 *         science, not remotely. This alone would have made the elective
 *         requirement satisfiable by three ethnicity and race studies courses.
 *   ISCS   3 courses. A Graduate School of Arts and Sciences code.
 *
 * The subjects are therefore enumerated, verified against
 * `courses.department` on 2026-08-30: COMS, CSEE, CSOR, CSBS, BMCS, EECS,
 * ORCS, STCS all resolve to the Computer Science department or to a genuine
 * cross-list with it (IEOR, Statistics, Biomedical, Electrical Engineering).
 *
 * ── Two courses our catalog does not hold ─────────────────────────────────
 *
 * Checked against the catalog on 2026-08-30. Two of the 41 codes this file
 * names have no row:
 *
 *   COMS W3251  Computational Linear Algebra   — one of five linear algebra options
 *   CBMF W4761  Computational Genomics         — one of 24 Area Foundation options
 *
 * Neither has a near-miss row under another school qualifier, which is what a
 * misspelt code looks like (`COMS W4119` for `CSEE W4119`) — a search on the
 * bare numbers 3251 and 4761 returns four unrelated courses and nothing in
 * `COMS` or `CBMF`. This is catalog coverage, not a transcription error: we
 * hold four terms and there is a gap where recent offerings would be.
 *
 * Both are KEPT. Dropping an option the department offers would tell a student
 * who took it that it did not count, and neither is the only option in its
 * group — linear algebra keeps four live alternatives and the Area Foundation
 * block keeps 23 for a requirement that needs three. No requirement is made
 * unsatisfiable by the gap.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 44-point minimum; the 3-point floor on each elective; the prerequisite
 * chains the table footnotes ("MATH UN1201 requires Calculus I but does NOT
 * require Calculus II; MATH UN1205 and APMA E2000 require both"); and the
 * major declaration form submitted via Slate.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/computer-science/";

/**
 * Computer Science subject codes as they exist in OUR catalog.
 *
 * Enumerated rather than pattern-matched. See the header — `CSER` is the
 * Center for Ethnicity and Race Studies and `ISCS` is a GSAS code, and both
 * match the obvious `CS`-prefix/suffix rule.
 */
const CS_SUBJECTS = [
  "COMS",
  "CSEE",
  "CSOR",
  "CSBS",
  "BMCS",
  "EECS",
  "ORCS",
  "STCS",
];

export const BC_MAJOR_COMPUTER_SCIENCE: Program = {
  id: "bc-major-computer-science",
  kind: "major",
  school: "BC",
  name: "Computer Science",
  department: "Computer Science",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "core",
      label: "Computer Science core",
      note:
        "Six required courses: Programming in Java, Data Structures in Java, " +
        "Advanced Programming, Discrete Mathematics, Computer Science Theory, " +
        "and Fundamentals of Computer Systems. This is the trackless " +
        "curriculum, for students who entered Barnard in Fall 2023 or later. " +
        "If you entered before that you are on the track-based curriculum, " +
        "which this audit does not encode — see your adviser.",
      rule: {
        kind: "all_of",
        courses: [
          "COMS W1004",
          "COMS W3134",
          "COMS W3157",
          "COMS W3203",
          "COMS W3261",
          "CSEE W3827",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "math-multivariable",
      label: "Mathematics A — multivariable calculus",
      note:
        "One of Calculus III, Accelerated Multivariable Calculus, or " +
        "Multivariable Calculus for Engineers. MATH UN1201 requires Calculus I " +
        "but not Calculus II; MATH UN1205 and APMA E2000 require both.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["MATH UN1201", "MATH UN1205", "APMA E2000"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "math-linear-algebra",
      label: "Mathematics B — linear algebra",
      note:
        "One of five. MATH UN2015 Linear Algebra and Probability counts here " +
        "AND for the probability requirement below — the department states " +
        "this is the only course in the major permitted to double count. " +
        "COMS W3251 Computational Linear Algebra is on the department's list " +
        "but has no row in our catalog; four options remain checkable.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: [
          "COMS W3251",
          "APMA E3101",
          "APMA E2101",
          "MATH UN2010",
          "MATH UN2015",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "math-probability",
      label: "Mathematics C — probability",
      note:
        "One of four. If you took MATH UN2015 it satisfies this and linear " +
        "algebra at once; that double count is granted explicitly by the " +
        "department and is the only one in the major.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: [
          "STAT UN1201",
          "STAT GU4001",
          "IEOR E3658",
          "MATH UN2015",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "area-foundation",
      label: "Three Area Foundation Courses",
      note:
        "Three from the department's 24-course AFC list, which spans " +
        "databases, distributed systems, languages, operating systems, " +
        "networks, software engineering, graphics, HCI, security, algorithms, " +
        "AI, NLP, vision, robotics, genomics, machine learning and " +
        "architecture. One of the 24 — CBMF W4761 Computational Genomics — has " +
        "no row in our catalog. It is kept anyway: dropping an option the " +
        "department offers would tell a student who took it that it did not " +
        "count, and 23 live options remain for a requirement that needs three.",
      rule: {
        kind: "n_matching",
        n: 3,
        select: {
          include: [
            "COMS BC3159",
            "COMS BC3160",
            "COMS BC3705",
            "COMS W4111",
            "COMS W4113",
            "COMS W4115",
            "COMS W4118",
            "CSEE W4119",
            "COMS W4152",
            "COMS W4156",
            "COMS W4160",
            "COMS W4167",
            "COMS W4170",
            "COMS W4181",
            "CSOR W4231",
            "COMS W4236",
            "COMS W4701",
            "COMS W4705",
            "COMS W4731",
            "COMS W4733",
            "CBMF W4761",
            "COMS W4771",
            "CSEE W4824",
            "CSEE W4868",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "electives",
      label: "Three computer science electives",
      note:
        '"3 courses from COMS/CSXX/XXCS that are at the 3000 level or higher ' +
        'and are at least 3-point courses." Counted over the enumerated ' +
        "Computer Science subjects — note that CSER is the Center for " +
        "Ethnicity and Race Studies and is deliberately NOT among them. " +
        "Courses already consumed by the core, the mathematics requirements or " +
        "the Area Foundation block do not count again here. The 3-point floor " +
        "is not checked.",
      rule: {
        kind: "n_matching",
        n: 3,
        select: {
          subjects: CS_SUBJECTS,
          numberRange: [3000, 9999],
          excludeGroups: [
            "core",
            "math-linear-algebra",
            "math-probability",
            "area-foundation",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
  ],
};
