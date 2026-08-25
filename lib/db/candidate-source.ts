/**
 * The Supabase side of requirement candidate generation.
 *
 * `lib/requirements/candidates.ts` owns the semantics and stays pure; this file
 * owns exactly one thing — turning a `CompiledSelector` into a query the
 * catalog's existing indexes can answer.
 *
 * ── Every clause below is chosen to hit an index ───────────────────────────
 *
 *   subjects      idx_courses_subject_number (subject_code, course_number)
 *   numberRange   idx_courses_number
 *   flag          idx_courses_requirement_flags, a GIN over jsonb_path_ops.
 *                 `.contains()` compiles to `@>`, which is the ONLY operator
 *                 that index serves — `->>` would silently seq-scan 8,189 rows.
 *   term          sections!inner + term_code, the same shape
 *                 `catalog-queries.ts` already uses for every course listing.
 *
 * ── Why the term filter is not optional ────────────────────────────────────
 *
 * A candidate is advice, and advice to take a course that is not offered is
 * worse than silence. The inner join to `sections` restricted to `ACTIVE_TERMS`
 * is what makes "you could take this" true. It also shrinks the search space
 * from 8,189 courses to the ~4,900 actually on offer.
 *
 * ── What this file deliberately does NOT do ────────────────────────────────
 *
 * It does not decide whether a row really matches. SQL and the TypeScript
 * predicate are two dialects of the same rule and they will drift; the caller
 * re-checks every row against `matchesCompiledSelector`. Concretely, `include`
 * is unioned in as an OR here but the exact `include`-beats-shape ordering is
 * resolved in the predicate, not in PostgREST.
 */

import { ACTIVE_TERMS } from "@/lib/constants";
import { formatCourseId } from "@/lib/requirements/code";
import type {
  CandidateCourse,
  CandidateProvider,
  CandidateQuery,
} from "@/lib/requirements/candidates";
import type { TermCode } from "@/lib/types";
import type { RequirementFlags } from "@/lib/types";

import { createAnonServerClient, getBrowserClient, isConfigured } from "./client";
import { parseRequirementFlags, type Json } from "./schema";

interface CandidateRow {
  course_id: string;
  title: string | null;
  /**
   * PostgREST returns `numeric` as a string, so this is genuinely either.
   * Normalized in `toCandidate` rather than trusted.
   */
  points_min: number | string | null;
  /**
   * `Json`, not `unknown`: the column really is jsonb, and `parseRequirementFlags`
   * validates it with zod anyway. Typing it `unknown` bought no safety — it just
   * moved a cast to the call site.
   */
  requirement_flags: Json | null;
}

function toCandidate(row: CandidateRow): CandidateCourse {
  const points =
    row.points_min == null
      ? null
      : Number.isFinite(Number(row.points_min))
        ? Number(row.points_min)
        : null;

  return {
    courseId: row.course_id,
    code: formatCourseId(row.course_id),
    title: row.title,
    points,
    requirementFlags: parseRequirementFlags(row.requirement_flags),
  };
}

/**
 * The selector fields a query can express, applied to a PostgREST builder.
 *
 * `exclude` is applied here as `not.in` rather than left to the caller because
 * a student with 30 completed courses would otherwise burn 30 of the 60
 * candidate slots on courses they have already taken — the limit would silently
 * become a much smaller number.
 */
function applySelector(
  // The PostgREST builder is generically typed to the row shape; the chain
  // below only narrows filters, so a loose local type keeps this readable
  // without weakening anything the caller sees.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder: any,
  query: CandidateQuery,
  terms: TermCode[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const { select, exclude, limit } = query;
  let q = builder.in("sections.term_code", terms);

  if (select.subjects && select.subjects.length > 0) {
    q = q.in("subject_code", select.subjects);
  }

  if (select.numberRange) {
    const [low, high] = select.numberRange;
    q = q.gte("course_number", low).lte("course_number", high);
  }

  if (select.flag) {
    // `@>` containment — the one operator idx_courses_requirement_flags serves.
    q = q.contains("requirement_flags", { [select.flag]: true });
  }

  if (select.exclude.size > 0) {
    q = q.not("course_id", "in", `(${[...select.exclude].join(",")})`);
  }

  if (exclude.size > 0) {
    q = q.not("course_id", "in", `(${[...exclude].join(",")})`);
  }

  /*
   * Over-fetch, then let the caller's re-check and dedupe cut back.
   *
   * The inner join to `sections` yields one row per SECTION, so a course with
   * twelve sections consumes twelve rows of the limit. Fetching `limit` alone
   * would return a handful of distinct courses. PostgREST cannot express
   * DISTINCT here, so the multiplier is the honest fix; `MAX_ROW_MULTIPLIER`
   * is capped so a pathological course cannot make this unbounded.
   */
  return q.limit(Math.min(limit * ROW_MULTIPLIER, MAX_ROWS));
}

/** Sections per course, roughly, for sizing the over-fetch. */
const ROW_MULTIPLIER = 8;
const MAX_ROWS = 1000;

export interface SupabaseCandidateOptions {
  /** Terms a candidate must be offered in. Defaults to the active pair. */
  terms?: TermCode[];
}

/**
 * Build a provider backed by the live catalog.
 *
 * Returns a provider that yields `[]` rather than throwing when Supabase is not
 * configured. A missing database should degrade a recommendation surface to
 * empty, not crash the page it sits on — the audit above it is still correct
 * and still worth rendering.
 */
export function createSupabaseCandidateProvider(
  options: SupabaseCandidateOptions = {},
): CandidateProvider {
  const terms = options.terms ?? ACTIVE_TERMS;

  return async (query) => {
    if (!isConfigured()) return [];
    const client =
      typeof window === "undefined" ? createAnonServerClient() : getBrowserClient();
    if (!client) return [];

    /*
     * A selector naming only explicit courses has no shape to query on. Asking
     * the database for "everything, then filter to these twelve ids" would scan
     * the catalog to produce a list we already hold, so it is fetched by id.
     */
    const explicitOnly = !query.select.hasShape && query.select.include.size > 0;

    const builder = client
      .from("courses")
      .select("course_id, title, points_min, requirement_flags, sections!inner(section_id, term_code)");

    const q = explicitOnly
      ? builder
          .in("course_id", [...query.select.include])
          .in("sections.term_code", terms)
          .limit(MAX_ROWS)
      : applySelector(builder, query, terms);

    const { data, error } = await q;
    if (error || !data) return [];

    // One row per section collapses to one row per course. Insertion order is
    // the database's order, which is the subject/number index order — stable,
    // and the caller ranks from here anyway.
    const byId = new Map<string, CandidateCourse>();
    for (const row of data as unknown as CandidateRow[]) {
      if (byId.has(row.course_id)) continue;
      byId.set(row.course_id, toCandidate(row));
    }

    return [...byId.values()].slice(0, query.limit);
  };
}

/**
 * `include` courses are fetched separately when the selector also has a shape.
 *
 * The Bulletin's "…and COMS W3902" tails name courses that fall OUTSIDE the
 * selector's own subject or level bounds — that is the entire reason `include`
 * exists. A single query cannot express "matches the shape OR is one of these"
 * through PostgREST's filter chain without an `or()` string that has to escape
 * every id, so the two halves are fetched separately and merged. The predicate
 * still decides.
 */
export function createSupabaseCandidateProviderWithIncludes(
  options: SupabaseCandidateOptions = {},
): CandidateProvider {
  const base = createSupabaseCandidateProvider(options);

  return async (query) => {
    const shaped = query.select.hasShape ? await base(query) : [];

    if (query.select.include.size === 0) return shaped.slice(0, query.limit);

    const includeQuery: CandidateQuery = {
      ...query,
      select: { ...query.select, hasShape: false },
    };
    const included = await base(includeQuery);

    const byId = new Map<string, CandidateCourse>();
    // Explicit courses first: the Bulletin naming a course outright is a
    // stronger claim than a flag match, and the ranking downstream agrees.
    for (const course of [...included, ...shaped]) {
      if (!byId.has(course.courseId)) byId.set(course.courseId, course);
    }
    return [...byId.values()].slice(0, query.limit);
  };
}

export type { CandidateCourse } from "@/lib/requirements/candidates";

/** Flags parsed off a raw jsonb column value. Re-exported for tests. */
export type { RequirementFlags };
