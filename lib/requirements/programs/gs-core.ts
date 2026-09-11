/**
 * The School of General Studies Core Curriculum.
 *
 * Transcribed by hand from the 2026-2027 General Studies Bulletin, read on
 * 2026-08-31. GS publishes a compact checklist, then gives each requirement a
 * page of its own. Those pages matter because several requirements can be met
 * by transfer credit, placement, an exemption exam, or an advisor-approved
 * substitution. A course-only audit cannot see any of those routes.
 *
 * University Writing is the one fixed course. Global Core is checkable against
 * the approved-course flag already ingested by LionPlan. The remaining groups
 * are `attested`: the student confirms the requirement after checking the
 * linked GS page or their official audit. Encoding only the usual course would
 * incorrectly fail students who satisfied a legitimate alternate route.
 *
 * NOT ENCODED: the 2.0 GPA floor, letter-grade rules, transfer-credit limits,
 * the two-course major/Core overlap cap, the two-courses-per-department cap,
 * or the requirement to take at least one Core course each semester. Those
 * depend on the registrar's assignment of credit, not merely course identity.
 */

import type { Program } from "../types";

const SOURCE = "https://bulletin.columbia.edu/general-studies/the-core/";

export const GS_CORE: Program = {
  id: "gs-core",
  kind: "core",
  school: "GS",
  name: "The Core Curriculum",
  degreePoints: 124,
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "university-writing",
      label: "University Writing",
      note:
        "GS students fulfill the writing requirement with ENGL GS1010, " +
        "University Writing.",
      rule: { kind: "all_of", courses: ["ENGL GS1010"] },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/writing/",
    },
    {
      id: "literature",
      label: "Literature",
      note:
        "One approved literature course taken at Columbia. The Lit Hum " +
        "sequence can satisfy this together with the Humanities requirement; " +
        "transfer and petition outcomes are visible only in the official audit.",
      rule: {
        kind: "attested",
        note:
          "I completed the GS Literature requirement with an approved course, " +
          "transfer equivalency, or petition.",
      },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/literature-humanities/",
    },
    {
      id: "humanities",
      label: "Humanities",
      note:
        "One approved humanities course. HUMA GS1001 and HUMA GS1002 together " +
        "can satisfy both the Literature and Humanities requirements; other " +
        "approved routes are evaluated by GS.",
      rule: {
        kind: "attested",
        note:
          "I completed the GS Humanities requirement with an approved course, " +
          "transfer equivalency, or petition.",
      },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/literature-humanities/",
    },
    {
      id: "foreign-language",
      label: "Foreign Language",
      note:
        "Proficiency through Intermediate II in one language. Placement exams, " +
        "approved test scores, transfer credit, and coursework can all satisfy it.",
      rule: {
        kind: "attested",
        note:
          "I have demonstrated foreign-language proficiency through the " +
          "Intermediate II level by an approved GS route.",
      },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/foreign-language/",
    },
    {
      id: "art-humanities",
      label: "Art Humanities",
      note:
        "Usually completed with HUMA UN1121, AHUM UN2604, AHUM UN2800, or " +
        "AHUM UN2901. GS also permits an approved exemption or substitution, " +
        "which LionPlan cannot infer from a transcript course code.",
      rule: {
        kind: "attested",
        note:
          "I completed or received an approved exemption from the GS Art " +
          "Humanities requirement.",
      },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/art-humanities/",
    },
    {
      id: "music-humanities",
      label: "Music Humanities",
      note:
        "Usually completed with HUMA UN1123, AHMM UN3320, or AHMM UN3321. " +
        "The Bulletin also permits an exemption exam or approved substitution.",
      rule: {
        kind: "attested",
        note:
          "I completed or received an approved exemption from the GS Music " +
          "Humanities requirement.",
      },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/music-humanities/",
    },
    {
      id: "global-core",
      label: "Global Core",
      note:
        "Two courses from the approved Global Core list. The list changes by " +
        "term, so LionPlan marks this as list-verified rather than exact.",
      rule: { kind: "n_matching", n: 2, select: { flag: "globalCore" } },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/global-core/",
    },
    {
      id: "social-science",
      label: "Contemporary Civilization / Social Science",
      note:
        "Two approved social-science courses, or the two-term Contemporary " +
        "Civilization sequence. Transfer and petition decisions require the " +
        "official GS audit.",
      rule: {
        kind: "attested",
        note:
          "I completed both GS Social Science courses or the approved " +
          "Contemporary Civilization sequence.",
      },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/contemporary-civilization-social-science/",
    },
    {
      id: "quantitative-reasoning",
      label: "Quantitative Reasoning",
      note:
        "An approved course, placement exam, standardized-test score, or " +
        "transfer equivalency can satisfy this requirement.",
      rule: {
        kind: "attested",
        note:
          "I completed the GS Quantitative Reasoning requirement through an " +
          "approved course, exam, score, or transfer equivalency.",
      },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/quantitative-reasoning/",
    },
    {
      id: "science",
      label: "Science",
      note:
        "Three approved science courses. The GS list and its lab or sequence " +
        "conditions are not identical to the Columbia College Science " +
        "Requirement list currently ingested by LionPlan.",
      rule: {
        kind: "attested",
        note:
          "I completed three courses that GS approved for the Science " +
          "requirement.",
      },
      sourceUrl:
        "https://bulletin.columbia.edu/general-studies/the-core/science/",
    },
  ],
};
