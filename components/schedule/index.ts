/**
 * Schedule lane (UI) — public surface.
 *
 * `WeekGrid` satisfies `WeekGridComponent` from `components/course/contracts.ts`,
 * so the course drawer can be handed it directly:
 *
 *   <CourseDetail integrations={{ weekGrid: WeekGrid }} />
 *
 * `ScheduleWeek` is the recurring five-column canvas every schedule surface
 * draws — the `/schedule` page, the shared read-only page, the chat card and
 * the course page's "on your week" preview. Nothing in this directory owns
 * scheduling logic — that lives in `lib/schedule` and is imported, never
 * reimplemented.
 */

export { WeekGrid } from "./week-grid";
export { AgendaList, type AgendaListProps } from "./agenda-list";
export { ScheduleWeek, type ScheduleWeekProps } from "./schedule-week";

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
  fitGridBounds,
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
