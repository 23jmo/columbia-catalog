import type { Course, CourseWithSections, Meeting, Section, TermCode } from "@/lib/types";

/**
 * The *display projection* of the catalog — what the search screen actually
 * needs, and nothing else.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `/search` hands the whole term to the client so that search can run locally
 * with zero network (spec section 19). At Fall 2026's real size that is 4,145
 * courses and 8,014 sections, and shipping the full `CourseWithSections` shape
 * cost ~5.5 MB of RSC payload — 99% of the page. Roughly 1.9 MB of that was
 * fields that nothing on the screen reads, and ~900 KB was keys whose value is
 * `null` on every single section (`component`, `gradingMode`,
 * `methodOfInstruction`, `waitlistCap`, `note`, `openTo` — 0 of 8,014
 * populated), repeated eight thousand times.
 *
 * ── Why these are interfaces the full types SATISFY, not new shapes ────────
 *
 * Every field here is structurally identical to its counterpart on `Course` /
 * `Section`, so `CourseWithSections` is assignable to `CourseListItem` for
 * free. That direction matters: consumers widen to accept the projection,
 * rather than the seam narrowing what it returns. Existing callers that still
 * hold full records keep working untouched, tests keep passing fixtures, and
 * the only place that has to actually *build* a projection is the one server
 * component that serializes it across the wire.
 *
 * ── Adding a field ─────────────────────────────────────────────────────────
 *
 * If a row starts rendering something new, add it here AND to `projectCourse`
 * below. Forgetting the second half is the failure mode, so the projector is
 * in this file rather than beside the page that calls it.
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
  /** Searched, never displayed in the list. Currently null for every course. */
  description: string | null;
  /** Searched, never displayed in the list. Currently null for every course. */
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
