/**
 * Course-drawer lane contracts.
 *
 * The drawer needs three things it does not own:
 *
 *   - a seat-history chart          → `components/charts/**`   (charts lane)
 *   - reputation aggregation        → `lib/reviews/**`         (reviews lane)
 *   - a week grid to preview into   → `components/schedule/**` (schedule lane)
 *
 * Rather than import from directories that may not exist yet, the drawer codes
 * against the narrow interfaces below and renders a designed placeholder when
 * an implementation is not supplied. When a lane lands, it satisfies the
 * matching interface and gets injected through `CourseDetailIntegrations` —
 * no file in this directory has to change.
 *
 * Everything here is intentionally minimal: the smallest surface that makes
 * the drawer correct, not a mirror of the other lane's internal model.
 */

import type { ComponentType } from "react";
import type {
  CampusZone,
  CommuteLeg,
  EnrollmentSnapshot,
  RegistrationMilestone,
  ReputationSummary,
  RmpSnapshot,
  ScheduleConflict,
  TermCode,
  Weekday,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// 1. Seat history — charts lane
// ---------------------------------------------------------------------------

/** One line on the seat-history chart. */
export interface SeatHistorySeries {
  /** Stable key. Section id for live series, `${sectionId}@${termCode}` for ghosts. */
  seriesId: string;
  /** Legend label, e.g. "Section 001" or "Fall 2025 (last year)". */
  label: string;
  /** Chronological, oldest first. May be empty — render the empty state. */
  points: EnrollmentSnapshot[];
  /**
   * A prior-term offering drawn behind the live line (spec §13 "ghost line").
   * The chart is expected to de-emphasise these.
   */
  isGhost?: boolean;
}

export interface SeatHistoryChartProps {
  series: SeatHistorySeries[];
  /** Vertical annotations: registration open, appointment windows, add/drop. */
  milestones: RegistrationMilestone[];
  /** Cap line to draw as the chart's ceiling, when the sections agree on one. */
  capacity: number | null;
  className?: string;
}

/**
 * What `components/charts` must export for the drawer to use it.
 * Charts are BoardUI Pro and NOT installed — build on `recharts` directly.
 */
export type SeatHistoryChartComponent = ComponentType<SeatHistoryChartProps>;

/** How the drawer asks for the history it needs. */
export type SeatHistoryLoader = (args: {
  sectionIds: string[];
  courseId: string;
  termCode: TermCode;
}) => Promise<{ series: SeatHistorySeries[]; milestones: RegistrationMilestone[] }>;

// ---------------------------------------------------------------------------
// 2. Reputation — reviews lane (`lib/reviews/**`)
// ---------------------------------------------------------------------------

/**
 * Course quality and instructor quality are aggregated SEPARATELY (spec §12)
 * and this shape is what enforces it: two `ReputationSummary` values that the
 * drawer renders side by side and never averages.
 */
export interface ReputationBundle {
  /** Aggregated across every instructor who has taught this course. */
  course: ReputationSummary | null;
  /** Aggregated across every course this instructor has taught. */
  instructor: ReputationSummary | null;
  /** Instructor the `instructor` summary belongs to, for attribution. */
  instructorName: string | null;
}

export type ReputationLoader = (args: {
  courseId: string;
  instructorName: string | null;
}) => Promise<ReputationBundle>;

// ---------------------------------------------------------------------------
// 3. RateMyProfessor — live at view time, attributed, NEVER persisted (spec §12)
// ---------------------------------------------------------------------------

/**
 * Resolves an RMP snapshot for an instructor at the moment the drawer opens.
 *
 * COMPLIANCE: the implementation must fetch live, must not write the result to
 * any database, file, cache, cookie, or storage of any kind, and must not be
 * called from an ingest job. `RmpSnapshot.fetchedAt` is displayed so the reader
 * can see the value is a live read and not a mirror.
 *
 * Returning `null` (no profile, rate-limited, upstream down) is a first-class
 * outcome — the drawer renders a graceful no-data state with a link out.
 */
export type RmpLookup = (instructorName: string) => Promise<RmpSnapshot | null>;

// ---------------------------------------------------------------------------
// 4. Week grid — schedule lane (`components/schedule/**`)
// ---------------------------------------------------------------------------

/** One rectangle on the week grid. */
export interface WeekGridBlock {
  blockId: string;
  label: string;
  /** Secondary line, e.g. "Mudd 833" or "Prof. Nieh". */
  sublabel?: string | null;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  /**
   * `plan` = already saved, `candidate` = this drawer's course previewed in,
   * `conflict` = overlaps a plan block.
   */
  tone: "plan" | "candidate" | "conflict";
}

export interface WeekGridProps {
  blocks: WeekGridBlock[];
  /** Minutes from midnight. Defaults to GRID_START_MINUTE/GRID_END_MINUTE. */
  startMinute?: number;
  endMinute?: number;
  /** Narrow viewports degrade to an agenda list (spec §18). */
  compact?: boolean;
  className?: string;
}

export type WeekGridComponent = ComponentType<WeekGridProps>;

// ---------------------------------------------------------------------------
// 5. The primary plan — schedule/plan lane
// ---------------------------------------------------------------------------

/**
 * A meeting already committed in the student's primary plan. Custom blocks
 * ("Work, Tue/Thu 3–6") participate fully, so `courseId` is nullable.
 */
export interface PlannedMeeting {
  /** Section id or custom-block id. */
  ownerId: string;
  label: string;
  courseId: string | null;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  buildingName: string | null;
  campusZone: CampusZone;
}

export interface PrimaryPlanSnapshot {
  planId: string;
  name: string;
  termCode: TermCode;
  sectionIds: string[];
  meetings: PlannedMeeting[];
}

export interface CandidateEvaluation {
  conflicts: ScheduleConflict[];
  commuteLegs: CommuteLeg[];
}

/**
 * Evaluates a candidate section against the primary plan. The drawer ships a
 * local implementation (`./plan-conflicts`) so the warnings are real today;
 * the schedule lane can replace it with the authoritative one.
 */
export type CandidateEvaluator = (
  candidate: PlannedMeeting[],
  plan: PrimaryPlanSnapshot,
) => CandidateEvaluation;

// ---------------------------------------------------------------------------
// 6. Actions — plan / watchlist lane
// ---------------------------------------------------------------------------

/**
 * Writes require an account (spec §3). Every handler is optional; when one is
 * absent the drawer still renders the affordance and explains why it is inert
 * rather than hiding it.
 */
export interface CourseActions {
  addSectionToPlan?: (sectionId: string) => void | Promise<void>;
  removeSectionFromPlan?: (sectionId: string) => void | Promise<void>;
  toggleWatch?: (sectionId: string) => void | Promise<void>;
  /** Section ids already in the primary plan. */
  plannedSectionIds?: string[];
  /** Section ids the signed-in student watches. */
  watchedSectionIds?: string[];
  /** Watchers per section — shown upfront, deliberately (spec §11 / watchlist). */
  watcherCounts?: Record<string, number>;
  isSignedIn?: boolean;
}

// ---------------------------------------------------------------------------
// 7. The single injection point
// ---------------------------------------------------------------------------

export interface CourseDetailIntegrations {
  seatHistoryChart?: SeatHistoryChartComponent;
  loadSeatHistory?: SeatHistoryLoader;
  loadReputation?: ReputationLoader;
  lookupRmp?: RmpLookup;
  weekGrid?: WeekGridComponent;
  primaryPlan?: PrimaryPlanSnapshot | null;
  evaluateCandidate?: CandidateEvaluator;
  /** Building → campus zone. Falls back to a local heuristic. */
  resolveCampusZone?: (buildingName: string | null) => CampusZone;
  actions?: CourseActions;
}
