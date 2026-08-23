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
 * Every course in a term, sections attached. Used to build the search index, so
 * it pages until exhausted rather than silently truncating at PostgREST's
 * 1000-row default — a truncated index is a search engine that quietly cannot
 * find half the catalog.
 */
export async function getAllCourses(
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections[]> {
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
