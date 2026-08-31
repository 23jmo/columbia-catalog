import { getProgram, listPrograms } from "@/lib/requirements/programs";
import { SCHOOL_LABEL, type Program } from "@/lib/requirements/types";

/**
 * Authored cores and majors for the public /programs pages.
 *
 * Concentrations and minors are skipped so we do not ship thin duplicates
 * of a major. Parsed programs are skipped because nobody has read them.
 *
 * Barnard joined on 2026-08-30, with Foundations and eleven majors read from
 * `catalog.barnard.edu`. It is listed here rather than gated behind a flag
 * because the gate that mattered was the registry being empty, not the
 * surface: `coreForSchool("BC")` returned `undefined` and the major picker
 * had nothing in it, so a Barnard student could pick her school and then get
 * an audit of nothing.
 */
export function listPublicPrograms(): Program[] {
  return listPrograms().filter(
    (program) =>
      program.origin === "authored" &&
      (program.school === "CC" ||
        program.school === "SEAS" ||
        program.school === "GS" ||
        program.school === "BC") &&
      (program.kind === "core" || program.kind === "major"),
  );
}

export function getPublicProgram(id: string): Program | undefined {
  const program = getProgram(id);
  if (!program) return undefined;
  return listPublicPrograms().some((entry) => entry.id === program.id)
    ? program
    : undefined;
}

export function programHref(program: Program): string {
  return `/programs/${program.id}`;
}

/** Search-shaped title. Same string is the H1. */
export function programPageTitle(program: Program): string {
  return `${program.name} at ${SCHOOL_LABEL[program.school]}: what LionPlan checks`;
}

export function programPageDescription(program: Program): string {
  const school = SCHOOL_LABEL[program.school];
  if (program.kind === "core") {
    return `What LionPlan checks for the ${program.name} at ${school}. An unofficial companion to Stellic and Vergil, not a replacement.`;
  }
  return `What to take for ${program.name} at ${school}. LionPlan checks these bulletin groups and shows what a class satisfies and what it unlocks.`;
}

export function programSitemapPaths(): string[] {
  return ["/programs", ...listPublicPrograms().map(programHref)];
}
