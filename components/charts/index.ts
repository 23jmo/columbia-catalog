/**
 * Charts lane — public surface.
 *
 * `SeatHistoryChart` satisfies `SeatHistoryChartComponent` from
 * `@/components/course/contracts` and is injected through
 * `CourseDetailIntegrations.seatHistoryChart`.
 *
 * NOTE ON LAZY-LOADING: importing from this barrel pulls Recharts into the
 * importing bundle. A surface that wants the chart split out should import the
 * file directly instead — both chart modules also carry a default export, so
 * `next/dynamic(() => import("@/components/charts/seat-history-chart"))` works
 * with no `.then(...)` unwrap.
 */

export { SeatHistoryChart } from "./seat-history-chart";
export { WaitlistOdds, WAITLIST_BAND_ORDER, waitlistBandLabel } from "./waitlist-odds";
export type {
  ClearanceObservation,
  WaitlistOddsBand,
  WaitlistOddsEstimate,
  WaitlistOddsProps,
} from "./waitlist-odds";

export {
  GHOST_COLOR_VAR,
  LIVE_SERIES_COLOR_VARS,
  alignmentShifts,
  anchorTermCodes,
  buildSeatChartModel,
  milestonesInWindow,
  normalizePoints,
  orderForPainting,
  shiftInDays,
  termCodeOfSeries,
  tickGranularity,
  yAxisMax,
} from "./series";
export type {
  PlottedMilestone,
  SeatChartModel,
  SeatFrame,
  SeatPlot,
  TickGranularity,
  TimedSnapshot,
} from "./series";
