import type { SearchFacets } from "@/components/catalog/search-source";
import type { CourseListItem } from "@/lib/catalog-list-types";
import type { TermCode } from "@/lib/types";

export interface SeatOverlayEntry {
  sectionId: string;
  hasOpenSeats: boolean;
}

/** Courses that have at least one section in the term. */
export function coursesForTerm(courses: CourseListItem[], termCode: TermCode): CourseListItem[] {
  return courses.filter((course) => course.sections.some((s) => s.termCode === termCode));
}

export function buildFacetsForTerm(courses: CourseListItem[], termCode: TermCode): SearchFacets {
  const subjectCounts = new Map<string, number>();
  const instructorCounts = new Map<string, number>();
  const schoolCounts = new Map<string, number>();
  let creditLo = Number.POSITIVE_INFINITY;
  let creditHi = 0;

  for (const course of coursesForTerm(courses, termCode)) {
    subjectCounts.set(course.subjectCode, (subjectCounts.get(course.subjectCode) ?? 0) + 1);
    for (const name of new Set(
      course.sections.filter((s) => s.termCode === termCode).flatMap((s) => s.instructors),
    )) {
      instructorCounts.set(name, (instructorCounts.get(name) ?? 0) + 1);
    }
    if (course.pointsMin !== null) creditLo = Math.min(creditLo, course.pointsMin);
    if (course.pointsMax !== null) creditHi = Math.max(creditHi, course.pointsMax);
  }

  const toOptions = (counts: Map<string, number>) =>
    [...counts.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label));

  return {
    subjects: toOptions(subjectCounts),
    schools: toOptions(schoolCounts),
    instructors: toOptions(instructorCounts),
    creditRange: [Number.isFinite(creditLo) ? creditLo : 0, creditHi > 0 ? creditHi : 6],
  };
}

function sectionHasOpenSeats(section: CourseListItem["sections"][number]): boolean {
  if (section.status === "full" || section.status === "closed") return false;
  if (section.enrollmentCount === null || section.enrollmentCap === null) {
    return section.status === "open";
  }
  return section.enrollmentCount < section.enrollmentCap;
}

/** Seat overlay from the display snapshot baked into the index at build time. */
export function seatOverlayEntriesForTerm(
  courses: CourseListItem[],
  termCode: TermCode,
): SeatOverlayEntry[] {
  const out: SeatOverlayEntry[] = [];
  for (const course of courses) {
    for (const section of course.sections) {
      if (section.termCode !== termCode) continue;
      out.push({ sectionId: section.sectionId, hasOpenSeats: sectionHasOpenSeats(section) });
    }
  }
  return out;
}
