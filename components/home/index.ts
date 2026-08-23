/**
 * Home lane — public surface.
 *
 * `app/page.tsx` and `app/schedule/**` import from here. Anything not exported
 * below is an internal detail of this directory and other lanes should not
 * reach for it.
 *
 * Seat rendering is NOT here. `components/catalog/seat-badge.tsx` is the one
 * sanctioned `SeatBadge`; this lane briefly carried a second one with a
 * different prop shape, which is precisely how two surfaces start disagreeing
 * about the same seat count. Deleted — import the catalog one.
 *
 * `plan-analysis.ts` and `week-summary.tsx` were likewise deleted: they
 * predated `lib/schedule` and reimplemented credits, conflicts and commute
 * legs. `analyzePlan` in `@/lib/schedule` is the single implementation, so
 * Home and `/schedule` can never disagree about the same plan, and the week
 * canvas comes from `components/schedule` through `week-grid-slot.tsx`.
 *
 * `demo-state.ts` is still live: `loadPlanSnapshot` reads `DEMO_PRIMARY_PLAN`
 * from it. Its `DEMO_MEETINGS` / `DEMO_BUILDING_ZONES` are not — meeting-time
 * scaffolding and building zones both come from `lib/schedule` now.
 */

// The two Home columns.
export { AgentHandoff, type AgentConnectionState, type AgentHandoffProps } from "./agent-handoff";
export { ScheduleColumn, type ScheduleColumnProps } from "./schedule-column";

// The week-canvas seam. `WeekGridSlotComponent` is what `components/schedule`
// has to satisfy; `WeekGridSlot` decides between it and the placeholder.
export {
  WeekGridPlaceholder,
  WeekGridSlot,
  type WeekGridBlock,
  type WeekGridSlotComponent,
  type WeekGridSlotProps,
} from "./week-grid-slot";

// Empty state, shared by Home and `/schedule`.
export { NoPlanState, type NoPlanStateProps } from "./no-plan-state";

// Data loading — one plan resolver for both screens.
export {
  loadPlanSnapshot,
  type LoadPlanSnapshotOptions,
  type PlanSnapshot,
} from "./load-plan-snapshot";

// Interactive leaf, used by the agent column.
export { CopyField, type CopyFieldProps } from "./copy-field";

