/**
 * The Barnard College major in English.
 *
 * Transcribed by hand from the Requirements tab of
 * https://catalog.barnard.edu/barnard-college/courses-instruction/english/
 * (2025-2026 edition), read on 2026-08-30.
 *
 * ── The base major, not its four concentrations ────────────────────────────
 *
 * The page publishes five programmes: the major, and concentrations in
 * American Literature (10 courses), Creative Writing (11, by application with
 * a 15-20 page portfolio), Film Studies (11) and Theatre (11). This file is
 * the base major — "at least ten courses that are a minimum of 35 credits in
 * total."
 *
 * The concentrations are not encoded. Each replaces two or three groups of the
 * base major with named alternatives, and Creative Writing's turn on ranges of
 * course codes the catalogue prints as prose — "ENGL BC3105 through ENGL
 * BC3113" for introductory writing, "ENGL BC3114 through ENGL BC3118" for
 * advanced — where several numbers in the range have no course. Encoding a
 * range as an `include` list means asserting courses exist that may not.
 *
 * ── Why five of the six groups are `attested`: English classifies by CONTENT ─
 *
 * This is the most `attested`-heavy program in this directory, and the reason
 * is worth stating because it is not laziness.
 *
 * Every other major here classifies courses by department, number band or
 * named list. English classifies them by what the literature IS:
 *
 *   "Two courses in literature written before 1900."
 *   "One of these courses must be a literature class."
 *   "A course in American literature."
 *   Colloquium substitutions must "cover literature before 1660 (i.e.
 *   Medieval or Renaissance)" or "literature of the 17th or 18th century".
 *
 * A course record holds a subject, a number, a title and a description. It
 * does not hold the century its texts were written in, and Barnard's ENGL
 * numbering does not encode period — the 108 `ENGL BC` rows in our catalog run
 * 1045 to 3999 with topic, not chronology, driving the number. There is no
 * flag for it. Nothing we could compute would be better than the student's own
 * reading of her transcript, and a wrong answer here is worse than no answer:
 * a senior told she had met the before-1900 requirement, who had not, does not
 * graduate.
 *
 * ── What IS checkable, and it is the spine of the major ───────────────────
 *
 *   ENGL BC3193  Critical Writing        — named, required, exact.
 *   ENGL BC3997  Senior Seminar in English   } two of these
 *   ENGL BC3998  Senior Seminar in English   } — verified in our catalog
 *   ENGL BC3993  Senior Seminar in Film and Literature
 *   Three electives across the department's offering.
 *
 * ── The Colloquium, and why it is not a `sequence_choice` ─────────────────
 *
 * `ENGL BC3159` (fall, Renaissance) and `ENGL BC3160` (spring, Enlightenment),
 * taken in the junior year. Both exist in our catalog and an `all_of` over
 * them would be exact — and would be wrong for a substantial minority of
 * majors, because the footnote grants a substitution:
 *
 *   "Students may substitute three courses for the two semesters of
 *   Colloquium. At least one of these three must cover literature before 1660
 *   ...; one other must cover literature of the 17th or 18th century ...; the
 *   last can cover either. Students may also take one Colloquium and two
 *   substitutions ..."
 *
 * The substitute courses are identified by period, which is exactly what we
 * cannot see, and one of them additionally counts toward the before-1900
 * requirement — a double-count the rule language cannot express. A
 * `sequence_choice` naming only BC3159 + BC3160 would report every substituting
 * student as having failed her Colloquium requirement in her final year.
 *
 * So the group is `attested` and its note carries both course codes, both
 * routes, and the "only one Colloquium substitution may be a Shakespeare
 * course" restriction.
 *
 * ── NOT ENCODED ────────────────────────────────────────────────────────────
 *
 * The 35-point minimum. "Six of the ten must be taken at Barnard or Columbia"
 * — residency. The chair's approval for one foreign-language literature course
 * to count as an elective. The rarely-granted substitution of ENGL BC3999
 * Independent Study for a senior seminar. The exclusion of The English
 * Conference from the elective pool. That the American literature course "can
 * simultaneously fulfill other requirements (elective, before 1900, etc.)" —
 * an explicit double-count, which is why that group deliberately carries no
 * `excludeGroups`.
 */

import type { Program } from "../types";

const SOURCE =
  "https://catalog.barnard.edu/barnard-college/courses-instruction/english/";

export const BC_MAJOR_ENGLISH: Program = {
  id: "bc-major-english",
  kind: "major",
  school: "BC",
  name: "English",
  department: "English",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2025-2026",
  groups: [
    {
      id: "critical-writing",
      label: "Critical Writing",
      note: "ENGL BC3193, best taken in the sophomore year. 4 points.",
      rule: { kind: "all_of", courses: ["ENGL BC3193"] },
      sourceUrl: SOURCE,
    },
    {
      id: "colloquium",
      label: "The English Colloquium",
      note:
        "ENGL BC3159 (fall, Renaissance) and ENGL BC3160 (spring, " +
        "Enlightenment), taken in the junior year — OR three substitute " +
        "courses: at least one covering literature before 1660, one covering " +
        "the 17th or 18th century, and a third covering either. One Colloquium " +
        "plus two substitutions also works. Only one substitution may be a " +
        "Shakespeare course, and one of the substitutes also counts toward the " +
        "before-1900 requirement. You certify this because the substitutes are " +
        "identified by the period of the literature they cover, which no " +
        "course record holds.",
      rule: {
        kind: "attested",
        note:
          "I have completed the English Colloquium (ENGL BC3159 and " +
          "ENGL BC3160) or an approved substitution.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "before-1900",
      label: "Two courses in literature before 1900",
      note:
        "Two courses in literature written before 1900. If you substituted " +
        "courses for the Colloquium, one of those substitutions counts here. " +
        "Certified rather than checked: a course record carries no publication " +
        "period, and Barnard's ENGL numbering runs by topic, not chronology.",
      rule: {
        kind: "attested",
        note:
          "I have completed two courses in literature written before 1900.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "electives",
      label: "Three electives",
      note:
        "Three electives from across the department's offering, excluding The " +
        "English Conference. At least one must be a literature class — that " +
        "condition is yours to check, for the same reason as above. With the " +
        "chair's approval one course in the literature of a foreign language, " +
        "in translation or in the original, may count here.",
      rule: {
        kind: "n_matching",
        n: 3,
        select: {
          subjects: ["ENGL"],
          numberRange: [1000, 3999],
          excludeGroups: ["critical-writing", "senior-seminars"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-seminars",
      label: "Two senior seminars",
      note:
        "Two senior seminars given by the Barnard English Department — " +
        "ENGL BC3997 and ENGL BC3998 Senior Seminar in English, or ENGL BC3993 " +
        "Senior Seminar in Film and Literature. Substituting an independent " +
        "study (ENGL BC3999) is permitted only rarely and by the chair.",
      rule: {
        kind: "n_matching",
        n: 2,
        select: {
          include: ["ENGL BC3997", "ENGL BC3998", "ENGL BC3993"],
        },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "american-literature",
      label: "A course in American literature",
      note:
        "One course in American literature. This one is explicitly allowed to " +
        "double count — it \"can simultaneously fulfill other requirements " +
        "(elective, before 1900, etc.) where appropriate\" — which is why it " +
        "does not exclude any group above. The department's own American " +
        "literature survey sequence is ENGL BC3179, BC3180, BC3181 and BC3183, " +
        "but any American literature course counts.",
      rule: {
        kind: "attested",
        note: "I have completed a course in American literature.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
