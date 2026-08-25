/**
 * Typical-year coursework, used only as GUESS evidence.
 *
 * The maybe-strip answers "what has this student already taken", not "what
 * should they take next". Requirement tables name a lot of future 3000-level
 * core, and open-ended groups expand into every Global Core / PE section in
 * the catalog. Neither is a first-year schedule. This module is the prior
 * that puts Calc I, Intro to CS, and Lit Hum on the strip before those.
 *
 * Nothing here is pre-checked. Typical evidence is "usually", which is a
 * glance on an unchecked chip, not a claim we write onto a transcript.
 */

import { levelOf, toCourseId, type CourseId } from "@/lib/requirements/code";
import type { Program, School } from "@/lib/requirements/types";

/** One cluster of courses a student this far along has usually met. */
export interface TypicalBand {
  /**
   * Offer once `yearsCompleted` is at least this. 0 = a first-year may
   * already have started it (Lit Hum I, University Writing, Calc I).
   */
  afterYears: number;
  /** Bulletin codes. First-listed is the most common option of a choice. */
  codes: readonly string[];
  label: string;
}

/**
 * School cores, paced the way the Bulletin actually assigns them.
 *
 * Columbia College: Lit Hum + Frontiers/UW in year 1, Contemporary
 * Civilization in year 2, Art/Music Hum somewhere in the first two.
 * SEAS: the First-Year/Sophomore Program grid — Calc, Physics, The Art
 * of Engineering, University Writing, then the rest of List A.
 *
 * GS borrows the College's first-year writing and a humanities sequence
 * without pretending their Core is identical. Barnard is empty on
 * purpose: we have not transcribed their Core and inventing one would
 * put the wrong courses on a Barnard student's strip.
 */
const TYPICAL_BY_SCHOOL: Record<School, readonly TypicalBand[]> = {
  CC: [
    {
      afterYears: 0,
      codes: ["HUMA CC1001", "ENGL CC1010", "SCNC CC1000"],
      label: "First-year Core",
    },
    {
      afterYears: 1,
      codes: ["HUMA CC1002", "HUMA UN1121", "HUMA UN1123"],
      label: "First-year Core",
    },
    { afterYears: 1, codes: ["COCI CC1101"], label: "Sophomore Core" },
    { afterYears: 2, codes: ["COCI CC1102"], label: "Sophomore Core" },
  ],
  SEAS: [
    {
      afterYears: 0,
      codes: ["MATH UN1101", "ENGL CC1010", "ENGI E1102", "PHYS UN1401", "PHYS UN1601"],
      label: "First-year engineering",
    },
    {
      afterYears: 1,
      codes: ["MATH UN1102", "PHYS UN1402", "PHYS UN1602", "CHEM UN1403", "ECON UN1105"],
      label: "First-year engineering",
    },
    {
      afterYears: 1,
      codes: ["HUMA CC1001", "COCI CC1101"],
      label: "SEAS Core sequence",
    },
    {
      afterYears: 2,
      codes: ["APMA E2000", "HUMA CC1002", "COCI CC1102", "HUMA UN1121", "HUMA UN1123"],
      label: "Sophomore engineering",
    },
  ],
  GS: [
    { afterYears: 0, codes: ["ENGL CC1010", "HUMA CC1001"], label: "Typical first year" },
    { afterYears: 1, codes: ["HUMA CC1002", "COCI CC1101"], label: "Typical Core" },
    { afterYears: 2, codes: ["COCI CC1102"], label: "Typical Core" },
  ],
  BC: [],
};

export interface TypicalGuess {
  courseId: CourseId;
  label: string;
}

/**
 * Every typical guess for this student: school-year cores, then the
 * alternatives their programs name at a level they have had time to finish.
 *
 * `n_of` and `sequence_choice` are the courses the strip used to bury —
 * Intro to CS is "W1004 OR W1007", so it was never required, so it sat
 * under every 3000-level `all_of` the major will one day ask for. Those
 * alternatives are exactly the courses a student this far along has
 * usually already picked.
 */
export function typicalGuesses(input: {
  school: School | null;
  yearsCompleted: number | null;
  ceiling: number;
  programs: readonly Program[];
}): TypicalGuess[] {
  const years = input.yearsCompleted ?? 0;
  const out: TypicalGuess[] = [];
  const seen = new Set<string>();

  const add = (code: string, label: string) => {
    const courseId = toCourseId(code);
    if (!courseId || seen.has(courseId)) return;
    if ((levelOf(courseId) ?? 9000) > input.ceiling) return;
    seen.add(courseId);
    out.push({ courseId, label });
  };

  if (input.school) {
    for (const band of TYPICAL_BY_SCHOOL[input.school]) {
      if (years < band.afterYears) continue;
      for (const code of band.codes) add(code, band.label);
    }
  }

  for (const program of input.programs) {
    for (const group of program.groups) {
      const rule = group.rule;
      if (rule.kind === "n_of") {
        for (const code of rule.courses) add(code, group.label);
        continue;
      }
      if (rule.kind !== "sequence_choice") continue;
      for (const sequence of rule.sequences) {
        // A first-year in August has finished no term; only the first of
        // a sequence is a fair "you might have started this". After a
        // year, both terms are fair game.
        const codes = years === 0 ? sequence.courses.slice(0, 1) : sequence.courses;
        for (const code of codes) add(code, sequence.label || group.label);
      }
    }
  }

  return out;
}
