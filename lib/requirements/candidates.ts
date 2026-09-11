/**
 * "What could I take to finish this?" — the forward direction of a requirement.
 *
 * ── The gap this closes ────────────────────────────────────────────────────
 *
 * `GroupResult.candidates` was populated for the rules that name a finite list
 * (`all_of`, `n_of`, `sequence_choice`) and returned `[]` for the two that do
 * not (`n_matching`, `points_matching`). Its old doc comment said so plainly:
 * "Empty for `n_matching` over a broad selector — there the recommender, not
 * the audit, is the right surface."
 *
 * The trouble is that the recommender read `requirement.candidates` too. So the
 * open-ended rules — Global Core, the Science Requirement, "three 3000-level
 * electives", every case where a student genuinely does not know what to take —
 * were the exact cases where nothing could be suggested. The rules that needed
 * no help worked; the rules that were the whole point returned nothing.
 *
 * ── Why a live query and not a build step ──────────────────────────────────
 *
 * A `CourseSelector` is a predicate over the catalog, and the catalog already
 * indexes everything it asks about: `idx_courses_subject_number` for subject and
 * level, and a GIN index over `requirement_flags` for the flag case. Compiling
 * the selector to a query is therefore cheap, and — more importantly — it is
 * fresh by construction. A generated candidate table would be stale the day a
 * department adds a course, and staleness here shows up as a course that exists,
 * is offered, satisfies the rule, and is never suggested.
 *
 * ── The correctness rule that matters ──────────────────────────────────────
 *
 * The query is a PRE-FILTER, never the authority. Every row it returns is
 * re-checked against `matchesCompiledSelector` — the same predicate
 * `evaluate.ts` uses to decide whether a course COUNTS. A candidate the audit
 * would refuse to count is worse than no candidate at all: the student takes it
 * and the requirement stays red.
 */

import { formatCourseId, type CourseId } from "./code";
import { exclusionKeysForProgram } from "./evaluate";
import {
  compileSelector,
  matchesCompiledSelector,
  type CompiledSelector,
} from "./selector";
import type { GroupResult, ProgramResult } from "./types";
import type { RequirementFlags } from "@/lib/types";

/** A course that could satisfy a rule, as the provider returns it. */
export interface CandidateCourse {
  courseId: CourseId;
  /** As a student reads it: `"ANTH UN2017"`. */
  code: string;
  title: string | null;
  points: number | null;
  requirementFlags: RequirementFlags;
}

export interface CandidateQuery {
  /** The shape to match. */
  select: CompiledSelector;
  /**
   * Course ids to leave out — everything already taken or planned. Applied by
   * the provider so the database does the work, and re-applied here.
   */
  exclude: ReadonlySet<CourseId>;
  /** Upper bound on rows. Providers may return fewer, never more. */
  limit: number;
}

/**
 * Fetches courses matching a selector. Async and injected, so this module stays
 * usable from a test with a fixture array and from a server component with
 * Supabase behind it.
 */
export type CandidateProvider = (query: CandidateQuery) => Promise<CandidateCourse[]>;

/**
 * How many candidates to fetch for one group.
 *
 * Deliberately small. This list feeds a recommender that will rank and cut to
 * a handful, and a student never reads 200 options — but a limit that is too
 * tight biases the recommender toward whatever the database happened to sort
 * first, which for `courses` is alphabetical by subject. 60 is wide enough that
 * ranking has real choice and narrow enough to stay one indexed page.
 */
export const DEFAULT_CANDIDATE_LIMIT = 60;

/** A provider over an in-memory course list. The test seam, and a fallback. */
export function inMemoryCandidateProvider(
  courses: readonly CandidateCourse[],
): CandidateProvider {
  return async ({ select, exclude, limit }) =>
    courses
      .filter((course) => !exclude.has(course.courseId))
      .filter((course) =>
        matchesCompiledSelector(
          { courseId: course.courseId, requirementFlags: course.requirementFlags },
          select,
        ),
      )
      .slice(0, limit);
}

/** Which rules need a query at all. The others already name their own courses. */
export function needsCandidateQuery(group: GroupResult): boolean {
  const kind = group.group.rule.kind;
  return kind === "n_matching" || kind === "points_matching";
}

export interface ExpandOptions {
  provider: CandidateProvider;
  /** Never suggest these. Taken and planned course ids. */
  exclude?: Iterable<CourseId>;
  limit?: number;
}

/**
 * Fill in `candidates` for the open-ended groups of one evaluated program.
 *
 * Satisfied groups are skipped: a query per finished requirement is a round
 * trip to produce a list nobody will render. Groups are expanded concurrently
 * because they are independent and a ten-group program should cost one round
 * trip's latency, not ten.
 */
export async function expandCandidates(
  result: ProgramResult,
  options: ExpandOptions,
): Promise<ProgramResult> {
  const exclude = new Set(options.exclude ?? []);
  const limit = options.limit ?? DEFAULT_CANDIDATE_LIMIT;

  /*
   * Stamped here because this is the last place the program is in hand. The
   * callers of `expandCandidatesForPrograms` all flatten straight to
   * `GroupResult[]`, and `excludeGroups` is resolved against the SAME program —
   * so after the flatten there is no way to tell this program's
   * `data-structures` from another program's. See `GroupResult.exclusionKey`.
   */
  const exclusionKeys = exclusionKeysForProgram(result.program);
  const keyed = (group: GroupResult): GroupResult => {
    const exclusionKey = exclusionKeys.get(group.group.id);
    return exclusionKey === undefined ? group : { ...group, exclusionKey };
  };

  const groups = await Promise.all(
    result.groups.map(async (group) => {
      /*
       * Stamped on satisfied and finite-list groups too, not only the ones
       * that get a query. The clusters that matter join an open-ended elective
       * block to the `all_of` core groups it refuses to re-count, and leaving
       * the core half unkeyed would leave the pair looking unrelated.
       */
      if (group.status === "satisfied") return keyed(group);
      if (!needsCandidateQuery(group)) return keyed(group);

      const rule = group.group.rule;
      if (rule.kind !== "n_matching" && rule.kind !== "points_matching") return keyed(group);

      // Courses already counted toward THIS group are not candidates for it,
      // on top of the caller's global exclusions.
      const matched = new Set(group.matched.map((m) => m.courseId));
      const compiled = compileSelector(rule.select);

      const rows = await options.provider({
        select: compiled,
        exclude: new Set([...exclude, ...matched]),
        limit,
      });

      /*
       * Re-check every row. The provider's query is an index-accelerated
       * approximation of the selector — a SQL translation of `include` /
       * `exclude` / `numberRange` that must agree with the predicate but is
       * written in a different language. This is the line that guarantees a
       * suggested course is a course the audit will actually count.
       */
      const verified = rows.filter(
        (row) =>
          !exclude.has(row.courseId) &&
          !matched.has(row.courseId) &&
          matchesCompiledSelector(
            { courseId: row.courseId, requirementFlags: row.requirementFlags },
            compiled,
          ),
      );

      return keyed({ ...group, candidates: verified.map((row) => row.courseId) });
    }),
  );

  return { ...result, groups };
}

/** `expandCandidates` across several programs, in one pass. */
export async function expandCandidatesForPrograms(
  results: readonly ProgramResult[],
  options: ExpandOptions,
): Promise<ProgramResult[]> {
  return Promise.all(results.map((result) => expandCandidates(result, options)));
}

/** Display helper: candidate ids rendered the way a student reads them. */
export function formatCandidates(group: GroupResult): string[] {
  return group.candidates.map(formatCourseId);
}
