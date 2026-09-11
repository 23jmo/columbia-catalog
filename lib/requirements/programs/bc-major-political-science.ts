/**
 * The Barnard College major in Political Science.
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/political-science/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── Ten courses, and only one of the three blocks is checkable ─────────────
 *
 * "A total of ten courses are necessary to complete the Political Science
 * major: three introductory lecture courses at the 1000-level or 3000-level
 * from different subfields, five elective courses, two colloquia, taken in
 * your final two semesters at Barnard."
 *
 * That reads like three clean groups. Two of them are not checkable, for two
 * different and instructive reasons.
 *
 * ── Why the introductory requirement is `attested`: subfields are invisible ─
 *
 * The department recognises four subfields — American Government and Politics,
 * Comparative Politics, International Relations, Political Theory — and
 * requires "at least one introductory 1000- or 3000-level lecture course in
 * three of the four".
 *
 * Nothing in a course record says which subfield a course belongs to. There is
 * no flag, and Barnard's POLS numbering does not encode it: `POLS BC` runs 11
 * courses at the 1000 level and 69 at the 3000 level with no subfield banding
 * inside either. A `n_matching { n: 3, subjects: ["POLS"] }` would therefore
 * report a student who took three American Politics courses as having
 * satisfied a requirement that exists precisely to stop her doing that.
 *
 * The requirement adds a second condition we cannot see either: "To count for
 * introductory course credit, these courses MUST be taken with Barnard
 * faculty. Intro courses taken at Columbia will count toward your elective
 * requirements only." That is a property of the section's instructor.
 *
 * ── Why the colloquium requirement is `attested`: they share a number band ──
 *
 * This is the sharper trap of the two, and it is worth stating plainly because
 * the obvious encoding looks right.
 *
 * The colloquia are 3000-level. The INTRODUCTORY lectures are also 1000- or
 * 3000-level. They overlap completely, so no `numberRange` separates them —
 * a selector for "two 3000-level POLS courses" would be satisfied by two
 * introductory lectures, and the same two courses would satisfy the
 * introductory block. The audit would count one student's two courses toward
 * five requirements.
 *
 * Title matching was considered and rejected. Our catalog holds five Barnard
 * POLS courses whose titles begin "Colloquium", against a department that runs
 * far more; the seminars are topical and re-titled every term ("Colloquium on
 * the Politics of the Arctic", "Colloquium: Transnational Kleptocracy"), so a
 * title predicate would be a rule about this term's offerings rather than
 * about the requirement. The rule language has no title field, and this is why
 * it should not grow one.
 *
 * Two further conditions ride along in the note: the colloquia "MUST be taken
 * with faculty at Barnard College" ("Columbia seminars do not fulfill this
 * requirement"), and they must fall in the student's final two semesters —
 * "Colloquia courses taken before your final two semesters will count toward
 * your elective credits", which is a rule about WHEN, and the audit sees a set
 * of courses rather than a sequence of terms.
 *
 * ── The electives block IS checkable, and is the one real signal here ───────
 *
 * "All courses offered at Barnard or Columbia in political science listed in
 * the Barnard Course Catalogue, including introductory lecture courses and
 * colloquia, satisfy elective course requirements." So the selector is simply
 * POLS, and — unusually — it deliberately does NOT exclude the other groups,
 * because the department says an intro lecture or a colloquium taken outside
 * its own slot counts here. What it excludes instead is nothing at all; the
 * five electives are five further POLS courses.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * "Six of the courses for the major must be taken from courses listed in the
 * political science section of the Barnard Course Catalogue" and the transfer
 * caps beneath it (three transfer, two Reid Hall, two study-abroad, one summer
 * session) — residency rules. The independent-study points floor: POLS BC3799
 * "counts as a course ... provided the project is approved for 3 or 4 points.
 * A project taken for 1 or 2 points does not count", which needs the points a
 * particular student registered for, not the course's published range. AP
 * credit in American or Comparative Politics, which satisfies a prerequisite
 * but "does not count toward the number of courses required for the major".
 * The substitution of a course in another department with prior approval from
 * the Major Advisor and the Associate Department Chair. The combined majors
 * (Human Rights, Jewish Studies, Women's Studies), the double major with one
 * integrating senior essay, and the Sciences Po - Barnard BA/MA exchange, all
 * of which are separate programs of study rather than variants of this one.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/political-science/";

export const BC_MAJOR_POLITICAL_SCIENCE: Program = {
  id: "bc-major-political-science",
  kind: "major",
  school: "BC",
  name: "Political Science",
  department: "Political Science",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "introductory-lectures",
      label: "Three introductory lectures, three subfields",
      note:
        "One introductory 1000- or 3000-level lecture in three of the four " +
        "subfields: American Government and Politics, Comparative Politics, " +
        "International Relations, Political Theory. You certify this because " +
        "nothing in a course record says which subfield a course belongs to, " +
        "and Barnard's POLS numbering does not encode it. Note the second " +
        "condition too: to count as introductory credit these must be taken " +
        "with BARNARD faculty — intro courses taken at Columbia count toward " +
        "your electives only.",
      rule: {
        kind: "attested",
        note:
          "I have completed three introductory POLS lectures with Barnard " +
          "faculty, in three different subfields.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "electives",
      label: "Five electives",
      note:
        "Five political science courses. The department counts anything in " +
        "the political science section of the Barnard catalogue, at Barnard or " +
        "Columbia — "  +
        '"including introductory lecture courses and colloquia". An intro ' +
        "lecture taken at Columbia, or a colloquium taken before your final " +
        "two semesters, lands here. POLS BC3799 Independent Study counts only " +
        "if approved for 3 or 4 points, which we cannot see.",
      rule: {
        kind: "n_matching",
        n: 5,
        select: { subjects: ["POLS"], numberRange: [1000, 4999] },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "colloquia",
      label: "Two colloquia",
      note:
        "Two colloquia, taken with Barnard faculty during your final two " +
        "semesters. Columbia seminars do not fulfil this. You certify it " +
        "because the colloquia sit at the 3000 level alongside the " +
        "introductory lectures — no course-number rule can tell the two apart, " +
        "and the seminars are re-titled every term, so no title rule can " +
        "either. A colloquium taken earlier than your final two semesters " +
        "counts as an elective instead.",
      rule: {
        kind: "attested",
        note:
          "I have completed two Barnard political science colloquia in my " +
          "final two semesters.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
