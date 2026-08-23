/**
 * Schedule lane — whole-plan analysis.
 *
 * One call produces everything the summary rail, the inline grid warnings and
 * the MCP `analyze_plan` tool need. Recomputed on every edit; it is cheap
 * because a plan is a handful of sections, not a catalog.
 *
 * Pure. Importable from the MCP server.
 */

import type {
  Building,
  Course,
  CustomBlock,
  PlanAnalysis,
  ScheduleConflict,
  Section,
  Weekday,
} from "../types";
import { REQUIREMENT_FILTERS, WEEKDAYS } from "../constants";
import { DEMO_BUILDINGS } from "./buildings";
import { detectConflicts } from "./conflicts";
import {
  analyzeCommute,
  commuteConflicts,
  totalWalkMinutesByDay,
  type CommuteLegDetail,
  type CommuteOptions,
} from "./commute";
import { toTimedItems } from "./timeline";

export interface AnalyzePlanInput {
  sections: readonly Section[];
  /** The courses those sections belong to. Supplies credits and requirement flags. */
  courses: readonly Course[];
  blocks?: readonly CustomBlock[];
  /**
   * Buildings with zones, and geocodes once the campus lane supplies them.
   * Defaults to this lane's own zone table so callers never have to care.
   */
  buildings?: readonly Building[];
  /** Weekdays the grid renders. Defaults to Mo–Fr. */
  weekdays?: readonly Weekday[];
  commute?: CommuteOptions;
}

/**
 * `PlanAnalysis` with the commute legs widened to carry the ids they connect,
 * so the grid can highlight exactly the two blocks a warning is about. Still a
 * `PlanAnalysis` for every consumer that only wants the shared shape.
 */
export interface PlanAnalysisDetail extends PlanAnalysis {
  commuteLegs: CommuteLegDetail[];
}

export interface CreditRange {
  min: number;
  max: number;
}

/**
 * Credits for one section.
 *
 * Columbia credits are a range, not a number — COMS 6900 is 1–3 points and a
 * plan that silently calls it 1 is lying about the student's load. The section's
 * own unit range wins; the course record is the fallback; a section with neither
 * contributes nothing rather than guessing.
 */
export function sectionCredits(section: Section, course?: Course): CreditRange {
  const min = section.minUnit ?? course?.pointsMin ?? null;
  const max = section.maxUnit ?? course?.pointsMax ?? min;
  if (min == null) return { min: 0, max: 0 };
  return { min, max: max ?? min };
}

/** Summed credit range across a plan. */
export function creditTotals(
  sections: readonly Section[],
  courses: readonly Course[],
): CreditRange {
  const byId = new Map(courses.map((course) => [course.courseId, course]));
  return sections.reduce<CreditRange>(
    (total, section) => {
      const credits = sectionCredits(section, byId.get(section.courseId));
      return { min: total.min + credits.min, max: total.max + credits.max };
    },
    { min: 0, max: 0 },
  );
}

/**
 * Requirement keys the plan's courses satisfy, in the order the filter list
 * declares them so the UI never has to sort. Only keys we actually surface as
 * filters are reported — a stray flag in the JSONB blob is not a requirement.
 */
export function satisfiedRequirements(courses: readonly Course[]): string[] {
  const satisfied = new Set<string>();
  for (const course of courses) {
    for (const filter of REQUIREMENT_FILTERS) {
      if (course.requirementFlags?.[filter.key] === true) satisfied.add(filter.key);
    }
  }
  return REQUIREMENT_FILTERS.filter((filter) => satisfied.has(filter.key)).map(
    (filter) => filter.key,
  );
}

/**
 * Weekdays with no course meeting. Custom blocks do not count — "no classes
 * Friday" stays true even when a shift is booked, and the grid shows the shift.
 */
export function daysWithNoClasses(
  sections: readonly Section[],
  weekdays: readonly Weekday[] = WEEKDAYS,
): Weekday[] {
  const busy = new Set(toTimedItems(sections, []).map((item) => item.weekday));
  return weekdays.filter((day) => !busy.has(day));
}

export function analyzePlan(input: AnalyzePlanInput): PlanAnalysisDetail {
  const { sections, courses } = input;
  const blocks = input.blocks ?? [];
  const buildings = input.buildings ?? DEMO_BUILDINGS;

  const commuteLegs = analyzeCommute(sections, blocks, buildings);
  const conflicts: ScheduleConflict[] = [
    ...detectConflicts(sections, blocks),
    ...commuteConflicts(commuteLegs, input.commute),
  ];
  const credits = creditTotals(sections, courses);

  return {
    creditsMin: credits.min,
    creditsMax: credits.max,
    conflicts,
    commuteLegs,
    satisfiedRequirements: satisfiedRequirements(courses),
    daysWithNoClasses: daysWithNoClasses(sections, input.weekdays ?? WEEKDAYS),
    totalWalkMinutesByDay: totalWalkMinutesByDay(commuteLegs),
  };
}

/** Convenience split used by the summary rail and the inline grid warnings. */
export function partitionConflicts(conflicts: readonly ScheduleConflict[]): {
  hard: ScheduleConflict[];
  soft: ScheduleConflict[];
} {
  return {
    hard: conflicts.filter((conflict) => conflict.severity === "hard"),
    soft: conflicts.filter((conflict) => conflict.severity === "soft"),
  };
}
