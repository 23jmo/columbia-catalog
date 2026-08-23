/**
 * Catalog read API — the single seam every UI surface reads through.
 *
 * Two backends live behind these signatures:
 *
 *   · Supabase (`lib/db/catalog-queries.ts`) whenever it is configured, and
 *   · a seed extract of real Fall 2026 COMS data when it is not.
 *
 * The seed is not a mock. It is 43 real courses captured from the directory,
 * and it exists so the UI, the tests and `next build` all work on a machine
 * with no `.env.local` — including CI and a fresh clone. Deleting it would make
 * the build depend on a network service.
 *
 * ── Why the fallback is per-call and not a module-level branch ──────────────
 *
 * `isConfigured()` reads `process.env` at module scope in `lib/db/client.ts`,
 * which Next inlines at build time for `NEXT_PUBLIC_*`. Deciding once per call
 * costs nothing and keeps the decision correct in every runtime — server
 * component, route handler, browser — rather than baking in whatever was true
 * when this module first evaluated.
 *
 * ── Why a database error is not silently swallowed ─────────────────────────
 *
 * If Supabase is configured and a query fails, that throws. Falling back to the
 * seed would render 43 COMS courses as if they were the whole catalog — a
 * plausible-looking page that is wrong, which is worse than an error boundary.
 * The seed is the answer to "no database", never to "the database is unhappy".
 *
 * DO NOT read the seed JSON directly from a component. Go through here.
 */

import type {
  Course,
  CourseWithSections,
  Section,
  TermCode,
} from "@/lib/types";
import { CURRENT_TERM } from "@/lib/constants";
import * as db from "@/lib/db/catalog-queries";
import { isConfigured } from "@/lib/db/client";
import seed from "@/lib/seed/coms-fall2026.json";

const SEED = seed as unknown as CourseWithSections[];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---------------------------------------------------------------------------
// Whole-catalog cache
// ---------------------------------------------------------------------------
//
// `getAllCourses` is the most expensive read in the app by a wide margin. It
// pages the entire term out of Supabase -- at Fall 2026's real size that is
// ~4,600 courses with their sections attached, five sequential 1,000-row round
// trips, ~8 MB of JSON, ~3.3s wall clock. `/search` awaits it on every single
// request, so every navigation, refresh and HMR reload paid the full 3.3s.
//
// Nothing about that work is per-request: the same term returns the same rows.
// So it is memoised here, at the seam, rather than in any one caller.
//
// Three deliberate choices:
//
//   · **The promise is cached, not the value.** Concurrent requests that miss
//     together (a reload storm, or dev's parallel prefetches) coalesce onto one
//     in-flight query instead of each launching their own five round trips.
//
//   · **A rejection evicts the entry.** A failed read must not be remembered as
//     an answer for the next 60 seconds; the next caller retries. This preserves
//     the file-header rule that a database error surfaces rather than silently
//     degrading to something plausible-looking.
//
//   · **The TTL is short and the result is shared, not cloned.** Cloning 8 MB
//     per request would hand back most of the latency the cache just saved, so
//     callers receive the same frozen-by-convention array. Treat it as read-only.
//
// On staleness: seat counts ride along on the section records, and search rows
// render them. Those numbers are already only as fresh as the last crawl, and
// every seat badge prints its own `sourceAsOf` provenance, so a 60-second memo
// adds a bounded, disclosed amount of lag to data the UI already timestamps.
// Truly live seat state has its own uncached read -- `getSeatStates` below,
// which is the volatile half of the spec section 9 split and stays uncached on purpose.

const CATALOG_TTL_MS = 60_000;

interface CatalogCacheEntry {
  expiresAt: number;
  courses: Promise<CourseWithSections[]>;
}

const catalogCache = new Map<TermCode, CatalogCacheEntry>();

/** Drop every memoised term. Exported for ingest jobs and tests. */
export function invalidateCatalogCache(termCode?: TermCode): void {
  if (termCode) catalogCache.delete(termCode);
  else catalogCache.clear();
}

/** Every course in a term, sections attached. Used to build the search index. */
export async function getAllCourses(
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections[]> {
  // The seed path is a synchronous filter over 43 in-memory records. There is
  // nothing to amortise, and cloning keeps the module-level SEED immutable.
  if (!isConfigured()) {
    return clone(SEED.filter((c) => c.sections.some((s) => s.termCode === termCode)));
  }

  const now = Date.now();
  const cached = catalogCache.get(termCode);
  if (cached && cached.expiresAt > now) return cached.courses;

  const courses = db.getAllCourses(termCode);
  catalogCache.set(termCode, { expiresAt: now + CATALOG_TTL_MS, courses });

  // Evict on failure so an outage is not memoised as an answer. The catch is
  // attached to a branch of the promise, not to the one handed to callers, so
  // the rejection still propagates to them exactly as before.
  courses.catch(() => {
    if (catalogCache.get(termCode)?.courses === courses) catalogCache.delete(termCode);
  });

  return courses;
}

export async function getCourse(
  courseId: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections | null> {
  if (isConfigured()) return db.getCourse(courseId, termCode);
  const found = SEED.find(
    (c) => c.courseId === courseId && c.sections.some((s) => s.termCode === termCode),
  );
  return found ? clone(found) : null;
}

export async function getCoursesByIds(
  courseIds: string[],
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections[]> {
  if (isConfigured()) return db.getCoursesByIds(courseIds, termCode);
  const wanted = new Set(courseIds);
  return clone(
    SEED.filter(
      (c) => wanted.has(c.courseId) && c.sections.some((s) => s.termCode === termCode),
    ),
  );
}

export async function getSection(sectionId: string): Promise<Section | null> {
  if (isConfigured()) return db.getSection(sectionId);
  for (const c of SEED) {
    const s = c.sections.find((x) => x.sectionId === sectionId);
    if (s) return clone(s);
  }
  return null;
}

export async function getSections(sectionIds: string[]): Promise<Section[]> {
  if (isConfigured()) return db.getSections(sectionIds);
  const wanted = new Set(sectionIds);
  const out: Section[] = [];
  for (const c of SEED) {
    for (const s of c.sections) if (wanted.has(s.sectionId)) out.push(clone(s));
  }
  return out;
}

/**
 * Live seat state for the sections currently on screen. This is the volatile
 * half of the split described in spec §9 — it is deliberately NOT in the
 * search index and is merged at render time.
 */
export type SeatState = db.SeatState;

export async function getSeatStates(sectionIds: string[]): Promise<SeatState[]> {
  if (isConfigured()) return db.getSeatStates(sectionIds);
  const sections = await getSections(sectionIds);
  return sections.map((s) => ({
    sectionId: s.sectionId,
    enrollmentCount: s.enrollmentCount,
    enrollmentCap: s.enrollmentCap,
    waitlistCount: s.waitlistCount,
    status: s.status,
    sourceAsOf: s.sourceAsOf,
  }));
}

/** Distinct subjects present in the catalog, for filter menus. */
export async function getSubjectCodes(): Promise<string[]> {
  if (isConfigured()) return db.getSubjectCodes();
  return [...new Set(SEED.map((c) => c.subjectCode))].sort();
}

/** Distinct instructor names, for the instructor filter. */
export async function getInstructorNames(): Promise<string[]> {
  if (isConfigured()) return db.getInstructorNames();
  const names = new Set<string>();
  for (const c of SEED) for (const s of c.sections) for (const n of s.instructors) names.add(n);
  return [...names].sort();
}

/** True when reads are served from Supabase rather than the seed extract. */
export function isLiveCatalog(): boolean {
  return isConfigured();
}

export type { Course, CourseWithSections, Section };
