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

import { instructorSlug } from "./instructor-slug";

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
/** Listings carry no seats, so they can live as long as the fat catalog cache in queries. */
const LISTING_TTL_MS = 5 * 60 * 1000;

interface CatalogCacheEntry {
  expiresAt: number;
  courses: Promise<CourseWithSections[]>;
}

const catalogCache = new Map<TermCode, CatalogCacheEntry>();
const listingCache = new Map<TermCode, { expiresAt: number; listings: Promise<CourseListing[]> }>();

/** Drop every memoised term. Exported for ingest jobs and tests. */
export function invalidateCatalogCache(termCode?: TermCode): void {
  if (termCode) {
    catalogCache.delete(termCode);
    listingCache.delete(termCode);
    return;
  }
  catalogCache.clear();
  listingCache.clear();
}

/**
 * One course as the engine ranks it: identity and credit, no sections.
 *
 * The feed scores thousands of these, then hydrates sections only for the
 * shortlist. Putting meetings on this type would drag them back into ranking.
 */
export interface CourseListing {
  courseId: string;
  subjectCode: string;
  number: number;
  qualifier: string | null;
  title: string;
  pointsMin: number | null;
  pointsMax: number | null;
}

function listingFromCourse(course: CourseWithSections): CourseListing {
  return {
    courseId: course.courseId,
    subjectCode: course.subjectCode,
    number: course.number,
    qualifier: course.qualifier,
    title: course.title,
    pointsMin: course.pointsMin,
    pointsMax: course.pointsMax,
  };
}

/**
 * Courses offered in a term, without nested sections.
 *
 * Ranking does not need meetings or instructors. Those are fetched later for
 * the few dozen winners via `getCoursesByIds`.
 */
export async function getCourseListings(
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseListing[]> {
  if (!isConfigured()) {
    return SEED.filter((course) => course.sections.some((section) => section.termCode === termCode)).map(
      listingFromCourse,
    );
  }

  const now = Date.now();
  const cached = listingCache.get(termCode);
  if (cached && cached.expiresAt > now) return cached.listings;

  const listings = db.getCourseListings(termCode);
  listingCache.set(termCode, { expiresAt: now + LISTING_TTL_MS, listings });
  listings.catch(() => {
    if (listingCache.get(termCode)?.listings === listings) listingCache.delete(termCode);
  });
  return listings;
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

/**
 * Qualifier-tolerant course lookup — `COMS4118` finding `COMS4118W`.
 *
 * Only called once an exact `getCourse` has missed. The seed path keeps the
 * original in-memory scan because 43 records cost nothing to walk.
 */
export async function findCourseByLooseId(
  wanted: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections | null> {
  if (isConfigured()) return db.findCourseByLooseId(wanted, termCode);

  const inTerm = SEED.filter((c) => c.sections.some((s) => s.termCode === termCode));
  const withQualifier = inTerm.find((c) => c.courseId.replace(/[A-Z]$/, "") === wanted);
  if (withQualifier) return clone(withQualifier);

  const match = wanted.match(/^([A-Z]+)0*(\d+)[A-Z]?$/);
  if (!match) return null;
  const [, subjectCode, number] = match;
  const numeric = inTerm.find(
    (c) => c.subjectCode === subjectCode && c.number === Number(number),
  );
  return numeric ? clone(numeric) : null;
}

/**
 * Candidates for the "similar courses" list on the course surface.
 *
 * The scorer keeps only same-subject and same-department courses, so those are
 * the only two sets worth fetching. Doing that turned the course drawer's cold
 * open from ~3.9s into a couple of small queries: it used to page the entire
 * term out of the database — ~4,400 courses, ~8 MB — to pick six rows.
 *
 * The seed path keeps the old shape because filtering 43 in-memory records is
 * free; the caller's scorer discards the non-matches either way.
 */
export async function getSimilarCandidates(
  subjectCode: string,
  department: string | null,
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections[]> {
  if (isConfigured()) return db.getSimilarCandidates(subjectCode, department, termCode);
  return clone(
    SEED.filter(
      (c) =>
        c.sections.some((s) => s.termCode === termCode) &&
        (c.subjectCode === subjectCode ||
          (department != null && c.department === department)),
    ),
  );
}

/**
 * One course with its sections across several terms, for offering history.
 *
 * Returns every section in any of `termCodes` attached to the single course —
 * the caller groups them by term. Replaces one `getCourse` call per term.
 */
export async function getCourseAcrossTerms(
  courseId: string,
  termCodes: TermCode[],
): Promise<CourseWithSections | null> {
  if (isConfigured()) return db.getCourseAcrossTerms(courseId, termCodes);
  const wanted = new Set<TermCode>(termCodes);
  const found = SEED.find((c) => c.courseId === courseId);
  if (!found) return null;
  const sections = found.sections.filter((s) => wanted.has(s.termCode));
  if (sections.length === 0) return null;
  return clone({ ...found, sections });
}

export interface InstructorCoursesResult {
  name: string;
  courses: CourseWithSections[];
}

function instructorCoursesFromSeed(
  slug: string,
  termCode: TermCode,
): InstructorCoursesResult | null {
  const names = new Set<string>();
  for (const course of SEED) {
    for (const section of course.sections) {
      if (section.termCode !== termCode) continue;
      for (const person of section.instructors) names.add(person);
    }
  }
  const name = [...names].find((candidate) => instructorSlug(candidate) === slug);
  if (!name) return null;

  const courses: CourseWithSections[] = [];
  for (const course of SEED) {
    const sections = course.sections.filter(
      (section) => section.termCode === termCode && section.instructors.includes(name),
    );
    if (sections.length === 0) continue;
    courses.push(clone({ ...course, sections: sections.map((section) => clone(section)) }));
  }

  courses.sort((a, b) =>
    `${a.subjectCode} ${a.number}`.localeCompare(`${b.subjectCode} ${b.number}`, undefined, {
      numeric: true,
    }),
  );
  return courses.length > 0 ? { name, courses } : null;
}

/**
 * Courses one instructor teaches in a term — only their sections attached.
 *
 * The instructor page used to call `getAllCourses` and scan the whole term.
 * This is the targeted read: resolve the slug against `instructors`, then join
 * through `section_instructors`.
 */
export async function getInstructorCourses(
  slugOrName: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<InstructorCoursesResult | null> {
  const slug = instructorSlug(decodeURIComponent(slugOrName));

  if (!isConfigured()) return instructorCoursesFromSeed(slug, termCode);

  const resolved = await db.findInstructorBySlug(slug);
  if (!resolved) return null;

  const courses = await db.getCoursesTaughtByInstructor(resolved.instructorId, termCode);
  if (courses.length === 0) return null;

  return { name: resolved.fullName, courses };
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
