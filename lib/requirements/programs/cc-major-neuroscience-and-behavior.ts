/**
 * The Columbia College major in Neuroscience and Behavior.
 *
 * Transcribed by hand on 2026-08-26 from TWO Bulletin pages (2026–2027 edition),
 * neither of which is complete on its own:
 *
 *   Biology half — .../departments-instruction/biological-sciences/
 *   Psychology half — .../departments-instruction/psychology/
 *
 * ── One program, two departments, one file ─────────────────────────────────
 *
 * This is the first program here administered by two departments, and the
 * decision is deliberate rather than accidental: all ten groups live on this
 * one file.
 *
 * The alternative — a biology file and a psychology file, or delegating the
 * biology half to `cc-major-biology` — is exactly the seam that has already
 * failed once in this codebase. `seas-core` delegated mathematics, science and
 * computing to the departments, `seas-major-computer-science` never picked its
 * share up, and a student was shown a CS degree with no physics in it. A
 * student declaring Neuroscience and Behavior declares ONE program and does not
 * care which department a requirement came from.
 *
 * Both pages delegate outward, and both delegations are picked up here: the
 * Biological Sciences page says "for the five courses required in Psychology,
 * see the Psychology section in this Bulletin", and the Psychology page says
 * "for the definitive list of biology requirements, see the Department of
 * Biological Sciences website".
 *
 * `Program.department` is a single string, so it carries both names rather than
 * picking a winner. Provenance is preserved the right way instead:
 * `RequirementGroup.sourceUrl` is per-group, so the biology groups point at the
 * Biological Sciences page and the psychology groups at the Psychology page —
 * which is what per-group `sourceUrl` exists for.
 *
 * ── Where the two pages disagree ───────────────────────────────────────────
 *
 * SIX BIOLOGY COURSES, NOT SEVEN. The Psychology page's transfer-guidance
 * paragraph reads "eleven courses are required … seven from the Department of
 * Biological Sciences and five from the Department of Psychology". 7 + 5 = 12,
 * which contradicts "eleven courses" in the same sentence. The enumerated
 * biology list has exactly six rows on both pages; the Biological Sciences page
 * says six; the GS bulletin's dedicated N&B page says six; the department's own
 * checklist has six biology rows. The "seven" appears once and nowhere else.
 *
 * WHICH BIOLOGY ELECTIVES. Biological Sciences says "from the list of Upper
 * Level Electives under the Biology Major" — a list the Bulletin actually
 * publishes. Psychology says "from a list approved by the biology adviser to the
 * program" — which points at nothing checkable. The department that owns biology
 * requirements wins.
 *
 * The eleven reconcile: 2 intro biology + 2 neurobiology + 2 biology electives =
 * 6, plus P1 through P5 = 5. General chemistry sits OUTSIDE the eleven — "in
 * addition to one year of college general chemistry, eleven courses are
 * required" — which is why it is a group but not one of them.
 *
 * ── The one line that matters most ─────────────────────────────────────────
 *
 * `excludeGroups: ["neurobiology"]` on the biology electives. `BIOL UN3004` and
 * `BIOL UN3005` are BOTH on the Biology major's Upper-Level Elective list —
 * they are its first two rows. Written as `n_of { n: 2 }` over that list, every
 * N&B student who has finished the required neurobiology year is scored 2 of 2
 * on an elective requirement they have not started, and graduates two courses
 * short. That is byte for byte the bug `cc-major-biology`'s own
 * `upper-level-electives` group was fixed for on 2026-08-24.
 *
 * `excludeGroups` lives on `CourseSelector` and `n_of` has no selector, which is
 * why the rule kind is `n_matching` and the tier drops to `flagged`.
 * `introductory-biology` needs no exclusion: `BIOL UN2005`/`UN2006` are not on
 * the elective list.
 *
 * The list itself is IMPORTED from `cc-major-biology`, not re-typed. Two literal
 * copies of one Bulletin table drift apart, and only one of them gets fixed.
 *
 * ── Three psychology groups that must NOT be copied from cc-major-psychology ─
 *
 * P3 STATISTICS. `cc-major-psychology`'s `statistics` group offers five courses
 * including `STAT UN1001`. This major's list is ten courses — it merges
 * statistics and research methods into one slot and adds `PSYC UN1920` and
 * `PSYC UN1950`, which are on no psychology-major list — and the Bulletin says
 * in so many words that "STAT UN1001 does not count towards the Neuroscience &
 * Behavior major". Copying the psychology group here produces a rule that
 * passes a student who has not met the requirement.
 *
 * P1 SCIENCE OF PSYCHOLOGY. For the plain Psychology major the Bulletin directs
 * transfer students to "enroll in PSYC UN1001 or PSYC BC1001". For this major
 * the corresponding paragraph says a maximum of ONE psychology course from
 * another institution, "including Barnard", may be applied, and requires an
 * approved Major Requirement Substitution Form. Counting `PSYC BC1001`
 * automatically would green-light a route that needs a petition and silently
 * spend the student's single Barnard slot. `PSYC UN1021` IS included, on the
 * Bulletin's own sentence that it "is an alternative version of PSYC UN1001 and
 * fulfills the same requirements".
 *
 * P5 SEMINAR. `cc-major-psychology`'s seminar group is described by number band
 * and is attested for that reason. This is a DIFFERENT requirement: a curated,
 * neuroscience-focused subset published off-Bulletin with a written-exception
 * process. Reusing the psychology note would tell an N&B student that any 3600s
 * social-psychology seminar qualifies. It does not.
 *
 * ── Why three groups are attested ──────────────────────────────────────────
 *
 * GENERAL CHEMISTRY names no course codes at all — it is one sentence of prose,
 * and the department's checklist writes the row as "General Chemistry: (or
 * high-school equivalent)". That equivalent leaves nothing on a transcript, and
 * `all_of ["CHEM UN1403", "CHEM UN1404"]` would also miss the intensive route
 * the Biology major's own chemistry section accepts.
 *
 * P4 and P5 both draw on approved lists published only on the Psychology
 * Department's website, revised per year, and the Bulletin warns in its own
 * emphasis that "courses not listed here will not count towards the P4
 * requirement". A `{ subjects: ["PSYC"], numberRange: [2000, 3999] }` selector
 * would sweep in the department's seminars, the 2.5-point Barnard laboratory
 * sections, the supervised-research and honors courses, and the P2 course the
 * student already used — with an explicit Bulletin sentence forbidding it.
 * There is nothing to transcribe and nothing that would stay true.
 *
 * ── Not encoded ───────────────────────────────────────────────────────────
 *
 * The C-minus grade floor and the bar on Pass; "no course may be counted twice
 * in fulfillment of the biology or psychology requirements", which is a
 * statement about the ASSIGNMENT of courses to groups rather than about any
 * course — `excludeGroups` implements the one case where it bites mechanically
 * and the general rule cannot be stated; the Fall-2024 cohort split on the
 * elective count, which is keyed on matriculation term and which `Program` has
 * no dimension for (n: 2 is the current cohort, the earlier one is in the note);
 * the cross-major exclusivity rules ("students may not double-major in both
 * Psychology and Neuroscience & Behavior"), which reach across a student's set
 * of programs; the two-course double-count cap with other majors and the
 * biochemistry bar, which `crossCountedCourseIds` reports rather than resolves;
 * the residency rule ("at least 4 biology or biochemistry courses and at least
 * 18 credits … must be taken at Columbia"), which needs the school qualifier
 * `CourseSelector` has no field for — it is stated as a departmental blanket
 * rule rather than as a row of this major, so unlike
 * `cc-major-psychology`'s `columbia-department-residency` it is not given a
 * group here; the one-course Barnard/transfer cap and its in-person condition;
 * strict prerequisite enforcement and the repeat limits; and honors, which runs
 * through the STAR thesis program or through Biological Sciences.
 *
 * Deliberately NOT encoded although it looks like a requirement: "many graduate
 * programs in neuroscience also require one year of calculus, one year of
 * physics, and chemistry through organic". That is advice. A student shown a red
 * calculus requirement on this major would take a course they do not owe.
 *
 * NOT IN OUR CATALOG, and kept anyway — nine codes, each printed by the Bulletin
 * with a description or a point value: `PSYC UN1021`, `PSYC UN2470`,
 * `PSYC UN1490`, `PSYC UN1660`, `PSYC UN1920` among the named courses, and
 * `BIOL UN3560`, `BIOL GU4002`, `BIOL GU4035`, `BIOL GU4193`, `BIOL GU4600` on
 * the imported elective list.
 *
 * OPEN, and deliberately not encoded: whether `BIOL UN2401`/`UN2402`
 * (Contemporary Biology I/II) satisfies the introductory-biology year. The
 * department's repeat-limit paragraph and dozens of its prerequisite lines treat
 * "(BIOL UN2005 and BIOL UN2006) or (BIOL UN2401 and BIOL UN2402)" as
 * equivalent, but the N&B requirement text names only UN2005/UN2006 and the
 * Biology major says other sequences need advance permission. If the answer is
 * yes, this group becomes a `sequence_choice` with two alternatives. It affects
 * every premedical student who took Contemporary Biology.
 */

import type { Program } from "../types";

import { BIOLOGY_UPPER_LEVEL_ELECTIVES } from "./cc-major-biology";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/biological-sciences/#requirementstextcontainer";

const PSYCHOLOGY_SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/psychology/#requirementstextcontainer";

export const CC_MAJOR_NEUROSCIENCE_AND_BEHAVIOR: Program = {
  id: "cc-major-neuroscience-and-behavior",
  kind: "major",
  school: "CC",
  name: "Neuroscience and Behavior",
  department: "Biological Sciences and Psychology",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "general-chemistry",
      label: "General Chemistry",
      rule: {
        kind: "attested",
        note: "One year of college general chemistry, finished before Introductory Biology. The Bulletin names no course codes here; the department's checklist gives General Chemistry I and II (CHEM UN1403-CHEM UN1404) as the usual route and accepts a high-school equivalent, which leaves nothing on your record — so this one is yours to confirm. This year of chemistry is in addition to the eleven courses of the major, not one of them.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "introductory-biology",
      label: "Introductory Biology",
      note: "The full year, both terms. One year of general chemistry is a prerequisite. Each course carries a 0-point companion section (BIOL UN2015, BIOL UN2016) that is not matched here.",
      rule: { kind: "all_of", courses: ["BIOL UN2005", "BIOL UN2006"] },
      sourceUrl: SOURCE,
    },
    {
      id: "neurobiology",
      label: "Neurobiology",
      note: "Both terms. These are the two courses that make this a neuroscience degree rather than a biology one, and they are also on the Biology major's upper-level elective list — which is why they cannot be reused as your two biology electives below. 0-point recitations (BIOL UN3014, BIOL UN3015, BIOL UN3016) go with them and are not matched here.",
      rule: { kind: "all_of", courses: ["BIOL UN3004", "BIOL UN3005"] },
      sourceUrl: SOURCE,
    },
    {
      id: "biology-electives",
      label: "Biology Electives",
      /*
       * The `excludeGroups` line the header calls the most important one in
       * this file. Without it every student who finished the required
       * neurobiology year reads 2 of 2 here having taken no elective at all.
       */
      note: "Two more 3000- or 4000-level biology lecture courses, drawn from the Biology major's upper-level elective list. Neurobiology I and II are on that list but are already required above, so they cannot also count here. Students who entered Columbia before Fall 2024 need only one — this audit counts two, which is the current rule. Five of the courses on the list have no row in our catalog and will not match automatically. Anything not on the list needs a biology adviser's written approval in advance.",
      rule: {
        kind: "n_matching",
        n: 2,
        select: {
          excludeGroups: ["neurobiology"],
          include: BIOLOGY_UPPER_LEVEL_ELECTIVES,
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "psychology-introduction",
      label: "The Science of Psychology",
      note: "One of the two. PSYC UN1021 is the Bulletin's own alternative version of PSYC UN1001 and fulfils the same requirement. A 5 on the AP Psychology exam or a 7 on the Higher Level IB exam also satisfies this, but does not count as one of the eleven courses — you will need an extra course and this group will read unmet. PSYC BC1001 can be used only as your one permitted Barnard psychology course and only with an approved Major Requirement Substitution Form, so it is not matched here.",
      rule: { kind: "n_of", n: 1, courses: ["PSYC UN1001", "PSYC UN1021"] },
      sourceUrl: PSYCHOLOGY_SOURCE,
    },
    {
      id: "neuroscience-lecture",
      label: "Introduction to Neuroscience",
      note: "One of the three. PSYC UN2470 is on the Bulletin but has no row in our catalog, so it will not match automatically. Whichever one you use here cannot also be your psychology lecture course below.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: ["PSYC UN2430", "PSYC UN2450", "PSYC UN2470"],
      },
      sourceUrl: PSYCHOLOGY_SOURCE,
    },
    {
      id: "statistics-or-research-methods",
      label: "Statistics or Research Methods",
      /*
       * Ten courses, not the psychology major's five, and STAT UN1001 is
       * absent on the Bulletin's own instruction. See the header.
       */
      note: "One course, statistics or research methods. STAT UN1001 is explicitly excluded from this major even though it counts for the Psychology major. A statistics course taken anywhere other than Columbia or Barnard cannot count, and AP Statistics never does; if you have taken statistics elsewhere the department asks you to use an intermediate or advanced Columbia course, or a PSYC 1400-level research methods course. PSYC UN1490, PSYC UN1660 and PSYC UN1920 are on the Bulletin but have no row in our catalog, so they will not match automatically.",
      rule: {
        kind: "n_of",
        n: 1,
        courses: [
          "PSYC UN1420",
          "PSYC UN1450",
          "PSYC UN1455",
          "PSYC UN1490",
          "PSYC UN1610",
          "PSYC UN1660",
          "PSYC UN1920",
          "PSYC UN1950",
          "STAT UN1101",
          "STAT UN1201",
        ],
      },
      sourceUrl: PSYCHOLOGY_SOURCE,
    },
    {
      id: "psychology-lecture",
      label: "Psychology Lecture Course",
      rule: {
        kind: "attested",
        note: "One more psychology lecture course at the 2000 or 3000 level, from the department's approved list. That list is published on the Psychology Department's Neuroscience & Behavior page rather than in the Bulletin, and the Bulletin warns that a course not on it will not count — so this one is yours to confirm. It must be a different course from the one you used for the neuroscience lecture.",
      },
      sourceUrl: PSYCHOLOGY_SOURCE,
    },
    {
      id: "psychology-seminar",
      label: "Advanced Psychology Seminar",
      rule: {
        kind: "attested",
        note: "One advanced psychology seminar from the department's approved list, published on the Psychology Department's Neuroscience & Behavior page rather than in the Bulletin. A seminar not on the list needs your psychology adviser's permission before you enrol, and your final paper has to be on a neuroscience topic. This one is yours to confirm.",
      },
      sourceUrl: PSYCHOLOGY_SOURCE,
    },
    {
      id: "major-requirement-checklist",
      label: "Major Requirement Checklist",
      rule: {
        kind: "attested",
        note: "Submit a Major Requirement Checklist to the Psychology Department before the start of your final semester — the Bulletin makes it the minimum for graduation eligibility to be certified. Have the biology half reviewed by your adviser in Biological Sciences as well: this major is signed off by two departments and the checklist only covers one of them.",
      },
      sourceUrl: PSYCHOLOGY_SOURCE,
    },
  ],
};
