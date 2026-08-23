/**
 * Schedule lane — conflict detection.
 *
 * Two rules, both from spec §8:
 *
 *   1. Custom blocks participate fully. "Work, Tue/Thu 3–6" is not a footnote,
 *      it is the thing that actually breaks a schedule, so it produces the same
 *      overlap conflicts a course does.
 *   2. Enrolling in two sections of the same course is a registration error, not
 *      a time clash — it is reported separately so the UI can say why.
 *
 * Pure. Importable from the MCP server.
 */

import type { CustomBlock, ScheduleConflict, Section, Weekday } from "../types";
import { WEEKDAY_LABEL, minutesToLabel } from "../constants";
import {
  courseLabel,
  groupByWeekday,
  overlaps,
  sectionLabel,
  toTimedItems,
  type TimedItem,
} from "./timeline";

/**
 * Overlap severity by what is colliding.
 *
 * Two courses, or a course and a personal commitment, are hard conflicts — the
 * student physically cannot be in both. Two personal commitments are soft: a
 * student may deliberately double-book their own time and we do not get a vote.
 */
function overlapSeverity(a: TimedItem, b: TimedItem): "hard" | "soft" {
  return a.kind === "block" && b.kind === "block" ? "soft" : "hard";
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Every time-overlap and duplicate-course problem in a plan.
 *
 * One conflict per colliding pair per weekday: a Mon/Wed clash reports twice,
 * because a student fixes it once per day on the grid.
 */
export function detectConflicts(
  sections: readonly Section[],
  blocks: readonly CustomBlock[],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const byDay = groupByWeekday(toTimedItems(sections, blocks));

  for (const [weekday, items] of byDay) {
    const seen = new Set<string>();
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        // Sorted by start: once b starts after a ends, nothing later can overlap a.
        if (b.startMinute >= a.endMinute) break;
        if (a.id === b.id) continue;
        if (!overlaps(a, b)) continue;

        // A single section meeting twice in a day (lecture + lab) is not a clash
        // with itself; different sections of the same course are caught below.
        const key = pairKey(a.id, b.id);
        if (seen.has(key)) continue;
        seen.add(key);

        conflicts.push({
          kind: "overlap",
          severity: overlapSeverity(a, b),
          message: `${a.label} (${minutesToLabel(a.startMinute)}–${minutesToLabel(
            a.endMinute,
          )}) overlaps ${b.label} (${minutesToLabel(b.startMinute)}–${minutesToLabel(
            b.endMinute,
          )}) on ${WEEKDAY_LABEL[weekday]}`,
          involves: [a.id, b.id],
          weekday,
        });
      }
    }
  }

  conflicts.push(...detectDuplicateCourses(sections));
  return conflicts;
}

/**
 * Two sections of the same course in one plan. The registrar rejects this even
 * when the times are clean, so it is a hard conflict with no weekday of its own —
 * we attach the earliest weekday either section meets so the grid can point at it.
 */
export function detectDuplicateCourses(sections: readonly Section[]): ScheduleConflict[] {
  const byCourse = new Map<string, Section[]>();
  for (const section of sections) {
    const list = byCourse.get(section.courseId);
    if (list) list.push(section);
    else byCourse.set(section.courseId, [section]);
  }

  const conflicts: ScheduleConflict[] = [];
  for (const [courseId, group] of byCourse) {
    if (group.length < 2) continue;
    conflicts.push({
      kind: "duplicate_course",
      severity: "hard",
      message: `${courseLabel(courseId)} is in this plan ${group.length} times (${group
        .map((section) => sectionLabel(section))
        .join(", ")}). Registration accepts only one section per course.`,
      involves: group.map((section) => section.sectionId),
      weekday: earliestWeekday(group),
    });
  }
  return conflicts;
}

/** ScheduleConflict requires a weekday; a duplicate has no natural one. */
function earliestWeekday(sections: readonly Section[]): Weekday {
  const items = toTimedItems(sections, []);
  return items.length > 0 ? items[0].weekday : "Mo";
}

/** True when nothing in the plan is a hard stop. */
export function isPlanFeasible(conflicts: readonly ScheduleConflict[]): boolean {
  return !conflicts.some((conflict) => conflict.severity === "hard");
}

/** Section/block ids touched by at least one conflict, for grid highlighting. */
export function conflictedIds(conflicts: readonly ScheduleConflict[]): Set<string> {
  const ids = new Set<string>();
  for (const conflict of conflicts) for (const id of conflict.involves) ids.add(id);
  return ids;
}
