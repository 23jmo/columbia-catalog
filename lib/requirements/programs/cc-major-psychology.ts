/**
 * The Columbia College major in Psychology.
 *
 * Transcribed by hand from "Major in Psychology" on the Requirements tab of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/psychology/
 * (2026–2027 edition).
 *
 * ── There are no tables on this page ────────────────────────────────────────
 *
 * Psychology publishes its major entirely as prose and bulleted lists, not as
 * `sc_courselist` tables. `parseRequirementTables` returns zero groups for it.
 * That is not a parser bug — there is nothing there to parse — but it is the
 * clearest example in this module of why `origin` exists: the coverage a parser
 * gives you is a function of the department's HTML habits, not of how
 * well-specified the degree is.
 *
 * ── The three distribution groups, and why the rule language cannot say them ─
 *
 * The Bulletin defines the distribution requirement by number band:
 *
 *   Group I   — Perception and cognition:      2200s, 3200s, or 4200s
 *   Group II  — Psychobiology and neuroscience: 2400s, 3400s, or 4400s
 *   Group III — Social, personality, abnormal:  2600s, 3600s, or 4600s
 *
 * Each group is a **union of three non-contiguous bands**, and
 * `CourseSelector.numberRange` is one contiguous `[min, max]` pair. There is no
 * `numberRanges`, and adding one to satisfy this page would be the tail wagging
 * the dog. Written as `[2200, 4299]` the Group I selector would swallow Group
 * II and Group III whole and report a student who took three social psychology
 * courses as having satisfied all three groups. That is the exact failure mode
 * `attested` exists to prevent, so all three groups are `attested` with the
 * bands spelled out in the note — the student can read their own transcript
 * against three number ranges far more reliably than we can approximate them.
 *
 * The seminar requirement has the same shape (3200s, 3400s, 3600s, 4200s,
 * 4400s, 4600s) plus four named exclusions, and is `attested` for the same
 * reason.
 *
 * ── What IS checkable ───────────────────────────────────────────────────────
 *
 * The introductory course, the statistics list and the research-methods list
 * are all explicit, and are transcribed exactly.
 *
 * ── Re-read against the live Bulletin on 2026-08-24 ─────────────────────────
 *
 * Four things changed, three of them because the first transcription read only
 * the "Major Requirements" block and not the surrounding prose on the same
 * page:
 *
 * 1. **The introductory course is a choice of three, not one course.** The
 *    requirement block prints `PSYC UN1001` alone, but the Course Numbering
 *    Structure paragraph above it says "PSYC UN1021 Science of Psychology:
 *    Explorations and Applications is an alternative version of PSYC UN1001 and
 *    fulfills the same requirements", and the transfer paragraph says a student
 *    without approved transfer credit "must enroll in PSYC UN1001 or
 *    PSYC BC1001 to complete this major requirement". Encoded as `all_of` over
 *    UN1001, this group reported UNMET for every student who took either of the
 *    other two — a requirement they had finished.
 *
 * 2. **"At least 6 of the 11 courses must be in the Columbia Psychology
 *    Department"** was previously listed as NOT ENCODED. It is a rule a student
 *    can fail — a Barnard-heavy or transfer-heavy eleven does not graduate —
 *    and `attested` is exactly the tier for it, because `PSYC UN2630` and
 *    `PSYC BC1138` share the subject `PSYC` and the selector has no field for
 *    the school qualifier that separates them.
 *
 * 3. **The Major Requirement Checklist** is a hard deadline in the same
 *    section: "At minimum, all students must submit a Major Requirement
 *    Checklist prior to the start of their final semester, so that graduation
 *    eligibility can be certified." Nothing about it is coursework, so nothing
 *    about it was visible in an audit built only from course lists.
 *
 * 4. **The 11-course total gained a `numberRange` of 1000–4999.** Subject
 *    alone counted the doctoral programme's `PSYC 6000`s and `9000`s and the
 *    School of Professional Studies' `PSYC 104` toward an undergraduate major
 *    that accepts none of them.
 *
 * 5. Three named courses are real on the Bulletin and absent from our catalog —
 *    see below.
 *
 * ── Three Bulletin courses our catalog does not have ────────────────────────
 *
 * `PSYC UN1021` Science of Psychology: Explorations and Applications,
 * `PSYC UN1660` Advanced Statistical Inference and `PSYC UN1490` Research
 * Methods - Cognition/Decision Making all resolve on the Bulletin (its course
 * listing prints UN1021 and UN1490; its course search returns UN1660 at 3
 * points) and none has a row in our catalog, which covers four terms — 20243,
 * 20251, 20263, 20271 — with a hole where Fall 2025 and Spring 2026 would be.
 * This is coverage, not a transcription error: there is no near-miss row under
 * another school qualifier, which is what a misspelt code looks like
 * (`COMS W4119` for `CSEE W4119`).
 *
 * All three are KEPT. Dropping an option the Bulletin offers would tell a
 * student who took it that it did not count. None is the only option in its
 * group — the introductory course keeps two live alternatives, statistics four
 * and research methods three — so no requirement is made unsatisfiable by the
 * gap.
 *
 * The gap cannot desynchronise `eleven-courses` from the groups above it,
 * either: a student's record is drawn from the same catalog, so a course with
 * no row cannot appear on it. Statistics and the eleven-course total therefore
 * fail together and recover together rather than disagreeing.
 *
 * ── One deliberate approximation, flagged as such ───────────────────────────
 *
 * The 11-course total is `n_matching` over the `PSYC` subject. This is close
 * but not exact, and the note says so: the Bulletin allows "Psychology or an
 * approved cognate discipline", and a STAT course used for the statistics
 * requirement is one of the 11 without carrying a PSYC code. Barnard's
 * psychology courses DO carry `PSYC` (`PSYC BC1138`), so they are counted, as
 * the Bulletin intends. `n_matching` is the `flagged` tier precisely because
 * it is "correct today, not provably correct" — that is the right label here.
 *
 * NOT ENCODED: the C- minimum, the P/D/F rules and their COVID-era exceptions,
 * the "each course may fulfill only one of these requirements" constraint
 * (which is a statement about the assignment, not about any course), the
 * three-course transfer cap, the "a course must be taken for 3 or more points"
 * floor (`CourseSelector` has no points field, so the four rows that currently
 * fail it are excluded by name on `eleven-courses` instead — see the comment
 * there), and the overlapping-course table. The Neuroscience and Behavior
 * major is a separate program and is not encoded here.
 *
 * ALSO NOT ENCODED, because it does not exist: a Psychology minor. The
 * Bulletin's "Minor in Psychology" heading reads, in full, "The Psychology
 * Department does not currently offer any minors."
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/psychology/#requirementstextcontainer";

export const CC_MAJOR_PSYCHOLOGY: Program = {
  id: "cc-major-psychology",
  kind: "major",
  school: "CC",
  name: "Psychology",
  department: "Psychology",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "introductory-psychology",
      label: "Introductory Psychology",
      /*
       * `n_of` over three courses, not `all_of` over PSYC UN1001. The
       * requirement block names only UN1001, but the same page says UN1021 "is
       * an alternative version of PSYC UN1001 and fulfills the same
       * requirements" and directs students without approved transfer credit to
       * "enroll in PSYC UN1001 or PSYC BC1001". Naming one of three told two
       * thirds of the ways a student can finish this requirement that they had
       * not.
       */
      note: "One of the three. A 5 on the AP Psychology exam or a 7 on the Higher Level IB Psychology exam also satisfies this — but it does not count as one of the eleven courses, so you will need an extra elective and this group will read unmet.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["PSYC UN1001", "PSYC UN1021", "PSYC BC1001"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "statistics",
      label: "Statistics",
      note: "One. Advised to be finished, before research methods, by the end of junior year. A statistics course taken anywhere other than Columbia or Barnard may not count, and the AP Statistics exam never does. PSYC UN1660 Advanced Statistical Inference is on the Bulletin but has no row in our catalog, so it will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: [
          "PSYC UN1610",
          "PSYC UN1660",
          "STAT UN1001",
          "STAT UN1101",
          "STAT UN1201",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "research-methods",
      label: "Research Methods",
      note: "One. Most of these require a statistics course first — check the prerequisites before you register. Research methods courses do not count toward any of the three distribution groups. PSYC UN1490 Research Methods - Cognition/Decision Making is on the Bulletin but has no row in our catalog, so it will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["PSYC UN1420", "PSYC UN1450", "PSYC UN1455", "PSYC UN1490"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "group-i",
      label: "Group I — Perception and Cognition",
      /*
       * Attested. See the header: this is a union of three number bands and
       * the selector language has one contiguous range. Approximating it
       * would let Group III courses satisfy Group I.
       */
      rule: {
        kind: "attested",
        note: "One course (3+ points) numbered in the 2200s, 3200s, or 4200s. Research methods courses do not count toward any distribution group.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "group-ii",
      label: "Group II — Psychobiology and Neuroscience",
      rule: {
        kind: "attested",
        note: "One course (3+ points) numbered in the 2400s, 3400s, or 4400s. PSYC UN1010 Mind, Brain and Behavior also counts, though it is no longer offered.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "group-iii",
      label: "Group III — Social, Personality, and Abnormal",
      rule: {
        kind: "attested",
        note: "One course (3+ points) numbered in the 2600s, 3600s, or 4600s.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "seminar",
      label: "Seminar",
      rule: {
        kind: "attested",
        note: "One Columbia Psychology course of 3+ points numbered in the 3200s, 3400s, 3600s, 4200s, 4400s, or 4600s. PSYC UN3910, PSYC UN3920, PSYC UN3930 and PSYC UN3950 are excluded. It must be a different course from the ones used for the three distribution groups.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "special-elective",
      label: "Special Elective",
      rule: {
        kind: "attested",
        note: "One integrative or applied course from the department's pre-approved Special Elective list, which is published on the department site rather than in the Bulletin. Anything not on it needs your program adviser's approval before you enrol.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "eleven-courses",
      /*
       * Cumulative by design, and allowlisted as such in `vacuity.test.ts`.
       * The Bulletin's own list of what the eleven "must include" ends with
       * "Enough PSYC electives to complete 11 courses", so the electives are
       * the remainder of this total rather than a group of their own. Writing
       * them as a separate `n_matching` would be worse, not better: the three
       * distribution groups, the seminar and the special elective are all
       * `attested` and therefore consume nothing, so `excludeGroups` could not
       * subtract them and the elective count would be satisfied by the very
       * courses that satisfied the distribution.
       */
      label: "Eleven courses total",
      note: "Eleven courses of 3+ points each, including everything above; once the named requirements are met, the rest are electives. Approved cognate courses outside the PSYC subject also count toward the eleven and are not matched here, so a statistics course taken as STAT will read one short. The 3-point floor is not checked as a rule: the four 0-point companion lab sections that exist today are excluded by name, so if the department adds another one it will count here until we notice.",
      rule: {
        kind: "n_matching",
        n: 11,
        /*
         * The number band added 2026-08-24. Subject alone counted the doctoral
         * programme's PSYC 6000s and 9000s (Supervised Teaching Assistance,
         * Departmental Colloquium) and the School of Professional Studies'
         * PSYC 104 toward an undergraduate major that takes none of them.
         * Barnard's PSYC BC numbering falls inside 1000–4999, as does the whole
         * GU 4000 band, so nothing a student can legitimately count is lost.
         *
         * ── The 0-point sections, excluded 2026-08-26 ───────────────────────
         *
         * The band is necessary and was not sufficient. Psychology attaches a
         * 0-point companion section to its statistics and research-methods
         * lectures, and the registrar gives each one its own PSYC course record
         * inside 1000–4999 — so they matched, and every student auto-registered
         * for one or two was silently credited that many phantom courses toward
         * an eleven-course total. The Bulletin's floor for this block is "3 or
         * more points", which is exactly what these fail.
         *
         * That is the OVER-counting direction, and it is the unrecoverable one:
         * a student can be told an eleven-course major is finished when two of
         * the eleven are lab sections they were enrolled in automatically.
         *
         * The header calls the 3-point floor unencodable because
         * `CourseSelector` has no points field. True in general, and it was too
         * quick here: the floor cannot be expressed, but the four rows in this
         * subject that currently fail it CAN be named, and naming them fixes
         * every real case today. Verified against the catalog on 2026-08-26 —
         * these are the only PSYC rows in 1000–4999 with points_max = 0. A new
         * 0-point section would slip through until it is added here, which is
         * the cost of an enumeration and is stated in the note.
         */
        select: {
          subjects: ["PSYC"],
          numberRange: [1000, 4999],
          exclude: ["PSYC UN1421", "PSYC UN1451", "PSYC UN1456", "PSYC UN1611"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "columbia-department-residency",
      label: "Six courses in the Columbia Psychology Department",
      /*
       * Attested rather than counted. Columbia's `PSYC UN2630` and Barnard's
       * `PSYC BC1138` both carry the subject `PSYC`; what separates them is the
       * school qualifier, and `CourseSelector` has no field for it. A selector
       * on the subject alone would count Barnard and transfer courses toward a
       * rule whose entire content is that they do not count, and would report
       * this satisfied for a student it is meant to stop.
       */
      rule: {
        kind: "attested",
        note: "At least 6 of the 11 courses must be taught in the Columbia Psychology Department. Barnard courses and transfer courses share the other 5 places, and no more than 3 of those may be transfer courses.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "major-requirement-checklist",
      label: "Major Requirement Checklist",
      /*
       * Not coursework, and therefore invisible to an audit assembled only
       * from course lists — which is why it was missing. It is still a thing a
       * student must do before they can graduate, and the Bulletin gives it a
       * deadline.
       */
      rule: {
        kind: "attested",
        note: "Submit a Major Requirement Checklist to the department before the start of your final semester. The Bulletin makes this the minimum for graduation eligibility to be certified: the department reviews the checklist and tells you whether your plan completes the major, and a revised one is required if your plan changes.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
