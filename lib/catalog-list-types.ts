import type { Course, CourseWithSections, Meeting, Section, TermCode } from "@/lib/types";

/**
 * Display projection for search rows — baked into the search index DISP block
 * at build time so `/search` never ships the whole catalog in the RSC payload.
 *
 * Every field here is structurally identical to its counterpart on `Course` /
 * `Section`, so `CourseWithSections` is assignable via `projectCourse`.
 *
 * See `lib/search/index-format.ts` (DISP block) and `projectCourse` below.
 */

/** Section fields the results table and the local search source read. */
export interface SectionListItem {
  sectionId: string;
  courseId: string;
  termCode: TermCode;
  callNumber: string;
  sectionCode: string;
  minUnit: number | null;
  maxUnit: number | null;
  instructors: string[];
  meetings: Meeting[];
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  waitlistCount: number | null;
  status: Section["status"];
  /** Provenance. Spec section 3: every seat number renders with its timestamp. */
  sourceAsOf: string | null;
}

/** Course fields the results table and the local search source read. */
export interface CourseListItem {
  courseId: string;
  subjectCode: string;
  number: number;
  title: string;
  /** Searched, never displayed in the list. */
  description: string | null;
  department: string | null;
  pointsMin: number | null;
  pointsMax: number | null;
  requirementFlags: Course["requirementFlags"];
  sections: SectionListItem[];
}

/**
 * Narrow a full record to the projection. Explicit field-by-field rather than
 * a destructuring rest, because `...rest` would silently carry every future
 * column the ingest adds straight back into the payload this exists to shrink.
 */
export function projectCourse(course: CourseWithSections): CourseListItem {
  return {
    courseId: course.courseId,
    subjectCode: course.subjectCode,
    number: course.number,
    title: course.title,
    description: course.description,
    department: course.department,
    pointsMin: course.pointsMin,
    pointsMax: course.pointsMax,
    requirementFlags: course.requirementFlags,
    sections: course.sections.map(projectSection),
  };
}

export function projectSection(section: Section): SectionListItem {
  return {
    sectionId: section.sectionId,
    courseId: section.courseId,
    termCode: section.termCode,
    callNumber: section.callNumber,
    sectionCode: section.sectionCode,
    minUnit: section.minUnit,
    maxUnit: section.maxUnit,
    instructors: section.instructors,
    meetings: section.meetings,
    enrollmentCount: section.enrollmentCount,
    enrollmentCap: section.enrollmentCap,
    waitlistCount: section.waitlistCount,
    status: section.status,
    sourceAsOf: section.sourceAsOf,
  };
}
