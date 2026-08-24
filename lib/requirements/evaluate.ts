/**
 * The audit engine: a student's course list plus a program, out comes what is
 * done and what is left.
 *
 * Pure. It takes a `CourseLookup` rather than reaching for the database, so it
 * runs identically in a test, in a server component, and inside the MCP
 * `check_requirements` tool. Nothing in here does I/O.
 *
 * ── Two modelling decisions worth defending ─────────────────────────────────
 *
 * **1. Groups are evaluated independently, and double-counting is reported
 * rather than resolved.**
 *
 * Columbia's real rules about overlap are program-specific, unpublished in any
 * structured form, and frequently settled by an advisor: the Core allows some
 * overlap, most majors forbid it, and "one course may count toward both the
 * major and the concentration" appears as prose in some departments and not
 * others. We have no data source for any of it.
 *
 * So a course that satisfies two groups is counted in both, and
 * `crossCountedCourseIds` names it. The UI then says "COMS W3203 is counting
 * toward 2 requirements — confirm with your adviser", which is true and useful.
 * The alternative — silently assigning it to one group — invents a registrar
 * rule and gets a student to graduation one course short.
 *
 * **2. Planned courses count, but are marked.**
 *
 * A student planning next term wants to see the requirement go green when they
 * add the course, otherwise the screen cannot answer "what should I take". So
 * a course on a plan counts toward `completed`, and every match carries
 * `planned: true` so nothing renders a planned course as a finished one.
 */

import type { RequirementFlags } from "@/lib/types";
import { formatCourseId, toCourseId, type CourseId } from "./code";
import { compileSelector, matchesCompiledSelector } from "./selector";
import {
  verificationOf,
  type CourseSelector,
  type GroupMatch,
  type GroupResult,
  type Program,
  type ProgramResult,
  type RequirementGroup,
  type RequirementRule,
} from "./types";

/**
 * What the engine needs to know about a course. A narrow local interface, not
 * `Course` from `@/lib/types` — the engine must be callable with a partial
 * record recovered from a transcript paste, where all we have is a code.
 */
export interface CourseFacts {
  courseId: CourseId;
  title: string | null;
  points: number | null;
  requirementFlags: RequirementFlags;
}

export type CourseLookup = (courseId: CourseId) => CourseFacts | undefined;

/** One entry in the student's record. */
export interface TakenCourseInput {
  courseId: CourseId;
  /** Term it was taken in, or is planned for. `null` when unknown. */
  termCode: string | null;
  /** On a plan rather than completed. */
  planned: boolean;
  /**
   * Points the student earned, when they differ from the catalog's range —
   * variable-credit courses are real and a 1-point independent study should not
   * count as 3.
   */
  points?: number | null;
}

export interface EvaluateOptions {
  taken: TakenCourseInput[];
  lookup: CourseLookup;
  /** Group ids the student has self-certified, for `attested` rules. */
  attestations?: Record<string, string | null>;
}

/** Points for one entry: the student's own number wins over the catalog's. */
function pointsFor(entry: TakenCourseInput, facts: CourseFacts | undefined): number {
  if (entry.points != null) return entry.points;
  return facts?.points ?? 0;
}

function toMatch(entry: TakenCourseInput, facts: CourseFacts | undefined): GroupMatch {
  return {
    courseId: entry.courseId,
    code: formatCourseId(entry.courseId),
    title: facts?.title ?? null,
    points: pointsFor(entry, facts) || null,
    planned: entry.planned,
  };
}

/**
 * Does one course match a selector?
 *
 * The predicate itself lives in `./selector.ts` because the SAME question is
 * asked in the other direction by `./candidates.ts` ("what would satisfy this
 * rule?"), and two implementations of it would eventually disagree — leaving
 * the audit refusing to count a course the recommender had just recommended.
 * This is the adapter from the audit's input shape onto that one definition.
 */
function matchesSelector(
  entry: TakenCourseInput,
  facts: CourseFacts | undefined,
  select: CourseSelector,
): boolean {
  return matchesCompiledSelector(
    { courseId: entry.courseId, requirementFlags: facts?.requirementFlags ?? null },
    compileSelector(select),
  );
}

/**
 * Deterministic match order: completed before planned, then by course id.
 *
 * Without this a `points_matching` group could swallow a planned course and
 * leave a completed one unassigned, so the same record would render differently
 * depending on array order. Completed-first also means the "you still need 3
 * points" number is the pessimistic, honest one.
 */
function orderedForMatching(entries: TakenCourseInput[]): TakenCourseInput[] {
  return [...entries].sort((a, b) => {
    if (a.planned !== b.planned) return a.planned ? 1 : -1;
    return a.courseId.localeCompare(b.courseId);
  });
}

function evaluateGroup(
  group: RequirementGroup,
  options: EvaluateOptions,
): GroupResult {
  const { taken, lookup, attestations } = options;
  const rule: RequirementRule = group.rule;
  const verification = verificationOf(rule);
  const ordered = orderedForMatching(taken);

  if (rule.kind === "attested") {
    const attestedAt = attestations?.[group.id] ?? null;
    return {
      group,
      status: attestedAt ? "satisfied" : "unmet",
      verification,
      matched: [],
      completed: attestedAt ? 1 : 0,
      required: 1,
      unit: "courses",
      candidates: [],
      attestedAt,
    };
  }

  if (rule.kind === "all_of" || rule.kind === "n_of") {
    const wanted = rule.courses
      .map(toCourseId)
      .filter((id): id is string => id !== null);
    const wantedSet = new Set(wanted);
    const matched = ordered
      .filter((entry) => wantedSet.has(entry.courseId))
      .map((entry) => toMatch(entry, lookup(entry.courseId)));

    const required = rule.kind === "all_of" ? wanted.length : rule.n;
    const completed = Math.min(matched.length, required);
    const matchedIds = new Set(matched.map((m) => m.courseId));

    return {
      group,
      status: statusOf(completed, required),
      verification,
      matched: matched.slice(0, required),
      completed,
      required,
      unit: "courses",
      candidates: wanted.filter((id) => !matchedIds.has(id)),
    };
  }

  if (rule.kind === "sequence_choice") {
    /*
     * Score every alternative, then report the one the student is furthest
     * into — not the first, and not the shortest.
     *
     * "Furthest into" is measured as a fraction, not a raw count, so a student
     * one course into a two-course sequence beats one course into a
     * three-course sequence. Reporting the wrong alternative would tell a
     * student they are 1/2 done with Lit Hum when they actually took CC I.
     */
    const scored = rule.sequences.map((sequence) => {
      const wanted = sequence.courses
        .map(toCourseId)
        .filter((id): id is string => id !== null);
      const wantedSet = new Set(wanted);
      const matched = ordered
        .filter((entry) => wantedSet.has(entry.courseId))
        .map((entry) => toMatch(entry, lookup(entry.courseId)));
      const matchedIds = new Set(matched.map((m) => m.courseId));
      return {
        sequence,
        matched,
        required: wanted.length,
        remaining: wanted.filter((id) => !matchedIds.has(id)),
        progress: wanted.length > 0 ? matched.length / wanted.length : 0,
      };
    });

    const best = scored.reduce((a, b) => (b.progress > a.progress ? b : a));
    return {
      group,
      status: statusOf(best.matched.length, best.required),
      verification,
      matched: best.matched,
      completed: best.matched.length,
      required: best.required,
      unit: "courses",
      // Only the chosen sequence's leftovers. Offering the other sequence's
      // courses as candidates would be advice to start a second sequence.
      candidates: best.remaining,
    };
  }

  if (rule.kind === "n_matching") {
    const matched = ordered
      .filter((entry) => matchesSelector(entry, lookup(entry.courseId), rule.select))
      .map((entry) => toMatch(entry, lookup(entry.courseId)));
    const completed = Math.min(matched.length, rule.n);
    return {
      group,
      status: statusOf(completed, rule.n),
      verification,
      matched: matched.slice(0, rule.n),
      completed,
      required: rule.n,
      unit: "courses",
      candidates: [],
    };
  }

  // points_matching — accumulate credit rather than course count, and stop
  // taking courses once the target is reached so the card does not claim
  // "18 of 12 points" when a student overshoots.
  const matched: GroupMatch[] = [];
  let earned = 0;
  for (const entry of ordered) {
    if (earned >= rule.points) break;
    const facts = lookup(entry.courseId);
    if (!matchesSelector(entry, facts, rule.select)) continue;
    matched.push(toMatch(entry, facts));
    earned += pointsFor(entry, facts);
  }

  return {
    group,
    status: statusOf(earned, rule.points),
    verification,
    matched,
    completed: Math.min(earned, rule.points),
    required: rule.points,
    unit: "points",
    candidates: [],
  };
}

function statusOf(completed: number, required: number): GroupResult["status"] {
  if (required <= 0) return "satisfied";
  if (completed >= required) return "satisfied";
  if (completed > 0) return "in_progress";
  return "unmet";
}

/**
 * Group ids this group's rule refuses to double-count with.
 *
 * Only the two open-ended rule kinds carry a selector, so only they can name
 * one. An `all_of` that overlapped another group would be a transcription
 * error rather than a rule to model.
 */
function excludedGroupIds(group: RequirementGroup): string[] {
  const rule = group.rule;
  if (rule.kind !== "n_matching" && rule.kind !== "points_matching") return [];
  return rule.select.excludeGroups ?? [];
}

export function evaluateProgram(
  program: Program,
  options: EvaluateOptions,
): ProgramResult {
  const firstPass = program.groups.map((group) => evaluateGroup(group, options));

  /*
   * Second pass for groups that exclude another group's matches.
   *
   * Needed because the first pass evaluates every group against the full
   * record independently, so a course required by name in one group is still
   * sitting in the pool when an elective block goes looking. The fix is not to
   * make groups aware of each other — that would turn an order-independent
   * evaluation into an order-dependent one — but to run them again with the
   * courses their named predecessors actually consumed removed.
   *
   * ONE pass, deliberately, not a fixpoint. Two groups that exclude each other
   * would oscillate, and no real curriculum expresses a requirement that way; a
   * single pass terminates, and its result is the honest one for the shape that
   * does occur — a later block excluding earlier, named requirements.
   */
  const consumed = new Map<string, Set<CourseId>>();
  for (const result of firstPass) {
    consumed.set(result.group.id, new Set(result.matched.map((match) => match.courseId)));
  }

  const groups: GroupResult[] = [];
  for (const [index, group] of program.groups.entries()) {
    const excludeGroups = excludedGroupIds(group);
    if (excludeGroups.length === 0) {
      groups.push(firstPass[index]);
      continue;
    }

    const spent = new Set<CourseId>();
    for (const groupId of excludeGroups) {
      for (const courseId of consumed.get(groupId) ?? []) spent.add(courseId);
    }
    if (spent.size === 0) {
      groups.push(firstPass[index]);
      continue;
    }

    const result = evaluateGroup(group, {
      ...options,
      taken: options.taken.filter((entry) => !spent.has(entry.courseId)),
    });
    groups.push(result);

    /*
     * Write the corrected match back before moving on, so a later group
     * excluding this one sees what it ACTUALLY took rather than its first-pass
     * guess.
     *
     * This is what makes two sibling elective slots work. The CS minor has two
     * "any 3000-level computer science course" groups, and in the first pass
     * both grab the same course — the lowest-numbered one the student holds,
     * which is usually a course a named requirement already claimed. Slot two
     * must exclude what slot one settled on after ITS own exclusions were
     * applied; excluding the first-pass value would hand both slots the same
     * course again and report a minor complete a course early.
     *
     * The loop runs in declaration order, so a group may only rely on groups
     * declared before it. A forward reference still resolves — to the first-pass
     * value — which is why the field is documented as one pass and not a
     * fixpoint. Curricula list prerequisites before electives, so this ordering
     * is the natural one rather than a constraint anyone has to remember.
     */
    consumed.set(group.id, new Set(result.matched.map((match) => match.courseId)));
  }

  let weighted = 0;
  let weight = 0;
  for (const result of groups) {
    // Weight by what the group asks for, so a 12-point elective block counts
    // for more than a one-course requirement. Points and courses are not the
    // same unit, so points are scaled to a rough course-equivalent (3 points)
    // rather than compared raw — otherwise a single points group dominates the
    // whole bar.
    const w = result.unit === "points" ? result.required / 3 : result.required;
    const done = result.unit === "points" ? result.completed / 3 : result.completed;
    weight += w;
    weighted += Math.min(done, w);
  }

  return {
    program,
    groups,
    satisfiedCount: groups.filter((g) => g.status === "satisfied").length,
    inProgressCount: groups.filter((g) => g.status === "in_progress").length,
    unmetCount: groups.filter((g) => g.status === "unmet").length,
    fraction: weight > 0 ? weighted / weight : 0,
  };
}

/**
 * Course ids that satisfied more than one group across all evaluated programs.
 *
 * Surfaced, never silently resolved — see the header. A student seeing "this
 * course is doing double duty, check with your adviser" is being told something
 * true; a student seeing it silently assigned to one group is being told
 * something we made up.
 */
export function crossCountedCourseIds(results: ProgramResult[]): string[] {
  const seen = new Map<string, number>();
  for (const result of results) {
    for (const group of result.groups) {
      for (const match of group.matched) {
        seen.set(match.courseId, (seen.get(match.courseId) ?? 0) + 1);
      }
    }
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([courseId]) => courseId)
    .sort();
}
