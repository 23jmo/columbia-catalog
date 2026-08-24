/**
 * Schedule lane (UI) — public surface.
 *
 * `WeekGrid` satisfies `WeekGridComponent` from `components/course/contracts.ts`,
 * so the course drawer can be handed it directly:
 *
 *   <CourseDetail integrations={{ weekGrid: WeekGrid }} />
 *
 * Everything else here is composed from it. Nothing in this directory owns
 * scheduling logic — that lives in `lib/schedule` and is imported, never
 * reimplemented.
 */

export { WeekGrid } from "./week-grid";
export { AgendaList, type AgendaListProps } from "./agenda-list";
export { PlanSummary, type PlanSummaryProps } from "./plan-summary";
export { ScheduleView, PlanSnapshotView, type ScheduleViewProps } from "./schedule-view";
export { CalendarShell } from "./calendar-shell";
export { CalendarWeekPreview, type CalendarWeekPreviewProps } from "./calendar-week-preview";

export {
  blockIdFor,
  ownerIdOf,
  sectionsToBlocks,
  customBlocksToBlocks,
  plannedMeetingsToBlocks,
  markConflicts,
  toWeekGridBlocks,
  gridWeekdays,
  gridBounds,
  hourMarks,
  layoutDay,
  layoutWeek,
  fractionOf,
  groupBlocksByWeekday,
  type GridBounds,
  type PositionedBlock,
  type WeekGridInput,
  type WeekGridTone,
} from "./to-blocks";
