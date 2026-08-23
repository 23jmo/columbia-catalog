/**
 * The one data path for the course surface.
 *
 * Both presentations — the standalone page (`app/course/[courseId]/page.tsx`)
 * and the in-app drawer (`./course-drawer-host.tsx`) — call this, so they can
 * never diverge. Everything goes through the catalog seam in
 * `@/lib/data/catalog`; the seed JSON is never read directly.
 */

import { getAllCourses, getCourse } from "@/lib/data/catalog";
import { ALL_TERMS, CURRENT_TERM, termLabel } from "@/lib/constants";
import type { CourseWithSections, Section, TermCode } from "@/lib/types";
import { creditsLabel } from "./format";

export interface SimilarCourse {
  courseId: string;
  code: string;
  title: string;
  sectionCount: number;
  instructors: string[];
  credits: string | null;
  /** Why we are showing it — students distrust unexplained recommendations. */
  reason: string;
}

export interface OfferingRecord {
  termCode: TermCode;
  label: string;
  offered: boolean;
  sectionCount: number;
  instructors: string[];
  totalEnrolled: number | null;
  totalCapacity: number | null;
}

export interface CourseDetailData {
  course: CourseWithSections;
  /** Sections filtered to the term being viewed, section code order. */
  sections: Section[];
  termCode: TermCode;
  termLabel: string;
  code: string;
  credits: string | null;
  /** Distinct instructors across the term's sections, most sections first. */
  instructors: string[];
  similar: SimilarCourse[];
  offeringHistory: OfferingRecord[];
}

/**
 * `/course/COMS4118` and `/course/COMS4118W` must both resolve. The registrar's
 * qualifier letter is plumbing no one types, and a pasted link is often missing
 * it — a 404 there is a self-inflicted wound.
 */
export async function resolveCourse(
  courseIdParam: string,
  termCode: TermCode,
): Promise<CourseWithSections | null> {
  const wanted = decodeURIComponent(courseIdParam).trim().toUpperCase().replace(/\s+/g, "");
  const exact = await getCourse(wanted, termCode);
  if (exact) return exact;

  const all = await getAllCourses(termCode);
  const withQualifier = all.find((c) => c.courseId.replace(/[A-Z]$/, "") === wanted);
  if (withQualifier) return withQualifier;

  // "COMS-4118" / "COMS 4118" already normalised above; try a numeric match.
  const match = wanted.match(/^([A-Z]+)0*(\d+)[A-Z]?$/);
  if (match) {
    const [, subject, number] = match;
    const numeric = all.find((c) => c.subjectCode === subject && c.number === Number(number));
    if (numeric) return numeric;
  }
  return null;
}

function sectionSort(a: Section, b: Section): number {
  return a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true });
}

function distinctInstructors(sections: Section[]): string[] {
  const counts = new Map<string, number>();
  for (const section of sections) {
    for (const name of section.instructors) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
}

function levelBand(number: number): number {
  return Math.floor(number / 1000);
}

function buildSimilar(course: CourseWithSections, all: CourseWithSections[]): SimilarCourse[] {
  const scored = all
    .filter((c) => c.courseId !== course.courseId)
    .map((candidate) => {
      const sameSubject = candidate.subjectCode === course.subjectCode;
      const sameBand = levelBand(candidate.number) === levelBand(course.number);
      const distance = Math.abs(candidate.number - course.number);

      let reason = "Same department";
      let score = 0;
      if (sameSubject && sameBand) {
        score = 100 - Math.min(99, distance / 10);
        reason = `Same subject, ${levelBand(course.number)}000 level`;
      } else if (sameSubject) {
        score = 40 - Math.min(39, distance / 100);
        reason = "Same subject";
      } else if (candidate.department && candidate.department === course.department) {
        score = 20;
        reason = "Same department";
      }

      // A neighbouring number in the same subject is usually the real sequel.
      if (sameSubject && distance > 0 && distance <= 20) {
        score += 25;
        reason = "Adjacent in the course sequence";
      }

      return { candidate, score, reason };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return scored.map(({ candidate, reason }) => ({
    courseId: candidate.courseId,
    code: `${candidate.subjectCode} ${candidate.number}`,
    title: candidate.title,
    sectionCount: candidate.sections.length,
    instructors: distinctInstructors(candidate.sections).slice(0, 2),
    credits: creditsLabel(candidate.pointsMin, candidate.pointsMax),
    reason,
  }));
}

async function buildOfferingHistory(courseId: string): Promise<OfferingRecord[]> {
  const records = await Promise.all(
    ALL_TERMS.map(async (termCode): Promise<OfferingRecord> => {
      const found = await getCourse(courseId, termCode);
      const sections = found?.sections.filter((s) => s.termCode === termCode) ?? [];
      const enrolled = sections.reduce<number | null>(
        (sum, s) => (s.enrollmentCount == null ? sum : (sum ?? 0) + s.enrollmentCount),
        null,
      );
      const capacity = sections.reduce<number | null>(
        (sum, s) => (s.enrollmentCap == null ? sum : (sum ?? 0) + s.enrollmentCap),
        null,
      );
      return {
        termCode,
        label: termLabel(termCode),
        offered: sections.length > 0,
        sectionCount: sections.length,
        instructors: distinctInstructors(sections),
        totalEnrolled: enrolled,
        totalCapacity: capacity,
      };
    }),
  );
  return records;
}

export async function loadCourseDetail(
  courseIdParam: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<CourseDetailData | null> {
  const course = await resolveCourse(courseIdParam, termCode);
  if (!course) return null;

  const sections = course.sections.filter((s) => s.termCode === termCode).sort(sectionSort);
  const [all, offeringHistory] = await Promise.all([
    getAllCourses(termCode),
    buildOfferingHistory(course.courseId),
  ]);

  return {
    course,
    sections,
    termCode,
    termLabel: termLabel(termCode),
    code: `${course.subjectCode} ${course.number}`,
    credits: creditsLabel(course.pointsMin, course.pointsMax),
    instructors: distinctInstructors(sections),
    similar: buildSimilar(course, all),
    offeringHistory,
  };
}
