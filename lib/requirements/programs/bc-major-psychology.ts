/**
 * The Barnard College major in Psychology.
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/psychology/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── Not Columbia College's Psychology major, and not close to it ───────────
 *
 * `cc-major-psychology` is eleven courses organised by number band — Group I
 * is "2200s, 3200s, or 4200s" — and its three distribution groups are
 * `attested` because `CourseSelector.numberRange` is one contiguous pair and
 * those bands are not.
 *
 * Barnard's is thirteen courses organised by NAMED LIST. Its two groups are
 * eight specific courses, not three number bands. That difference is the whole
 * reason this file can be mostly `exact` where the College's had to be
 * `attested`: Barnard prints the courses, so we can check them.
 *
 * The two majors do share `PSYC BC1101` — the College's file notes that a
 * student without transfer credit "must enroll in PSYC UN1001 or PSYC BC1001".
 * They are separate degrees that happen to draw on one department's courses.
 *
 * ── "Three lectures, at least one from each group" needs three groups ──────
 *
 * The table says: three PSYC lecture courses, at least one from each of Group
 * 1 and Group 2. That is two constraints at once — a floor per group and a
 * total — and no single rule kind says both.
 *
 * Written as one `n_of { n: 3 }` over all eight courses it would accept three
 * from Group 1 and none from Group 2, which is not the requirement. Written as
 * two `n_of { n: 1 }` groups it would accept two courses total and call the
 * requirement finished, which is not it either.
 *
 * So it is three groups: one floor per group, then a third lecture from either,
 * with `excludeGroups` naming the first two so the same course cannot close
 * both a floor and the remainder. That is exactly what `excludeGroups` is for —
 * it excludes what a group actually CONSUMED, so a student who took four
 * lectures still has one left over to count here.
 *
 * The remainder group is `n_matching` over an `include` list rather than
 * `n_of`, because `excludeGroups` lives on `CourseSelector` and `n_of` takes
 * bare courses. That drops its tier from `exact` to `flagged`, which slightly
 * understates it — the list is explicit and finite. The alternative was to
 * accept a wrong answer, so the weaker label is the right trade.
 *
 * ── The laboratory requirement has a genuine second route ──────────────────
 *
 * Two labs from either group, taken concurrently with their associated
 * lectures — OR `PSYC BC1010` Intro Lab in Experimental Psych plus one lab
 * with its associated lecture. Both routes are transcribed as sequences.
 *
 * Two things are NOT checked and are in the note:
 *
 *   - "taken concurrently with their associated lectures". The audit is handed
 *     a set of course ids, not terms, so concurrency is invisible to it. A
 *     student who took Perception Lab without Perception Lecture would be
 *     reported as fine. She is not.
 *   - Which lab pairs with which lecture. `PSYC BC2109` Perception Lab goes
 *     with `PSYC BC2110` Perception Lecture; the table's Group 1 / Group 2
 *     split makes the pairing legible to a human and inexpressible to the rule
 *     language.
 *
 * ── NSBV courses are on the Psychology lists on purpose ────────────────────
 *
 * `NSBV BC1001` appears among the Group 1 lectures and `NSBV BC1002` /
 * `NSBV BC2001` among the Group 1 labs. These are not strays from the
 * Neuroscience and Behavior page — the Psychology department lists them, and
 * dropping them would tell a student who took Introduction to Neuroscience
 * that it did not count toward her Psychology major. It does.
 *
 * ── The entry-year fork, which changes the number of requirements ──────────
 *
 * `PSYC BC1020` Behavioral Research Methods and Analysis is marked "REQUIRED
 * FOR STUDENTS ENTERING BARNARD IN OR AFTER FA21", and the last table row —
 * One Additional Research Experience — is marked "*NOT REQUIRED FOR STUDENTS
 * WHO ENTERED BARNARD IN OR AFTER FA21". They are the two halves of one
 * curriculum change.
 *
 * This file encodes the CURRENT curriculum: BC1020 is required, and the
 * additional research experience is not a group at all. Every student the app
 * can serve entered in or after Fall 2021. The pre-FA21 rule is recorded here
 * rather than in a group, because offering it would propose a requirement no
 * current student has — the same reasoning `cc-concentration-economics` uses
 * for its entry-year gate.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 37.5-point minimum; "at least six of the required PSYC courses, worth
 * three or more credits each, must be taken at Barnard or Columbia" (a
 * residency rule, and `PSYC UN` and `PSYC BC` share a subject code so the
 * selector cannot tell them apart); the C- letter-grade floor on every PSYC
 * course; the AP/IB exemption from BC1001 and its replacement course; the cap
 * of two Toddler Center / Independent Study courses toward the major; the
 * three-core-courses-are-prerequisites-for-all-2000-level-labs rule; and the
 * "senior requirement must be taken during the final two semesters" deadline.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/psychology/";

/** Group 1 lectures — perception, cognition, learning, neuroscience. */
const GROUP_1_LECTURES = [
  "PSYC BC2107",
  "PSYC BC2110",
  "PSYC BC2115",
  "NSBV BC1001",
];

/** Group 2 lectures — personality, development, social, clinical. */
const GROUP_2_LECTURES = [
  "PSYC BC2125",
  "PSYC BC2129",
  "PSYC BC2138",
  "PSYC BC2156",
];

export const BC_MAJOR_PSYCHOLOGY: Program = {
  id: "bc-major-psychology",
  kind: "major",
  school: "BC",
  name: "Psychology",
  department: "Psychology",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "core-introductory",
      label: "Three core introductory courses",
      note:
        "PSYC BC1001 Introduction to Psychology, PSYC BC1101 Statistics " +
        "Lecture and Recitation, and PSYC BC1020 Behavioral Research Methods " +
        "and Analysis. All three. They are prerequisites for every 2000-level " +
        "PSYC lab. BC1020 is required for students who entered Barnard in or " +
        "after Fall 2021; if you entered earlier, see your adviser — you carry " +
        "an additional research experience requirement instead, which this " +
        "audit does not show.",
      rule: {
        kind: "all_of",
        courses: ["PSYC BC1001", "PSYC BC1101", "PSYC BC1020"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "lecture-group-1",
      label: "Lecture — Group 1",
      note:
        "At least one Group 1 lecture: Psychology of Learning, Perception, " +
        "Cognitive Psychology, or Introduction to Neuroscience. NSBV BC1001 is " +
        "on this list by the department's own table, not by our inference.",
      rule: { kind: "n_of", n: 1, courses: GROUP_1_LECTURES },
      sourceUrl: SOURCE,
    },
    {
      id: "lecture-group-2",
      label: "Lecture — Group 2",
      note:
        "At least one Group 2 lecture: Psychology of Personality, " +
        "Developmental Psychology, Social Psychology, or Clinical Psychology.",
      rule: { kind: "n_of", n: 1, courses: GROUP_2_LECTURES },
      sourceUrl: SOURCE,
    },
    {
      id: "lecture-third",
      label: "Third lecture, either group",
      note:
        "The major asks for three lectures with at least one from each group. " +
        "This is the third, from either — and it will not re-count a course " +
        "that already satisfied a group above.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: {
          include: [...GROUP_1_LECTURES, ...GROUP_2_LECTURES],
          excludeGroups: ["lecture-group-1", "lecture-group-2"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "laboratories",
      label: "Two laboratory courses",
      note:
        "Two labs from either group, OR PSYC BC1010 plus one lab with its " +
        "associated lecture. Two conditions the table states and we cannot " +
        "check: labs are taken CONCURRENTLY with their associated lecture, and " +
        "each lab pairs with a specific lecture (Perception Lab with Perception " +
        "Lecture, and so on). The audit sees a set of courses, not the terms " +
        "you took them in.",
      rule: {
        kind: "n_matching",
        n: 2,
        select: {
          include: [
            /* Group 1 labs */
            "PSYC BC2106",
            "PSYC BC2109",
            "PSYC BC2114",
            "NSBV BC1002",
            "NSBV BC2001",
            /* Group 2 labs */
            "PSYC BC2124",
            "PSYC BC2128",
            "PSYC BC2137",
            "PSYC BC2155",
            /* The alternative route's introductory lab */
            "PSYC BC1010",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-requirement",
      label: "Senior requirement",
      note:
        "A Capstone Project written in any PSYC or NSBV 3000-level seminar " +
        "taken during your final two semesters — including one section of " +
        "PSYC BC3603 Independent Study (3 or 4 credits), one semester of " +
        "PSYC BC3465 Toddler Center Seminar, or PSYC BC3473 Clinical Field " +
        "Practicum. The requirement is the PROJECT, not the course: two " +
        "students in the same seminar can differ on whether it counted, and " +
        "you must tell the professor at the start of the semester that you are " +
        "using it. Nothing in our data records that, so you certify it.",
      rule: {
        kind: "attested",
        note:
          "I have completed a Capstone Project in a 3000-level PSYC or NSBV " +
          "seminar during my final two semesters.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "additional-psyc",
      label: "One additional PSYC course",
      note:
        '"At least one lecture or seminar course worth 3 or more credits." ' +
        "Counted as one further PSYC course at the 2000 level or above that " +
        "the groups above have not already consumed. The 3-credit floor is not " +
        "checked — `CourseSelector` has no points field.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: {
          subjects: ["PSYC"],
          numberRange: [2000, 3999],
          excludeGroups: [
            "lecture-group-1",
            "lecture-group-2",
            "lecture-third",
            "laboratories",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "outside-cognate",
      label: "Outside course — cognate discipline",
      note:
        "One course from a cognate discipline: ANTH, COMS, ECON, LING, PHIL, " +
        "SOCI or STEM.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: {
          subjects: ["ANTH", "COMS", "ECON", "LING", "PHIL", "SOCI", "STEM"],
          numberRange: [1000, 4999],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "outside-science",
      label: "Outside courses — another science",
      note:
        '"Two lectures in another science, plus one laboratory course" from ' +
        "ASTR, BIOL, CHEM, EESC or PHYS. The two science courses may be from " +
        "different departments. We count three courses across those subjects " +
        "and do NOT separate the two lectures from the one lab: our course " +
        "records carry no lecture/lab distinction. The department also defers " +
        "to the home department's own substitutions — if Biology accepts a " +
        "substitute for one of its labs, Psychology honours it.",
      rule: {
        kind: "n_matching",
        n: 3,
        select: {
          subjects: ["ASTR", "BIOL", "CHEM", "EESC", "PHYS"],
          numberRange: [1000, 4999],
        },
      },
      sourceUrl: SOURCE,
    },
  ],
};
