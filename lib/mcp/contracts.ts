/**
 * MCP lane contracts.
 *
 * The MCP server needs five things it does not own:
 *
 *   - catalog reads            → `lib/data/catalog.ts`   (exists today)
 *   - conflict / commute /
 *     requirement analysis     → `lib/schedule/**`       (schedule lane)
 *   - plans and watches        → `lib/db/**`             (database lane)
 *   - seat history             → `lib/db/**`             (database lane)
 *   - reputation aggregation   → `lib/reviews/**`        (reviews lane)
 *
 * Rather than import from directories that may not exist yet, every tool codes
 * against the narrow port interfaces below. `lib/mcp/adapters.ts` wires the
 * ports that exist; `lib/mcp/fallbacks.ts` supplies deliberately-minimal local
 * implementations for the ones that do not, so the server is useful today and
 * gets better without a single tool handler changing.
 *
 * These are the smallest surfaces that make the tools correct — not mirrors of
 * another lane's internal model.
 *
 * NOTE on imports: this directory uses relative imports rather than the `@/`
 * alias because the vitest run has no path-alias resolver configured and the
 * alias would make `lib/mcp/mcp.test.ts` unrunnable.
 */

import type {
  CommuteLeg,
  CourseWithSections,
  CustomBlock,
  EnrollmentSnapshot,
  Plan,
  ReputationSummary,
  ScheduleConflict,
  SearchFilters,
  Section,
  TermCode,
  WatchWithState,
} from "../types";

// ---------------------------------------------------------------------------
// 1. Catalog — satisfied today by lib/data/catalog.ts
// ---------------------------------------------------------------------------

export interface CatalogPort {
  getAllCourses(termCode?: TermCode): Promise<CourseWithSections[]>;
  getCourse(courseId: string, termCode?: TermCode): Promise<CourseWithSections | null>;
  getCoursesByIds(courseIds: string[], termCode?: TermCode): Promise<CourseWithSections[]>;
  getSection(sectionId: string): Promise<Section | null>;
  getSections(sectionIds: string[]): Promise<Section[]>;
}

// ---------------------------------------------------------------------------
// 2. Search — search lane (lib/search/**)
// ---------------------------------------------------------------------------

export interface SearchPort {
  /**
   * Filters are the authoritative `SearchFilters` shape. The implementation
   * must never touch the network (spec §9) — the fallback filters the local
   * catalog, the real one queries the prebuilt index.
   */
  search(
    filters: SearchFilters,
    limit: number,
  ): Promise<{ courses: CourseWithSections[]; total: number; elapsedMs: number }>;
}

// ---------------------------------------------------------------------------
// 3. Schedule analysis — schedule lane (lib/schedule/**)
// ---------------------------------------------------------------------------

/** What one requirement key looks like after evaluating a proposed schedule. */
export interface RequirementOutcome {
  key: string;
  label: string;
  satisfiedBy: string[];
  satisfied: boolean;
}

export interface RequirementReport {
  program: string;
  satisfied: RequirementOutcome[];
  unsatisfied: RequirementOutcome[];
  /** Requirement keys the program does not track — reported, never silently dropped. */
  notApplicable: string[];
}

export interface SchedulePort {
  checkConflicts(sections: Section[], customBlocks: CustomBlock[]): ScheduleConflict[];
  checkCommute(sections: Section[], customBlocks: CustomBlock[]): CommuteLeg[];
  checkRequirements(courses: CourseWithSections[], program: string): RequirementReport;
}

// ---------------------------------------------------------------------------
// 4. Reputation — reviews lane (lib/reviews/**)
// ---------------------------------------------------------------------------

/**
 * Course quality and instructor quality are scored SEPARATELY and are never
 * averaged into one number (spec §12). The port returns them apart and the
 * tool serialises them apart.
 */
export interface RatingsPort {
  getCourseReputation(courseId: string): Promise<ReputationSummary | null>;
  getInstructorReputation(instructorId: string): Promise<ReputationSummary | null>;
}

// ---------------------------------------------------------------------------
// 5. Seat history — database lane (lib/db/**)
// ---------------------------------------------------------------------------

export interface SeatHistoryPort {
  /** Chronological, oldest first. Empty is a legitimate answer. */
  getSeatHistory(sectionId: string, sinceIso?: string): Promise<EnrollmentSnapshot[]>;
}

// ---------------------------------------------------------------------------
// 6. The student's own data — database lane (lib/db/**)
// ---------------------------------------------------------------------------

/**
 * Deliberately READ-ONLY for plans.
 *
 * There is no `addSectionToPlan` on this interface and there must never be
 * one. Spec §16 "Agent authority": write tools propose rather than act. The
 * absence of a mutation method is the structural guarantee that an MCP client
 * physically cannot change a saved plan — not a convention a future handler
 * might forget.
 *
 * Watches are different: `watch_section` is additive, reversible, and touches
 * no schedule, so it is allowed to write directly under `watch:write`.
 */
export interface PlansPort {
  listPlans(userId: string, termCode?: TermCode): Promise<Plan[]>;
  getPlan(userId: string, planId: string): Promise<Plan | null>;
  listWatches(userId: string): Promise<WatchWithState[]>;
  addWatch(userId: string, sectionId: string): Promise<WatchWithState>;
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

import type { ProposalStore } from "./proposals";
import type { RateLimiter } from "./ratelimit";

export interface McpDeps {
  catalog: CatalogPort;
  search: SearchPort;
  schedule: SchedulePort;
  ratings: RatingsPort;
  seatHistory: SeatHistoryPort;
  plans: PlansPort;
  proposals: ProposalStore;
  rateLimiter: RateLimiter;
  /** Public origin, used to build review links returned to the agent. */
  baseUrl: string;
}
