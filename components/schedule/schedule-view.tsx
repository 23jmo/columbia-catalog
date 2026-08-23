import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { termLabel } from "@/lib/constants";
import type { Building, Course, CustomBlock, Section, TermCode } from "@/lib/types";
import type { PlannedMeeting, PrimaryPlanSnapshot } from "@/components/course/contracts";
import { analyzePlan } from "@/lib/schedule/analysis";
import type { CommuteOptions } from "@/lib/schedule/commute";
import { PlanSummary } from "./plan-summary";
import { WeekGrid } from "./week-grid";
import { toWeekGridBlocks } from "./to-blocks";

/**
 * The whole schedule surface: the week canvas plus the live summary rail.
 *
 * This is what the schedule screen renders full-width and what Home renders for
 * the primary plan (spec §5 / §8). Both get the same component so the two
 * screens can never disagree about a student's credits or conflicts.
 *
 * Division of labour:
 *   - `lib/schedule/analysis.analyzePlan` decides everything factual — credits,
 *     conflicts, commute legs, requirement coverage, free days.
 *   - `to-blocks.toWeekGridBlocks` decides what is drawn and how it is toned.
 *   - This file only arranges the two and picks the responsive form.
 *
 * Deliberately hook-free so it renders on the server. Drag-and-drop and plan
 * switching are interactive shells that wrap this, not behaviour inside it.
 */

export interface ScheduleViewProps {
  /** Sections committed to the plan. */
  sections: readonly Section[];
  /** The courses those sections belong to — supplies credits and requirements. */
  courses: readonly Course[];
  /** Non-course commitments. Full participants in conflicts and commute (spec §8). */
  customBlocks?: readonly CustomBlock[];
  /**
   * A plan expressed as meetings rather than sections — what the course drawer
   * holds. Drawn on the grid; it cannot contribute credits, because meetings
   * carry no point values.
   */
  plannedMeetings?: readonly PlannedMeeting[];
  /** Sections previewed from the drawer or watchlist, drawn translucent. */
  candidateSections?: readonly Section[];
  /** The same preview expressed as meetings. */
  candidateMeetings?: readonly PlannedMeeting[];
  /** Buildings with zones. Defaults to the schedule lane's own table. */
  buildings?: readonly Building[];
  /** Overrides the tight-transfer threshold used for commute notes. */
  commute?: CommuteOptions;
  planName?: string;
  termCode?: TermCode;
  /** Home renders the canvas alone; the schedule screen wants the rail. */
  showSummary?: boolean;
  /** Earliest/latest minute to draw. Auto-expands past these if a block needs it. */
  startMinute?: number;
  endMinute?: number;
  /** Rendered above the grid — plan switcher, export button, and so on. */
  toolbar?: ReactNode;
  className?: string;
}

export function ScheduleView({
  sections,
  courses,
  customBlocks = [],
  plannedMeetings,
  candidateSections,
  candidateMeetings,
  buildings,
  commute,
  planName,
  termCode,
  showSummary = true,
  startMinute,
  endMinute,
  toolbar,
  className,
}: ScheduleViewProps) {
  const blocks = toWeekGridBlocks({
    sections,
    customBlocks,
    plannedMeetings,
    candidateSections,
    candidateMeetings,
  });

  /**
   * Candidates are excluded from the analysis on purpose: the rail describes the
   * plan the student has actually committed to, so a previewed section must not
   * silently inflate the credit total. Its clash with the plan is still visible —
   * `toWeekGridBlocks` runs conflict detection across candidates too, and paints
   * both ends of the collision.
   */
  const analysis = analyzePlan({
    sections,
    courses,
    blocks: customBlocks,
    buildings,
    commute,
  });

  const grid = (
    <>
      {/* Wide viewports get the canvas; narrow ones get the agenda list. A CSS
          swap keeps both correct without a media-query hook, so this component
          stays server-renderable and never flashes the wrong form. */}
      <WeekGrid
        blocks={blocks}
        startMinute={startMinute}
        endMinute={endMinute}
        className="max-md:hidden"
      />
      <WeekGrid blocks={blocks} compact className="md:hidden" />
    </>
  );

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}

      {showSummary ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">{grid}</div>
          <PlanSummary
            analysis={analysis}
            planName={planName}
            termLabel={termCode ? termLabel(termCode) : undefined}
            sectionCount={sections.length}
          />
        </div>
      ) : (
        grid
      )}
    </div>
  );
}

/**
 * Convenience entry point for callers holding a `PrimaryPlanSnapshot` (the shape
 * the course drawer passes around) instead of hydrated `Section` records.
 *
 * The rail is off by default here: a snapshot carries meetings, not point
 * values, so a credit total computed from it would read zero and look like a
 * bug rather than a missing input.
 */
export function PlanSnapshotView({
  plan,
  candidateMeetings,
  className,
  ...rest
}: {
  plan: PrimaryPlanSnapshot;
  candidateMeetings?: readonly PlannedMeeting[];
  className?: string;
} & Pick<ScheduleViewProps, "startMinute" | "endMinute" | "toolbar" | "showSummary">) {
  return (
    <ScheduleView
      sections={[]}
      courses={[]}
      plannedMeetings={plan.meetings}
      candidateMeetings={candidateMeetings}
      planName={plan.name}
      termCode={plan.termCode}
      showSummary={false}
      className={className}
      {...rest}
    />
  );
}

export default ScheduleView;
