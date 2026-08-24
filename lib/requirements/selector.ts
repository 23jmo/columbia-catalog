/**
 * One definition of "does this course match this selector".
 *
 * `CourseSelector` is read in two directions and they must agree exactly:
 *
 *   **Backwards**, by `evaluate.ts` — "the student took MATH UN1201; does it
 *   count toward the Science Requirement?"
 *
 *   **Forwards**, by `candidates.ts` — "what could the student take to finish
 *   the Science Requirement?"
 *
 * Before this module existed only the backward direction was implemented, and
 * the forward one returned `[]` for every open-ended rule. The obvious fix is
 * to write a query that generates candidates — and the obvious bug in that fix
 * is that the query and the predicate drift apart, so the audit refuses to
 * count a course the recommender just recommended. That failure is silent and
 * it is maddening from the student's side.
 *
 * So the predicate lives here once, and `candidates.ts` re-checks every row its
 * query returns against this same function before handing it out. The query is
 * an index-accelerated pre-filter; this is the authority.
 */

import type { RequirementFlags } from "@/lib/types";
import { padSubjectCode, toCourseId, type CourseId } from "./code";
import type { CourseSelector } from "./types";

/**
 * A course, reduced to the two things a selector can ask about.
 *
 * `requirementFlags: null` means "we hold no catalog record for this course" —
 * a transcript row for an archived or transfer course. It is deliberately
 * distinct from `{}` ("we hold a record and it carries no flags"), because the
 * two must behave the same way for flag rules but should not be conflated by a
 * future reader.
 */
export interface SelectorSubject {
  courseId: CourseId;
  requirementFlags: RequirementFlags | null;
}

/** The subject fields of a selector, precompiled so callers can reuse them. */
export interface CompiledSelector {
  /** Padded subject codes, or null when the selector does not constrain them. */
  subjects: string[] | null;
  numberRange: [number, number] | null;
  flag: string | null;
  /** Course ids that always match. */
  include: Set<CourseId>;
  /** Course ids that never match. */
  exclude: Set<CourseId>;
  /**
   * False when the selector names only explicit courses. Such a selector
   * matches its `include` list and nothing else — a distinction that decides
   * whether a query should scan the catalog at all.
   */
  hasShape: boolean;
}

function toIdSet(codes: string[] | undefined): Set<CourseId> {
  return new Set(
    (codes ?? []).map(toCourseId).filter((id): id is CourseId => id !== null),
  );
}

export function compileSelector(select: CourseSelector): CompiledSelector {
  return {
    subjects: select.subjects ? select.subjects.map(padSubjectCode) : null,
    numberRange: select.numberRange ?? null,
    flag: (select.flag as string | undefined) ?? null,
    include: toIdSet(select.include),
    exclude: toIdSet(select.exclude),
    hasShape:
      select.subjects != null || select.numberRange != null || select.flag != null,
  };
}

/** The four-digit course number inside a course id, or null. */
export function courseNumberOf(courseId: CourseId): number | null {
  const digits = /(\d{4})/.exec(courseId)?.[1];
  return digits ? Number(digits) : null;
}

/** The padded subject code at the head of a course id, or null. */
export function subjectCodeOf(courseId: CourseId): string | null {
  return /^([A-Z]{2,6}_*)/.exec(courseId)?.[1] ?? null;
}

/**
 * Does this course match this selector?
 *
 * Order matters and is load-bearing. `exclude` beats everything, and `include`
 * is checked after it but before the shape — that is how the Bulletin's
 * "…and COMS W3902" tails work: an explicitly listed course still matches even
 * when it falls outside the selector's own subject or level bounds.
 */
export function matchesCompiledSelector(
  subject: SelectorSubject,
  compiled: CompiledSelector,
): boolean {
  if (compiled.exclude.has(subject.courseId)) return false;
  if (compiled.include.has(subject.courseId)) return true;
  if (!compiled.hasShape) return false;

  if (compiled.subjects) {
    const code = subjectCodeOf(subject.courseId);
    if (!code || !compiled.subjects.includes(code)) return false;
  }

  if (compiled.numberRange) {
    const number = courseNumberOf(subject.courseId);
    if (number == null) return false;
    const [low, high] = compiled.numberRange;
    if (number < low || number > high) return false;
  }

  if (compiled.flag) {
    /*
     * No catalog record means no provable flag.
     *
     * A transcript-only course cannot be shown to satisfy a flagged
     * requirement, and claiming otherwise is exactly the false green the
     * verification tiers exist to prevent. This is the same rule `evaluate.ts`
     * applied before the predicate moved here.
     */
    if (!subject.requirementFlags) return false;
    if (subject.requirementFlags[compiled.flag] !== true) return false;
  }

  return true;
}

/** Convenience wrapper for one-off checks. Compile once when looping. */
export function matchesSelector(
  subject: SelectorSubject,
  select: CourseSelector,
): boolean {
  return matchesCompiledSelector(subject, compileSelector(select));
}
