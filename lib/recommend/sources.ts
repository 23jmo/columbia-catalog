/**
 * The real sources behind the engine's injected interfaces.
 *
 * `lib/recommend/index.ts` is deliberately pure — it takes vectors and
 * prerequisite reachability as interfaces so the scoring rules can be tested
 * against ten courses in memory. This file is where those interfaces meet the
 * database, and it is separate precisely so that a change to the storage layer
 * cannot quietly change what the engine recommends.
 */

import { createServiceRoleClient } from "@/lib/db/client";
import {
  buildProgressionGraph,
  evaluateCourse,
  newlyUnlockedBy,
  type ProgressionGraph,
} from "@/lib/prereqs/graph";
import type { PrereqNode, PrereqRequirement, ProgressionCourse } from "@/lib/prereqs/types";
import type { CourseId } from "@/lib/requirements/code";

import type { CourseVectorSource, PrereqSource } from "./types";

/* ==========================================================================
 * Prerequisites
 * ========================================================================== */

/**
 * The shape `scripts/backfill-prereqs.ts` writes into
 * `courses.prerequisite_formula`.
 *
 * Declared here as well as in `lib/db/schema.ts` because this is the READ side,
 * and the two ends of a jsonb column should be able to disagree loudly rather
 * than silently share a type that only one of them maintains.
 */
interface StoredFormula {
  tree: PrereqNode | null;
  corequisites: PrereqNode | null;
  instructorPermission: boolean;
  advisories: string[];
}

/**
 * Narrow an untrusted jsonb value into a formula.
 *
 * Returns `null` rather than throwing on anything unexpected. The column is
 * written by a script that may be an older version than this reader, and the
 * correct response to a formula we do not understand is to treat the course as
 * having no parsed prerequisites — which routes it through the `unknown` path
 * and shows the student the registrar's prose. Throwing would take down a whole
 * feed over one malformed row.
 */
function readStoredFormula(value: unknown): PrereqRequirement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Partial<StoredFormula>;
  if (typeof record.instructorPermission !== "boolean") return null;

  return {
    tree: (record.tree ?? null) as PrereqNode | null,
    corequisites: (record.corequisites ?? null) as PrereqNode | null,
    instructorPermission: record.instructorPermission,
    advisories: Array.isArray(record.advisories) ? record.advisories.filter(isString) : [],
    // `confidence` is stored in its own column; the graph does not read it, and
    // inventing a value here would let a `prose` formula masquerade as parsed.
    confidence: "partial",
  } as PrereqRequirement;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Build the progression graph from the backfilled formulas.
 *
 * Reads every course, not only the 1,293 with prerequisite prose: the graph's
 * `unlocks` map has to know that a course with no prerequisites exists, or
 * `newlyUnlockedBy` cannot tell "nothing depends on this" from "we never loaded
 * it". Roughly 8,189 rows, which is one query and a few MB — worth doing once
 * per process rather than per request.
 */
export async function loadProgressionGraph(): Promise<ProgressionGraph> {
  const db = createServiceRoleClient();
  if (!db) {
    /*
     * Throw rather than return an empty graph. An empty graph reports every
     * course as having no prerequisites, i.e. `met` — so a missing service-role
     * key would silently turn the hard filter off and start recommending
     * COMS W4111 to first-years. Callers that want to survive this should catch
     * and fall back to `unknownPrereqSource()`, which fails toward showing the
     * caveat instead of toward showing everything.
     */
    throw new Error(
      "loadProgressionGraph: no service-role Supabase client. " +
        "Fall back to unknownPrereqSource() rather than running without a prerequisite filter.",
    );
  }

  const courses: ProgressionCourse[] = [];
  const PAGE = 1000;

  /*
   * Paged explicitly. PostgREST caps a response at 1,000 rows regardless of
   * `.limit()`, so a single call would silently return an eighth of the catalog
   * and produce a graph that looks fine and is mostly missing — the worst
   * possible failure for a filter that decides what a student may be shown.
   */
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("courses")
      .select("course_id, subject_code, course_number, qualifier, title, points_min, prerequisite_formula")
      .order("course_id")
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`loadProgressionGraph: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      courses.push({
        courseId: row.course_id,
        subjectCode: row.subject_code,
        number: row.course_number,
        qualifier: row.qualifier,
        title: row.title,
        points: row.points_min == null ? null : Number(row.points_min),
        prereq: readStoredFormula(row.prerequisite_formula),
        equivalents: [],
      });
    }

    if (data.length < PAGE) break;
  }

  return buildProgressionGraph({
    source: "courses.prerequisite_formula",
    builtAt: new Date().toISOString(),
    courses,
    /*
     * Equivalence groups were applied at BACKFILL time — `canonicalizeRequirement`
     * already rewrote retired course codes onto their surviving ids before the
     * formula was stored. Passing them again here would be redundant, and
     * passing a stale set would be worse than passing none.
     */
    equivalenceGroups: [],
  });
}

/**
 * Wrap a graph as the engine's `PrereqSource`.
 *
 * A thin adapter on purpose. Every judgement about what `met`, `unmet` and
 * `unknown` mean — including the rule that instructor permission downgrades a
 * failed gate to `unknown` rather than leaving it `unmet` — lives in
 * `evaluateCourse`, and duplicating any of it here would create a second
 * opinion about whether a student may see a course.
 */
export function graphPrereqSource(graph: ProgressionGraph): PrereqSource {
  return {
    statusFor(courseId, completed) {
      const evaluation = evaluateCourse(graph, courseId, completed);
      return {
        status: evaluation.status,
        outstanding: evaluation.outstanding.map((choice) => choice.options),
        advisories: evaluation.advisories,
      };
    },
    newlyUnlockedBy(courseId, completed) {
      return newlyUnlockedBy(graph, courseId, completed);
    },
  };
}

/**
 * The source to use when the graph could not be loaded.
 *
 * Reports every course as `unknown` — never `met`, never `unmet`.
 *
 * This is the one degradation that had to be designed rather than defaulted.
 * `met` would let the engine recommend anything to anyone, which is the exact
 * failure the hard filter exists to prevent. `unmet` would empty the feed for
 * every student the moment a query failed. `unknown` shows courses with the
 * caveat attached, which is the same answer the engine gives for the 43.2% of
 * prerequisites the parser could not resolve — a state the UI already handles.
 */
export function unknownPrereqSource(): PrereqSource {
  return {
    statusFor: () => ({
      status: "unknown",
      outstanding: [],
      advisories: ["Prerequisites could not be checked. Read the course page before registering."],
    }),
    newlyUnlockedBy: () => [],
  };
}

/* ==========================================================================
 * Semantic vectors
 * ========================================================================== */

/**
 * A vector source backed by an in-memory map.
 *
 * The LSA vectors currently live in `public/index/*.emb.bin`, an artifact built
 * for the browser search client. Decoding it server-side is real work and it is
 * not this module's work, so the seam is here: whatever eventually reads that
 * file produces a map, and the engine never learns where it came from.
 */
export function mapVectorSource(
  vectors: ReadonlyMap<string, Float32Array>,
): CourseVectorSource {
  return { vectorFor: (courseId: CourseId) => vectors.get(courseId) };
}

/**
 * The vector source to use before the LSA artifact is wired up.
 *
 * Every course returns `undefined`, which the engine already handles: taste
 * scores zero, a `no_vector` caveat is attached, and recommendations fall back
 * to requirement fit and unlock. That is a real, useful feed — it is the
 * "here is what your degree needs" half of the product working without the
 * "here is what you might like" half.
 *
 * Named rather than passed inline so that a feed running without semantics is
 * visible in the code, instead of looking like a configured choice.
 */
export function noVectorSource(): CourseVectorSource {
  return { vectorFor: () => undefined };
}
