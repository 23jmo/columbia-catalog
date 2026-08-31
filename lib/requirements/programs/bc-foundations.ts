/**
 * Barnard College's general education curriculum, "Foundations".
 *
 * Transcribed by hand from
 * https://catalog.barnard.edu/barnard-college/curriculum/requirements-liberal-arts-degree/foundations/
 * and its parent page (2025-2026 edition), read on 2026-08-30.
 *
 * ── Barnard's catalogue is a different publication, on a different host ─────
 *
 * Everything else in this directory was read from `bulletin.columbia.edu`.
 * Barnard's is `catalog.barnard.edu` — a separate CourseLeaf install with its
 * own edition year, its own numbering and its own vocabulary. This is the same
 * split `lib/crawler/fetcher.ts` carries a second allowed host for, and the
 * reason blocker #10 exists: the Columbia host advertises `/barnard-college/…`
 * paths in its sitemap and 404s on every one of them.
 *
 * The practical consequence for this file: the edition is `2025-2026`, not the
 * `2026-2027` every other program here carries. That is not a stale
 * transcription. It is the edition Barnard currently publishes.
 *
 * ── Foundations replaced the Nine Ways of Knowing ──────────────────────────
 *
 * "Barnard's curriculum, Foundations, applies to students entering in or after
 * Fall 2016." Students who matriculated before that are on the Nine Ways of
 * Knowing, which the catalogue now serves only from its archive. `lib/types.ts`
 * still names Nine Ways flags (`culturesInComparison`, `laboratoryScience`, …)
 * because the flag column is shared with course records that predate the
 * change; nothing in this file uses them. A 2016-or-later matriculant is every
 * undergraduate the app can plausibly serve, so Foundations is encoded and the
 * older curriculum is not.
 *
 * ── Why nine of the thirteen groups are `attested` ─────────────────────────
 *
 * This is the single most important thing to understand before "improving"
 * this file, because the obvious improvement produces a confidently wrong
 * audit.
 *
 * Barnard does not publish its approved-course lists in the catalogue. They
 * live in a Slate portal — https://slate.barnard.edu/portal/gen_ed_courses —
 * which the Foundations page links to and which renders its rows client-side
 * from a DataTables widget. The page served to a plain GET contains the filter
 * form, the term list and the requirement list, and exactly one `<tr>`: the
 * table header. Neither GET nor POST with `gers_term_id` / `gers_reqs_id` set
 * changes the response by a single byte. There is no JSON endpoint in the
 * markup to call instead.
 *
 * So there is no list to ingest, and `courses.requirement_flags` holds no
 * Barnard flag on any row — a census of the column on 2026-08-30 returned four
 * keys, `globalCore`, `scienceRequirement`, `scienceB` and `scienceC`, all of
 * them Columbia's, written by `scripts/ingest-core-flags.ts` from Columbia's
 * Bulletin. `lib/types.ts` declares `thinkingLocally` and its five siblings;
 * nothing has ever written one.
 *
 * Writing these groups as `n_matching` over `flag: "thinkingLocally"` would
 * therefore typecheck, read correctly, and match zero courses for every
 * student forever — while `expandCandidates` returned an empty candidate list,
 * which renders identically to a requirement that is already finished. That is
 * precisely the failure `scripts/ingest-core-flags.ts` was written to fix for
 * Columbia, and re-introducing it for Barnard because the flag names happen to
 * exist would be worse than saying nothing.
 *
 * `attested` is the honest tier: the student ticks the box, the UI says they
 * ticked it, and each group's note carries the portal URL so they can check
 * themselves against the registrar's own list in one click.
 *
 * **If Barnard's approved lists ever become fetchable, this file changes.**
 * Six Modes of Thinking and three of the four Distributional Requirements
 * become `n_matching` over a flag, and the tier moves from `attested` to
 * `flagged` on its own — `verificationOf` derives it from the rule kind, so
 * there is no second place to update.
 *
 * ── What IS checkable ──────────────────────────────────────────────────────
 *
 * The First-Year Experience and Physical Education. Both name courses that
 * exist in our catalog, verified against it on 2026-08-30:
 *
 *   FYWB BC1001  First-Year Writing at Barnard      3 pts
 *   FYWB BC1002  First-Year Writing Workshop        4 pts
 *   FYSB BC1001  First-Year Seminar at Barnard      3 pts
 *   FYSB BC1002  First-Year Seminar Workshop        4 pts
 *   PHED BC1004  Physical Education Courses         1 pt   (+ 16 more PHED BC rows)
 *
 * Writing and Seminar are each `n_of { n: 1 }` over the standard course and its
 * Workshop variant, not `all_of` over the standard one. The Workshop sections
 * are a genuine alternative route through the same one-semester requirement —
 * a student placed into BC1002 has satisfied First-Year Writing, and an
 * `all_of` on BC1001 would tell her she had not.
 *
 * ── The Modes of Thinking "@ BC" restriction, which is not a course rule ────
 *
 * From Fall 2025, first-years "will be expected to enroll exclusively in
 * Barnard classes during their first year, and will complete all Modes of
 * Thinking requirements at Barnard"; transfers from Fall 2026 the same. The
 * Slate portal encodes this as a separate requirement per mode — "Social
 * Difference @BC (BC sections only)" alongside a plain "Social Difference" —
 * and warns that the distinction is carried on the *section*, not the course:
 * "Barnard sections: Call numbers start with 0. Columbia sections: Call
 * numbers start with 1."
 *
 * `CourseSelector` has no section field and no call-number field, and a course
 * can have a Barnard section and a Columbia section in the same term. So this
 * is not expressible even in principle from a course-level selector, and it is
 * a rule a student can genuinely fail. It is stated in each mode's note rather
 * than silently dropped.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 2.0 overall GPA floor; the 122-point total (recorded as `degreePoints`,
 * which the audit reports but does not check); the 121-point variant for
 * transfers entering with 24+ points; the "one of the 122 must be for PE"
 * clause; the deadline that PE be finished by the end of the first year; the
 * three-point floor on every general education course; the exclusion of
 * independent studies, AP, IB and National Exam Credit; and the double-count
 * rule ("students may use such courses to satisfy up to two requirements in
 * separate categories"). Every one of them is either a statement about an
 * assignment of courses to requirements rather than about any course, or needs
 * the registrar's own record. See the header of `lib/requirements/types.ts`.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/curriculum/requirements-liberal-arts-degree/foundations/";

const DEGREE_SOURCE =
  "https://catalog.barnard.edu/barnard-college/curriculum/requirements-liberal-arts-degree/";

/**
 * Barnard's approved-course portal. Every `attested` group below points at it,
 * because it is the only place the answer actually lives — see the header.
 */
const GER_PORTAL = "https://slate.barnard.edu/portal/gen_ed_courses";

/** Repeated verbatim on every Mode of Thinking. See the header. */
const AT_BARNARD_NOTE =
  "Students entering as first-years in Fall 2025 or later (and transfers from " +
  "Fall 2026) must complete this at Barnard: the approved course must carry the " +
  '"@ BC" designation and the section must be a Barnard section — its call ' +
  "number starts with 0, not 1. We cannot check that: it is a property of the " +
  "section, not of the course.";

export const BC_FOUNDATIONS: Program = {
  id: "bc-foundations",
  kind: "core",
  school: "BC",
  name: "Foundations",
  degreePoints: 122,
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    /* ── I. First-Year Experience ─────────────────────────────────────── */
    {
      id: "first-year-writing",
      label: "First-Year Writing",
      note:
        "One semester of First-Year Writing. FYWB BC1001 is the standard " +
        "course; FYWB BC1002, the First-Year Writing Workshop, is the " +
        "alternative route through the same requirement. Either satisfies it.",
      rule: { kind: "n_of", n: 1, courses: ["FYWB BC1001", "FYWB BC1002"] },
      sourceUrl:
        "https://catalog.barnard.edu/barnard-college/courses-instruction/first-year-writing/",
    },
    {
      id: "first-year-seminar",
      label: "First-Year Seminar",
      note:
        '"Every Barnard first-year student is required to take a First-Year ' +
        'Seminar during her first or second semester at Barnard." FYSB BC1001 ' +
        "is the standard course; FYSB BC1002 is the Workshop variant.",
      rule: { kind: "n_of", n: 1, courses: ["FYSB BC1001", "FYSB BC1002"] },
      sourceUrl:
        "https://catalog.barnard.edu/barnard-college/courses-instruction/first-year-seminar/",
    },

    /* ── II. Physical Education ───────────────────────────────────────── */
    {
      id: "physical-education",
      label: "Physical Education",
      note:
        "One PE course, to be completed by the end of the first year. " +
        '"All Physical Education courses are one point of credit and are one ' +
        'semester long." The deadline is not checkable here; the course is.',
      rule: { kind: "n_matching", n: 1, select: { subjects: ["PHED"] } },
      sourceUrl:
        "https://catalog.barnard.edu/barnard-college/courses-instruction/physical-education/",
    },

    /* ── III. Distributional Requirements ─────────────────────────────── */
    {
      id: "distributional-arts-humanities",
      label: "Distributional: Arts & Humanities",
      note:
        '"Two courses that explore modes of cultural and artistic ' +
        'expression." Barnard publishes the approved list in its general ' +
        `education portal (${GER_PORTAL}) rather than in the catalogue, and ` +
        "that portal renders its rows client-side, so we hold no list to check " +
        "against. Confirm your two courses there.",
      rule: {
        kind: "attested",
        note: "I have completed two approved Arts & Humanities courses.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "distributional-social-sciences",
      label: "Distributional: Social Sciences",
      note:
        '"Two courses that prepare students to analyze societies and social ' +
        'structures critically and constructively through theoretical and ' +
        'empirical inquiry." Approved list: ' +
        GER_PORTAL,
      rule: {
        kind: "attested",
        note: "I have completed two approved Social Sciences courses.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "distributional-sciences",
      label: "Distributional: Sciences",
      note:
        "One approved science lecture + lab combination, plus either one " +
        "additional approved 3-point science lecture or lab, or a second " +
        "lecture + lab combination. The lecture/lab pairing is the part we " +
        "could not check even with a flag: our course records do not " +
        "distinguish an approved lab from an approved lecture. Approved list: " +
        GER_PORTAL,
      rule: {
        kind: "attested",
        note:
          "I have completed an approved science lecture + lab combination and " +
          "one additional approved science lecture or lab.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "distributional-languages",
      label: "Distributional: Languages",
      note:
        '"Two courses in the same language other than English." The ' +
        '"same language" clause is the reason this cannot be a selector: two ' +
        "courses each carrying a language flag may be in two different " +
        "languages and satisfy nothing.",
      rule: {
        kind: "attested",
        note:
          "I have completed two courses in the same language other than English.",
      },
      sourceUrl: SOURCE,
    },

    /* ── IV. Modes of Thinking ────────────────────────────────────────── */
    {
      id: "thinking-locally",
      label: "Thinking Locally — New York City",
      note:
        '"One course that asks students to examine the community and ' +
        'environment in which they find themselves as residents of New York ' +
        `City." Approved list: ${GER_PORTAL}. ${AT_BARNARD_NOTE}`,
      rule: {
        kind: "attested",
        note: "I have completed an approved Thinking Locally — New York City course.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "thinking-through-global-inquiry",
      label: "Thinking through Global Inquiry",
      note:
        '"One course that asks students to consider communities, places, and ' +
        'experiences within a global perspective." Approved list: ' +
        `${GER_PORTAL}. ${AT_BARNARD_NOTE}`,
      rule: {
        kind: "attested",
        note:
          "I have completed an approved Thinking through Global Inquiry course.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "thinking-about-social-difference",
      label: "Thinking about Social Difference",
      note:
        '"One course through which students examine how difference is ' +
        'constituted, defined, lived, and challenged in cultural, social, ' +
        `historical, or regional contexts." Approved list: ${GER_PORTAL}. ` +
        AT_BARNARD_NOTE,
      rule: {
        kind: "attested",
        note:
          "I have completed an approved Thinking about Social Difference course.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "thinking-with-historical-perspective",
      label: "Thinking with Historical Perspective",
      note:
        '"One course that enables students to study events and societies of ' +
        "the past, to learn theories and methods of historical analysis, and to " +
        "discover how different understandings of history shape our conceptions " +
        `of both past and present." Approved list: ${GER_PORTAL}. ` +
        AT_BARNARD_NOTE,
      rule: {
        kind: "attested",
        note:
          "I have completed an approved Thinking with Historical Perspective course.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "thinking-quantitatively-and-empirically",
      label: "Thinking Quantitatively & Empirically",
      note:
        '"One course that exposes students to empirical and mathematical ' +
        `analysis and tools for problem solving." Approved list: ${GER_PORTAL}. ` +
        AT_BARNARD_NOTE,
      rule: {
        kind: "attested",
        note:
          "I have completed an approved Thinking Quantitatively & Empirically course.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "thinking-technologically-and-digitally",
      label: "Thinking Technologically & Digitally",
      note:
        "One course engaging technological and digital modes of thought. " +
        `Approved list: ${GER_PORTAL}. ${AT_BARNARD_NOTE}`,
      rule: {
        kind: "attested",
        note:
          "I have completed an approved Thinking Technologically & Digitally course.",
      },
      sourceUrl: SOURCE,
    },

    /* ── The degree total, recorded rather than checked ───────────────── */
    {
      id: "points-total",
      label: "122 points",
      note:
        '"Students entering as first years must complete 122 points." ' +
        "Transfer students entering with at least 24 points of credit must " +
        "earn 121, of which one is for PE. We record the total on the program " +
        "rather than checking it: points come from the registrar's record, not " +
        "from a course list we hold.",
      rule: {
        kind: "attested",
        note: "I have completed (or am on track to complete) 122 points.",
      },
      sourceUrl: DEGREE_SOURCE,
    },
  ],
};
