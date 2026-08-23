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
  /** Distinct topic for this section, when it has one. See `Section.title`. */
  title?: string | null;
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
    sections: course.sections.map((section) => projectSection(section, course.title)),
  };
}

/**
 * @param courseTitle when given, a section title equal to it is dropped.
 *
 * The directory prints a title on EVERY section row, and for an ordinary course
 * it is just the course title again -- all 10 sections of COMS W1004 say
 * "INTRO-COMPUT SCI/PROG IN". Ingest stores that faithfully because it is what
 * the page says, but shipping it is ~8,000 restatements of a string the row
 * already renders directly above, and the UI would print each one next to its
 * section code as though it meant something. Dropping it here keeps the
 * redundancy out of the payload and leaves `section.title` meaning exactly
 * "this section is not interchangeable with its siblings".
 */
export function projectSection(section: Section, courseTitle?: string): SectionListItem {
  return {
    sectionId: section.sectionId,
    courseId: section.courseId,
    termCode: section.termCode,
    callNumber: section.callNumber,
    sectionCode: section.sectionCode,
    title: isDistinctSectionTitle(section.title, courseTitle) ? section.title : undefined,
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

/**
 * Whether a section's title says something the course title does not.
 *
 * Compared case- and space-insensitively because the directory is inconsistent
 * about both across rows of the same course.
 */
export function isDistinctSectionTitle(sectionTitle: string | null | undefined, courseTitle?: string): boolean {
  if (!sectionTitle) return false;
  if (courseTitle === undefined) return true;
  return foldForCompare(sectionTitle) !== foldForCompare(courseTitle);
}

/**
 * The sections a free-text query is *about*, or null when it is not about any.
 *
 * Lives here, in the module both search paths already depend on, because both
 * have to compute it identically. The local source answers keystrokes and the
 * binary engine takes over once the index downloads; if they disagreed, the
 * expanded row would change under the reader a moment after the page settled,
 * with nothing on screen to explain it. Shared code makes that agreement
 * structural instead of a thing two files have to remember.
 *
 * Best-coverage rather than any-token, because a realistic query mixes tokens
 * that name a section with tokens that name the course: "coms6998 brain" has a
 * token no section title contains. Counting per section and keeping only the
 * best scorers lets the useful token do the work instead of being cancelled by
 * the one that was never going to match a title.
 *
 * Returns null when every surviving section ties, including the common case
 * where none matched at all. A tie carries no information -- if all 24 sections
 * are equally "the answer", the course row already said that, and expanding it
 * to highlight all 24 is noise rather than an answer.
 */
export function sectionsNamedByQuery<T extends { title?: string | null }>(
  sections: T[],
  tokens: string[],
): T[] | null {
  if (tokens.length === 0 || sections.length === 0) return null;

  let best = 0;
  const coverage = sections.map((section) => {
    const title = section.title ? foldForCompare(section.title) : "";
    const covered = title ? tokens.filter((token) => title.includes(token)).length : 0;
    if (covered > best) best = covered;
    return covered;
  });

  if (best === 0) return null;
  const named = sections.filter((_, index) => coverage[index] === best);
  return named.length === sections.length ? null : named;
}

/** The tokens `sectionsNamedByQuery` expects, from a raw query string. */
export function queryTokens(query: string): string[] {
  return foldForCompare(query).split(" ").filter(Boolean);
}

function foldForCompare(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
