/**
 * Catalog read API — the single seam every UI surface reads through.
 *
 * Today this is backed by a seed extract of real Fall 2026 COMS data so the UI
 * can be built and tested without a database. The database lane replaces the
 * bodies of these functions with Supabase queries; the signatures are the
 * contract and must not change.
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
import seed from "@/lib/seed/coms-fall2026.json";

const SEED = seed as unknown as CourseWithSections[];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Every course in a term, sections attached. Used to build the search index. */
export async function getAllCourses(
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections[]> {
  return clone(SEED.filter((c) => c.sections.some((s) => s.termCode === termCode)));
}

export async function getCourse(
  courseId: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections | null> {
  const found = SEED.find(
    (c) => c.courseId === courseId && c.sections.some((s) => s.termCode === termCode),
  );
  return found ? clone(found) : null;
}

export async function getCoursesByIds(
  courseIds: string[],
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseWithSections[]> {
  const wanted = new Set(courseIds);
  return clone(
    SEED.filter(
      (c) => wanted.has(c.courseId) && c.sections.some((s) => s.termCode === termCode),
    ),
  );
}

export async function getSection(sectionId: string): Promise<Section | null> {
  for (const c of SEED) {
    const s = c.sections.find((x) => x.sectionId === sectionId);
    if (s) return clone(s);
  }
  return null;
}

export async function getSections(sectionIds: string[]): Promise<Section[]> {
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
export interface SeatState {
  sectionId: string;
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  waitlistCount: number | null;
  status: Section["status"];
  sourceAsOf: string | null;
}

export async function getSeatStates(sectionIds: string[]): Promise<SeatState[]> {
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
  return [...new Set(SEED.map((c) => c.subjectCode))].sort();
}

/** Distinct instructor names, for the instructor filter. */
export async function getInstructorNames(): Promise<string[]> {
  const names = new Set<string>();
  for (const c of SEED) for (const s of c.sections) for (const n of s.instructors) names.add(n);
  return [...names].sort();
}

export type { Course, CourseWithSections, Section };
