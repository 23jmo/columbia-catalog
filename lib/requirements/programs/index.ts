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
import { CC_CONCENTRATION_ECONOMICS } from "./cc-concentration-economics";
import { CC_CORE } from "./cc-core";
import { CC_MAJOR_BIOLOGY } from "./cc-major-biology";
import { CC_MAJOR_COMPUTER_SCIENCE } from "./cc-major-computer-science";
import { CC_MAJOR_ECONOMICS } from "./cc-major-economics";
import { CC_MAJOR_ENGLISH } from "./cc-major-english";
import { CC_MAJOR_HISTORY } from "./cc-major-history";
import { CC_MAJOR_MATHEMATICS } from "./cc-major-mathematics";
import { CC_MAJOR_NEUROSCIENCE_AND_BEHAVIOR } from "./cc-major-neuroscience-and-behavior";
import { CC_MAJOR_PHILOSOPHY } from "./cc-major-philosophy";
import { CC_MAJOR_PHYSICS } from "./cc-major-physics";
import { CC_MAJOR_POLITICAL_SCIENCE } from "./cc-major-political-science";
import { CC_MAJOR_PSYCHOLOGY } from "./cc-major-psychology";
import { CC_MAJOR_SOCIOLOGY } from "./cc-major-sociology";
import { CC_MAJOR_STATISTICS } from "./cc-major-statistics";
import { CC_MINOR_COMPUTER_SCIENCE } from "./cc-minor-computer-science";
import { SEAS_CORE } from "./seas-core";
import { SEAS_MAJOR_APPLIED_MATHEMATICS } from "./seas-major-applied-mathematics";
import { SEAS_MAJOR_BIOMEDICAL_ENGINEERING } from "./seas-major-biomedical-engineering";
import { SEAS_MAJOR_CHEMICAL_ENGINEERING } from "./seas-major-chemical-engineering";
import { SEAS_MAJOR_COMPUTER_ENGINEERING } from "./seas-major-computer-engineering";
import { SEAS_MAJOR_COMPUTER_SCIENCE } from "./seas-major-computer-science";
import { SEAS_MAJOR_ELECTRICAL_ENGINEERING } from "./seas-major-electrical-engineering";
import { SEAS_MAJOR_MECHANICAL_ENGINEERING } from "./seas-major-mechanical-engineering";
import { SEAS_MAJOR_OPERATIONS_RESEARCH } from "./seas-major-operations-research";

export const AUTHORED_PROGRAMS: Program[] = [
  // The two Cores. Not electable — see `coreForSchool`.
  CC_CORE,
  SEAS_CORE,

  // Columbia College majors.
  CC_MAJOR_BIOLOGY,
  CC_MAJOR_COMPUTER_SCIENCE,
  CC_MAJOR_ECONOMICS,
  CC_MAJOR_ENGLISH,
  CC_MAJOR_HISTORY,
  CC_MAJOR_MATHEMATICS,
  /*
   * One file for a program two departments run jointly. Biological Sciences and
   * Psychology each publish their own half of it and the halves disagree — the
   * Psychology page says "seven" biology courses in the same sentence that says
   * "eleven courses" — so it is transcribed from both pages at once rather than
   * assembled from either.
   */
  CC_MAJOR_NEUROSCIENCE_AND_BEHAVIOR,
  CC_MAJOR_PHILOSOPHY,
  CC_MAJOR_PHYSICS,
  CC_MAJOR_POLITICAL_SCIENCE,
  CC_MAJOR_PSYCHOLOGY,
  CC_MAJOR_SOCIOLOGY,
  CC_MAJOR_STATISTICS,

  // SEAS majors. Note these are genuinely different programs from their College
  // namesakes rather than aliases of them: SEAS Computer Science requires all
  // three of MATH UN1101 / UN1102 / APMA E2000 where the College's
  // identically-named requirement is a choice of one, and SEAS additionally
  // requires ENGI E1006 that the College only recommends.
  SEAS_MAJOR_APPLIED_MATHEMATICS,
  SEAS_MAJOR_BIOMEDICAL_ENGINEERING,
  SEAS_MAJOR_CHEMICAL_ENGINEERING,
  /*
   * Computer Engineering is its own program, not a track of Electrical
   * Engineering or of Computer Science. The Bulletin gives it a department-level
   * node of its own and both parent departments defer to it — and the degrees
   * genuinely differ, in physics, probability, computing, the laboratory set and
   * the elective total.
   */
  SEAS_MAJOR_COMPUTER_ENGINEERING,
  SEAS_MAJOR_COMPUTER_SCIENCE,
  SEAS_MAJOR_ELECTRICAL_ENGINEERING,
  SEAS_MAJOR_MECHANICAL_ENGINEERING,
  SEAS_MAJOR_OPERATIONS_RESEARCH,

  // Sub-major programs.
  CC_MINOR_COMPUTER_SCIENCE,
  /*
   * Filed as a concentration, not a minor, because that is what the Bulletin
   * calls it — the Economics department publishes no minor at all. It also sits
   * under "For students who entered Columbia in or before the 2023-24 academic
   * year", a gate the rule language cannot express and the audit cannot check.
   * Offering it to a 2025 matriculant would propose a program they are not
   * eligible to declare, so the restriction lives in the program's own note
   * where the UI can show it.
   */
  CC_CONCENTRATION_ECONOMICS,
];

/**
 * Programs the CourseLeaf parser produced, registered at build time.
 *
 * Empty in the running app today: the parser exists and is tested
 * (`lib/requirements/requirements.test.ts`), but wiring its output into a
 * generated module is the ingest lane's call, not this module's. Keeping the
 * seam here means that lands as a one-line change rather than a refactor.
 *
 * Worth knowing before that happens: the parser has three limitations that were
 * found by running it over these same Bulletin pages, and each one produces a
 * confidently wrong program rather than an obviously empty one.
 *
 *   1. `selectCount` reads only `area.headerText`, never `area.notes`. On pages
 *      where "Choose one of the following:" arrives as a plain
 *      `.courselistcomment` row instead of a `.courselistcomment.areaheader`
 *      row, a choose-one becomes an `all_of` over every alternative — the
 *      student is told to take all six.
 *   2. The `or`-row branch can invert a whole table, rewriting the header of a
 *      list of required courses into "Select one of the following:" because two
 *      of its rows carried an `or`.
 *   3. Programs that publish requirements as `table.sc_plangrid` (the
 *      eight-semester schedule) rather than `table.sc_courselist` are invisible
 *      to it. IEOR, Mechanical and Biomedical all do this; the parser returns
 *      nothing for them, which reads as "no requirements" rather than as
 *      "unparsed".
 *
 * All three are why the programs above were transcribed by hand.
 */
export const PARSED_PROGRAMS: Program[] = [];

/**
 * Display order for `kind`, lowest first.
 *
 * A rank rather than a chain of comparisons, because the obvious two-way form —
 * `a.kind === "core" ? -1 : 1` — is not a valid comparator once there are more
 * than two kinds: it reports `major` after `minor` AND `minor` after `major`,
 * which leaves `Array.prototype.sort` free to return any order it likes. That
 * held only while the registry contained cores and majors alone.
 */
const KIND_ORDER: Record<ProgramKind, number> = {
  core: 0,
  major: 1,
  concentration: 2,
  minor: 3,
};

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
      if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
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

export {
  CC_CONCENTRATION_ECONOMICS,
  CC_CORE,
  CC_MAJOR_BIOLOGY,
  CC_MAJOR_COMPUTER_SCIENCE,
  CC_MAJOR_ECONOMICS,
  CC_MAJOR_ENGLISH,
  CC_MAJOR_HISTORY,
  CC_MAJOR_MATHEMATICS,
  CC_MAJOR_NEUROSCIENCE_AND_BEHAVIOR,
  CC_MAJOR_PHILOSOPHY,
  CC_MAJOR_PHYSICS,
  CC_MAJOR_POLITICAL_SCIENCE,
  CC_MAJOR_PSYCHOLOGY,
  CC_MAJOR_SOCIOLOGY,
  CC_MAJOR_STATISTICS,
  CC_MINOR_COMPUTER_SCIENCE,
  SEAS_CORE,
  SEAS_MAJOR_APPLIED_MATHEMATICS,
  SEAS_MAJOR_BIOMEDICAL_ENGINEERING,
  SEAS_MAJOR_CHEMICAL_ENGINEERING,
  SEAS_MAJOR_COMPUTER_ENGINEERING,
  SEAS_MAJOR_COMPUTER_SCIENCE,
  SEAS_MAJOR_ELECTRICAL_ENGINEERING,
  SEAS_MAJOR_MECHANICAL_ENGINEERING,
  SEAS_MAJOR_OPERATIONS_RESEARCH,
};
