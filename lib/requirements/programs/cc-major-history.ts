/**
 * The Columbia College major in History.
 *
 * Transcribed by hand from "Major in History" on the Requirements tab of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/history/
 * (2026–2027 edition).
 *
 * ── This page names exactly one number and zero courses ─────────────────────
 *
 * The entire major is nine courses arranged around a **specialization** the
 * student invents and an adviser approves:
 *
 *   "All History students are required to choose and complete a
 *    'specialization'. The specialization is a set of courses on a specific
 *    field, theme, or subject. In most cases, the regional specialization must
 *    be bound by a time period; for example, '20th Century U.S. History' as
 *    opposed to just 'U.S. History'."
 *   "To determine which History courses fulfill a specialization, students
 *    should consult an Undergraduate Education Committee (UNDED) advisor."
 *
 * Every one of the five distribution rows is defined relative to that
 * specialization — four courses inside it, one "removed in time" from it, two
 * "removed in space" from it, two unconstrained, and two of the nine must be
 * seminars with one of those inside the specialization. None of those is a
 * property of a course. "Removed in time" is a relation between a course and a
 * plan of study that exists only in a PDF an adviser signed.
 *
 * So the counted content of this program is one `n_matching` group, and the
 * rest is `attested`. It is a thin audit, and a thin audit that says so beats
 * a thick one that guesses which of a student's HIST courses their adviser
 * agreed was 20th-century U.S. history.
 *
 * ── Re-read against the live Bulletin on 2026-08-24 ─────────────────────────
 *
 * Two corrections, both from the department's Overview tab rather than its
 * Requirements tab. The requirement breakdown lives on Requirements; the
 * definitions the breakdown depends on live on Overview, and reading only the
 * first leaves rules that look unstatable and are not.
 *
 * 1. **The Plan of Study is now a group.** It was listed as NOT ENCODED on the
 *    grounds that it "is not published anywhere machine-readable" — true, and
 *    beside the point. "All program course plans are organized through a
 *    student's Plan of Study, which is approved by an UNDED advisor" is a thing
 *    a student must do and can fail to do, and `attested` is the tier for
 *    exactly that. A History major who takes nine HIST courses without one has
 *    not completed the major, and until now nothing in the audit said so.
 *
 * 2. **The Bulletin does publish a number band for seminars.** This file used
 *    to state the opposite — "The Bulletin publishes no number band or list
 *    that identifies a History seminar" — which was wrong, and wrong in the
 *    direction that leaves a student with no way to check themselves. Both
 *    tabs say it: "Seminars are numbered at the 3000-level and 4000-level",
 *    and the Overview adds "History seminars are numbered at the 3000-level
 *    (all undergraduate) or 4000-level (undergraduate and graduate). Some
 *    summer courses listed at the 3000 level may be lectures and do not qualify
 *    as seminars."
 *
 *    The group stays `attested` rather than becoming `n_matching` over
 *    HIST 3000–4999, because of that last sentence and because the seminar
 *    requirement is really two rules — two seminars, at least one of them
 *    inside the specialization — and the second half is not a property of a
 *    course at any number. A rule that counted the band would report a student
 *    who took two summer 3000-level lectures, or two seminars both outside
 *    their specialization, as finished. The band is in the note instead, where
 *    it does the student's checking for them without doing it wrong.
 *
 * ── Why the nine-course rule is `n_matching` over HIST and not narrower ─────
 *
 * The Bulletin's own eligible-course list is: "Courses in the History
 * Departments of both Columbia and Barnard (HIST and HIST BC)", cross-listed
 * courses named per term in the Bulletin, approved transfer courses, and
 * graduate courses taught by History faculty. Barnard's `HIST BC` codes carry
 * the `HIST` subject so they are matched. The per-term cross-listings and the
 * graduate courses are not, and the note says so.
 *
 * NOT ENCODED: the contents of any individual Plan of Study, which is the
 * actual governing artifact of this major and is not published anywhere
 * machine-readable — the group below records only that one exists and was
 * approved. Also not encoded: the 4-point convention ("most of which will be
 * 4-points" — a convention, not a requirement); the transfer and study-abroad
 * caps (at most 3 toward the major, at most 2 of those toward the
 * specialization); the departmental-honors thesis and its 3.6 GPA, which are
 * honors rather than graduation requirements; and the department's own
 * Undergraduate Handbook, which the Bulletin links to and which was not read
 * for this transcription.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/history/#requirementstextcontainer";

export const CC_MAJOR_HISTORY: Program = {
  id: "cc-major-history",
  kind: "major",
  school: "CC",
  name: "History",
  department: "History",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "nine-history-courses",
      label: "Nine History courses",
      note: "Nine courses on a Plan of Study approved by an Undergraduate Education Committee adviser: four in your specialization, one removed in time, two removed in space, and two that need not fit any requirement. Columbia and Barnard History courses both carry the HIST subject and are matched here; per-term cross-listings and approved transfer courses also count and are not. Graduate HIST courses are matched, because the Bulletin accepts graduate courses taught by History faculty — but like everything else here they only count once an UNDED adviser has put them on your Plan of Study.",
      rule: { kind: "n_matching", n: 9, select: { subjects: ["HIST"] } },
      sourceUrl: SOURCE,
    },
    {
      id: "plan-of-study",
      label: "Plan of Study",
      /*
       * The governing artifact of this major, and the one requirement here
       * that is not coursework at all — which is why an audit assembled from
       * course lists could not see it. Every other group on this page is
       * defined relative to it.
       */
      rule: {
        kind: "attested",
        note: "Have a Plan of Study approved by an Undergraduate Education Committee (UNDED) adviser. It names your specialization and the nine courses that fulfil the major, and every other requirement below is defined relative to it. The department strongly advises meeting an UNDED adviser in the fall of your junior year and again in the fall of your senior year.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "specialization",
      label: "Specialization courses",
      /*
       * Attested, and every group below it for the same reason: the
       * specialization is a set of courses the student proposes and an adviser
       * approves, so no course code carries membership in it.
       */
      rule: {
        kind: "attested",
        note: "Four courses directly related to your chosen specialization — a field, theme, or subject, usually bounded by a time period. Which courses count is settled with an Undergraduate Education Committee adviser, not by course number.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "breadth-removed-in-time",
      label: "Breadth — removed in time",
      rule: {
        kind: "attested",
        note: "One course covering a time period far removed from your specialization.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "breadth-removed-in-space",
      label: "Breadth — removed in space",
      rule: {
        kind: "attested",
        note: "Two courses in regions removed from your specialization.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "additional-history-courses",
      label: "Additional History courses",
      rule: {
        kind: "attested",
        note: "Two further History courses that do not have to fit any specific requirement. Attested rather than counted because whether a course is 'additional' depends on which of your nine the other rows already claimed.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "seminars",
      label: "Seminars",
      rule: {
        kind: "attested",
        note: "At least two of the nine must be History seminars, and at least one of those must be a seminar in your specialization. The Bulletin numbers History seminars at the 3000 level (all undergraduate) and the 4000 level (undergraduate and graduate), and lectures at the 1000 and 2000 levels — but some summer courses listed at the 3000 level are lectures and do not qualify, and no course number can say whether a seminar is inside your specialization.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
