/**
 * The Barnard College major in History.
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/history/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── Eleven courses, organised around a concentration we cannot see ─────────
 *
 * "The History major consists of eleven courses: six in the area of
 * concentration; the other five may be either within or without."
 *
 * The area of concentration is chosen by the student in consultation with a
 * professor — "a region (such as Africa, Asia, Europe, Latin America, South
 * Asia, U.S., transnational), period (such as ancient, medieval, early
 * modern), or theme". It is not declared anywhere we can read, and two
 * students with identical transcripts can have different concentrations. So
 * the six-in-concentration split is `attested` and the eleven-course total is
 * counted without it.
 *
 * ── Barnard History numbers encode region, and it is nearly usable ─────────
 *
 * This page is unusual: it publishes its own numbering scheme.
 *
 *   By course type:  1000-level introductory lectures
 *                    2000-level other undergraduate lectures
 *                    3000-level undergraduate seminars
 *
 *   By world region: x000-x059 Ancient      x600-x659 Jewish
 *                    x060-x099 Medieval     x660-x699 Latin America
 *                    x1xx-x199 Early Modern Europe
 *                    x2xx-x299 East Central Europe
 *                    x3xx-x399 Modern Western Europe
 *                    x4xx-x599 United States
 *                    x700-x759 Middle East  x760-x799 Africa
 *                    x800-x859 South Asia   x860-x899 East Asia
 *                    x9xx-x999 Research, Historiography, Trans-National
 *
 * The COURSE TYPE half is used — it is what makes the introductory and seminar
 * blocks below `flagged` rather than `attested`, and it is the reason this
 * major is more checkable than Political Science's, whose lectures and
 * colloquia share the 3000 band.
 *
 * The REGION half is deliberately not used, and the temptation to use it is
 * the interesting failure here. `CourseSelector.numberRange` is one contiguous
 * `[min, max]` pair, and every region band is a slice of the LAST three digits
 * repeated at three different levels — "x4xx-x599" means 1400-1599 AND
 * 2400-2599 AND 3400-3599. Three non-contiguous ranges, which is the same
 * shape that forced `cc-major-psychology`'s three distribution groups to
 * `attested`. Approximating it as [1400, 3599] would swallow eleven other
 * regions whole.
 *
 * ── One caveat on the introductory block, from the page itself ────────────
 *
 * "at least one 1000-level course; the two others may be 1000- or 2000-level
 * courses. Note that a Columbia global core course is listed at 2000 level but
 * counts as a 1000-level course."
 *
 * The floor is split out as its own group so the "at least one 1000-level"
 * condition is genuinely enforced, with `excludeGroups` stopping the same
 * course from also filling one of the other two slots. The global-core
 * exception is not encoded — a `globalCore`-flagged 2000-level HIST course
 * counts as 1000-level for this requirement, and we would have to special-case
 * a flag inside a number range to say it. It is in the note.
 *
 * ── The senior research seminar is the one exact thing here ────────────────
 *
 * `HIST BC3391` and `HIST BC3392`, "normally taken in sequence, beginning in
 * the Fall and continuing into Spring of the senior year". Both are required —
 * this is `all_of`, not a choice — and both resolve against our catalog.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 38-point minimum. "Six of the eleven courses must be taken at Barnard or
 * Columbia" and "one of [the two seminars] must be taken at Barnard or
 * Columbia" — residency. "Majors may, with the approval of their advisers,
 * include two non-history courses in their list of eleven if the subjects are
 * closely related to their concentrations" — which is why the eleven-course
 * total below counts only HIST and will under-count for a student who used
 * that allowance. The temporal-breadth and geographic-range requirements, each
 * `attested` below. The prospectus deadline halfway through the first senior
 * semester.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/history/";

export const BC_MAJOR_HISTORY: Program = {
  id: "bc-major-history",
  kind: "major",
  school: "BC",
  name: "History",
  department: "History",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "introductory-1000",
      label: "One 1000-level introductory lecture",
      note:
        "At least one of the three introductory lectures must be at the 1000 " +
        "level. One exception we cannot encode: a Columbia Global Core course " +
        "is listed at the 2000 level but counts as a 1000-level course for " +
        "this requirement.",
      rule: {
        kind: "n_matching",
        n: 1,
        select: { subjects: ["HIST"], numberRange: [1000, 1999] },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "introductory-lectures",
      label: "Two further introductory lectures",
      note:
        "The other two introductory lectures, at the 1000 or 2000 level. " +
        "Barnard History numbers lectures at 1000 (introductory) and 2000 " +
        "(other undergraduate); seminars are 3000.",
      rule: {
        kind: "n_matching",
        n: 2,
        select: {
          subjects: ["HIST"],
          numberRange: [1000, 2999],
          excludeGroups: ["introductory-1000"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "seminars",
      label: "Two seminars",
      note:
        "Two 3000- or 4000-level seminars, one of which must be taken at " +
        "Barnard or Columbia. The senior research seminar below does not " +
        "count toward these two.",
      rule: {
        kind: "n_matching",
        n: 2,
        select: {
          subjects: ["HIST"],
          numberRange: [3000, 4999],
          excludeGroups: ["senior-research-seminar"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-research-seminar",
      label: "Senior research seminar",
      note:
        "HIST BC3391 and HIST BC3392, normally taken in sequence beginning in " +
        "the Fall of senior year. This is where the senior essay (30-50 pages) " +
        "is written.",
      rule: { kind: "all_of", courses: ["HIST BC3391", "HIST BC3392"] },
      sourceUrl: SOURCE,
    },
    {
      id: "temporal-breadth",
      label: "Temporal breadth",
      note:
        "At least one course (lecture or seminar) demonstrating temporal " +
        "breadth — \"usually ... one course that covers themes and topics " +
        "related to the pre-modern period (generally taken to mean the period " +
        "before the nineteenth century)\". Barnard's numbering does encode " +
        "region and epoch, but each band is a slice of the last three digits " +
        "repeated at three course levels, and a selector takes one contiguous " +
        "range — so you certify this rather than us guessing at it.",
      rule: {
        kind: "attested",
        note: "I have completed a course demonstrating temporal breadth.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "geographic-range",
      label: "Geographic range",
      note:
        "At least one course demonstrating geographic range, unless your area " +
        "of concentration already does so — \"If your concentration is " +
        "geography-based, this means a geographical area or region that is " +
        "outside your field of study.\" Whether it applies at all depends on a " +
        "concentration that is not recorded anywhere we can read.",
      rule: {
        kind: "attested",
        note:
          "I have completed a course demonstrating geographic range, or my " +
          "concentration already satisfies it.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "concentration",
      label: "Six courses in the area of concentration",
      note:
        "Six of the eleven must be in your area of concentration — a region, " +
        "a period, or a theme, chosen with your adviser. Nothing records which " +
        "concentration you declared, so you certify this.",
      rule: {
        kind: "attested",
        note:
          "Six of my eleven courses are in my declared area of concentration.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "eleven-courses",
      label: "Eleven courses",
      note:
        "The major totals eleven courses. Counted over HIST at the 1000-4999 " +
        "levels. One deliberate under-count: with an adviser's approval you " +
        "may include up to two NON-history courses closely related to your " +
        "concentration, and those will not appear here.",
      rule: {
        kind: "n_matching",
        n: 11,
        select: { subjects: ["HIST"], numberRange: [1000, 4999] },
      },
      sourceUrl: SOURCE,
    },
  ],
};
