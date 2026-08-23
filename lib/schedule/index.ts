/**
 * Schedule lane — public API.
 *
 * This is the surface the MCP server, the API routes and the UI all import.
 * Everything re-exported here is pure except `plans.ts` (browser storage) and
 * `ics.ts` (depends on the `ics` package). Nothing here touches the network and
 * nothing here writes to columbia.edu.
 */

export {
  courseLabel,
  sectionLabel,
  toTimedItems,
  groupByWeekday,
  compareTimedItems,
  overlaps,
  overlapMinutes,
  type TimedItem,
  type TimedItemKind,
} from "./timeline";

export {
  detectConflicts,
  detectDuplicateCourses,
  isPlanFeasible,
  conflictedIds,
} from "./conflicts";

export {
  analyzeCommute,
  commuteConflicts,
  walkMinutesBetween,
  totalWalkMinutesByDay,
  TIGHT_BUFFER_MINUTES,
  type CommuteLegDetail,
  type CommuteOptions,
} from "./commute";

export {
  analyzePlan,
  creditTotals,
  sectionCredits,
  satisfiedRequirements,
  daysWithNoClasses,
  partitionConflicts,
  type AnalyzePlanInput,
  type CreditRange,
  type PlanAnalysisDetail,
} from "./analysis";

export {
  DEMO_BUILDINGS,
  findBuilding,
  normalizeBuildingName,
  zoneOf,
} from "./buildings";

export {
  planToIcs,
  planEvents,
  icsFilename,
  firstOccurrence,
  weeklyRule,
  type PlanIcsInput,
  type PlanIcsResult,
} from "./ics";

export { termBounds, parseCalendarDate, type TermBounds } from "./term-dates";

export {
  planStore,
  LocalPlanStore,
  PlanWriteDeniedError,
  setAuthGuard,
  makeBlock,
  newPlanId,
  newBlockId,
  nextPlanName,
  copyName,
  enforceSinglePrimary,
  LOCAL_USER_ID,
  type AuthGuard,
  type AuthGuardResult,
  type CreatePlanInput,
  type PlanStore,
} from "./plans";
