/**
 * The Columbia College major in English.
 *
 * Transcribed by hand from "Major in English (for students who matriculated in
 * 2024-5 and after)" on the Requirements tab of
 * https://bulletin.columbia.edu/columbia-college/departments-instruction/english-comparative-literature/
 * (2026–2027 edition). The department slug is `english-comparative-literature`;
 * `english` 404s.
 *
 * ── There are two English majors on this page and this is the newer one ─────
 *
 * The Bulletin prints "Major in English (for students who matriculated in
 * 2023-4 and prior)" immediately above this one. The two differ in real ways —
 * the older one accepts `ENGL UN3001`/`ENGL UN3011` as the introductory course
 * and asks for three pre-1800 courses; the newer one requires `ENGL UN2000`,
 * splits the period requirement into pre-1700 / 1700-1900 / 1900-present, and
 * adds an ethnicity-and-race course and a capstone. Only the current one is
 * encoded, because a program object carries no matriculation year and offering
 * both under one id would be worse than offering one.
 *
 * ── The distribution requirements are designations, not codes ───────────────
 *
 * Every distribution row is a *designation* the department assigns per course
 * per term:
 *
 *   "one course focused on each of the following genres: poetry, prose,
 *    drama/film/media"
 *   "Designations of distribution requirements can be found on the
 *    department's course listings site."
 *
 * Not in the Bulletin — on a separate departmental site, per term, and a single
 * course carries several at once ("Shakespeare I, for example, would cover
 * British/Irish, drama, and one pre-1700"). Nothing in a course code says
 * whether a course is "focused on prose", and the registrar's
 * `requirement_flags` do not carry English distribution designations. All seven
 * distribution rows are therefore `attested`, one group each so the UI shows
 * the Bulletin's own structure rather than one undifferentiated blob.
 *
 * ── Re-read against the live Bulletin on 2026-08-24 ─────────────────────────
 *
 * Row by row against the page's own list, both tabs. Every requirement the
 * Bulletin states for the 2024-5-and-after major has a group here: the ten
 * courses, the introductory course, three genres, three geographies, ethnicity
 * and race, two pre-1700, one 1700-1900, one 1900-present, and the capstone.
 * Nothing was missing. Two things changed anyway:
 *
 * 1. **The ten-course selector gained a `numberRange` of 1000–4999.** It was
 *    subject-only, and the subjects it names reach further than the major
 *    does: our catalog carries `CLEN 6475`, `CLEN 6511` and a dozen more
 *    graduate seminars under `CLEN`, and `ENGL 850` under the School of
 *    Professional Studies. None of those is a course this major counts, and
 *    each of them was counting. The Bulletin's own Course Numbering Structure
 *    section describes the major's courses as 1000-, 2000-, 3000- and
 *    4000-level, and Barnard's `ENGL BC` courses sit inside that band too, so
 *    the range costs a student nothing and removes an over-count.
 *
 * 2. The capstone note now names both halves of the Senior Essay programme.
 *
 * Every course code this file names resolves against the catalog.
 *
 * ── Two judgement calls, both recorded ──────────────────────────────────────
 *
 * 1. **The introductory course is encoded as `ENGL UN2000` alone.** The
 *    Bulletin writes it "ENGL 2000/2001", and `ENGL UN2001` is real — it is the
 *    0-point recitation-style seminar section that co-registration requires.
 *    Requiring both would report the requirement unmet for any student whose
 *    record carries only the graded lecture, which is most of the ways a record
 *    reaches us. The co-requisite is named in the note instead. This is the
 *    same call made for `APMA E2001` and `ECON UN1155` on the SEAS programs.
 *
 * 2. **The capstone is `attested`.** It is "either a Senior Essay or an
 *    advanced (4000-level) seminar". The Senior Essay is nameable
 *    (`ENGL UN3999`), but "advanced 4000-level seminar" is not: the ENGL GU4xxx
 *    band contains lecture courses too, so a level selector would mark the
 *    capstone satisfied by a course that is not a seminar. Over-accepting a
 *    graduation requirement is the failure worth avoiding.
 *
 * NOT ENCODED: the C- minimum and letter-grade rule, the single P/D/F
 * allowance, the "only one of the pre-1700 courses can be a Shakespeare
 * course" cap, the two-Barnard-course allowance, the two-related-non-English-
 * course allowance, the transfer limits, and the prohibition on counting Lit
 * Hum / CC / UW / Art Hum / Music Hum. Every one needs grades, provenance, or a
 * cross-course constraint the rule language has no way to state.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/english-comparative-literature/#requirementstextcontainer";

export const CC_MAJOR_ENGLISH: Program = {
  id: "cc-major-english",
  kind: "major",
  school: "CC",
  name: "English",
  department: "English and Comparative Literature",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "introductory-course",
      label: "The Introductory Course",
      note: "Approaches to Literary Study. Registering for ENGL UN2000 also requires registering for a section of the 0-point seminar ENGL UN2001; only the lecture is matched here. This is the one course in the major that may not be taken Pass/D/Fail.",
      rule: { kind: "all_of", courses: ["ENGL UN2000"] },
      sourceUrl: SOURCE,
    },
    {
      id: "ten-courses",
      /*
       * Cumulative by design, and allowlisted as such in `vacuity.test.ts`:
       * the Bulletin reads "At least 10 courses in English and Comparative
       * Literature ... including: The Introductory Course", so ENGL UN2000 is
       * the first of the ten rather than an eleventh course beside them.
       *
       * `numberRange` added 2026-08-24. Subject alone let the department's
       * graduate CLEN seminars (CLEN 6475, CLEN 6511, and others in the 6000s)
       * and the School of Professional Studies' ENGL 850 count toward an
       * undergraduate major that does not accept any of them. The Bulletin
       * describes the major's courses as 1000- through 4000-level and Barnard's
       * ENGL BC numbering falls inside that, so nothing a student can legitimately
       * count is lost.
       */
      label: "Ten courses in English and Comparative Literature",
      note: "At least ten, for a letter grade, each passed with a C- or higher. Only ENGL and CLEN courses can fulfil the distribution requirements; up to two related courses from other Columbia departments may count toward the ten with the director of undergraduate studies' approval, and are not matched here. Neither are Lit Hum, CC, University Writing, Art Hum or Music Hum, which the department excludes outright.",
      rule: {
        kind: "n_matching",
        n: 10,
        select: { subjects: ["ENGL", "CLEN"], numberRange: [1000, 4999] },
      },
      sourceUrl: SOURCE,
    },
    {
      id: "distribution-genres",
      label: "Distribution — genres",
      /*
       * Attested, along with every distribution group below it. See the
       * header: these are per-term designations published on the department's
       * own course-listings site, not anything a course code or a registrar
       * flag carries.
       */
      rule: {
        kind: "attested",
        note: "Three courses: one focused on poetry, one on prose, one on drama/film/media. The designations are published on the department's course listings site.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "distribution-geographies",
      label: "Distribution — geographies",
      rule: {
        kind: "attested",
        note: "Three courses: one focused on British/Irish, one on American, one on Global/Comparative literature. A single course can carry more than one designation.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "distribution-ethnicity-race",
      label: "Distribution — ethnicity and race",
      rule: {
        kind: "attested",
        note: "One course focused on the study of ethnicity and race.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "distribution-pre-1700",
      label: "Distribution — pre-1700",
      rule: {
        kind: "attested",
        note: "Two courses focused on literature before 1700, only one of which may be a Shakespeare course.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "distribution-1700-1900",
      label: "Distribution — 1700 to 1900",
      rule: {
        kind: "attested",
        note: "One course focused on literature between 1700 and 1900.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "distribution-1900-present",
      label: "Distribution — 1900 to present",
      rule: {
        kind: "attested",
        note: "One course focused on literature from 1900 to the present.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "capstone",
      label: "Capstone",
      rule: {
        kind: "attested",
        note: "Either the Senior Essay or an advanced 4000-level seminar. The Senior Essay programme runs fall and spring — ENGL UN3795 Senior Essay Research Methods and ENGL UN3999 The Senior Essay — and counts as one of the ten; it can satisfy the capstone and nothing else. The 4000-level ENGL band also holds lecture courses, so there is no level rule that picks out only the seminars.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
