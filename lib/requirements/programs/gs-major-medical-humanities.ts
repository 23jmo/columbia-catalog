/**
 * The School of General Studies major in Medical Humanities.
 *
 * Transcribed by hand from the 2026-2027 GS Bulletin, read on 2026-08-31.
 * The major requires at least 33 points across eleven courses. Only two slots
 * name one fixed course: CPLS UN3900 and CPLS UN3991. Every other block is
 * approved by the program director or depends on facts the public catalog does
 * not carry, so those blocks are deliberately `attested` rather than guessed.
 *
 * The optional thesis, CPLS UN3995, is not a requirement and is not encoded.
 * It is required only for departmental honors. The 3000-level expectation,
 * Columbia residency preference, limits on Barnard coursework, application
 * timing, and the DUS approval requirement are preserved in notes below.
 */

import type { Program } from "../types";

const SOURCE =
  "https://bulletin.columbia.edu/general-studies/majors-concentrations/medical-humanities/";

export const GS_MAJOR_MEDICAL_HUMANITIES: Program = {
  id: "gs-major-medical-humanities",
  kind: "major",
  school: "GS",
  name: "Medical Humanities",
  department: "Institute for Comparative Literature and Society",
  sourceUrl: SOURCE,
  origin: "authored",
  edition: "2026-2027",
  groups: [
    {
      id: "introduction",
      label: "Introduction to Comparative Literature and Society",
      note: "The required three-point introduction: CPLS UN3900.",
      rule: { kind: "all_of", courses: ["CPLS UN3900"] },
      sourceUrl: SOURCE,
    },
    {
      id: "comparative-literature",
      label: "Comparative Literature and Society course",
      note:
        "One three- or four-point CPLS course or course carrying the CL " +
        "identifier. Cross-listing and director approval cannot be inferred " +
        "reliably from the catalog subject code alone.",
      rule: {
        kind: "attested",
        note:
          "I completed one director-approved CPLS or CL-identified course for " +
          "the major.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "advanced-language-prerequisite",
      label: "Advanced foreign-language prerequisite",
      note:
        "Before applying, students must have completed advanced foreign-language " +
        "study. Placement, transfer work, and language level require program review.",
      rule: {
        kind: "attested",
        note:
          "I met the program's advanced foreign-language prerequisite before " +
          "applying to the major.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "language-readings",
      label: "Course with non-English readings",
      note:
        "One three- or four-point course with substantial readings in a " +
        "language other than English, approved as part of the major plan.",
      rule: {
        kind: "attested",
        note:
          "I completed one approved course with readings in a language other " +
          "than English.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "disciplinary-nexus",
      label: "Disciplinary or methodological nexus",
      note:
        "Three courses, totaling 9-12 points, forming an individualized nexus " +
        "around health, society, and the humanities. The DUS approves the set " +
        "as a whole, so a subject or keyword filter would be misleading.",
      rule: {
        kind: "attested",
        note:
          "The DUS approved my three-course disciplinary or methodological " +
          "nexus for Medical Humanities.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "medical-humanities-core",
      label: "Medical Humanities core",
      note:
        "Two courses, totaling six points, taught by faculty on the Medical " +
        "Humanities advisory board and emphasizing Medical Humanities. " +
        "Students must confirm the choices with the program director.",
      rule: {
        kind: "attested",
        note:
          "The program director confirmed my two Medical Humanities core " +
          "courses.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "human-biology",
      label: "Human biology or biochemistry",
      note:
        "Two biology or biochemistry courses, totaling 6-8 points, related to " +
        "fundamental human biology. Not every BIOL or CHEM course qualifies, " +
        "so this remains director-confirmed.",
      rule: {
        kind: "attested",
        note:
          "The program director confirmed my two human-biology or biochemistry " +
          "courses.",
      },
      sourceUrl: SOURCE,
    },
    {
      id: "senior-seminar",
      label: "Senior Seminar at ICLS",
      note: "The required three-point senior seminar: CPLS UN3991.",
      rule: { kind: "all_of", courses: ["CPLS UN3991"] },
      sourceUrl: SOURCE,
    },
    {
      id: "program-approval",
      label: "Program application and course-plan approval",
      note:
        "Students apply at the beginning of the spring term of sophomore year " +
        "with a transcript and one-page statement. The DUS must approve the " +
        "specific course of study; courses are normally 3000-level or above.",
      rule: {
        kind: "attested",
        note:
          "I was admitted to Medical Humanities and the DUS approved my " +
          "specific course of study.",
      },
      sourceUrl: SOURCE,
    },
  ],
};
