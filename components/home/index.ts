/**
 * Home lane — public surface.
 *
 * `app/page.tsx` and `app/schedule/**` import from here. Anything not exported
 * below is an internal detail of this directory and other lanes should not
 * reach for it.
 */

export { AgentAnnouncement } from "./agent-announcement";
export { AgentSetupPanel, type AgentSetupPanelProps } from "./agent-setup-panel";
export { AgentSetupScreen, type AgentSetupScreenProps } from "./agent-setup-screen";
export { ScheduleColumn, type ScheduleColumnProps } from "./schedule-column";

export {
  WeekGridPlaceholder,
  WeekGridSlot,
  type WeekGridBlock,
  type WeekGridSlotComponent,
  type WeekGridSlotProps,
} from "./week-grid-slot";

export { NoPlanState, type NoPlanStateProps } from "./no-plan-state";

export {
  loadPlanSnapshot,
  type LoadPlanSnapshotOptions,
  type PlanSnapshot,
} from "./load-plan-snapshot";

export { CopyPromptButton, type CopyPromptButtonProps } from "./copy-prompt-button";
export { CopyField, type CopyFieldProps } from "./copy-field";
