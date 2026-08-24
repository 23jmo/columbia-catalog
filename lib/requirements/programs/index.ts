/**
 * The program registry.
 *
 * Two populations live here and they are deliberately not merged:
 *
 *   **Authored** programs are transcribed from the Bulletin by a person and
 *   covered by a test that pins their shape. They are correct until the
 *   Bulletin changes, and a change breaks the test rather than the student.
 *
 *   **Parsed** programs come from `lib/ingest/parsers/requirements.ts` reading
 *   CourseLeaf tables. There are far more of them and nobody has read any of
 *   them. `origin` travels on every `Program` so the UI can be plain about
 *   which kind a student is looking at.
 *
 * `listPrograms` returns authored first. When a parsed program and an authored
 * program claim the same id, the authored one wins — a human transcription is
 * the better artifact and the parser's job is coverage, not override.
 */

import type { Program, ProgramKind, School } from "../types";
import { CC_CORE } from "./cc-core";
import { CC_MAJOR_COMPUTER_SCIENCE } from "./cc-major-computer-science";
import { CC_MAJOR_ECONOMICS } from "./cc-major-economics";
import { SEAS_CORE } from "./seas-core";

export const AUTHORED_PROGRAMS: Program[] = [
  CC_CORE,
  SEAS_CORE,
  CC_MAJOR_COMPUTER_SCIENCE,
  CC_MAJOR_ECONOMICS,
];

/**
 * Programs the CourseLeaf parser produced, registered at build time.
 *
 * Empty in the running app today: the parser exists and is tested
 * (`lib/ingest/parsers/requirements.test.ts`), but wiring its output into a
 * generated module is the ingest lane's call, not this module's. Keeping the
 * seam here means that lands as a one-line change rather than a refactor.
 */
export const PARSED_PROGRAMS: Program[] = [];

export function listPrograms(filter?: {
  school?: School;
  kind?: ProgramKind;
}): Program[] {
  const byId = new Map<string, Program>();
  // Parsed first so authored overwrites on collision.
  for (const program of [...PARSED_PROGRAMS, ...AUTHORED_PROGRAMS]) {
    byId.set(program.id, program);
  }

  return [...byId.values()]
    .filter((program) => !filter?.school || program.school === filter.school)
    .filter((program) => !filter?.kind || program.kind === filter.kind)
    .sort((a, b) => {
      if (a.origin !== b.origin) return a.origin === "authored" ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === "core" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function getProgram(id: string): Program | undefined {
  return listPrograms().find((program) => program.id === id);
}

/**
 * The Core a student in this school must satisfy.
 *
 * There is exactly one per school and it is not optional, so it is resolved
 * from the school rather than chosen — a Columbia College student cannot elect
 * out of the Core, and offering it as a picker option would imply they could.
 */
export function coreForSchool(school: School): Program | undefined {
  return listPrograms({ school, kind: "core" })[0];
}

export { CC_CORE, SEAS_CORE, CC_MAJOR_COMPUTER_SCIENCE, CC_MAJOR_ECONOMICS };
