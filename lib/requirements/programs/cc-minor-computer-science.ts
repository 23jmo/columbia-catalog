/**
 * The Columbia College minor in Computer Science.
 *
 * Transcribed by hand from "Minor in Computer Science" on the Requirements tab
 * of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/computer-science/
 * (2026–2027 edition). The department publishes it as a numbered prose list —
 * "The Computer Science Minor consists of 6 courses as follows" — not as an
 * `sc_courselist` table, so the CourseLeaf parser returns nothing for it.
 *
 * ── Six slots, and the sixth is the interesting one ─────────────────────────
 *
 * Slots 1 through 4 are ordinary choices. Slot 5 is a level rule. Slot 6 is
 * "any 3000- or 4000-level COMS/CSXX/XXCS course of at least 3 points **OR**
 * one linear algebra or probability/statistics course from the following:
 * APMA E3101, APMA E2101, MATH UN2010, MATH UN2015, IEOR E3658, STAT UN1201,
 * STAT GU4001 or STAT GU4203."
 *
 * That is a union of a level rule and an explicit list, and the rule language
 * has no union of two rule kinds. `CourseSelector` does, though: `include`
 * exists exactly for "explicit codes that always match, on top of the shape
 * above". So slot 6 is `n_matching { n: 1 }` over the 3000+ computer science
 * shape with the eight named math and statistics courses as `include`. That is
 * the whole rule, not an approximation of it.
 *
 * Slots 5 and 6 are two separate groups rather than one `n_matching { n: 2 }`,
 * because they are not the same requirement — slot 5 has no math escape hatch.
 * Merged, a student could satisfy both with two statistics courses and no
 * upper-level computer science at all.
 *
 * ── The elective slots cannot exclude the required courses ──────────────────
 *
 * `COMS W3157`, `COMS W3261` and `CSEE W3827` are the three candidates for slot
 * 4, and all three also match the 3000-level shape of slots 5 and 6. The
 * language has no way to say "a course used for slot 4 may not also count for
 * slot 5" — that is a constraint on the assignment, not on the courses. They
 * are left in the selector and the note says so, because excluding them
 * outright would be worse: a student who satisfied slot 4 with `COMS W3157`
 * would then be barred from counting `COMS W3261` toward slot 5, which the
 * Bulletin permits.
 *
 * ── The "at least 3 points" floor, which is NOT enforced ────────────────────
 *
 * Slots 5 and 6 both read "of at least 3 points". `CourseSelector` has no
 * minimum-points field, and `n_matching` counts courses rather than credit, so
 * a 1-point COMS W4901 Projects in Computer Science — variable 1–3 points in
 * our catalog, 4000-level, and matched by both selectors — closes a whole slot.
 * That is an over-count and it is the one known one left in this file.
 *
 * It is left rather than papered over. Excluding the project courses outright
 * would refuse a 3-point W4901, which the Bulletin explicitly permits (it caps
 * project and thesis credit at 6 points rather than banning it), and inventing
 * a restriction the department does not have is the same class of mistake in
 * the other direction. The major does not have this problem because its
 * elective block is `points_matching`, so a 1-point course contributes 1 point.
 * The fix here is a `pointsMin` field on `CourseSelector`, which is an engine
 * change and is reported rather than made.
 *
 * NOT ENCODED: the two-transfer-course cap (and the rule that a transferred
 * linear algebra or probability course consumes one of the two); the 6-point
 * cap on project and thesis courses; the "no more than one course from each
 * set" restrictions; and the AP exemption from `COMS W1004`, which leaves
 * nothing on a record to match. Note also that holding this minor makes a
 * student ineligible for the department's Artificial Intelligence minor — a
 * cross-program rule the audit has no place to put.
 *
 * `COMS W3999` Fieldwork and `COMS W3136` Essential Data Structures ARE now
 * encoded, as `exclude` on both elective slots; see the comment there.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/computer-science/#requirementstextcontainer";

export const CC_MINOR_COMPUTER_SCIENCE: Program = {
  id: "cc-minor-computer-science",
  kind: "minor",
  school: "CC",
  name: "Computer Science",
  department: "Computer Science",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "intro-programming",
      label: "Introductory Programming",
      note: "COMS W1004, or COMS W1007 for students with prior experience. A 4 or 5 on the CS AP Exam A exempts you and leaves nothing on your record to match.",
      rule: { kind: "n_of", n: 1, courses: ["COMS W1004", "COMS W1007"] },
      sourceUrl: SOURCE,
    },
    {
      id: "data-structures",
      label: "Data Structures",
      note: "COMS W3134, or the honors course COMS W3137.",
      rule: { kind: "n_of", n: 1, courses: ["COMS W3134", "COMS W3137"] },
      sourceUrl: SOURCE,
    },
    {
      id: "discrete-mathematics",
      label: "Discrete Mathematics",
      rule: { kind: "all_of", courses: ["COMS W3203"] },
      sourceUrl: SOURCE,
    },
    {
      id: "core-choice",
      label: "One core course",
      note: "One of Advanced Programming, Computer Science Theory, or Fundamentals of Computer Systems.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["COMS W3157", "COMS W3261", "CSEE W3827"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "upper-level-elective",
      label: "Upper-level elective",
      note: "Any 3000- or 4000-level COMS, CSEE, CSOR or CBMF course of at least 3 points. It must be a different course from the ones used above. The 3-point floor is not checked — a variable-credit project course taken for fewer points will still show as filling this slot.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: {
          subjects: ["COMS", "CSEE", "CSOR", "CBMF"],
          numberRange: [3000, 4999],
          /*
           * The department's Restrictions section: "COMS W1005 and COMS W3136
           * cannot be counted towards the Computer Science major, minor, and
           * concentration" and "COMS W3999 Fieldwork cannot be used as a CS
           * Elective." COMS W3136 is a 4-point 3000-level COMS course that is
           * in our catalog and matched by the shape above, so without this it
           * filled an elective slot the department would refuse.
           */
          exclude: ["COMS W3136", "COMS W3999"],
          /*
           * "A different course from the one used above" — which this file used
           * to note it could not enforce, and now can. Data Structures, Discrete
           * Mathematics and the core choice are all 3000-level computer science
           * courses, so without this the slot was filled by a course the minor
           * had already required by name and a student was told they were a
           * course further along than they were.
           */
          excludeGroups: ["data-structures", "discrete-mathematics", "core-choice"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "upper-level-elective-or-math",
      label: "Upper-level elective or mathematics",
      /*
       * The union of a level rule and an explicit list, expressed with
       * `CourseSelector.include` rather than approximated by dropping one half.
       */
      note: "Either another 3000- or 4000-level COMS, CSEE, CSOR or CBMF course of at least 3 points, or one linear algebra or probability/statistics course from the department's list. As with slot five, the 3-point floor is not checked.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: {
          subjects: ["COMS", "CSEE", "CSOR", "CBMF"],
          numberRange: [3000, 4999],
          // Same departmental restriction as the slot above.
          exclude: ["COMS W3136", "COMS W3999"],
          /*
           * The named requirements, plus the OTHER elective slot.
           *
           * Excluding `upper-level-elective` is what makes these two genuinely
           * separate slots rather than one requirement counted twice. Both
           * selectors describe the same set of courses, so left alone they both
           * settle on the same course and the minor reports two slots filled by
           * one class. `evaluateProgram` resolves these in declaration order, so
           * this reads slot five's corrected choice, not its first guess.
           */
          excludeGroups: [
            "data-structures",
            "discrete-mathematics",
            "core-choice",
            "upper-level-elective",
          ],
          include: [
            "APMA E3101",
            "APMA E2101",
            "MATH UN2010",
            "MATH UN2015",
            "IEOR E3658",
            "STAT UN1201",
            "STAT GU4001",
            "STAT GU4203",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
  ],
};
