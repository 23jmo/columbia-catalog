/**
 * The four-year plan: eight terms, a prerequisite graph, and the checks that
 * make the difference between a list of courses and a plan that works.
 *
 * ── What "valid" means here ─────────────────────────────────────────────────
 *
 * A course placed in term N is checked against everything scheduled *strictly
 * before* term N — not against the whole plan. That ordering is the entire
 * point: "COMS W4111 in Fall of year 2, W3134 in Spring of year 3" is a set of
 * courses that satisfies every prerequisite and is still an impossible plan.
 *
 * Corequisites are checked against term N *inclusive*, because a corequisite
 * is a course you take alongside, not before.
 *
 * ── Why nothing here throws ─────────────────────────────────────────────────
 *
 * Every problem is reported as an `PlanIssue` with a severity. A plan with a
 * missing prerequisite is still a plan, and a planner that refused to hold one
 * would be useless during the exact activity — dragging things around — that
 * it exists to support. `error` means it cannot work as written; `warning`
 * means it works but is worth knowing about; `info` is a gate no transcript
 * can settle.
 */

import { SEASON_DIGIT } from "@/lib/constants";
import type { Season, TermCode } from "@/lib/types";
import { evaluatePrereqTree, type ProgressionGraph } from "@/lib/prereqs/graph";
import type { ProgressionCourse } from "@/lib/prereqs/types";
import { formatCourseId } from "@/lib/prereqs/format";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface PlanTerm {
  /** Stable within a plan; also the drag-and-drop target id. */
  termKey: string;
  /** Real Columbia term code, so a term can eventually join to sections. */
  termCode: TermCode;
  season: Season;
  year: number;
  /** Academic year, 1–4. Two terms share one. */
  academicYear: number;
  label: string;
  courseIds: string[];
}

export interface FourYearPlan {
  planId: string;
  name: string;
  /** Calendar year of the first Fall term. */
  startYear: number;
  terms: PlanTerm[];
}

export type PlanIssueKind =
  | "prereq_unmet"
  | "prereq_external"
  | "prereq_unknown"
  | "corequisite_unmet"
  | "duplicate_course"
  | "equivalent_conflict"
  | "over_load"
  | "under_load"
  | "unknown_course";

export type PlanIssueSeverity = "error" | "warning" | "info";

export interface PlanIssue {
  kind: PlanIssueKind;
  severity: PlanIssueSeverity;
  termKey: string;
  /** The course the issue is about. Null for term-level issues like load. */
  courseId: string | null;
  message: string;
  /** Course ids that would resolve it — any one of them. */
  resolvedBy: string[];
}

export interface TermAnalysis {
  termKey: string;
  points: number;
  /** Courses whose points the bulletin does not state; excluded from `points`. */
  unknownPointCourseIds: string[];
  issues: PlanIssue[];
}

export interface PlanAnalysis {
  terms: TermAnalysis[];
  issues: PlanIssue[];
  totalPoints: number;
  /** Placed course ids, in plan order. */
  plannedCourseIds: string[];
}

// ---------------------------------------------------------------------------
// Load rules
// ---------------------------------------------------------------------------

/**
 * Columbia College / SEAS full-time registration is 12 points; 18 is the point
 * above which a student needs approval and pays per-point. These are the
 * numbers a plan should be checked against, not invented round ones.
 */
export const TERM_POINTS = {
  fullTimeMinimum: 12,
  approvalThreshold: 18,
} as const;

// ---------------------------------------------------------------------------
// Term construction
// ---------------------------------------------------------------------------

const SEASON_LABEL: Record<Season, string> = {
  Fall: "Fall",
  Spring: "Spring",
  Summer: "Summer",
};

/**
 * The eight terms of a standard degree, Fall-first.
 *
 * A Columbia academic year runs Fall `Y` → Spring `Y+1`, so academic year 2's
 * Spring is calendar year `startYear + 2`. Getting that off by one puts every
 * term code in the plan on the wrong year, which is why it is computed rather
 * than written out.
 */
export function buildFourYearTerms(startYear: number, years = 4): PlanTerm[] {
  const terms: PlanTerm[] = [];

  for (let academicYear = 1; academicYear <= years; academicYear += 1) {
    for (const season of ["Fall", "Spring"] as const) {
      const year = season === "Fall" ? startYear + academicYear - 1 : startYear + academicYear;
      terms.push({
        termKey: `y${academicYear}-${season.toLowerCase()}`,
        termCode: `${year}${SEASON_DIGIT[season]}`,
        season,
        year,
        academicYear,
        label: `${SEASON_LABEL[season]} ${year}`,
        courseIds: [],
      });
    }
  }
  return terms;
}

export function createEmptyPlan(startYear: number, name = "My four-year plan"): FourYearPlan {
  return {
    planId: `plan-${startYear}`,
    name,
    startYear,
    terms: buildFourYearTerms(startYear),
  };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function analyzeFourYearPlan(
  graph: ProgressionGraph,
  plan: FourYearPlan,
): PlanAnalysis {
  const terms: TermAnalysis[] = [];
  const issues: PlanIssue[] = [];
  const plannedCourseIds: string[] = [];

  /** Everything scheduled in a strictly earlier term. */
  const completed = new Set<string>();
  /** Every course placed anywhere so far, for duplicate detection. */
  const placed = new Map<string, string>();

  for (const term of plan.terms) {
    const termIssues: PlanIssue[] = [];
    const concurrent = new Set([...completed, ...term.courseIds]);
    let points = 0;
    const unknownPointCourseIds: string[] = [];

    for (const courseId of term.courseIds) {
      plannedCourseIds.push(courseId);

      const previousTermKey = placed.get(courseId);
      if (previousTermKey) {
        termIssues.push({
          kind: "duplicate_course",
          severity: "error",
          termKey: term.termKey,
          courseId,
          message: `Already planned in ${labelOf(plan, previousTermKey)}.`,
          resolvedBy: [],
        });
      }
      placed.set(courseId, term.termKey);

      const course = graph.courses.get(courseId);
      if (!course) {
        termIssues.push({
          kind: "unknown_course",
          severity: "warning",
          termKey: term.termKey,
          courseId,
          message: "Not in the parsed bulletin, so its prerequisites are unchecked.",
          resolvedBy: [],
        });
        continue;
      }

      if (typeof course.points === "number") points += course.points;
      else unknownPointCourseIds.push(courseId);

      termIssues.push(...equivalentConflicts(graph, plan, course, placed, term.termKey));
      termIssues.push(...prerequisiteIssues(graph, course, completed, concurrent, term));
    }

    termIssues.push(...loadIssues(term, points, unknownPointCourseIds.length));

    terms.push({ termKey: term.termKey, points, unknownPointCourseIds, issues: termIssues });
    issues.push(...termIssues);
    term.courseIds.forEach((courseId) => completed.add(courseId));
  }

  return {
    terms,
    issues,
    totalPoints: terms.reduce((sum, term) => sum + term.points, 0),
    plannedCourseIds,
  };
}

function labelOf(plan: FourYearPlan, termKey: string): string {
  return plan.terms.find((term) => term.termKey === termKey)?.label ?? termKey;
}

/**
 * Two courses from the same equivalence group earn credit once. Planning both
 * is not illegal, but it spends a term on points the registrar will not grant.
 */
function equivalentConflicts(
  graph: ProgressionGraph,
  plan: FourYearPlan,
  course: ProgressionCourse,
  placed: ReadonlyMap<string, string>,
  termKey: string,
): PlanIssue[] {
  return course.equivalents
    .filter((equivalentId) => placed.has(equivalentId))
    .map((equivalentId) => ({
      kind: "equivalent_conflict" as const,
      severity: "warning" as const,
      termKey,
      courseId: course.courseId,
      message:
        `Overlaps ${equivalentId} in ${labelOf(plan, placed.get(equivalentId) as string)} — ` +
        "the registrar grants credit for only one of them.",
      resolvedBy: [],
    }));
}

function prerequisiteIssues(
  graph: ProgressionGraph,
  course: ProgressionCourse,
  completed: ReadonlySet<string>,
  concurrent: ReadonlySet<string>,
  term: PlanTerm,
): PlanIssue[] {
  const prereq = course.prereq;
  if (!prereq) return [];

  const issues: PlanIssue[] = [];

  // Prerequisites: everything strictly before this term.
  const before = evaluatePrereqTree(prereq.tree, completed, graph.equivalence);
  if (before.status === "unmet") {
    for (const choice of before.outstanding) {
      // A requirement satisfiable only by courses outside the ingested catalog
      // is not a blocker, because nothing the reader can do on this board will
      // clear it — MATH UN1201 has no card to drag. Calling it an error would
      // also contradict `suggestPlan`, which treats external courses as
      // already-held when it decides what to place. So it is stated as an
      // assumption to confirm, which is what it actually is.
      const onlyExternal = choice.options.every((id) => !graph.courses.has(id));

      if (onlyExternal) {
        issues.push({
          kind: "prereq_external",
          severity: "warning",
          termKey: term.termKey,
          courseId: course.courseId,
          message: `Assumes ${joinOptions(choice.options)} taken elsewhere — not in the ingested catalog.`,
          resolvedBy: choice.options,
        });
        continue;
      }

      issues.push({
        kind: "prereq_unmet",
        // An instructor override does not make the course takeable on paper,
        // but it does make this a conversation rather than a blocker.
        severity: prereq.instructorPermission ? "warning" : "error",
        termKey: term.termKey,
        courseId: course.courseId,
        message: prereq.instructorPermission
          ? `Needs ${joinOptions(choice.options)} first, or the instructor's permission.`
          : `Needs ${joinOptions(choice.options)} in an earlier term.`,
        resolvedBy: choice.options,
      });
    }
  }

  // Corequisites: this term counts.
  const alongside = evaluatePrereqTree(prereq.corequisites, concurrent, graph.equivalence);
  if (alongside.status === "unmet") {
    for (const choice of alongside.outstanding) {
      issues.push({
        kind: "corequisite_unmet",
        severity: "error",
        termKey: term.termKey,
        courseId: course.courseId,
        message: `Needs ${joinOptions(choice.options)} in the same term or earlier.`,
        resolvedBy: choice.options,
      });
    }
  }

  for (const advisory of prereq.advisories) {
    issues.push({
      kind: "prereq_unknown",
      severity: "info",
      termKey: term.termKey,
      courseId: course.courseId,
      message: advisory,
      resolvedBy: [],
    });
  }

  return issues;
}

/**
 * Names the courses that would satisfy a requirement, in reading order.
 *
 * Formatted for display — `resolvedBy` keeps the raw ids, since that is the
 * field anything programmatic should be joining on.
 */
function joinOptions(options: string[]): string {
  const names = options.map(formatCourseId);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * Load is only worth flagging on a term that has something in it. An empty
 * term is a gap the student has not filled yet, not an under-load.
 */
function loadIssues(term: PlanTerm, points: number, unknownCount: number): PlanIssue[] {
  if (term.courseIds.length === 0) return [];

  if (points > TERM_POINTS.approvalThreshold) {
    return [
      {
        kind: "over_load",
        severity: "warning",
        termKey: term.termKey,
        courseId: null,
        message: `${points} points — over ${TERM_POINTS.approvalThreshold}, which needs approval.`,
        resolvedBy: [],
      },
    ];
  }
  // Courses of unknown weight could close the gap, so silence rather than
  // assert an under-load we cannot actually evidence.
  if (points < TERM_POINTS.fullTimeMinimum && unknownCount === 0) {
    return [
      {
        kind: "under_load",
        severity: "warning",
        termKey: term.termKey,
        courseId: null,
        message: `${points} points — under the ${TERM_POINTS.fullTimeMinimum} needed for full-time.`,
        resolvedBy: [],
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * The earliest term a course could legally sit in, given the rest of the plan.
 *
 * Used to place a dropped course sensibly and to tell a student where a course
 * they want actually lands. Returns null when no term in the plan works —
 * which is real information: it means the chain is longer than the plan.
 */
export function earliestFeasibleTerm(
  graph: ProgressionGraph,
  plan: FourYearPlan,
  courseId: string,
): PlanTerm | null {
  const course = graph.courses.get(courseId);
  if (!course?.prereq?.tree) return plan.terms[0] ?? null;

  const completed = new Set<string>();
  for (const term of plan.terms) {
    if (
      evaluatePrereqTree(course.prereq.tree, completed, graph.equivalence).status !== "unmet"
    ) {
      return term;
    }
    term.courseIds.forEach((id) => completed.add(id));
  }
  return null;
}

/**
 * Build a plan that reaches every course in `goals`, prerequisites included.
 *
 * Greedy by depth: repeatedly take whatever is now unblocked, preferring the
 * courses that the most other required courses depend on, until the term is
 * full. Preferring high-fan-out courses is what stops the schedule from
 * back-loading a chain — putting off the one course that four later courses
 * need is the classic way a four-year plan turns into a five-year one.
 *
 * Not optimal, and not trying to be: a student edits this afterwards. What it
 * must be is *correct* — every course it places has its prerequisites already
 * placed in an earlier term.
 *
 * ── The external-prerequisite assumption ────────────────────────────────────
 *
 * COMS W4771 requires COMS W3203 and MATH UN1201. MATH is a different
 * department page, so it is an `external` node: known to exist, but with no
 * points, no prerequisites of its own, and nothing to schedule. Treating it as
 * unsatisfiable would refuse to plan most of the CS major. Treating it as
 * silently satisfied would hide a real requirement. So it is assumed satisfied
 * AND reported back in `assumedExternal`, for the UI to state plainly.
 */
export function suggestPlan(
  graph: ProgressionGraph,
  goals: readonly string[],
  options: { startYear: number; pointsPerTerm?: number; alreadyCompleted?: Iterable<string> } ,
): { plan: FourYearPlan; unplaced: string[]; assumedExternal: string[] } {
  const pointsPerTerm = options.pointsPerTerm ?? 15;
  const completed = new Set(options.alreadyCompleted ?? []);
  const plan = createEmptyPlan(options.startYear, "Suggested plan");

  const required = requiredClosure(graph, goals);
  const remaining = new Set([...required].filter((id) => !completed.has(id)));
  const assumedExternal = new Set<string>();

  /** What readiness is judged against: the plan so far, plus every external. */
  const satisfied = () => new Set([...completed, ...graph.external.keys()]);

  for (const term of plan.terms) {
    let points = 0;

    // Re-evaluated every pick, not once per term: taking a course can unblock
    // another one in the very same pass, and a plan that ignored that would
    // stretch a two-course chain across two extra terms.
    for (;;) {
      const ready = [...remaining]
        .filter((id) => graph.courses.has(id))
        .filter(
          (id) =>
            evaluatePrereqTree(
              graph.courses.get(id)?.prereq?.tree ?? null,
              satisfied(),
              graph.equivalence,
            ).status !== "unmet",
        )
        .filter((id) => points + (graph.courses.get(id)?.points ?? 3) <= pointsPerTerm);

      if (ready.length === 0) break;

      ready.sort((a, b) => {
        const fanOut =
          countDependents(graph, b, required) - countDependents(graph, a, required);
        if (fanOut !== 0) return fanOut;
        const depth = (graph.depth.get(a) ?? 0) - (graph.depth.get(b) ?? 0);
        return depth !== 0 ? depth : a.localeCompare(b);
      });

      const chosen = ready[0];
      term.courseIds.push(chosen);
      points += graph.courses.get(chosen)?.points ?? 3;
      remaining.delete(chosen);

      for (const referenced of graph.requires.get(chosen) ?? []) {
        if (graph.external.has(referenced)) assumedExternal.add(referenced);
      }
    }

    // Courses only become available *after* the term they are taken in.
    term.courseIds.forEach((id) => completed.add(id));
    if (remaining.size === 0) break;
  }

  return { plan, unplaced: [...remaining], assumedExternal: [...assumedExternal].sort() };
}

/** Every course that must be taken to reach `goals`, the goals included. */
export function requiredClosure(
  graph: ProgressionGraph,
  goals: readonly string[],
): Set<string> {
  const required = new Set<string>();
  const queue = [...goals];

  while (queue.length > 0) {
    const courseId = queue.shift() as string;
    if (required.has(courseId)) continue;
    required.add(courseId);

    const course = graph.courses.get(courseId);
    if (!course?.prereq?.tree) continue;
    // Only one branch of an `or` is needed. Picking the cheapest by depth
    // keeps the closure to a plan a student would actually follow rather than
    // every course that could possibly satisfy any alternative.
    queue.push(...cheapestSatisfyingSet(graph, course.prereq.tree));
  }
  return required;
}

function cheapestSatisfyingSet(
  graph: ProgressionGraph,
  node: import("@/lib/prereqs/types").PrereqNode | null,
): string[] {
  if (!node || node.kind === "advisory") return [];
  if (node.kind === "course") return graph.courses.has(node.courseId) ? [node.courseId] : [];
  if (node.kind === "all") return node.children.flatMap((c) => cheapestSatisfyingSet(graph, c));

  const branches = node.children
    .map((child) => cheapestSatisfyingSet(graph, child))
    .filter((branch) => branch.length > 0);
  if (branches.length === 0) return [];
  return branches.sort(
    (a, b) =>
      a.length - b.length ||
      Math.max(...a.map((id) => graph.depth.get(id) ?? 0)) -
        Math.max(...b.map((id) => graph.depth.get(id) ?? 0)),
  )[0];
}

function countDependents(
  graph: ProgressionGraph,
  courseId: string,
  within: ReadonlySet<string>,
): number {
  return (graph.unlocks.get(courseId) ?? []).filter((id) => within.has(id)).length;
}
