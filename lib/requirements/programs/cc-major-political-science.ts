/**
 * The Columbia College major in Political Science.
 *
 * Transcribed by hand from the "Major in Political Science" section of the
 * Requirements tab on
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/political-science/
 * (2026–2027 edition). The requirements live in one `sc_courselist` table with
 * six `areaheader` rows; four of those six name no courses at all.
 *
 * ── Why this program is mostly `attested`, and why that is correct ──────────
 *
 * Political science does not distribute its major by course list. It
 * distributes it by **subfield**, and the subfield a student is claiming is a
 * declaration they make to an adviser, not a fact about any course:
 *
 *   "Students must choose a Primary Subfield and a Secondary Subfield."
 *   "Primary Subfield: minimum three courses."
 *   "Minor Subfield: minimum two courses."
 *
 * The department does publish a numbering scheme — the second digit of a POLS
 * number encodes the subfield (X1XX theory, X2XX American, X5XX comparative,
 * X6XX international) — so it is tempting to write `numberRange` selectors and
 * call the requirement checked. Two things stop that being honest. First,
 * `CourseSelector.numberRange` is a single contiguous band and a subfield spans
 * several non-contiguous ones (2201, 3289, GU4210…). Second, and fatally, the
 * audit would still not know WHICH subfield the student picked, so it could not
 * tell three American-politics courses satisfying the primary requirement from
 * three that satisfy nothing. A rule that cannot distinguish those is not a
 * check; it is a number that happens to go up.
 *
 * The seminar requirement fails for the same reason plus one more: "two 4-point
 * 3000-level seminars, at least one of which is in the student's Primary
 * Subfield". The UN39xx band the department names for seminars also contains
 * `POLS UN3901`/`POLS UN3902` Independent Research, which are explicitly not
 * seminars, so even the level rule over-accepts.
 *
 * ── What IS checkable ───────────────────────────────────────────────────────
 *
 * The introductory courses and the research-methods courses are both published
 * as explicit lists, and both are transcribed exactly.
 *
 * ── The renumbering, transcribed in full ────────────────────────────────────
 *
 * Beginning Fall 2025 the introductory courses moved from UN1x01 to UN2x01, and
 * the Bulletin keeps both sets: "Introductory courses completed at Barnard or
 * Columbia before the Fall 2025 semester may be offered to fulfill the
 * introductory course requirement." Both sets are in the `n_of`, because a
 * junior's record legitimately carries the old numbers and dropping them would
 * report a finished requirement as unmet.
 *
 * ── Groups overlap, and the Bulletin means them to ──────────────────────────
 *
 * The stated total is "a minimum of 9 courses", but the groups below sum to 11.
 * That is not a transcription error: the two introductory courses also count
 * inside the primary and secondary subfields, and the seminars count inside
 * them too. `evaluate.ts` will report cross-counted courses here and that is
 * expected rather than a warning.
 *
 * ── The elective row is a real row, and it stays that way ───────────────────
 *
 * `political-science-electives` carries `excludeGroups`. Without it the row was
 * satisfied by `POLS UN2201`, an introductory course the student was already
 * required to take, so the major read as complete one course early. Re-verified
 * against the live evaluator on 2026-08-24: a student holding only the required
 * coursework now scores 0/1 there, and a student who takes a THIRD introductory
 * course still gets it counted as the elective — which is what the Bulletin's
 * own note asks for ("Introductory courses taken that do not fit into the
 * Primary or Secondary Subfield will be counted in the Political Science
 * Elective category"). `excludeGroups` removes what a group actually consumed,
 * and `introductory-courses` consumes exactly two.
 *
 * Do not turn that back into a plain selector.
 *
 * ── Coverage: six named courses have no row in our catalog ──────────────────
 *
 * Checked with `npm run dump:program cc-major-political-science` on 2026-08-24.
 * Every one is printed by the Bulletin exactly as it is written here, and each
 * was probed for an alternate school qualifier and a matching title; none is a
 * transcription error. Our catalog covers four terms only — 20243, 20251,
 * 20263, 20271, with a hole at Fall 2025 / Spring 2026 — and these are courses
 * that were not offered in any of them:
 *
 *   POLS UN2501  Introduction to Comparative Politics. This one matters most:
 *                it is one of the four current introductory courses, and it is
 *                the only one of the four missing (UN2101, UN2201 and UN2601 all
 *                resolve). The pre-2025 number POLS UN1501 does resolve, so a
 *                student who took comparative politics before Fall 2025 is
 *                matched and one who took it after is not.
 *   POLS UN3289  Media and Data in American Politics    (research methods)
 *   POLS UN3706  Empirical Research Methods in Political Science
 *   POLS GU4764  Design and Analysis of Sample Surveys
 *   POLS GU4792  Quantitative Methods: Research Topics
 *   PSAM UN3707  Persuasion at Scale. The PSAM subject code has no rows in our
 *                catalog at all, so this is a whole missing subject rather than
 *                a missing course.
 *
 * All six are kept. A named course that never matches costs a student nothing;
 * dropping an option the Bulletin offers tells a student who took it that it
 * did not count. The practical effect is that research methods has 13
 * automatically-matchable options rather than 17.
 *
 * NOT ENCODED: the C- minimum on major coursework, the one-course Pass/D/Fail
 * allowance, the three-transfer-course cap, the AP exemption from POLS UN2201 /
 * POLS UN2501 (which leaves no course on a record at all), and the rule that
 * the methods course may not double count into another program. All of them
 * need grades, a transcript, or a second declared program.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/political-science/#requirementstextcontainer";

export const CC_MAJOR_POLITICAL_SCIENCE: Program = {
  id: "cc-major-political-science",
  kind: "major",
  school: "CC",
  name: "Political Science",
  department: "Political Science",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "introductory-courses",
      label: "Introductory Courses",
      note: "Two. The first four are the current Columbia courses; the last four are the pre-Fall-2025 numbers, which still count if you took them then. Columbia College and General Studies students must take these at Columbia, not at Barnard.",
      rule: {
        kind: "n_of",
        n: 2,
        courses: [
          "POLS UN2201",
          "POLS UN2501",
          "POLS UN2601",
          "POLS UN2101",
          "POLS UN1201",
          "POLS UN1501",
          "POLS UN1601",
          "POLS UN1101",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "primary-subfield",
      label: "Primary Subfield",
      /*
       * Attested. See the header: the subfield is the student's declaration,
       * and no rule over course codes can know which one they declared.
       */
      rule: {
        kind: "attested",
        note: "Minimum three courses in your declared primary subfield — American Politics, Comparative Politics, International Relations, or Political Theory. Which subfield a course belongs to is set by the department's numbering scheme, but which subfield is yours is not something we can see.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "secondary-subfield",
      label: "Secondary Subfield",
      note: 'The Bulletin\'s table labels this row "Minor Subfield".',
      rule: {
        kind: "attested",
        note: "Minimum two courses in your declared secondary subfield.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "seminars",
      label: "Seminars",
      /*
       * Attested, even though the seminar NUMBERS are enumerable.
       *
       * The department publishes them: "All sections of 3911 are seminars in
       * political theory. All sections of 3921 are seminars in American
       * politics. All sections of 3951 3952 are seminars in comparative
       * politics. All sections of 3961 3962 are seminars in international
       * relations." So `n_of { n: 2 }` over those six is writable, and it was
       * considered on 2026-08-24 and rejected.
       *
       * What it would get wrong is the half of the rule that is not about
       * course codes: "at least one of the seminars taken must be in the
       * student's primary subfield (i.e. the one in which at least 9 other
       * points have been completed)". The audit does not know which subfield
       * the student declared — that is the whole reason `primary-subfield` is
       * attested — so a student who took two comparative-politics seminars with
       * American politics as their primary subfield would be told the
       * requirement was DONE when the department will refuse it. Being told you
       * are short a seminar you have taken is recoverable in one conversation
       * with an adviser; being told you are finished is discovered at
       * graduation.
       *
       * The numbers are in the note instead, where they help without asserting
       * anything.
       */
      rule: {
        kind: "attested",
        note: "Two 4-point 3000-level seminars, at least one in your primary subfield. The department numbers them POLS UN3911 (political theory), POLS UN3921 (American politics), POLS UN3951 and POLS UN3952 (comparative politics), POLS UN3961 and POLS UN3962 (international relations) — but which subfield is yours is not something we can see, so this one is yours to confirm. Entry requires the instructor's permission. Barnard colloquia do not count toward this, though they may count toward a subfield or the electives. Honors students take POLS UN3998–POLS UN3999 in place of this.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "research-methods",
      label: "Research Methods",
      note: "One, from the department's published list. Must be completed by the end of junior year and may not be taken Pass/D/Fail.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: [
          "POLS UN3220",
          "POLS UN3289",
          "POLS UN3704",
          "POLS UN3706",
          "PSAM UN3707",
          "POLS UN3720",
          "POLS UN3768",
          "POLS GU4710",
          "POLS GU4712",
          "POLS GU4716",
          "POLS GU4720",
          "POLS GU4722",
          "POLS GU4724",
          "POLS GU4726",
          "POLS GU4762",
          "POLS GU4764",
          "POLS GU4792",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "political-science-electives",
      label: "Political Science Electives",
      note: "Minimum one course, in any subfield. Introductory courses that fall outside your two subfields land here, and Barnard political science courses count. POLS UN3901 and POLS UN3902 Independent Research count only when taken for at least 3 points, which this rule cannot check — it counts courses, not credit.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: {
          subjects: ["POLS"],
          /*
           * The Bulletin lists "Political Science Electives — minimum one
           * course" as its own row of the requirement table, alongside the
           * introductory courses, the two subfields, the seminars and research
           * methods. Without this the row was satisfied by the introductory
           * course a student was already required to take, so the major read as
           * complete one course early.
           *
           * The note below still holds and is not in tension with this: an
           * introductory course outside the student's two subfields does land
           * here, because it is not consumed by `primary-subfield` or
           * `secondary-subfield` and so is never excluded.
           */
          excludeGroups: [
            "introductory-courses",
            "primary-subfield",
            "secondary-subfield",
            "seminars",
            "research-methods",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
  ],
};
