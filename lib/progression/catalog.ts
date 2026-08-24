/**
 * Progression read API — the single seam the progression UI reads through.
 *
 * Mirrors `lib/data/catalog.ts` deliberately. Today it is backed by the
 * generated `lib/prereqs/generated/prereq-catalog.json` (built by
 * `npx tsx scripts/build-prereqs.ts` from captured bulletin HTML). When the
 * database lane starts persisting `prerequisite_formula`, the bodies here
 * change and nothing above them does.
 *
 * The graph is built once per process. It is derived data over a frozen JSON
 * import, so rebuilding it per request would be pure waste.
 */

import catalogJson from "@/lib/prereqs/generated/prereq-catalog.json";
import { buildProgressionGraph, type ProgressionGraph } from "@/lib/prereqs/graph";
import type { PrereqCatalog, ProgressionCourse } from "@/lib/prereqs/types";
import { formatCourseId } from "@/lib/prereqs/format";

// Re-exported so callers keep a single import for everything catalog-shaped.
export { formatCourseId };

const CATALOG = catalogJson as unknown as PrereqCatalog;

let cachedGraph: ProgressionGraph | null = null;

export function getProgressionGraph(): ProgressionGraph {
  if (!cachedGraph) cachedGraph = buildProgressionGraph(CATALOG);
  return cachedGraph;
}

export function getPrereqCatalog(): PrereqCatalog {
  return CATALOG;
}

export function getProgressionCourse(courseId: string): ProgressionCourse | null {
  return getProgressionGraph().courses.get(courseId) ?? null;
}

/**
 * A display label for any id in the graph, catalog or external.
 *
 * External courses are the ones a prerequisite names but this department page
 * never describes — MATH UN1201 and friends. They still need to render.
 */
export function courseLabel(graph: ProgressionGraph, courseId: string): string {
  return graph.external.get(courseId)?.label ?? formatCourseId(courseId);
}


