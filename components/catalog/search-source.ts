/**
 * The narrow seam the Search screen reads through.
 *
 * The search-engine lane (`lib/search/**`) is building the real inverted index
 * plus embedding ranker. This file describes exactly what the UI needs from it
 * and ships a straightforward in-memory implementation over `getAllCourses()`
 * so the screen is fully functional today. When the real engine lands it
 * implements `SearchSource` and drops in behind the same interface -- nothing
 * in `components/catalog/**` changes.
 *
 * Two hard constraints on any implementation:
 *
 *   1. `search()` is SYNCHRONOUS. It is called during render on every
 *      keystroke and every filter toggle. It must never return a promise,
 *      never touch the network, and never schedule work the UI waits on.
 *   2. `search()` must be pure and cheap enough to run inside a 16ms frame
 *      (see `PERF_BUDGET.searchMs`).
 */

import type {
  CourseWithSections,
  ReputationSummary,
  SearchFilters,
  SearchHit,
  SearchResult,
  Section,
  Weekday,
} from "@/lib/types";
import { REQUIREMENT_FILTERS } from "@/lib/constants";

/* -------------------------------------------------------------------------- */
/*  Filter extension                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `SearchFilters` in `@/lib/types` is authoritative and not ours to edit. It
 * carries `maxWorkload` and `minTeachingQuality` but no difficulty ceiling,
 * while spec section 6 asks for a difficulty slider. We carry it as a
 * structural extension: an engine that only knows `SearchFilters` ignores the
 * extra key and still type-checks, and the day it is promoted into the shared
 * type this interface disappears without a call-site change.
 */
export interface CatalogSearchFilters extends SearchFilters {
  /** Reputation ceiling, 1-5. Ignored by engines that do not model it. */
  maxDifficulty?: number;
}

/* -------------------------------------------------------------------------- */
/*  Facets                                                                    */
/* -------------------------------------------------------------------------- */

export interface FacetOption {
  /** The value written into `SearchFilters` (subject code, instructor name). */
  value: string;
  /** What the filter menu renders. */
  label: string;
  /** Courses in the loaded catalog carrying this value. */
  count: number;
}

/** Everything needed to populate the filter menus without a second query. */
export interface SearchFacets {
  subjects: FacetOption[];
  schools: FacetOption[];
  instructors: FacetOption[];
  /** [min, max] credit points present in the catalog. */
  creditRange: [number, number];
}

/* -------------------------------------------------------------------------- */
/*  The interface the engine lane must satisfy                                */
/* -------------------------------------------------------------------------- */

export interface SearchSource {
  /**
   * Run the whole filter set. Synchronous, no network, no loading state.
   *
   * Expected semantics, mirrored by the local implementation:
   *  - free text is AND across whitespace-separated tokens
   *  - exact course-code matches (`COMS 4118`, `coms4118`) outrank title
   *    matches, which outrank description / instructor matches
   *  - requirement keys OR within a curriculum group, AND across groups
   *  - `includeUnrated` defaults to TRUE: a course with no review coverage is
   *    never silently dropped by a reputation slider (spec section 6)
   *  - `matchedSectionIds` is `null` when no section-level filter (days, time
   *    window, instructor, open seats) is active, and the list of surviving
   *    section ids when one is
   */
  search(filters: SearchFilters): SearchResult;

  /** Course record behind a hit, sections attached. Synchronous lookup. */
  getCourse(courseId: string): CourseWithSections | undefined;

  /** Reputation for a course, or null when it has no review coverage. */
  getReputation(courseId: string): ReputationSummary | null;

  /** Values that populate the filter menus. */
  readonly facets: SearchFacets;

  /** Size of the loaded catalog. The empty state distinguishes 0-of-N. */
  readonly totalCourses: number;
}

/* -------------------------------------------------------------------------- */
/*  Helpers shared with the UI                                                */
/* -------------------------------------------------------------------------- */

/** Section-level filters make matching sections surface directly (spec 6). */
export function hasSectionLevelFilter(filters: SearchFilters): boolean {
  return Boolean(
    (filters.days && filters.days.length > 0) ||
      filters.startAfterMinute !== undefined ||
      filters.endBeforeMinute !== undefined ||
      filters.openSeatsOnly ||
      (filters.instructors && filters.instructors.length > 0),
  );
}

/** A section has seats when the directory says open and count is under cap. */
export function sectionHasOpenSeats(section: Section): boolean {
  if (section.status === "full" || section.status === "closed") return false;
  if (section.enrollmentCount === null || section.enrollmentCap === null) {
    return section.status === "open";
  }
  return section.enrollmentCount < section.enrollmentCap;
}

/* -------------------------------------------------------------------------- */
/*  Local implementation                                                      */
/* -------------------------------------------------------------------------- */

interface IndexedCourse {
  course: CourseWithSections;
  /** Lowercased searchable blob. */
  haystack: string;
  /** `coms4118` -- code with no separators, for exact/prefix code matching. */
  codeKey: string;
  titleLower: string;
  instructorsLower: string[];
  creditsMin: number | null;
  creditsMax: number | null;
}

const REQUIREMENT_GROUP_BY_KEY: Record<string, string> = Object.fromEntries(
  REQUIREMENT_FILTERS.map((r) => [r.key, r.group]),
);

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function stripSeparators(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildIndexedCourse(course: CourseWithSections): IndexedCourse {
  const instructors = [...new Set(course.sections.flatMap((s) => s.instructors))];
  const parts = [
    course.courseId,
    `${course.subjectCode} ${course.number}`,
    course.subjectCode,
    String(course.number),
    course.title,
    course.description ?? "",
    course.department ?? "",
    instructors.join(" "),
    Object.entries(course.requirementFlags)
      .filter(([, on]) => on)
      .map(([key]) => key)
      .join(" "),
    course.sections.map((s) => s.callNumber).join(" "),
  ];

  return {
    course,
    haystack: normalize(parts.join("   ")),
    codeKey: stripSeparators(`${course.subjectCode}${course.number}`),
    titleLower: normalize(course.title),
    instructorsLower: instructors.map(normalize),
    creditsMin: course.pointsMin,
    creditsMax: course.pointsMax,
  };
}

function meetingMatchesDays(section: Section, days: Weekday[]): boolean {
  const wanted = new Set(days);
  // CONTAINMENT semantics: every meeting must fall on a selected day, so the
  // section fits entirely inside the days the student has free.
  //
  // This has to match `SearchEngine` exactly. Both paths are live — this
  // source answers keystrokes until the binary index finishes loading, and the
  // engine answers them afterwards — so a disagreement means the same filter
  // silently returns a different set mid-session. It also matches
  // `meetingsWithinWindow` directly below, which already requires every
  // meeting to fit inside the time window; days and times then answer one
  // coherent question ("what fits the time I have free?") instead of two.
  //
  // A section with no parsed meeting days cannot be shown to satisfy the
  // filter, so it is excluded rather than assumed to fit.
  if (section.meetings.length === 0) return false;
  return section.meetings.every((m) => wanted.has(m.weekday));
}

function meetingsWithinWindow(
  section: Section,
  startAfterMinute: number | undefined,
  endBeforeMinute: number | undefined,
): boolean {
  if (startAfterMinute === undefined && endBeforeMinute === undefined) return true;
  // A section with no published meeting time cannot be shown to fit a window.
  // The directory omits times for many sections; the bulletin supplies them.
  if (section.meetings.length === 0) return false;
  return section.meetings.every((m) => {
    if (startAfterMinute !== undefined && m.startMinute < startAfterMinute) return false;
    if (endBeforeMinute !== undefined && m.endMinute > endBeforeMinute) return false;
    return true;
  });
}

function sectionMatches(section: Section, filters: SearchFilters): boolean {
  if (filters.termCode && section.termCode !== filters.termCode) return false;
  if (filters.openSeatsOnly && !sectionHasOpenSeats(section)) return false;
  if (filters.days && filters.days.length > 0 && !meetingMatchesDays(section, filters.days)) {
    return false;
  }
  if (!meetingsWithinWindow(section, filters.startAfterMinute, filters.endBeforeMinute)) {
    return false;
  }
  if (filters.instructors && filters.instructors.length > 0) {
    const wanted = new Set(filters.instructors.map(normalize));
    if (!section.instructors.some((name) => wanted.has(normalize(name)))) return false;
  }
  return true;
}

function requirementsMatch(indexed: IndexedCourse, requirements: string[]): boolean {
  // OR within a curriculum group, AND across groups.
  const byGroup = new Map<string, string[]>();
  for (const key of requirements) {
    const group = REQUIREMENT_GROUP_BY_KEY[key] ?? "other";
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(key);
    else byGroup.set(group, [key]);
  }
  for (const keys of byGroup.values()) {
    if (!keys.some((key) => indexed.course.requirementFlags[key] === true)) return false;
  }
  return true;
}

function creditsMatch(indexed: IndexedCourse, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true;
  const lo = indexed.creditsMin ?? indexed.creditsMax;
  const hi = indexed.creditsMax ?? indexed.creditsMin;
  if (lo === null || hi === null) return false;
  if (min !== undefined && hi < min) return false;
  if (max !== undefined && lo > max) return false;
  return true;
}

/**
 * Lexical score. Deliberately simple -- BM25 plus embeddings arrive with the
 * real engine. What matters here is the ordering contract: code beats title
 * beats body, and every token must appear somewhere.
 */
function scoreQuery(indexed: IndexedCourse, tokens: string[], rawQuery: string): number {
  if (tokens.length === 0) return 1;

  const compact = stripSeparators(rawQuery);
  let score = 0;

  if (compact.length >= 4) {
    if (indexed.codeKey === compact) score += 1000;
    else if (indexed.codeKey.startsWith(compact)) score += 500;
  }

  for (const token of tokens) {
    if (!indexed.haystack.includes(token)) return 0;
    if (indexed.titleLower === token) score += 300;
    else if (indexed.titleLower.startsWith(token)) score += 120;
    else if (indexed.titleLower.includes(token)) score += 60;
    if (indexed.instructorsLower.some((n) => n.includes(token))) score += 25;
    score += 5;
  }

  // Shorter titles that satisfy the same tokens are the tighter match.
  score += Math.max(0, 40 - indexed.titleLower.length) / 40;
  return score;
}

/**
 * Reputation lookup. STUB: review ingest (spec section 12) is a separate lane
 * and no reputation data reaches the catalog yet, so every course reads as
 * unrated. This is exactly why `includeUnrated` defaults to ON -- flipping it
 * off today empties the result list, and the empty state names it as the
 * filter to relax.
 */
function localReputation(courseId: string): ReputationSummary | null {
  void courseId;
  return null;
}

/** Build the in-memory source. O(n) over the catalog, done once. */
export function createLocalSearchSource(courses: CourseWithSections[]): SearchSource {
  const indexed = courses.map(buildIndexedCourse);
  const byId = new Map<string, IndexedCourse>(indexed.map((c) => [c.course.courseId, c]));

  const subjectCounts = new Map<string, number>();
  const instructorCounts = new Map<string, number>();
  const schoolCounts = new Map<string, number>();
  let creditLo = Number.POSITIVE_INFINITY;
  let creditHi = 0;

  for (const item of indexed) {
    const { course } = item;
    subjectCounts.set(course.subjectCode, (subjectCounts.get(course.subjectCode) ?? 0) + 1);
    for (const name of new Set(course.sections.flatMap((s) => s.instructors))) {
      instructorCounts.set(name, (instructorCounts.get(name) ?? 0) + 1);
    }
    if (item.creditsMin !== null) creditLo = Math.min(creditLo, item.creditsMin);
    if (item.creditsMax !== null) creditHi = Math.max(creditHi, item.creditsMax);
  }

  const toOptions = (counts: Map<string, number>): FacetOption[] =>
    [...counts.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label));

  const facets: SearchFacets = {
    subjects: toOptions(subjectCounts),
    // The catalog read API does not expose a subject-to-school mapping yet
    // (`Subject.school` lives on the subject index, owned by the ingest lane).
    // Until it does this facet is empty and the School control says so.
    schools: toOptions(schoolCounts),
    instructors: toOptions(instructorCounts),
    creditRange: [Number.isFinite(creditLo) ? creditLo : 0, creditHi > 0 ? creditHi : 6],
  };

  function search(filters: SearchFilters): SearchResult {
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    const extended = filters as CatalogSearchFilters;
    const rawQuery = (filters.q ?? "").trim();
    const tokens = normalize(rawQuery).split(" ").filter(Boolean);
    const sectionScoped = hasSectionLevelFilter(filters);
    const subjectSet = filters.subjects?.length ? new Set(filters.subjects) : null;
    const schoolFilterActive = Boolean(filters.schools?.length);
    const includeUnrated = filters.includeUnrated !== false;
    const reputationActive =
      filters.maxWorkload !== undefined ||
      filters.minTeachingQuality !== undefined ||
      extended.maxDifficulty !== undefined;

    const hits: SearchHit[] = [];

    for (const item of indexed) {
      const { course } = item;

      if (subjectSet && !subjectSet.has(course.subjectCode)) continue;
      // No school data in the catalog yet. An explicit school filter cannot be
      // satisfied, rather than being silently ignored.
      if (schoolFilterActive) continue;
      if (filters.levelRange) {
        const [lo, hi] = filters.levelRange;
        if (course.number < lo || course.number > hi) continue;
      }
      if (!creditsMatch(item, filters.creditsMin, filters.creditsMax)) continue;
      if (filters.requirements?.length && !requirementsMatch(item, filters.requirements)) {
        continue;
      }

      const reputation = localReputation(course.courseId);
      if (reputation === null) {
        if (!includeUnrated) continue;
      } else if (reputationActive) {
        const d = reputation.dimensions;
        if (
          filters.maxWorkload !== undefined &&
          d.workload !== null &&
          d.workload > filters.maxWorkload
        ) {
          continue;
        }
        if (
          extended.maxDifficulty !== undefined &&
          d.difficulty !== null &&
          d.difficulty > extended.maxDifficulty
        ) {
          continue;
        }
        if (
          filters.minTeachingQuality !== undefined &&
          d.teachingQuality !== null &&
          d.teachingQuality < filters.minTeachingQuality
        ) {
          continue;
        }
      }

      const matching = course.sections.filter((s) => sectionMatches(s, filters));
      if (matching.length === 0) continue;

      const score = scoreQuery(item, tokens, rawQuery);
      if (score === 0) continue;

      hits.push({
        courseId: course.courseId,
        score,
        matchedSectionIds: sectionScoped ? matching.map((s) => s.sectionId) : null,
      });
    }

    hits.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ca = byId.get(a.courseId)?.course;
      const cb = byId.get(b.courseId)?.course;
      if (!ca || !cb) return 0;
      if (ca.subjectCode !== cb.subjectCode) {
        return ca.subjectCode.localeCompare(cb.subjectCode);
      }
      return ca.number - cb.number;
    });

    const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    return { hits, total: hits.length, elapsedMs: endedAt - startedAt };
  }

  return {
    search,
    getCourse: (courseId) => byId.get(courseId)?.course,
    getReputation: localReputation,
    facets,
    totalCourses: indexed.length,
  };
}
