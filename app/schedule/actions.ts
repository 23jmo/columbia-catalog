"use server";

import { CURRENT_TERM } from "@/lib/constants";
import { searchAdapter } from "@/lib/mcp/adapters";
import type { Meeting, TermCode } from "@/lib/types";

/**
 * Catalog search for the "Add a class" sheet.
 *
 * The full search screen loads a compressed index into the browser, which is
 * right for a page whose whole job is search and wrong for a sheet opened to
 * find one class. This runs the same engine on the server — the one the MCP
 * `search_courses` tool already uses — and returns only what a row needs.
 */

export interface SchedulableSection {
  sectionId: string;
  sectionCode: string;
  instructors: string[];
  meetings: Meeting[];
  status: string;
}

export interface SchedulableCourse {
  courseId: string;
  title: string;
  points: string | null;
  sections: SchedulableSection[];
}

const LIMIT = 8;

export async function searchSchedulableCourses(
  query: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<SchedulableCourse[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const { courses } = await searchAdapter.search({ q, termCode }, LIMIT);

  return courses.map((course) => ({
    courseId: course.courseId,
    title: course.title,
    points:
      course.pointsMin == null
        ? null
        : course.pointsMax != null && course.pointsMax !== course.pointsMin
          ? `${course.pointsMin}–${course.pointsMax}`
          : String(course.pointsMin),
    sections: course.sections
      .filter((section) => section.termCode === termCode)
      .map((section) => ({
        sectionId: section.sectionId,
        sectionCode: section.sectionCode,
        instructors: section.instructors,
        meetings: section.meetings,
        status: section.status,
      })),
  }));
}
