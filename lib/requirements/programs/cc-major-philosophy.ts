/**
 * The Columbia College major in Philosophy.
 *
 * Transcribed by hand from the Requirements tab of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/philosophy/
 * (2026–2027 edition), read on 2026-08-26, with the Overview tab of the same
 * page and the department's own Undergraduate Program Guide read in full as
 * secondary sources.
 *
 * ── The page states this major twice, and the two do not agree ─────────────
 *
 * Under `Required Coursework for all Programs` there is a prose `<ul>` of six
 * bullets, headed "At least 30 points in philosophy, chosen from courses
 * prefixed with UN, GU, or GR*, including:". Under `Major in Philosophy` there
 * is a sentence plus one `sc_courselist` table, headed "The major requires a
 * minimum of 30 points in philosophy chosen from courses prefixed with UN or
 * GU:".
 *
 * They differ on the allowed prefixes, on the contents of the two area
 * requirements, and on whether a substitution is offered at all. The
 * department's own PDF guide agrees with the prose block, not the table. Both
 * readings are recorded below on the groups they touch; where a choice had to be
 * made, the narrower one won, for the reason given on `thirty-points`.
 *
 * ── The thirty-point floor is the whole point of this transcription ────────
 *
 * The six named rows come to 21–23 points. The major's floor is 30. A student
 * who took exactly the six named courses is two or three courses short and
 * every one of their six groups would be green. `thirty-points` is the only
 * thing that says so, and the Bulletin states it in one sentence of prose,
 * twice, in two different forms — never as a table row.
 *
 * A six-group transcription of this major would report that student complete at
 * 22 of 30 points. That is the single most valuable finding on this page.
 *
 * The block is cumulative by design — "at least 30 points … INCLUDING" the six
 * — so it carries an allowlist entry in `vacuity.test.ts`, the same shape
 * `cc-major-english:ten-courses` has.
 *
 * Cross-checks from the same page confirm the model: the minor requires 15
 * points and names no courses at all, the concentration 24 points and names none
 * either. Both are the same construction with the "including" clause removed.
 *
 * ── Where the Bulletin publishes a list and where it publishes an example ──
 *
 * This is the question every humanities major turns on, and here the Bulletin
 * answers it differently for two adjacent rows.
 *
 * The ethics row says "Select at least one course in either ethics or social and
 * political philosophy FROM THE FOLLOWING:" and prints three codes. That is a
 * list, so it is `n_of`.
 *
 * The metaphysics row says "e.g." — in all three sources, every time — and ends
 * "or a related course to be chosen in consultation with the director of
 * undergraduate studies". There is no published approved-course list for that
 * area anywhere: not on either Bulletin tab, and not in the department's own
 * program guide, which is the document that would carry one. `n_of` over the
 * handful of `e.g.` codes would mark the requirement unmet for most students who
 * satisfied it legitimately; `n_matching` over a PHIL number band would mark it
 * satisfied by courses the DUS will reject. It is `attested`.
 *
 * The two history rows sit in between: each names its default course AND two
 * substitutes by code, so each is `n_of` over exactly the three the Bulletin
 * prints. That never over-counts, since every option is Bulletin-named, and
 * under-counts strictly less than `all_of` would.
 *
 * They are NOT a sequence, which was checked rather than assumed: two
 * independent rows with two independent substitution clauses, and the Bulletin
 * never says "sequence" or "both terms". A student may satisfy the first with
 * Plato and the second with History of Philosophy II, and that is a complete and
 * legitimate schedule. `sequence_choice` would forbid the mixed path; a single
 * `n_of { n: 2 }` over all six codes would accept Plato plus Aristotle with no
 * early-modern course at all.
 *
 * ── What the table's markup hides ──────────────────────────────────────────
 *
 * The `Major in Philosophy` table has NO `areaheader` classes and NO
 * `blockindent` classes anywhere in it. The row "Select at least one course in
 * either ethics or social and political philosophy from the following:" and its
 * three options render at exactly the same indent as the three flatly-required
 * courses. A parser reading this table produces an `all_of` over six codes —
 * wrong in the direction that fails a complete student.
 *
 * `PHIL UN2201`'s Title cell is empty and its code is not hyperlinked, while
 * every other code in the table links out to a course page. In CourseLeaf that
 * is the signature of a code the course database no longer resolves — and
 * indeed `PHIL UN2201` appears nowhere on the Bulletin's own Courses tab except
 * inside other courses' prerequisite lines. It is kept anyway.
 *
 * The Major table also prints `PHIL W3960`, which is not a course: the live code
 * is `PHIL UN3960 EPISTEMOLOGY`, which the same page's Economics-Philosophy
 * table spells correctly. `PHIL W3960` is a legacy pre-`UN` code left in the
 * table. It is named nowhere here.
 *
 * The page carries exactly one footnote, and it is a literal `*` character
 * rather than a `<sup>` — there are zero `<sup>` elements and zero
 * `sc_footnotes` blocks in the whole requirements container. It attaches to the
 * `GR` prefix in the block's opening sentence and to four of the six rows, and
 * reads: "All substituted or related courses must be selected in consultation
 * with the Director of Undergraduate Studies (DUS)."
 *
 * NOT IN OUR CATALOG, and kept anyway: `PHIL UN3222`, `PHIL UN3237` (both
 * substitutes on the History of Philosophy II row) and `PHIL UN2702`
 * Contemporary Moral Problems. None appears on the Bulletin's own Courses tab
 * either, so the department is printing options it is not currently offering —
 * but dropping an option the Bulletin prints would tell a student who took it
 * that it did not count, which is the `seas-major-mechanical-engineering`
 * precedent for `COMS W1005` and `MATH UN3027`. `PHIL UN2201` and
 * `PHIL UN3121` do have catalog rows but no points, having not run in a term we
 * cover.
 *
 * NOT ENCODED: the grade-of-D bar and the pass/fail restriction; "no more than
 * one course at the 1000-level can be counted toward the major", which is a
 * constraint across the set the student picks rather than a property of any one
 * course — narrowing `thirty-points` to `[2000, 4999]` would under-count the one
 * 1000-level course a student is allowed, the identical situation to
 * `cc-major-economics`'s "no more than one elective at the 2000-level"; the
 * four-courses-before-a-4000-level registration rule; GR-prefix instructor
 * permission; the Majors Seminar's 20-student cap and its five-step priority
 * order; the two-course Summer Session cap; the five-course transfer cap;
 * residency; the four open substitution clauses; cross-listings in other
 * departments, which are per-term and not carried on a course record; the
 * optional senior thesis, which is an honors route rather than a graduation
 * requirement (its registration codes are `PHIL UN3996`/`UN3997`/`UN3998`); and
 * departmental honors, which is a 3.6 major GPA under a 10% quota.
 *
 * Worth knowing because it is the opposite of the `ECON UN1105` situation noted
 * on `seas-core`: "The Department of Philosophy does not accept any advanced
 * placement credit toward courses in the curriculum." No group here needs an AP
 * caveat, in either direction.
 *
 * A warning for whoever encodes the Joint Major in Economics-Philosophy, which
 * is printed on this same page and is a different program: `PHIL UN3411` will
 * exist on both files, and `ECON UN1105`/`UN3211`/`UN3213`/`UN3412` on both it
 * and `cc-major-economics`. That is the `ECON UN1105` duplication removed from
 * three SEAS files — the joint major's requirements belong on the joint major's
 * file alone. Note too that the page gives its seminar code two ways, `ECPH
 * UN4950` in prose and `ECPH GU4950` in the table; the Courses tab says
 * `ECPH GU4950`.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/philosophy/#requirementstextcontainer";

export const CC_MAJOR_PHILOSOPHY: Program = {
  id: "cc-major-philosophy",
  kind: "major",
  school: "CC",
  name: "Philosophy",
  department: "Philosophy",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "history-of-philosophy-i",
      label: "History of Philosophy I",
      note: "History of Philosophy I, or another course in ancient or medieval philosophy. The Bulletin names Aristotle (PHIL UN3131) and Plato (PHIL UN3121) as examples and the category is open beyond them — any other substitution has to be settled with the Director of Undergraduate Studies, so a course outside these three will not be matched here. PHIL UN2101 carries a required 0-point discussion section, printed by the Bulletin under its legacy code PHIL V2111; only the lecture is matched.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["PHIL UN2101", "PHIL UN3131", "PHIL UN3121"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "history-of-philosophy-ii",
      label: "History of Philosophy II",
      note: "History of Philosophy II, or another course in the history of late medieval or early modern philosophy. The Bulletin names Descartes-Spinoza-Leibniz (PHIL UN3222) and Late Medieval and Modern Philosophy (PHIL UN3237) as examples; the category is open beyond them and any other substitution is settled with the Director of Undergraduate Studies. None of these three has run in a term this catalog covers, so if you have taken one it will not be matched automatically — that is a gap in our data, not a judgement about your record.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["PHIL UN2201", "PHIL UN3222", "PHIL UN3237"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "logic",
      label: "Symbolic Logic",
      /*
       * The one row on the page with no asterisk. "In exceptional cases, a more
       * advanced course in logic" names nothing and has no number band that
       * means it — PHIL GU4424, GU4431 and GU4481 are logic-adjacent at the
       * 4000 level and PHIL GU4900 is early modern history at the same level.
       */
      note: "Symbolic Logic. In exceptional cases the department substitutes a more advanced logic course; the Bulletin names none, so no substitute is matched here. PHIL UN1401 Introduction to Logic does not count toward the major.",
      rule: { kind: "all_of", courses: ["PHIL UN3411"] },
      sourceUrl: SOURCE,
    },
    {
      id: "metaphysics-and-epistemology",
      label: "Metaphysics and Epistemology",
      /*
       * Attested, and this is the group where the permissive mistake is
       * available and must be refused. See the header: all three sources give
       * examples, never a list, and no approved-course list for this area is
       * published anywhere.
       */
      rule: {
        kind: "attested",
        note: "One course in metaphysics, epistemology, philosophy of language, philosophy of science, or phenomenology and existentialism. The Bulletin's own examples are PHIL UN3601 Metaphysics, PHIL UN3960 Epistemology, PHIL GU4501 Epistemology, PHIL UN3551 Philosophy of Science and PHIL GU4481 Philosophy of Language, but the category is open and any related course has to be agreed with the Director of Undergraduate Studies — so no course number decides this one.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "ethics-social-and-political-philosophy",
      label: "Ethics, Social and Political Philosophy",
      /*
       * `n_of` because the table says "from the following:" and then prints
       * three codes — the only place on this page the department publishes a
       * list rather than examples. The open escape and the prose block's extra
       * aesthetics category live in the note; the residual failure is an
       * under-count that sends the student to the DUS, which is the recoverable
       * direction.
       */
      note: "One course in ethics or in social and political philosophy. The Bulletin lists Contemporary Moral Problems (PHIL UN2702), Ethics (PHIL UN3701) and Political Philosophy (PHIL UN3751), and accepts a related course agreed with the Director of Undergraduate Studies, which is not matched here. The Bulletin's prose version of this requirement also accepts a course in aesthetics or philosophy of art; the Major table does not name that category, so check with the DUS before relying on it.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["PHIL UN2702", "PHIL UN3701", "PHIL UN3751"],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "major-seminar",
      label: "Majors Seminar",
      /*
       * Three independent statements on one page name the same single code with
       * no substitution offered, so `all_of` is exact.
       */
      note: "The Majors Seminar. Required of senior majors and open to junior majors; capped at 20 students with preference given to philosophy majors, and the department fills it in a published priority order that starts with senior majors who have not taken one before. Register early.",
      rule: { kind: "all_of", courses: ["PHIL UN3912"] },
      sourceUrl: SOURCE,
    },
    {
      id: "thirty-points",
      label: "Thirty Points in Philosophy",
      /*
       * Cumulative by design — the six named requirements are the FIRST of the
       * thirty points, not thirty more beside them. Allowlisted in
       * `vacuity.test.ts` for that reason.
       *
       * `[1000, 4999]` is the Major table's "UN or GU" exactly: UN runs
       * 1000–3999 and GU runs 4000–4999. The prose block and the department
       * guide both say "UN, GU, or GR", which would need `[1000, 6999]` — and
       * 9000-level PHIL is doctoral dissertation and colloquium registration,
       * which must never count. The narrow reading wins because GR courses need
       * instructor permission and are rare, because under-counting sends a
       * student to the DUS while over-counting sends them to the registrar after
       * add/drop, and because it is the reading printed under the heading "Major
       * in Philosophy". If the department confirms the wider one, the change is
       * `numberRange: [1000, 6999]` and nothing else.
       *
       * `numberRange` reads the four-digit number regardless of prefix, so the
       * three Barnard-only courses have to be excluded by name.
       */
      note: "At least thirty points of philosophy, the six requirements above among them. Columbia and Barnard run one joint philosophy curriculum and all of it counts except the courses written for Barnard students — PHIL BC4050 and BC4051 Senior Seminar, and BC4052 Senior Essay — which are excluded here. PHIL UN1401 Introduction to Logic and the Core courses do not count. No more than one 1000-level course may count toward the major, a cap this audit does not enforce. Courses in other departments count only when cross-listed or when the Director of Undergraduate Studies approves them, and neither is matched automatically.",
      rule: {
        kind: "points_matching",
        points: 30,
        select: {
          subjects: ["PHIL"],
          numberRange: [1000, 4999],
          exclude: [
            // Named twice on the same tab as not counting toward the major.
            "PHIL UN1401",
            // "excluding those courses specifically designed for Barnard
            // students" — Overview tab. These are the only PHIL BC rows we hold.
            "PHIL BC4050",
            "PHIL BC4051",
            "PHIL BC4052",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
  ],
};
