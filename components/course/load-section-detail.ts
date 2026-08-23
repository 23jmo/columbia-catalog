/**
 * The data path for the SECTION surface.
 *
 * The drawer shows one section — never a whole course. That is a product rule
 * (a student clicking "PHED: Swim (Beginner)" wants that class, not the 64-way
 * container it is filed under) and it is also why this loader exists separately
 * from `loadCourseDetail`.
 *
 * The difference is not cosmetic. `loadCourseDetail` assembles similar courses
 * and eight terms of offering history, which is right for a course page nobody
 * opens casually and wrong for an overlay that has to feel like a panel sliding
 * in. This resolves the course and picks a section out of it: one query, no
 * fan-out, nothing the drawer will not draw.
 *
 * Everything still goes through the catalog seam in `@/lib/data/catalog`.
 */

import { isDistinctSectionTitle } from "@/lib/catalog-list-types";
import { CURRENT_TERM, termLabel } from "@/lib/constants";
import type { CourseWithSections, Section, TermCode } from "@/lib/types";

import { creditsLabel, prettyTitle } from "./format";
import { resolveCourse } from "./load-course-detail";

export interface SectionDetailData {
  course: CourseWithSections;
  /** The one section this surface is about. */
  section: Section;
  /** The course's other sections this term, section-code order. Often empty. */
  siblings: Section[];
  termCode: TermCode;
  termLabel: string;
  /** "COMS 6998" */
  code: string;
  credits: string | null;
  /**
   * What to print as the heading — the section's own name when it has one,
   * the course's name when it does not.
   */
  headline: string;
  /**
   * Non-null only when the section names itself something the course does not.
   * When set, the course title becomes context ("Part of …") rather than the
   * heading, because on a container course the section title IS the class name.
   */
  ownTitle: string | null;
  /** Always the course's own title, for the context line and handoff labels. */
  courseTitle: string;
}

function sectionSort(a: Section, b: Section): number {
  return a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true });
}

/**
 * Section codes are zero-padded in the catalog ("001") but people type and
 * paste them unpadded ("1"). Comparing on the padded form alone turns a
 * hand-edited URL into a dead drawer for no reason.
 */
function sameSectionCode(a: string, b: string): boolean {
  const fold = (value: string) => value.trim().toUpperCase().replace(/^0+(?=\d)/, "");
  return fold(a) === fold(b);
}

export interface LoadSectionDetailResult {
  /** Null when the course itself could not be resolved. */
  data: SectionDetailData | null;
  /**
   * Set when the COURSE resolved but the requested section did not — a
   * different failure from "no such course", and one the drawer answers by
   * offering the sections that do exist instead of a dead end.
   */
  course: CourseWithSections | null;
  sections: Section[];
}

/**
 * Resolve one section of one course.
 *
 * `sectionCode` is nullable because the drawer can be reached without one (a
 * similar-course link, a hand-edited URL). A course with exactly one section
 * resolves to it — asking someone to pick from a list of one is a dead click —
 * and anything else is reported back as "course found, section not chosen" so
 * the caller can offer a chooser rather than falling back to a course page.
 */
export async function loadSectionDetail(
  courseIdParam: string,
  sectionCode: string | null,
  termCode: TermCode = CURRENT_TERM,
): Promise<LoadSectionDetailResult> {
  const course = await resolveCourse(courseIdParam, termCode);
  if (!course) return { data: null, course: null, sections: [] };

  const sections = course.sections.filter((s) => s.termCode === termCode).sort(sectionSort);

  const section = sectionCode
    ? sections.find((s) => sameSectionCode(s.sectionCode, sectionCode))
    : sections.length === 1
      ? sections[0]
      : undefined;

  if (!section) return { data: null, course, sections };

  const courseTitle = prettyTitle(course.title);
  const ownTitle = isDistinctSectionTitle(section.title, course.title)
    ? prettyTitle(section.title!)
    : null;

  return {
    data: {
      course,
      section,
      siblings: sections.filter((s) => s.sectionId !== section.sectionId),
      termCode,
      termLabel: termLabel(termCode),
      code: `${course.subjectCode} ${course.number}`,
      // Section-level units when the registrar published them; the course's
      // range otherwise. A section that is worth 3 points inside a course
      // listed as "1-4" should say 3.
      credits: creditsLabel(section.minUnit, section.maxUnit)
        ?? creditsLabel(course.pointsMin, course.pointsMax),
      headline: ownTitle ?? courseTitle,
      ownTitle,
      courseTitle,
    },
    course,
    sections,
  };
}
