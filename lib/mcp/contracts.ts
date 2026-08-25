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
 * NOTE on imports: the library half of this directory uses relative imports.
 * The `@/` alias resolves fine under both tsc and vitest, so this is a
 * convention rather than a constraint — these modules are meant to be liftable
 * into a standalone MCP server process, and relative imports come along.
 */

import type {
  CommuteLeg,
  CourseWithSections,
  CustomBlock,
  EnrollmentStatusCode,
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

/**
 * One look in the seat history.
 *
 * Declared here rather than reusing `EnrollmentSnapshot` from lib/types
 * because that type has a non-null `enrollmentCap`, and the directory really
 * does print a count with no cap. Coercing those rows to a number would invent
 * a capacity; dropping them would put a hole in a chart that is supposed to be
 * every reading we hold. The cap is nullable because the source is.
 */
export interface SeatHistoryPoint {
  sectionId: string;
  observedAt: string;
  enrollmentCount: number;
  enrollmentCap: number | null;
  waitlistCount: number | null;
  status: EnrollmentStatusCode;
}

export interface SeatHistoryPort {
  /** Chronological, oldest first. Empty is a legitimate answer. */
  getSeatHistory(sectionId: string, sinceIso?: string): Promise<SeatHistoryPoint[]>;
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
// 7. Saved classes — database lane (lib/db/bookmarks.ts)
// ---------------------------------------------------------------------------

/** One folder, with how many saved classes carry its label. */
export interface BookmarkFolderSummary {
  folderId: string;
  name: string;
  createdAt: string;
  count: number;
}

/**
 * One saved section.
 *
 * `folderIds` is a list because folders are many-to-many — a class can be in
 * "Maybe" and "Fallbacks" at once. An empty list is the computed
 * "Uncategorized"; there is no folder row with that name and an agent must not
 * invent one.
 */
export interface BookmarkEntry {
  sectionId: string;
  termCode: TermCode;
  savedAt: string;
  folderIds: string[];
}

/**
 * READ-ONLY, for the same reason `PlansPort` is (see above).
 *
 * A bookmark is cheaper to undo than a schedule change, but it is still the
 * student's shortlist — the list they reason about when they decide what to
 * take. An agent quietly adding to it would corrupt the input to a decision
 * rather than the decision itself, which is worse, not better. So the write
 * pair (`propose_bookmark`, `propose_unbookmark`) goes through the same
 * proposal review as everything else, and there is deliberately no
 * `addBookmark` on this interface.
 *
 * `watch:write` remains the one direct write, because a watch changes nothing
 * a student reads — it only asks to be told something.
 */
export interface BookmarksPort {
  listFolders(userId: string): Promise<BookmarkFolderSummary[]>;
  /**
   * `folderId` filters to one folder's contents; the sentinel
   * `"uncategorized"` selects the bookmarks with no folder at all.
   */
  listBookmarks(
    userId: string,
    options?: { termCode?: TermCode; folderId?: string },
  ): Promise<BookmarkEntry[]>;
  /** True when this section is already saved — used to refuse no-op proposals. */
  isBookmarked(userId: string, sectionId: string): Promise<boolean>;
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
  bookmarks: BookmarksPort;
  proposals: ProposalStore;
  rateLimiter: RateLimiter;
  /** Public origin, used to build review links returned to the agent. */
  baseUrl: string;
}
