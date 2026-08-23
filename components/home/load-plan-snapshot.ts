/**
 * The one place Home and `/schedule` load a plan from.
 *
 * Both screens need exactly the same four things — the plan, its sections, the
 * courses those sections belong to, and `analyzePlan`'s verdict — so they share
 * this loader rather than each assembling it and drifting apart.
 *
 * Everything analytical here is `lib/schedule`. This module resolves data and
 * shapes it; it does not compute credits, conflicts, or commutes, because that
 * lane already does and a second implementation would be a second set of
 * answers.
 *
 * ── SEAMS, in the order they will be removed ───────────────────────────────
 *
 * TODO(auth): there is no session, so there is no student and therefore no
 *   saved plan. `resolvePlan` returns `null` by default and the screens render
 *   their signed-out state. Spec §15: read is free, write needs an account.
 *
 * TODO(db): once Supabase lands, `resolvePlan` becomes
 *   `getPrimaryPlan(userId, termCode)`. Note that `planStore` from
 *   `@/lib/schedule` is deliberately NOT used here — it is localStorage-backed
 *   and a server component cannot read it. It becomes usable from this seam the
 *   moment its Supabase implementation lands.
 *
 * TODO(ingest): the Fall 2026 seed carries real courses, call numbers, seats
 *   and instructors but **no meeting times** — the directory subject pages do
 *   not print them, the bulletin does. `withDemoMeetingsAll` from the schedule
 *   lane fills that gap and is identity on any section that already has real
 *   times, so this line goes quiet on its own when the bulletin parser lands.
 */

import { CURRENT_TERM } from "@/lib/constants";
import { getCoursesByIds, getSections } from "@/lib/data/catalog";
import {
  analyzePlan,
  conflictedIds,
  toTimedItems,
  type PlanAnalysisDetail,
} from "@/lib/schedule";
import { withDemoMeetingsAll } from "@/lib/schedule/demo-meetings";
import type { Course, Plan, Section, TermCode } from "@/lib/types";
import { DEMO_PRIMARY_PLAN } from "@/components/home/demo-state";
import type { WeekGridBlock } from "@/components/home/week-grid-slot";

/** Everything a schedule surface needs, resolved once. */
export interface PlanSnapshot {
  /** `null` means "no plan yet" — the correct signed-out state. */
  plan: Plan | null;
  termCode: TermCode;
  sections: Section[];
  courses: Course[];
  /** `null` whenever there is no plan to analyse. */
  analysis: PlanAnalysisDetail | null;
  blocks: WeekGridBlock[];
  /**
   * True when the plan on screen is the built-in sample rather than a saved
   * one. Every screen that renders a snapshot MUST surface this — showing
   * fabricated plan membership as if it were the student's own would be
   * exactly the "guess presented as fact" the product rules forbid.
   */
  isSample: boolean;
  /** True when meeting times came from the demo filler, not from ingest. */
  hasDemoMeetingTimes: boolean;
}

export interface LoadPlanSnapshotOptions {
  termCode?: TermCode;
  /**
   * Opt into the built-in sample plan so the screen can be designed, reviewed,
   * and demoed before auth and the database exist. Off by default: a visitor
   * with no account genuinely has no plan.
   */
  useSamplePlan?: boolean;
}

/**
 * TODO(db + auth): replace the whole body with
 * `getPrimaryPlan(session.userId, termCode)`.
 */
function resolvePlan(termCode: TermCode, useSamplePlan: boolean): Plan | null {
  if (!useSamplePlan) return null;
  return { ...DEMO_PRIMARY_PLAN, termCode };
}

/** An empty snapshot, for the no-plan and no-sections cases. */
function emptySnapshot(termCode: TermCode, plan: Plan | null, isSample: boolean): PlanSnapshot {
  return {
    plan,
    termCode,
    sections: [],
    courses: [],
    analysis: plan
      ? analyzePlan({ sections: [], courses: [], blocks: plan.customBlocks })
      : null,
    blocks: [],
    isSample,
    hasDemoMeetingTimes: false,
  };
}

export async function loadPlanSnapshot(
  options: LoadPlanSnapshotOptions = {},
): Promise<PlanSnapshot> {
  const termCode = options.termCode ?? CURRENT_TERM;
  const useSamplePlan = options.useSamplePlan ?? false;
  const plan = resolvePlan(termCode, useSamplePlan);

  if (!plan) return emptySnapshot(termCode, null, false);
  if (plan.sectionIds.length === 0 && plan.customBlocks.length === 0) {
    return emptySnapshot(termCode, plan, useSamplePlan);
  }

  const rawSections = await getSections(plan.sectionIds);
  const sections = withDemoMeetingsAll(rawSections);
  const hasDemoMeetingTimes = rawSections.some((section) => section.meetings.length === 0);

  const courses = await getCoursesByIds(
    [...new Set(sections.map((section) => section.courseId))],
    termCode,
  );

  const analysis = analyzePlan({
    sections,
    courses,
    blocks: plan.customBlocks,
  });

  return {
    plan,
    termCode,
    sections,
    courses,
    analysis,
    blocks: toWeekGridBlocks(sections, plan, analysis),
    isSample: useSamplePlan,
    hasDemoMeetingTimes,
  };
}

/**
 * Plan → grid rectangles.
 *
 * `toTimedItems` already flattens sections and custom blocks into one stream
 * with custom blocks as first-class citizens (spec §8), so this only has to
 * decide tone and sublabel. A block is `conflict` when the analysis says
 * something it is involved in clashes — the ids come straight from
 * `conflictedIds`, so the grid and the warning list can never disagree.
 */
function toWeekGridBlocks(
  sections: readonly Section[],
  plan: Plan,
  analysis: PlanAnalysisDetail,
): WeekGridBlock[] {
  const conflicted = conflictedIds(analysis.conflicts);
  const titleByCourseId = new Map(sections.map((section) => [section.courseId, section]));

  return toTimedItems(sections, plan.customBlocks).map((item) => {
    const section = item.courseId ? titleByCourseId.get(item.courseId) : undefined;
    const room = [item.buildingName, item.room].filter(Boolean).join(" ");

    return {
      blockId: item.id,
      label: item.label,
      sublabel:
        room || (section?.instructors[0] ?? null) || (item.kind === "block" ? "Custom block" : null),
      weekday: item.weekday,
      startMinute: item.startMinute,
      endMinute: item.endMinute,
      tone: conflicted.has(item.id) ? "conflict" : "plan",
    };
  });
}
