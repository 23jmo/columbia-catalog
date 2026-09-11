/**
 * The Barnard College major in Biology.
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/biological-sciences/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── Five specializations, and which of them this file encodes ─────────────
 *
 * "There are five ways to complete a biology major. These are called
 * 'specializations' (ie tracks):"
 *
 *   1  General Biology (GB)
 *   2  Cellular and Molecular Biology (C&M)
 *   3  Physiological and Organismal Biology (P&O)
 *   4  Ecological and Evolutionary Biology (E&E)
 *   5  Computational Biology (CB)
 *
 * Specializations 1-4 share a spine: the same introductory sequence, the same
 * five upper-level lectures, the same three upper-level labs, the same senior
 * capstone, and the same chemistry requirement — 51.5 points. They differ only
 * in WHICH categories those five lectures are drawn from, which is a
 * distribution rule over lists the department publishes but our course records
 * do not carry.
 *
 * So this file encodes the shared spine of specializations 1-4, with the
 * category distribution `attested`. The alternative — four near-identical
 * programs differing in one `attested` group — would put four Biology majors
 * in the picker and make a student choose between them before she has taken a
 * course.
 *
 * **Computational Biology students: two groups here are wrong for you.** CB is
 * 41 points, not 51.5. It needs ONE upper-level lab rather than three, and it
 * replaces the chemistry requirement entirely with an introductory computing
 * course plus an introductory statistics course. Both affected groups say so
 * in their notes. CB was not given its own program for the same reason as
 * above; if it turns out students want it, it is a clean copy of this file
 * with two groups swapped.
 *
 * ── The introductory sequence includes its discussion sections ─────────────
 *
 * "Every biology major must complete ALL of the following introductory biology
 * and genetics courses" — and the list names the discussion and recitation
 * sections as separate rows, each marked as a co-requisite of its parent:
 *
 *   BIOL BC1500 + BIOL BC1510 (discussion)      Organismal & Evolutionary
 *   BIOL BC1501 + BIOL BC1511 (recitation)      ... and its lab
 *   BIOL BC1502 + BIOL BC1512 (discussion)      Cell & Molecular
 *   BIOL BC1503 + BIOL BC1513 (recitation)      ... and its lab
 *   BIOL BC2100                                  Genetics
 *
 * They are transcribed as required because the page requires them. A student
 * registers for a discussion section alongside its lecture, so in practice
 * these fail and recover together with their parents.
 *
 * ── The upper-level categories, and the "cannot fulfill breadth" footnote ──
 *
 * The three category lists (C&M, P&O, E&E) overlap on purpose — `BIOL BC2278`
 * Evolution is on both C&M and E&E, `BIOL BC3320` Microbiology on all three —
 * and the page says "although some courses are listed in multiple categories,
 * a student can only use a course toward one of the categories."
 *
 * That is a constraint on the ASSIGNMENT of courses to categories, not on any
 * course, and `lib/requirements/types.ts` says plainly that the rule language
 * cannot express it. Combined with the fact that the distribution differs per
 * specialization, it is the second reason the category rule is `attested`.
 *
 * Several rows additionally carry "(This course cannot fulfill the breadth
 * requirement.)" — the computational courses, mostly. Another assignment
 * constraint, and in the note.
 *
 * ── The senior capstone is a genuine sequence choice ──────────────────────
 *
 * One semester of `BIOL BC3590` Senior Seminar, OR the year-long
 * `BIOL BC3593` + `BIOL BC3594` Senior Thesis Research and Seminar, which "is
 * only available as a fall to spring sequence". Half the thesis satisfies
 * nothing, so `sequence_choice` rather than `n_of`.
 *
 * There is also an interaction the audit cannot see: a senior using Guided
 * Research & Seminar (BC3591 + BC3592) to fulfil two upper-level labs "cannot
 * take Senior Thesis Research and Seminar at the same time. Instead, they must
 * complete their senior capstone experience with BIOL BC3590." That is a rule
 * about which OTHER requirement a course was already spent on. In the note.
 *
 * ── General Chemistry's laboratory has no code on this page ────────────────
 *
 * The chemistry requirement is stated as "at least one semester of General
 * Chemistry (with laboratory) and at least one semester of Organic Chemistry
 * (with laboratory)", and then three codes are given: General Chemistry
 * lecture `CHEM BC2001`, Organic Chemistry lecture `CHEM BC3230` and lab
 * `CHEM BC3328`. The general chemistry LAB is required by the prose and named
 * nowhere. Only the three printed codes are transcribed; the missing lab is in
 * the note rather than guessed at.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 51.5-point minimum and its per-block credit breakdown. "Equivalent
 * courses at Columbia may be taken in lieu of the Barnard Chemistry courses"
 * and the equivalent permission for labs ("with permission from the Associate
 * Chair"). The Guided Research option counting for up to two upper-level labs.
 * The rule that a course used for lab credit "will not count toward the
 * elective requirement", and that non-CB students may count exactly one
 * CB-Comp course as a lab. The pre- and co-requisite chains between each lab
 * and its lecture. The major declaration form submitted via Slate.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/biological-sciences/";

export const BC_MAJOR_BIOLOGY: Program = {
  id: "bc-major-biology",
  kind: "major",
  school: "BC",
  name: "Biology",
  department: "Biological Sciences",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "introductory-sequence",
      label: "Introductory Biology & Genetics",
      note:
        "The full introductory sequence, discussion and recitation sections " +
        "included: Organismal & Evolutionary Biology (BC1500) with its " +
        "discussion (BC1510) and lab (BC1501) with its recitation (BC1511); " +
        "Cell & Molecular Biology (BC1502) with its discussion (BC1512) and lab " +
        "(BC1503) with its recitation (BC1513); and Genetics (BC2100). The " +
        "department recommends but does not require taking Genetics " +
        "immediately after the 1500-level sequence.",
      rule: {
        kind: "all_of",
        courses: [
          "BIOL BC1500",
          "BIOL BC1510",
          "BIOL BC1501",
          "BIOL BC1511",
          "BIOL BC1502",
          "BIOL BC1512",
          "BIOL BC1503",
          "BIOL BC1513",
          "BIOL BC2100",
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "upper-level-lectures",
      label: "Five upper-level lectures",
      note:
        "Five upper-level lecture courses. Which categories they must come " +
        "from depends on your specialization — General Biology needs at least " +
        "one from each of C&M, P&O and E&E; the three focused specializations " +
        "need four from their own category and one from another. See the " +
        "distribution requirement below.",
      rule: {
        kind: "n_matching",
        n: 5,
        select: {
          subjects: ["BIOL", "CHEM", "EEEB"],
          numberRange: [2200, 4999],
          excludeGroups: [
            "introductory-sequence",
            "upper-level-labs",
            "senior-capstone",
            "chemistry",
          ],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "lecture-distribution",
      label: "Upper-level category distribution",
      note:
        "General Biology: at least one lecture from each of Cellular & " +
        "Molecular, Physiology & Organismal, and Ecology & Evolutionary. C&M, " +
        "P&O or E&E: four from your own category plus one from another. " +
        "Computational Biology: four CB-COMP plus one CB-BIOL. You certify " +
        "this because the department's category lists overlap deliberately and " +
        "a course may be used toward only ONE category — a rule about how your " +
        "courses are assigned, not about any course. Several rows are also " +
        'marked "cannot fulfill the breadth requirement".',
      rule: {
        kind: "attested",
        note:
          "My five upper-level lectures satisfy my specialization's category " +
          "distribution.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "upper-level-labs",
      label: "Three upper-level laboratories",
      note:
        "Three upper-level Barnard Biology labs — numbered above BIOL BC2100. " +
        "COMPUTATIONAL BIOLOGY students need only ONE, from a restricted list " +
        "(BC3303, BC3305, BC3311, BC3321, BC3361, BC3363). Two options this " +
        "cannot see: the year-long Guided Research & Seminar (BC3591 + BC3592) " +
        "may fulfil up to two of the three, and non-CB students may count " +
        "exactly one CB-Comp course as a lab — but then it cannot also count " +
        "as an elective.",
      rule: {
        kind: "n_matching",
        n: 3,
        select: {
          subjects: ["BIOL"],
          numberRange: [2101, 3999],
          excludeGroups: ["introductory-sequence", "senior-capstone"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-capstone",
      label: "Senior Capstone Experience",
      note:
        "One semester of BIOL BC3590 Senior Seminar, or the year-long Senior " +
        "Thesis Research and Seminar (BIOL BC3593 then BC3594), which is only " +
        "offered fall-to-spring. One interaction to watch: if you are using " +
        "Guided Research & Seminar to fulfil two upper-level labs you may NOT " +
        "take Senior Thesis at the same time — your capstone must then be " +
        "BIOL BC3590.",
      rule: {
        kind: "sequence_choice",
        sequences: [
          { label: "Senior Seminar", courses: ["BIOL BC3590"] },
          {
            label: "Senior Thesis Research and Seminar",
            courses: ["BIOL BC3593", "BIOL BC3594"],
          },
        ],
      },
      sourceUrl: SOURCE,
    },
    {
      id: "chemistry",
      label: "Chemistry",
      note:
        "One semester of General Chemistry with laboratory and one semester of " +
        "Organic Chemistry with laboratory. The page names three codes — " +
        "CHEM BC2001 (General Chemistry lecture, fall only), CHEM BC3230 " +
        "(Organic lecture) and CHEM BC3328 (Organic lab) — and does not name " +
        "the general chemistry laboratory, so it is not encoded here; check it " +
        "with your adviser. Equivalent Columbia courses may be substituted. " +
        "COMPUTATIONAL BIOLOGY students do NOT take this at all: they complete " +
        "one introductory computing course (COMS W1004, COMS BC1016 or " +
        "ENGI E1006) and one introductory statistics course (STAT UN1010, " +
        "UN1101, UN1201, UN2102, NSBV BC2002 or EEEB UN3005) instead.",
      rule: {
        kind: "all_of",
        courses: ["CHEM BC2001", "CHEM BC3230", "CHEM BC3328"],
      },
      sourceUrl: SOURCE,
    },
  ],
};
