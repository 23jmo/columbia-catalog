/**
 * Equivalence groups — "you may receive credit for only one of these".
 *
 * The bulletin states these in prose inside a course description, several
 * blocks away from the prerequisite that depends on knowing them:
 *
 *   "Note: Due to significant overlap, students may receive credit for only
 *    one of the following three courses: COMS W3134, COMS W3136, COMS W3137."
 *
 * Two surfaces need this. The prerequisite parser uses it to read W4111's
 * published "(W3134) and (W3136) and (W3137)" as the alternation it must be
 * (see `collapseEquivalentConjunctions`). The four-year planner uses it to
 * flag a plan that spends credits twice on the same material.
 *
 * Every phrasing matched below is one that appears verbatim in
 * `lib/ingest/__fixtures__/bulletin-cs.html`. The bulletin abbreviates once it
 * has named a subject — "COMS W3134, W3136, or W3137" — so codes are resolved
 * against the subject of the course whose description they appear in.
 */

import { buildCourseId, cleanText, parseCourseNumber } from "../ingest/parsers/shared";
import type { EquivalenceGroup } from "./types";

/**
 * The phrases that introduce a mutual-exclusion list, each followed by the
 * courses it applies to. Ordered longest-first so the more specific
 * "credit for only one of the following" wins over a bare "only one of".
 */
const EXCLUSION_TRIGGERS: RegExp[] = [
  /credit for only one of(?: the following)?(?: \w+)? courses?\s*:?/i,
  /may only receive credit for either/i,
  /may not receive credit for both/i,
  /credit for only one of/i,
  /only one of/i,
];

/** How far past the trigger a course list may run before we stop believing it. */
const LIST_WINDOW = 160;

const COURSE_IN_LIST =
  /\b(?:([A-Z]{2,5})\s+)?([A-Z]{1,3})?(\d{4})([A-Z]{1,3})?\b/g;

/**
 * Read every mutual-exclusion statement out of one course description.
 *
 * Returns one group per statement; `mergeEquivalenceGroups` folds overlapping
 * statements from different descriptions together afterwards.
 */
export function extractEquivalenceGroups(
  description: string | null | undefined,
  defaultSubject: string | null,
): EquivalenceGroup[] {
  const text = cleanText(description);
  if (!text) return [];

  const groups: EquivalenceGroup[] = [];
  // A description can carry more than one such note; scan the whole string and
  // never re-read a window we have already consumed.
  let cursor = 0;

  while (cursor < text.length) {
    const hit = firstTrigger(text, cursor);
    if (!hit) break;

    const listStart = hit.index + hit.length;
    const window = text.slice(listStart, listStart + LIST_WINDOW);
    const courseIds = harvestCourseIds(window, defaultSubject);

    if (courseIds.length >= 2) {
      groups.push({
        courseIds: [...courseIds].sort(),
        sourceText: cleanText(text.slice(hit.index, listStart + window.length)),
      });
    }
    cursor = listStart;
  }

  return groups;
}

function firstTrigger(text: string, from: number): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const trigger of EXCLUSION_TRIGGERS) {
    const match = trigger.exec(text.slice(from));
    if (!match) continue;
    const index = from + match.index;
    // Earliest wins; on a tie the longer (more specific) phrase wins.
    if (!best || index < best.index || (index === best.index && match[0].length > best.length)) {
      best = { index, length: match[0].length };
    }
  }
  return best;
}

/**
 * Collect course codes until the list stops looking like a list.
 *
 * The bulletin's lists are held together by commas, "or", "and" and the odd
 * "Barnard". Anything else — a full stop, a new sentence — ends it, which is
 * what keeps "only one of COMS 4160 or Barnard COMS 3160BC may be taken for
 * credit. Fall 2026: COMS W4160 …" from swallowing the schedule table that
 * follows it.
 */
function harvestCourseIds(window: string, defaultSubject: string | null): string[] {
  const ids: string[] = [];
  let lastEnd = 0;
  COURSE_IN_LIST.lastIndex = 0;

  for (let match = COURSE_IN_LIST.exec(window); match; match = COURSE_IN_LIST.exec(window)) {
    const gap = window.slice(lastEnd, match.index);
    if (ids.length > 0 && !isListGlue(gap)) break;

    const [, subject, prefix, digits, suffix] = match;
    const resolvedSubject = subject ?? defaultSubject;
    if (!resolvedSubject) break;

    const parsed = parseCourseNumber(`${prefix ?? ""}${digits}${suffix ?? ""}`);
    if (!parsed) break;

    const courseId = buildCourseId(resolvedSubject, parsed.number, parsed.qualifier);
    if (!ids.includes(courseId)) ids.push(courseId);
    lastEnd = match.index + match[0].length;
  }

  return ids;
}

const LIST_GLUE = /^[\s,;]*(?:or|and|nor)?[\s,;]*(?:Barnard|the following)?[\s,;]*$/i;

function isListGlue(gap: string): boolean {
  return LIST_GLUE.test(gap);
}

/**
 * Fold overlapping statements into maximal groups.
 *
 * The W3134/W3136/W3137 note appears in all three of their descriptions, each
 * abbreviated differently. Union-by-overlap turns those three partial views
 * into the one group they describe.
 */
export function mergeEquivalenceGroups(groups: EquivalenceGroup[]): EquivalenceGroup[] {
  const merged: EquivalenceGroup[] = [];

  for (const group of groups) {
    const overlapping = merged.filter((existing) =>
      existing.courseIds.some((id) => group.courseIds.includes(id)),
    );

    if (overlapping.length === 0) {
      merged.push({ ...group, courseIds: [...group.courseIds] });
      continue;
    }

    const combined = new Set(group.courseIds);
    const sources = [group.sourceText];
    for (const existing of overlapping) {
      existing.courseIds.forEach((id) => combined.add(id));
      sources.push(existing.sourceText);
      merged.splice(merged.indexOf(existing), 1);
    }
    merged.push({
      courseIds: [...combined].sort(),
      // Keep the fullest statement — it is the one a reader learns most from.
      sourceText: sources.sort((a, b) => b.length - a.length)[0],
    });
  }

  return merged.sort((a, b) => a.courseIds[0].localeCompare(b.courseIds[0]));
}

/** courseId → every id it is interchangeable with, itself included. */
export function buildEquivalenceIndex(
  groups: EquivalenceGroup[],
): Map<string, ReadonlySet<string>> {
  const index = new Map<string, ReadonlySet<string>>();
  for (const group of groups) {
    const members = new Set(group.courseIds);
    for (const id of group.courseIds) index.set(id, members);
  }
  return index;
}
