/**
 * The Columbia College major in Biology.
 *
 * Transcribed by hand from "Major in Biology" on the Requirements tab of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/biological-sciences/
 * (2026–2027 edition). Note the department slug is `biological-sciences`, not
 * `biology` — the obvious guess 404s.
 *
 * ── The one place `sequence_choice` earns its keep outside the Core ─────────
 *
 * The chemistry requirement is three whole alternative programs, each several
 * courses long:
 *
 *   Option 1  general chemistry lectures + lab, then organic lectures + labs
 *   Option 2  for students who qualify for intensive chemistry
 *   Option 3  for students who qualify for first-year organic chemistry
 *
 * Written as `n_of` over the union, a student could satisfy "chemistry" with
 * four courses drawn from three different options and never complete any of
 * them — which is precisely the schedule `sequence_choice` exists to reject
 * (see the comment on that rule kind in `types.ts`). Option 3 itself ends in an
 * internal "or", so it is transcribed as two sequences that differ only in
 * their final lab; that is the honest expansion, since the rule language has no
 * nesting.
 *
 * ── Where the Bulletin defeats the language, and what was done about it ─────
 *
 * **The laboratory requirement is `attested`.** Four options are offered and
 * two of them are not courses:
 *
 *   Option 3  "Two terms of BIOL UN3500 (3 or 4 credits per term), including
 *              the submission of a satisfactory research report each semester"
 *   Option 4  "Completion of all the requirements for one session of the Summer
 *              Undergraduate Research Fellowship (SURF)"
 *
 * `all_of`/`n_of` cannot say "the same course twice", and SURF leaves no course
 * on a record at all. Encoding only options 1 and 2 would report every SURF
 * student's finished requirement as unmet, and there are a lot of them. So the
 * whole group is `attested` with all four options in the note — the student
 * knows which one they did.
 *
 * **Physics and mathematics are `attested`.** Both are written as an example
 * plus an open door: "The usual choices are PHYS UN1201-PHYS UN1202 … Higher
 * level physics sequences are also acceptable", and "Two semesters of calculus
 * or honors mathematics … students may substitute one semester of statistics
 * … for students with AP credit, completion of MATH UN1102, MATH UN1201, or
 * MATH UN1207 is sufficient." The Bulletin names no closed set for either, so
 * neither has one to transcribe.
 *
 * ── One transcribed hazard ──────────────────────────────────────────────────
 *
 * The core-courses table is "two out of the following six", and one of those
 * six is written `BIOL GU4501` with a following `or BIOL UN3300` row. Both are
 * Biochemistry. Flattened into `n_of { n: 2 }` the rule will accept GU4501 and
 * UN3300 together as two core courses, which the department's "or" forbids.
 * The rule language cannot express an alternation nested inside a choose-two,
 * so the flattening stands and the note says what it costs.
 *
 * ── The elective block was satisfying itself (fixed 2026-08-24) ────────────
 *
 * "Select two ADDITIONAL courses" — and seven of the courses on the elective
 * list are also the `core-courses` options. Written as `n_of` this group
 * counted them twice, so a student with exactly two core courses and no
 * electives read `2/2 DONE` on a requirement they had not started. See the
 * comment on `upper-level-electives`; the rule is now `n_matching` over the
 * same enumeration with `excludeGroups: ["core-courses"]`.
 *
 * ── Coverage: eleven named courses have no row in our catalog ──────────────
 *
 * Checked against the live catalog on 2026-08-24 with `npm run dump:program
 * cc-major-biology`. All eleven are on the elective list and all eleven are
 * printed by the Bulletin exactly as they are written here, so none is a
 * transcription error — they are courses that were not offered in any of the
 * four terms our catalog covers (20243, 20251, 20263, 20271; note the hole at
 * Fall 2025 / Spring 2026). Each was probed for an alternate school qualifier
 * and none has one:
 *
 *   BIOL UN3019, BIOL UN3560, BIOL UN3799, BIOL GU4002, BIOL GU4035,
 *   BIOL GU4075, BIOL GU4193, BIOL GU4402, BIOL GU4600, BIOL GU4777,
 *   CHEM GU4324
 *
 * BIOL UN3560 and BIOL UN3799 are the undergraduate numbers of BIOL GU4560 and
 * BIOL GU4799, both of which DO resolve; the Bulletin prints the pair joined by
 * "or" and only the GU half has appeared in a covered term.
 *
 * They are kept rather than dropped. A named course that never matches costs a
 * student nothing; silently removing an option the Bulletin offers tells a
 * student who took it that it did not count. The practical effect is that the
 * elective requirement has 26 automatically-matchable options rather than 37,
 * which is worth knowing when reading a red requirement.
 *
 * NOT ENCODED: the C- minimum, the "at least 4 biology courses and 18 credits
 * at Columbia" residency rule, the non-major course list (BIOL UN1004,
 * UN1130, UN1360, UN1908, UN2300, UN3920, UN3995, GU4305, GU4506, and every
 * HPSC/SCNC/BIOT course), the repeat limits, and the strict prerequisite
 * enforcement. All need grades or a term-ordered transcript.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/biological-sciences/#requirementstextcontainer";

export const CC_MAJOR_BIOLOGY: Program = {
  id: "cc-major-biology",
  kind: "major",
  school: "CC",
  name: "Biology",
  department: "Biological Sciences",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "introductory-biology",
      label: "Introductory Biology",
      note: "The full year, both terms, usually in the sophomore year. General Chemistry 1 and 2 are a prerequisite. Any other sequence needs a departmental adviser's permission in advance.",
      rule: { kind: "all_of", courses: ["BIOL UN2005", "BIOL UN2006"] },
      sourceUrl: SOURCE,
    },
    {
      id: "core-courses",
      label: "Core Courses",
      note: "Two of the six. BIOL GU4501 and BIOL UN3300 are alternatives for the same Biochemistry requirement and only one of them may count — a restriction this audit cannot enforce, so check it yourself. Core courses should be taken at Columbia.",
      rule: {
        kind: "n_of",
        n: 2,
        courses: [
          "BIOL UN3022",
          "BIOL UN3031",
          "BIOL UN3041",
          "BIOL GU4501",
          "BIOL UN3300",
          "BIOL GU4512",
          "BIOL GU4560",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "laboratory",
      label: "Laboratory Experience",
      /*
       * Attested. See the header: two of the four options are not expressible
       * as a set of distinct course codes, and one of those two (SURF) leaves
       * no course on a record whatsoever.
       */
      rule: {
        kind: "attested",
        note: "One of four options. (1) A 5-point project lab — BIOL UN3058 or BIOL UN3052. (2) BIOL UN2501 and BIOL UN3040 together, or a 5-point project lab. (3) Two terms of BIOL UN3500 with a satisfactory research report each term. (4) One session of the Summer Undergraduate Research Fellowship. Options 3 and 4 leave nothing on a record we can match, so this one is yours to confirm.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "upper-level-electives",
      label: "Upper-Level Electives",
      /*
       * ── The word the Bulletin uses is "additional" ──────────────────────
       *
       * "Select two ADDITIONAL courses, carrying at least 3 points each, from
       * any of the 3000- or 4000-level lecture courses." Seven of the courses
       * on that list — BIOL UN3022, UN3031, UN3041, UN3300, GU4501, GU4512,
       * GU4560 — are also the six options of the `core-courses` group, because
       * the department lets one course play either role but not both.
       *
       * Written as `n_of` this group had no way to know that, so a student who
       * took exactly two core courses and not one elective was scored
       * `2/2 DONE` here (verified against the live evaluator on 2026-08-24 with
       * BIOL UN2005/UN2006/UN3022/UN3031: `core-courses` satisfied AND
       * `upper-level-electives` satisfied, from the same two courses). That is
       * the identical failure the two computer science majors had with their
       * elective blocks, and it costs a biology student two whole courses.
       *
       * `n_matching` over an `include`-only selector is the fix, because
       * `excludeGroups` lives on `CourseSelector` and `n_of` has no selector.
       * The list itself is unchanged — it is still exactly the Bulletin's
       * enumeration, not a subject/level shape. A bare
       * `{ subjects: ["BIOL"], numberRange: [3000, 4999] }` was considered and
       * rejected: it would swallow the Barnard BIOL...BC courses (the Bulletin
       * puts "All Barnard Courses" on its non-major list), the project labs,
       * the 0-point recitations, BIOL UN3500 (explicitly barred here) and
       * BIOL UN3995 — a much larger over-count than the one being fixed.
       *
       * `excludeGroups` removes what `core-courses` ACTUALLY consumed, which is
       * two. A student who takes four of the seven overlapping courses keeps
       * the other two as electives, which is what the department intends.
       *
       * Cost of the change: the verification tier drops from `exact` to
       * `flagged`. That is the honest tier anyway — the Bulletin ends the list
       * with "Any course not listed below must be approved by a biology
       * adviser to count toward the major", so the set genuinely moves.
       */
      note: "Two additional 3000- or 4000-level lecture courses of at least 3 points each, on top of the two core courses. BIOL UN3500 cannot be used. Anything not on this list needs a biology adviser's approval. SCNC, HPSC and BIOT courses never count, and neither do Barnard courses. Eleven of the courses named below are not in our catalog, so they will not match automatically — see the note at the top of this file.",
      rule: {
        kind: "n_matching",
        n: 2,
        select: {
          /*
           * `core-courses` only. The laboratory group is `attested` and
           * consumes nothing, and none of its courses (BIOL UN3058, UN3052,
           * UN2501, UN3040) are on this list; neither are BIOL UN2005/UN2006.
           */
          excludeGroups: ["core-courses"],
          include: [
            "BIOL UN3004",
            "BIOL UN3005",
            "BIOL UN3006",
            "BIOL UN3019",
            "BIOL UN3022",
            "BIOL UN3025",
            "BIOL UN3031",
            "BIOL UN3041",
            "BIOL UN3073",
            "BIOL GU4073",
            "BIOL UN3300",
            "BIOL UN3320",
            "BIOL UN3404",
            "BIOL UN3560",
            "BIOL GU4560",
            "BIOL UN3799",
            "BIOL GU4799",
            "BIOL GU4001",
            "BIOL GU4002",
            "BIOL GU4034",
            "BIOL GU4035",
            "BIOL GU4036",
            "BIOL GU4075",
            "BIOL GU4080",
            "BIOL GU4193",
            "BIOL GU4290",
            "BIOL GU4300",
            "BIOL GU4310",
            "BIOL GU4323",
            "CHEM GU4324",
            "BIOL GU4402",
            "BIOL GU4501",
            "BIOL GU4510",
            "BIOL GU4512",
            "BIOL GU4551",
            "BIOL GU4600",
            "BIOL GU4777",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemistry",
      label: "Chemistry",
      note: "Chemistry through organic, including labs. One complete option — not a mix of them.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          {
            label: "Option 1 — general chemistry then organic",
            courses: [
              "CHEM UN1403",
              "CHEM UN1404",
              "CHEM UN1500",
              "CHEM UN1501",
              "CHEM UN2443",
              "CHEM UN2444",
              "CHEM UN2493",
              "CHEM UN2494",
            ],
          },
          {
            label: "Option 2 — intensive general chemistry",
            courses: [
              "CHEM UN1604",
              "CHEM UN1507",
              "CHEM UN2443",
              "CHEM UN2444",
              "CHEM UN2495",
              "CHEM UN2496",
            ],
          },
          {
            label: "Option 3 — first-year organic, two-term lab",
            courses: [
              "CHEM UN1507",
              "CHEM UN2045",
              "CHEM UN2046",
              "CHEM UN2495",
              "CHEM UN2496",
            ],
          },
          {
            label: "Option 3 — first-year organic, intensive lab",
            courses: [
              "CHEM UN1507",
              "CHEM UN2045",
              "CHEM UN2046",
              "CHEM UN2545",
            ],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "physics",
      label: "Physics",
      rule: {
        kind: "attested",
        note: "Two terms of physics with the accompanying labs. The usual choice is PHYS UN1201–PHYS UN1202 with PHYS UN1291–PHYS UN1292, but the Bulletin says higher-level sequences are also acceptable without naming them, so there is no closed list to check against.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "mathematics",
      label: "Mathematics",
      rule: {
        kind: "attested",
        note: "Two semesters of calculus or honors mathematics. One semester may be replaced by STAT UN1101 or STAT UN1201. With AP credit, MATH UN1102, MATH UN1201 or MATH UN1207 alone is enough — which means the requirement can be finished with a single course on your record, and no course-count rule can tell that apart from being one short.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
