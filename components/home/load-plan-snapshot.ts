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
 * ── Where the plan comes from ──────────────────────────────────────────────
 *
 * `getPrimaryPlanForViewer` reads the signed-in student's saved plan straight
 * from Supabase. `planStore` from `@/lib/schedule` is deliberately NOT used
 * here — it is localStorage-backed and a server component cannot see it. The
 * two agree because `lib/db/plan-sync.ts` write-throughs every local edit to
 * the same rows this reads.
 *
 * A signed-out reader has no plan and gets the signed-out state. That is the
 * product rule, not a gap: reads are free, a plan belongs to an account.
 *
 * ── Meeting times, and why some blocks are grey ────────────────────────────
 *
 * Columbia stopped printing meeting days and times in the public directory
 * after Spring 2025 (.plans/BLOCKERS.md item 5), so for Fall 2026 and Spring
 * 2027 we hold real courses, real seats, real instructors — and zero times.
 *
 * This loader used to fill that hole with `withDemoMeetingsAll`, which assigns
 * each section a slot from Columbia's standard grid. That was defensible while
 * the plan on screen was always the built-in sample: fabricated times for a
 * fabricated plan. It stopped being defensible the moment this function
 * started returning the reader's OWN plan, because a made-up "Mo We 10:10" for
 * a class they are actually registering for is a lie with consequences.
 *
 * So it reads `getTypicalMeetings` instead: the times that same section
 * genuinely met at in a term we do hold, carrying the term they came from.
 * They render in the `candidate` tone the grid already reserves for "not
 * committed", never in `plan` tone, and they are kept out of the `Section`
 * records entirely — `analyzePlan` never sees them, so no credit total,
 * conflict or commute warning is ever computed from a guess.
 *
 * A section with no history at all contributes no rectangle. An empty row is
 * honest; an invented one is not.
 */

import { CURRENT_TERM, buildTerm } from "@/lib/constants";
import { getPrimaryPlanForViewer } from "@/lib/db/plan-reads";
import { getCoursesByIds, getSections } from "@/lib/data/catalog";
import { getTypicalMeetings, type TypicalMeetingPattern } from "@/lib/db/typical-meetings";
import {
  analyzePlan,
  conflictedIds,
  toTimedItems,
  type PlanAnalysisDetail,
} from "@/lib/schedule";
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
  /**
   * Sections in this plan with no published meeting time for this term.
   * Nonzero is the normal case for Fall 2026 onward — see the header.
   */
  unscheduledCount: number;
  /** Of those, how many we could show a previous term's pattern for. */
  historicalCount: number;
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
 * The student's own plan, or the built-in sample when a caller explicitly
 * asked for one.
 *
 * A real plan always wins. `useSamplePlan` exists so a screen can be designed
 * and demoed, and showing a fabricated plan over a saved one would be exactly
 * the "guess presented as fact" the product rules forbid — which is also why
 * `isSample` travels with the snapshot and every screen has to surface it.
 */
async function resolvePlan(
  termCode: TermCode,
  useSamplePlan: boolean,
): Promise<{ plan: Plan | null; isSample: boolean }> {
  const saved = await getPrimaryPlanForViewer(termCode);
  if (saved) return { plan: saved, isSample: false };
  if (!useSamplePlan) return { plan: null, isSample: false };
  return { plan: { ...DEMO_PRIMARY_PLAN, termCode }, isSample: true };
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
    unscheduledCount: 0,
    historicalCount: 0,
  };
}

export async function loadPlanSnapshot(
  options: LoadPlanSnapshotOptions = {},
): Promise<PlanSnapshot> {
  const termCode = options.termCode ?? CURRENT_TERM;
  const useSamplePlan = options.useSamplePlan ?? false;
  const { plan, isSample } = await resolvePlan(termCode, useSamplePlan);

  if (!plan) return emptySnapshot(termCode, null, false);
  if (plan.sectionIds.length === 0 && plan.customBlocks.length === 0) {
    return emptySnapshot(termCode, plan, isSample);
  }

  const sections = await getSections(plan.sectionIds);
  const unscheduled = sections.filter((section) => section.meetings.length === 0);

  /*
   * Only asked about sections that have no times of their own, and the result
   * is never merged into a `Section`. Keeping the two apart is what stops a
   * historical pattern from reaching `analyzePlan` and being counted as a real
   * clash — spec's rule is that "these usually overlap" is a warning, not the
   * hard "you cannot be in two places at once".
   *
   * Never throws: a missing hint must not take Home down.
   */
  const typical =
    unscheduled.length > 0
      ? await getTypicalMeetings(unscheduled.map((section) => section.sectionId))
      : new Map<string, TypicalMeetingPattern>();

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
    blocks: [
      ...toWeekGridBlocks(sections, plan, analysis),
      ...historicalBlocks(typical, sections),
    ],
    isSample,
    unscheduledCount: unscheduled.length,
    historicalCount: typical.size,
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

/**
 * Previous terms' patterns as grid rectangles, in the `candidate` tone.
 *
 * `candidate` is the tone the grid already means "on screen, not committed" by,
 * and it carries its own border style and icon rather than relying on colour
 * (spec §18). Reusing it means a historical block reads as provisional without
 * inventing a fourth visual language the legend would have to explain.
 *
 * The sublabel names the term the times were actually observed in. "usually"
 * on its own would still leave the reader guessing how old the guess is.
 */
function historicalBlocks(
  typical: Map<string, TypicalMeetingPattern>,
  sections: readonly Section[],
): WeekGridBlock[] {
  const labelBySectionId = new Map(
    sections.map((section) => [section.sectionId, `${section.courseId} · ${section.sectionCode}`]),
  );

  return [...typical.values()].flatMap((pattern) =>
    pattern.meetings.map((meeting, index) => ({
      blockId: `typical:${pattern.sectionId}:${index}`,
      label: labelBySectionId.get(pattern.sectionId) ?? pattern.sectionId,
      sublabel: `${buildTerm(pattern.sourceTerm as TermCode).label} pattern`,
      weekday: meeting.weekday,
      startMinute: meeting.startMinute,
      endMinute: meeting.endMinute,
      tone: "candidate" as const,
    })),
  );
}
