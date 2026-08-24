/**
 * Columbia Catalog — prerequisite structure.
 *
 * `Course.prerequisiteText` in `@/lib/types` is prose: what a human reads on
 * the bulletin. This module is the structured half — the boolean expression a
 * machine can evaluate against a set of completed courses, plus the honest
 * record of everything in the prose that did NOT survive the translation.
 *
 * These types are local to the progression lane on purpose. `lib/types.ts` is
 * shared and frozen; nothing here belongs in it until the database lane grows
 * a `prerequisite_formula` column to persist it (spec §"Schema").
 *
 * DESIGN NOTE — why `advisory` is a node kind and not a dropped string.
 * Half of Columbia's real prerequisites are unmachinable: "Knowledge of Java",
 * "Fluency in at least one programming language", "Approval by a faculty
 * member". Discarding them would make the planner confidently wrong — it would
 * clear a course whose actual gate it never saw. Keeping them as inert nodes
 * means the tree stays a faithful picture of the prose, the planner reports
 * them as "check yourself" rather than "satisfied", and nothing is silently
 * lost between the bulletin and the screen.
 */

/** A node in a prerequisite boolean expression. */
export type PrereqNode =
  /** A concrete course reference that can be checked against a transcript. */
  | { kind: "course"; courseId: string; /** As printed, e.g. "COMS W3134". */ label: string }
  /** Every child must be satisfied. */
  | { kind: "all"; children: PrereqNode[] }
  /** At least one child must be satisfied. */
  | { kind: "any"; children: PrereqNode[] }
  /** Prose we kept verbatim and deliberately cannot evaluate. Never blocks. */
  | { kind: "advisory"; text: string };

/**
 * How much of the prose became structure.
 *
 * - `structured` — every clause resolved to course references.
 * - `partial`    — some courses resolved, some prose remained.
 * - `prose`      — no course reference at all ("permission of instructor").
 */
export type PrereqConfidence = "structured" | "partial" | "prose";

/** Everything the bulletin says about getting into one course. */
export interface PrereqRequirement {
  courseId: string;
  /** The prose exactly as published. Always displayed beside the parsed tree. */
  rawText: string;
  /** Parsed prerequisites. Null when the prose carried no requirement at all. */
  tree: PrereqNode | null;
  /** Corequisites — taken *with*, not before. Held separately: they never gate. */
  corequisites: PrereqNode | null;
  /**
   * "or permission of the instructor". When true every gate below is soft: the
   * planner still reports what is missing, but never calls the course blocked.
   */
  instructorPermission: boolean;
  /** Prose clauses preserved but not evaluated. Mirrors the `advisory` nodes. */
  advisories: string[];
  confidence: PrereqConfidence;
}

/**
 * Courses that overlap so heavily the registrar grants credit for only one.
 *
 * Parsed from the bulletin's own "students may receive credit for only one of
 * the following three courses: COMS W3134, COMS W3136, COMS W3137". This is
 * load-bearing, not decoration: the bulletin writes W4111's prerequisite as an
 * AND across all three, which read literally demands a combination no student
 * can be granted. Knowing they are equivalents is what makes that AND readable
 * as the OR it plainly means. See `collapseEquivalentConjunctions`.
 */
export interface EquivalenceGroup {
  /** Course ids, sorted. Membership is symmetric. */
  courseIds: string[];
  /** The bulletin sentence this was read from. Provenance, always available. */
  sourceText: string;
}

/** One course as the progression surfaces need it. */
export interface ProgressionCourse {
  courseId: string;
  subjectCode: string;
  number: number;
  qualifier: string | null;
  title: string;
  /** Single figure, or the low end of a range. Null when the bulletin omits it. */
  points: number | null;
  prereq: PrereqRequirement | null;
  /** Other course ids in this course's equivalence group. Never includes self. */
  equivalents: string[];
}

/** The generated catalog `scripts/build-prereqs.ts` writes and the UI reads. */
export interface PrereqCatalog {
  /** Which fixture/source this was built from, and when. Provenance. */
  source: string;
  builtAt: string;
  courses: ProgressionCourse[];
  equivalenceGroups: EquivalenceGroup[];
}
