/**
 * Supabase-backed implementations of the catalog read seam.
 *
 * Every function here mirrors a function in `lib/data/catalog.ts` — same name,
 * same signature, same return shape. That file is the seam the whole UI reads
 * through; when Supabase is provisioned its bodies delegate here and nothing
 * else in the app changes. See `lib/db/README.md` for the flip.
 *
 * Callers must gate on `isConfigured()` first. These functions throw rather
 * than returning empty results when Supabase is absent, because an empty
 * catalog silently rendering as "no courses found" is a worse failure than a
 * loud one.
 */

import { CURRENT_TERM } from "@/lib/constants";
import type { CourseWithSections, Section, TermCode } from "@/lib/types";

import {
  createAnonServerClient,
  getBrowserClient,
  isConfigured,
  type CatalogClient,
} from "./client";
import {
  SECTION_SELECT,
  rowToCourseWithSections,
  rowToSection,
  type CourseRowWithSections,
  type SectionRow,
  type SectionRowWithRelations,
} from "./schema";

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Gate catalog reads on isConfigured() and fall back to the seed extract.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

/**
 * PostgREST caps a single response at 1000 rows by default. Anything that can
 * legitimately exceed that pages through.
 */
const PAGE_SIZE = 1000;

/**
 * Ceiling on ids per `in.()` filter. PostgREST puts the whole list in the query
 * string and proxies cap URL length, so long id lists are chunked.
 */
const IN_CHUNK = 200;

/**
 * Only courses that actually have a section in the term come back — `!inner`
 * turns the embedded filter into a join condition rather than a post-filter.
 */
const COURSE_WITH_TERM_SECTIONS_SELECT = `*, sections!inner(${SECTION_SELECT})`;

/**
 * The right client for wherever this is running: the shared browser singleton
 * in the browser, a cookie-free anonymous client on the server. Catalog reads
 * are world-readable and need no session, so the server path deliberately skips
 * the cookie round trip.
 */
function readClient(): CatalogClient {
  if (!isConfigured()) throw new DatabaseNotConfiguredError();
  const client = typeof window === "undefined" ? createAnonServerClient() : getBrowserClient();
  if (!client) throw new DatabaseNotConfiguredError();
  return client;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown Supabase error"}`);
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

/**
 * How long a loaded catalog is reused before it is fetched again.
 *
 * The catalog is refreshed by the nightly crawl (`vercel.json` crons it at
 * 07:00), so it is effectively static within a day and minutes of staleness
 * cost a reader nothing. Anything that must observe a write immediately should
 * query the row it wrote, not the whole term.
 */
const CATALOG_TTL_MS = 5 * 60 * 1000;

const catalogCache = new Map<TermCode, { expires: number; courses: Promise<CourseWithSections[]> }>();

/**
 * Every course in a term, sections attached. Used to build the search index, so
 * it pages until exhausted rather than silently truncating at PostgREST's
 * 1000-row default — a truncated index is a search engine that quietly cannot
 * find half the catalog.
 *
 * WHY this memoises, and why the cache holds the PROMISE rather than the result:
 *
 * This is a whole-collection read — 4,400 courses over five paged round trips,
 * around 8 MB and five seconds — and callers reach for it per item. Rendering
 * one instructor's profile downloads the entire term to find the sections one
 * person teaches, and the instructor route prerenders four thousand of those.
 * Uncached that is ~40,000 full-catalog queries in a single build, nine build
 * workers deep; Postgres cancels them on `statement_timeout` long before the
 * build finishes, which is exactly how it used to fail.
 *
 * Caching the promise rather than the resolved array is what collapses the
 * concurrent callers: `generateMetadata` and the page body both ask during the
 * same render, and both must await the SAME in-flight request rather than
 * starting a second one. A rejected promise is evicted so a transient failure
 * is retried instead of being served as a cached error for the whole TTL.
 *
 * This is a per-process cache, so it is bounded by the process: nine build
 * workers hold at most nine copies, and a serverless instance holds one for as
 * long as it stays warm. That is the right shape for data this size — a shared
 * cache would need eviction and invalidation that a daily-refreshed catalog
 * does not earn.
 */
export async function getAllCourses(
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections[]> {
  const cached = catalogCache.get(termCode);
  if (cached && cached.expires > Date.now()) return cached.courses;

  const inFlight = fetchAllCourses(termCode);
  catalogCache.set(termCode, { expires: Date.now() + CATALOG_TTL_MS, courses: inFlight });
  // A failed fetch must not be served for the rest of the TTL. Only drop the
  // entry if it is still the one this call installed, so a retry that has
  // already replaced it is not evicted by an older rejection.
  inFlight.catch(() => {
    if (catalogCache.get(termCode)?.courses === inFlight) catalogCache.delete(termCode);
  });
  return inFlight;
}

/** Uncached read. See `getAllCourses` for why callers must not use this. */
async function fetchAllCourses(termCode: TermCode): Promise<CourseWithSections[]> {
  const client = readClient();
  const courses: CourseWithSections[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .from("courses")
      .select(COURSE_WITH_TERM_SECTIONS_SELECT)
      .eq("sections.term_code", termCode)
      .order("subject_code", { ascending: true })
      .order("course_number", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .overrideTypes<CourseRowWithSections[], { merge: false }>();

    if (error) fail(`getAllCourses(${termCode})`, error);

    const rows = data ?? [];
    for (const row of rows) courses.push(rowToCourseWithSections(row, termCode));
    if (rows.length < PAGE_SIZE) break;
  }

  return courses;
}

export async function getCourse(
  courseId: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections | null> {
  const client = readClient();

  const { data, error } = await client
    .from("courses")
    .select(COURSE_WITH_TERM_SECTIONS_SELECT)
    .eq("course_id", courseId)
    .eq("sections.term_code", termCode)
    .maybeSingle()
    .overrideTypes<CourseRowWithSections | null, { merge: false }>();

  if (error) fail(`getCourse(${courseId})`, error);
  return data ? rowToCourseWithSections(data, termCode) : null;
}

export async function getCoursesByIds(
  courseIds: string[],
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections[]> {
  if (courseIds.length === 0) return [];
  const client = readClient();
  const out: CourseWithSections[] = [];

  for (const ids of chunk([...new Set(courseIds)], IN_CHUNK)) {
    const { data, error } = await client
      .from("courses")
      .select(COURSE_WITH_TERM_SECTIONS_SELECT)
      .in("course_id", ids)
      .eq("sections.term_code", termCode)
      .overrideTypes<CourseRowWithSections[], { merge: false }>();

    if (error) fail("getCoursesByIds", error);
    for (const row of data ?? []) out.push(rowToCourseWithSections(row, termCode));
  }

  // Preserve the caller's ordering — search hands these back in rank order and
  // a database's idea of order is not the ranking.
  const byId = new Map(out.map((c) => [c.courseId, c]));
  return courseIds.map((id) => byId.get(id)).filter((c): c is CourseWithSections => Boolean(c));
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * The qualifier-tolerant course lookup behind `resolveCourse`.
 *
 * `/course/COMS4118` must resolve to `COMS4118W`: the registrar's trailing
 * qualifier letter is plumbing nobody types, and a pasted link is usually
 * missing it. That used to be answered by scanning the whole term in memory,
 * which meant the most forgiving path was also the slowest one -- ~3.9s to
 * recover from a missing letter. Two indexed queries answer it instead.
 *
 * Only ever called after an exact `getCourse` has already missed.
 */
export async function findCourseByLooseId(
  wanted: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections | null> {
  const client = readClient();

  // `_` and `%` are LIKE metacharacters. Real course ids are alphanumeric, so
  // rather than escape them, anything else declines the pattern query outright
  // -- matching the old in-memory scan, which could not match them either.
  if (/^[A-Z0-9]+$/.test(wanted)) {
    const { data, error } = await client
      .from("courses")
      .select(COURSE_WITH_TERM_SECTIONS_SELECT)
      .eq("sections.term_code", termCode)
      .like("course_id", `${wanted}_`)
      .order("course_id", { ascending: true })
      .overrideTypes<CourseRowWithSections[], { merge: false }>();

    if (error) fail(`findCourseByLooseId(${wanted})`, error);

    // LIKE's `_` matches any single character; the qualifier is specifically an
    // uppercase letter, so the shape is re-checked here rather than trusted.
    const qualified = (data ?? []).find((row) =>
      /^[A-Z]$/.test(String(row.course_id).slice(wanted.length)),
    );
    if (qualified) return rowToCourseWithSections(qualified, termCode);
  }

  // "COMS0004118" / "COMS4118W" -> subject COMS, number 4118.
  const match = wanted.match(/^([A-Z]+)0*(\d+)[A-Z]?$/);
  if (!match) return null;
  const [, subjectCode, number] = match;

  const { data, error } = await client
    .from("courses")
    .select(COURSE_WITH_TERM_SECTIONS_SELECT)
    .eq("sections.term_code", termCode)
    .eq("subject_code", subjectCode)
    .eq("course_number", Number(number))
    .order("course_id", { ascending: true })
    .limit(1)
    .overrideTypes<CourseRowWithSections[], { merge: false }>();

  if (error) fail(`findCourseByLooseId(${wanted} numeric)`, error);
  const row = data?.[0];
  return row ? rowToCourseWithSections(row, termCode) : null;
}

/**
 * The courses that could plausibly be "similar" to one course.
 *
 * `buildSimilar` in `components/course/load-course-detail.ts` scores candidates
 * and keeps only those scoring above zero, and exactly two families ever do:
 * another course in the SAME SUBJECT, or one sharing the same non-null
 * DEPARTMENT. So this fetches those two sets instead of the entire term. The
 * result is not an approximation -- every course this omits would have scored
 * zero and been filtered out anyway.
 *
 * The distinction is worth ~4 seconds. A term is ~4,400 courses and pages out
 * of PostgREST in five sequential round trips (~8 MB); the largest subject is
 * 217 courses and the largest department 73, each a single round trip well
 * under the 1,000-row cap. And 63% of courses carry no department at all, so
 * most calls here are one query returning a few dozen rows.
 *
 * The two sets are fetched concurrently and merged rather than expressed as a
 * PostgREST `or=(...)`: department values are URL paths, and embedding
 * arbitrary punctuation into `or`'s comma-separated grammar is a quoting bug
 * waiting to happen.
 */
export async function getSimilarCandidates(
  subjectCode: string,
  department: string | null,
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections[]> {
  const client = readClient();

  const bySubject = client
    .from("courses")
    .select(COURSE_WITH_TERM_SECTIONS_SELECT)
    .eq("sections.term_code", termCode)
    .eq("subject_code", subjectCode)
    .overrideTypes<CourseRowWithSections[], { merge: false }>();

  // Skipped entirely when the course has no department — no candidate can match
  // a null, so the query would be a round trip guaranteed to score nothing.
  const byDepartment = department
    ? client
        .from("courses")
        .select(COURSE_WITH_TERM_SECTIONS_SELECT)
        .eq("sections.term_code", termCode)
        .eq("department", department)
        .overrideTypes<CourseRowWithSections[], { merge: false }>()
    : null;

  const [subjectResult, departmentResult] = await Promise.all([bySubject, byDepartment]);

  if (subjectResult.error) fail(`getSimilarCandidates(${subjectCode})`, subjectResult.error);
  if (departmentResult?.error) {
    fail(`getSimilarCandidates(department ${department})`, departmentResult.error);
  }

  // A same-subject course is usually also same-department, so the two sets
  // overlap heavily; dedupe by id before the caller scores them.
  const byId = new Map<string, CourseWithSections>();
  for (const row of [...(subjectResult.data ?? []), ...(departmentResult?.data ?? [])]) {
    const course = rowToCourseWithSections(row, termCode);
    byId.set(course.courseId, course);
  }
  return [...byId.values()];
}

/**
 * One course with its sections across several terms, in a single round trip.
 *
 * Offering history asks the same question of eight terms. Asking it as eight
 * separate `getCourse` calls is eight round trips for rows that live in one
 * table; this asks once and lets the caller group by `termCode`.
 *
 * Note the deliberate lack of a `termCode` argument to `rowToCourseWithSections`
 * — passing one would filter the sections down to a single term and throw away
 * the very thing this function exists to fetch.
 */
export async function getCourseAcrossTerms(
  courseId: string,
  termCodes: TermCode[],
): Promise<CourseWithSections | null> {
  const client = readClient();

  const { data, error } = await client
    .from("courses")
    .select(COURSE_WITH_TERM_SECTIONS_SELECT)
    .eq("course_id", courseId)
    .in("sections.term_code", termCodes)
    .maybeSingle()
    .overrideTypes<CourseRowWithSections | null, { merge: false }>();

  if (error) fail(`getCourseAcrossTerms(${courseId})`, error);
  return data ? rowToCourseWithSections(data) : null;
}

export async function getSection(sectionId: string): Promise<Section | null> {
  const client = readClient();

  const { data, error } = await client
    .from("sections")
    .select(SECTION_SELECT)
    .eq("section_id", sectionId)
    .maybeSingle()
    .overrideTypes<SectionRowWithRelations | null, { merge: false }>();

  if (error) fail(`getSection(${sectionId})`, error);
  return data ? rowToSection(data) : null;
}

export async function getSections(sectionIds: string[]): Promise<Section[]> {
  if (sectionIds.length === 0) return [];
  const client = readClient();
  const out: Section[] = [];

  for (const ids of chunk([...new Set(sectionIds)], IN_CHUNK)) {
    const { data, error } = await client
      .from("sections")
      .select(SECTION_SELECT)
      .in("section_id", ids)
      .overrideTypes<SectionRowWithRelations[], { merge: false }>();

    if (error) fail("getSections", error);
    for (const row of data ?? []) out.push(rowToSection(row));
  }

  return out;
}

// ---------------------------------------------------------------------------
// Seat state
// ---------------------------------------------------------------------------

/**
 * Live seat state for the sections currently on screen. The volatile half of
 * the split in spec §9: deliberately NOT in the search index, merged at render
 * time. Mirrors the type of the same name in `lib/data/catalog.ts`.
 */
export interface SeatState {
  sectionId: string;
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  waitlistCount: number | null;
  status: Section["status"];
  sourceAsOf: string | null;
}

/**
 * Selects only the volatile columns — no meetings, no instructors, no joins.
 * This is the query that runs on every realtime tick and every scroll, so it
 * stays as narrow as the data it actually needs.
 */
export async function getSeatStates(sectionIds: string[]): Promise<SeatState[]> {
  if (sectionIds.length === 0) return [];
  const client = readClient();
  const out: SeatState[] = [];

  type SeatRow = Pick<
    SectionRow,
    | "section_id"
    | "enrollment_count"
    | "enrollment_cap"
    | "waitlist_count"
    | "status"
    | "source_as_of"
    | "source_as_of_raw"
  >;

  for (const ids of chunk([...new Set(sectionIds)], IN_CHUNK)) {
    const { data, error } = await client
      .from("sections")
      .select(
        "section_id, enrollment_count, enrollment_cap, waitlist_count, status, source_as_of, source_as_of_raw",
      )
      .in("section_id", ids)
      .overrideTypes<SeatRow[], { merge: false }>();

    if (error) fail("getSeatStates", error);

    for (const row of data ?? []) {
      out.push({
        sectionId: row.section_id,
        enrollmentCount: row.enrollment_count,
        enrollmentCap: row.enrollment_cap,
        waitlistCount: row.waitlist_count,
        status: row.status,
        // Provenance travels with the numbers, always: the directory's own
        // printed stamp wins over our parsed copy.
        sourceAsOf: row.source_as_of_raw ?? row.source_as_of,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Filter menus
// ---------------------------------------------------------------------------

/** Distinct subjects present in the catalog, for filter menus. */
export async function getSubjectCodes(): Promise<string[]> {
  const client = readClient();
  const out: string[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .from("subjects")
      .select("subject_code")
      .order("subject_code", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .overrideTypes<{ subject_code: string }[], { merge: false }>();

    if (error) fail("getSubjectCodes", error);

    const rows = data ?? [];
    for (const row of rows) out.push(row.subject_code);
    if (rows.length < PAGE_SIZE) break;
  }

  return out;
}

/** Distinct instructor names, for the instructor filter. */
export async function getInstructorNames(): Promise<string[]> {
  const client = readClient();
  const names = new Set<string>();

  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .from("instructors")
      .select("full_name")
      .order("normalized_name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .overrideTypes<{ full_name: string }[], { merge: false }>();

    if (error) fail("getInstructorNames", error);

    const rows = data ?? [];
    for (const row of rows) names.add(row.full_name);
    if (rows.length < PAGE_SIZE) break;
  }

  return [...names].sort();
}

export type { CourseWithSections, Section };
