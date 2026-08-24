/**
 * The prerequisite graph, and the questions worth asking of it.
 *
 * A prerequisite tree answers "can I take this?". A graph answers the question
 * students actually ask, which is the reverse: "if I take this, what opens
 * up?". Both directions are built here from the same edge set.
 *
 * ── Two things this deliberately does not do ────────────────────────────────
 *
 * It does not drop references to courses outside the catalog. COMS W3770
 * requires MATH UN1201, and a graph that quietly deleted the MATH node would
 * show a course with no prerequisites at all — worse than useless. Unknown
 * references become `external` nodes: real, drawn, and marked as unverified.
 *
 * It does not treat an unevaluable prerequisite as satisfied. "Knowledge of
 * Java" evaluates to `unknown`, never `met`, and `unknown` propagates upward
 * through AND and OR. A planner that rounded it to `met` would clear courses
 * a student cannot actually take.
 */

import type {
  EquivalenceGroup,
  PrereqCatalog,
  PrereqNode,
  ProgressionCourse,
} from "./types";
import { buildEquivalenceIndex } from "./equivalence";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type PrereqEdgeKind =
  /** The only way in: satisfying it is not optional. */
  | "required"
  /** One of several alternatives. Losing it does not close the course. */
  | "alternative"
  /** Taken alongside, not before. Never contributes to depth. */
  | "corequisite";

export interface PrereqEdge {
  /** The prerequisite. */
  from: string;
  /** The course it leads to. */
  to: string;
  kind: PrereqEdgeKind;
}

/** A course referenced by a prerequisite but absent from the catalog. */
export interface ExternalCourse {
  courseId: string;
  subjectCode: string;
  /** As the bulletin printed it, e.g. "MATH UN1201". */
  label: string;
}

export interface ProgressionGraph {
  courses: ReadonlyMap<string, ProgressionCourse>;
  /** Referenced-but-unknown courses, keyed the same way as `courses`. */
  external: ReadonlyMap<string, ExternalCourse>;
  edges: readonly PrereqEdge[];
  /** courseId → the prerequisite course ids it names. */
  requires: ReadonlyMap<string, readonly string[]>;
  /** courseId → the courses that name it as a prerequisite. */
  unlocks: ReadonlyMap<string, readonly string[]>;
  /**
   * Longest prerequisite chain ending at this course, roots at 0. Drives the
   * left-to-right column layout: a course always sits right of everything it
   * needs. Cycles (which real data should not contain, but bad data does) are
   * broken rather than allowed to hang the layout.
   */
  depth: ReadonlyMap<string, number>;
  equivalence: ReadonlyMap<string, ReadonlySet<string>>;
  equivalenceGroups: readonly EquivalenceGroup[];
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function buildProgressionGraph(catalog: PrereqCatalog): ProgressionGraph {
  const courses = new Map(catalog.courses.map((course) => [course.courseId, course]));
  const external = new Map<string, ExternalCourse>();
  const edges: PrereqEdge[] = [];

  for (const course of catalog.courses) {
    if (!course.prereq) continue;

    for (const edge of edgesFromTree(course.prereq.tree, course.courseId, false)) {
      edges.push(edge);
    }
    for (const edge of edgesFromTree(course.prereq.corequisites, course.courseId, true)) {
      edges.push(edge);
    }

    for (const node of [course.prereq.tree, course.prereq.corequisites]) {
      for (const label of courseLabelsIn(node)) {
        if (courses.has(label.courseId) || external.has(label.courseId)) continue;
        external.set(label.courseId, {
          courseId: label.courseId,
          subjectCode: /^[A-Z]{2,5}/.exec(label.courseId)?.[0] ?? label.courseId,
          label: label.label,
        });
      }
    }
  }

  const requires = groupBy(edges, (edge) => edge.to, (edge) => edge.from);
  const unlocks = groupBy(edges, (edge) => edge.from, (edge) => edge.to);

  return {
    courses,
    external,
    edges,
    requires,
    unlocks,
    depth: computeDepth([...courses.keys(), ...external.keys()], edges),
    equivalence: buildEquivalenceIndex(catalog.equivalenceGroups),
    equivalenceGroups: catalog.equivalenceGroups,
  };
}

/**
 * Flatten a tree into edges, labelling each by whether it is escapable.
 *
 * An edge is `alternative` when it sits anywhere under an `any` node — the
 * distinction the UI draws as a dashed line, and the reason "COMS W3134
 * unlocks W4111" is a weaker claim than "COMS W3157 unlocks W4156".
 */
function edgesFromTree(
  node: PrereqNode | null,
  to: string,
  isCorequisite: boolean,
  underAny = false,
): PrereqEdge[] {
  if (!node) return [];
  if (node.kind === "advisory") return [];
  if (node.kind === "course") {
    return [
      {
        from: node.courseId,
        to,
        kind: isCorequisite ? "corequisite" : underAny ? "alternative" : "required",
      },
    ];
  }
  const nowUnderAny = underAny || node.kind === "any";
  return node.children.flatMap((child) =>
    edgesFromTree(child, to, isCorequisite, nowUnderAny),
  );
}

function courseLabelsIn(node: PrereqNode | null): { courseId: string; label: string }[] {
  if (!node) return [];
  if (node.kind === "course") return [{ courseId: node.courseId, label: node.label }];
  if (node.kind === "advisory") return [];
  return node.children.flatMap(courseLabelsIn);
}

function groupBy<T, K, V>(
  items: readonly T[],
  keyOf: (item: T) => K,
  valueOf: (item: T) => V,
): Map<K, V[]> {
  const out = new Map<K, V[]>();
  for (const item of items) {
    const key = keyOf(item);
    const value = valueOf(item);
    const bucket = out.get(key);
    if (!bucket) out.set(key, [value]);
    else if (!bucket.includes(value)) bucket.push(value);
  }
  return out;
}

/**
 * Longest-path depth by iterative relaxation.
 *
 * A topological sort would be tidier but throws on a cycle, and cycles do turn
 * up in scraped prerequisite data (two courses each listed as the other's
 * prerequisite, usually a typo). Relaxing a bounded number of times converges
 * on the right answer for any acyclic subgraph and simply stops early on a
 * cycle instead of failing the whole page.
 */
function computeDepth(courseIds: string[], edges: readonly PrereqEdge[]): Map<string, number> {
  const depth = new Map(courseIds.map((id) => [id, 0]));
  // Corequisites are concurrent, so they impose no ordering and no depth.
  const ordering = edges.filter((edge) => edge.kind !== "corequisite");

  for (let pass = 0; pass < courseIds.length; pass += 1) {
    let changed = false;
    for (const edge of ordering) {
      const candidate = (depth.get(edge.from) ?? 0) + 1;
      if (candidate > (depth.get(edge.to) ?? 0)) {
        depth.set(edge.to, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return depth;
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

/** Everything reachable from `courseId` by following `unlocks`, excluding itself. */
export function descendants(graph: ProgressionGraph, courseId: string): string[] {
  return reachable(courseId, (id) => graph.unlocks.get(id) ?? []);
}

/** Everything `courseId` transitively depends on, excluding itself. */
export function ancestors(graph: ProgressionGraph, courseId: string): string[] {
  return reachable(courseId, (id) => graph.requires.get(id) ?? []);
}

function reachable(start: string, next: (id: string) => readonly string[]): string[] {
  const seen = new Set<string>([start]);
  const out: string[] = [];
  const queue = [...next(start)];

  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...next(id));
  }
  return out;
}

/**
 * The subgraph worth drawing around one course: the course, everything it
 * needs, and everything it leads to — nothing else.
 *
 * `upstream` and `downstream` bound each direction independently, because the
 * interesting asymmetry is that a 1000-level course has no ancestors and
 * eighty descendants, while a 6000-level seminar is the reverse.
 *
 * `maxNodes` is the safety valve on top of that. Two hops downstream of an
 * intro course reaches most of the department, and a map with a hundred cards
 * on it is not a map. When the budget bites, the nodes kept are the ones
 * closest to the focus, and within one hop distance the best-connected — so
 * what is dropped is always the periphery. `truncated` says how many, and the
 * caller is expected to say so rather than quietly show a partial picture.
 */
export function neighbourhood(
  graph: ProgressionGraph,
  courseId: string,
  options: { upstream?: number; downstream?: number; maxNodes?: number } = {},
): { courseIds: string[]; edges: PrereqEdge[]; truncated: number } {
  const upstream = options.upstream ?? 2;
  const downstream = options.downstream ?? 2;
  const maxNodes = options.maxNodes ?? Number.POSITIVE_INFINITY;

  // Hop distance from the focus, whichever direction reached it first.
  const distance = new Map<string, number>([[courseId, 0]]);
  walk(courseId, upstream, (id) => graph.requires.get(id) ?? [], distance);
  walk(courseId, downstream, (id) => graph.unlocks.get(id) ?? [], distance);

  let included = [...distance.keys()];
  let truncated = 0;

  if (included.length > maxNodes) {
    truncated = included.length - maxNodes;
    included = included
      .sort(
        (a, b) =>
          (distance.get(a) as number) - (distance.get(b) as number) ||
          degree(graph, b) - degree(graph, a) ||
          a.localeCompare(b),
      )
      .slice(0, maxNodes);
  }

  const kept = new Set(included);
  return {
    courseIds: included,
    edges: graph.edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to)),
    truncated,
  };
}

function degree(graph: ProgressionGraph, courseId: string): number {
  return (
    (graph.unlocks.get(courseId)?.length ?? 0) + (graph.requires.get(courseId)?.length ?? 0)
  );
}

/** Breadth-first to `hops`, recording the distance at which each node was met. */
function walk(
  start: string,
  hops: number,
  next: (id: string) => readonly string[],
  distance: Map<string, number>,
): void {
  let frontier = [start];
  for (let step = 1; step <= hops; step += 1) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      for (const neighbour of next(id)) {
        if (distance.has(neighbour)) continue;
        distance.set(neighbour, step);
        nextFrontier.push(neighbour);
      }
    }
    if (nextFrontier.length === 0) break;
    frontier = nextFrontier;
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type PrereqStatus =
  /** Every gate is provably satisfied. */
  | "met"
  /** A gate is provably unsatisfied. */
  | "unmet"
  /** Some gate is prose that no transcript can settle. */
  | "unknown";

/** One outstanding gate: take any single course from `options`. */
export interface OutstandingChoice {
  options: string[];
}

export interface PrereqEvaluation {
  status: PrereqStatus;
  /** Empty when `met`. Each entry is satisfied by any one of its options. */
  outstanding: OutstandingChoice[];
  /** Prose gates the student has to settle themselves. */
  advisories: string[];
}

/**
 * Evaluate a prerequisite tree against a set of completed courses.
 *
 * Equivalences count: a student who took COMS W3137 satisfies a requirement
 * written as COMS W3134, because the registrar treats them as the same course.
 */
export function evaluatePrereqTree(
  node: PrereqNode | null,
  completed: ReadonlySet<string>,
  equivalence: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): PrereqEvaluation {
  if (!node) return { status: "met", outstanding: [], advisories: [] };

  if (node.kind === "advisory") {
    return { status: "unknown", outstanding: [], advisories: [node.text] };
  }

  if (node.kind === "course") {
    const accepted = equivalence.get(node.courseId) ?? new Set([node.courseId]);
    const satisfied = [...accepted].some((id) => completed.has(id));
    return satisfied
      ? { status: "met", outstanding: [], advisories: [] }
      : { status: "unmet", outstanding: [{ options: [...accepted].sort() }], advisories: [] };
  }

  const children = node.children.map((child) =>
    evaluatePrereqTree(child, completed, equivalence),
  );
  const advisories = children.flatMap((child) => child.advisories);

  if (node.kind === "all") {
    const unmet = children.filter((child) => child.status === "unmet");
    if (unmet.length > 0) {
      return {
        status: "unmet",
        outstanding: unmet.flatMap((child) => child.outstanding),
        advisories,
      };
    }
    const status = children.some((child) => child.status === "unknown") ? "unknown" : "met";
    return { status, outstanding: [], advisories };
  }

  // `any`: one satisfied child settles it. Otherwise every course option across
  // the branch collapses into a single choice — which is exactly how a student
  // reads "W3134 or W3136 or W3137".
  if (children.some((child) => child.status === "met")) {
    return { status: "met", outstanding: [], advisories: [] };
  }
  const options = [
    ...new Set(children.flatMap((child) => child.outstanding.flatMap((entry) => entry.options))),
  ].sort();
  const status = children.some((child) => child.status === "unknown") ? "unknown" : "unmet";
  return {
    status,
    outstanding: options.length > 0 ? [{ options }] : [],
    advisories,
  };
}

/** Evaluate a whole course, prerequisites and prose gates together. */
export function evaluateCourse(
  graph: ProgressionGraph,
  courseId: string,
  completed: ReadonlySet<string>,
): PrereqEvaluation {
  const course = graph.courses.get(courseId);
  if (!course?.prereq) return { status: "met", outstanding: [], advisories: [] };

  const evaluation = evaluatePrereqTree(course.prereq.tree, completed, graph.equivalence);
  const advisories = [...new Set([...evaluation.advisories, ...course.prereq.advisories])];

  // "or permission of the instructor" cannot make a missing course appear, but
  // it does mean the gate is negotiable. Reporting it as `unmet` would be a
  // stronger claim than the bulletin makes.
  const status: PrereqStatus =
    course.prereq.instructorPermission && evaluation.status === "unmet"
      ? "unknown"
      : evaluation.status === "met" && advisories.length > 0
        ? "unknown"
        : evaluation.status;

  return { status, outstanding: evaluation.outstanding, advisories };
}

/**
 * Which courses a student could newly take if they added `courseId` — the
 * number that makes an intro course worth choosing over another.
 *
 * Counting `descendants` instead would badly overstate it: it counts courses
 * three chains away that this one term does not bring within reach.
 */
export function newlyUnlockedBy(
  graph: ProgressionGraph,
  courseId: string,
  completed: ReadonlySet<string>,
): string[] {
  const after = new Set(completed);
  after.add(courseId);

  const candidates = graph.unlocks.get(courseId) ?? [];
  return candidates.filter((candidate) => {
    if (completed.has(candidate)) return false;
    const before = evaluateCourse(graph, candidate, completed);
    if (before.status === "met") return false;
    return evaluateCourse(graph, candidate, after).status !== "unmet";
  });
}

/** Total reach: every course downstream, however many terms away. */
export function totalReach(graph: ProgressionGraph, courseId: string): number {
  return descendants(graph, courseId).length;
}
