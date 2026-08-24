/**
 * Resolve half-written course references against the real course universe.
 *
 * The bulletin abbreviates once it has named a subject. "Students may receive
 * credit for only one of the following two courses: 1004 or 1005" is about
 * COMS W1004 and COMS W1005, but read literally it yields `COMS1004` and
 * `COMS1005` — ids with no qualifier, which join to nothing.
 *
 * The fix is not to guess a qualifier. It is to look the course up: within one
 * subject a number almost always has exactly one qualifier, so `COMS` + `1004`
 * resolves to `COMS1004W` unambiguously. Where it does not — two real courses
 * sharing a number with different qualifiers — the reference is left exactly as
 * written rather than resolved to the wrong one.
 */

import type { EquivalenceGroup, PrereqNode, PrereqRequirement } from "./types";

/** `${subjectCode}${number}` → the one canonical id, when there is only one. */
export type CanonicalIndex = ReadonlyMap<string, string>;

/**
 * Build the lookup from every course id we actually know about.
 *
 * A number with more than one qualifier is deliberately *removed* from the
 * index rather than resolved arbitrarily.
 */
export function buildCanonicalIndex(courseIds: Iterable<string>): CanonicalIndex {
  const candidates = new Map<string, Set<string>>();

  for (const courseId of courseIds) {
    const match = /^([A-Z]{2,5})(\d{4})([A-Z]{0,3})$/.exec(courseId);
    if (!match) continue;
    const key = `${match[1]}${match[2]}`;
    const existing = candidates.get(key);
    if (existing) existing.add(courseId);
    else candidates.set(key, new Set([courseId]));
  }

  const index = new Map<string, string>();
  for (const [key, ids] of candidates) {
    // The unqualified form is itself a member when a course genuinely has no
    // qualifier; that is the identity case and still resolves correctly.
    if (ids.size === 1) index.set(key, [...ids][0]);
  }
  return index;
}

/** `COMS1004` → `COMS1004W`. Unknown or ambiguous references pass through. */
export function canonicalizeCourseId(courseId: string, index: CanonicalIndex): string {
  if (index.has(courseId)) return index.get(courseId) as string;
  const match = /^([A-Z]{2,5})(\d{4})([A-Z]{0,3})$/.exec(courseId);
  if (!match) return courseId;
  return index.get(`${match[1]}${match[2]}`) ?? courseId;
}

export function canonicalizeNode(
  node: PrereqNode | null,
  index: CanonicalIndex,
): PrereqNode | null {
  if (!node) return null;
  if (node.kind === "advisory") return node;
  if (node.kind === "course") {
    return { ...node, courseId: canonicalizeCourseId(node.courseId, index) };
  }
  return {
    kind: node.kind,
    children: node.children
      .map((child) => canonicalizeNode(child, index))
      .filter((child): child is PrereqNode => child !== null),
  };
}

export function canonicalizeRequirement(
  requirement: PrereqRequirement | null,
  index: CanonicalIndex,
): PrereqRequirement | null {
  if (!requirement) return null;
  return {
    ...requirement,
    tree: canonicalizeNode(requirement.tree, index),
    corequisites: canonicalizeNode(requirement.corequisites, index),
  };
}

export function canonicalizeEquivalenceGroups(
  groups: EquivalenceGroup[],
  index: CanonicalIndex,
): EquivalenceGroup[] {
  return groups.map((group) => ({
    ...group,
    courseIds: [...new Set(group.courseIds.map((id) => canonicalizeCourseId(id, index)))].sort(),
  }));
}
