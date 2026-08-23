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
 * This is the predicate the whole app asks before printing a section's own
 * name, so it decides once, for search rows, the drawer heading and the
 * sections panel alike.
 *
 * ── Why equality is not enough ─────────────────────────────────────────────
 *
 * The registrar truncates, and it truncates the two fields at DIFFERENT
 * lengths: section titles are capped at 25 characters and course titles at 40.
 * So the same name routinely arrives clipped twice over --
 *
 *   section "Private Equity and Ventur"   course "Private Equity and Venture Cap"
 *   section "CONTEMP WESTERN CIVILIZAT"   course "CONTEMP WESTERN CIVILIZATION I"
 *
 * -- and a plain inequality test calls those distinct. In Fall 2026 that was
 * 2,748 of the 5,001 sections we considered "named", 55% of them, and every one
 * would have led its row with a word broken off mid-syllable. A truncated
 * repeat of the course title is strictly worse than showing the course title:
 * it is the same information, damaged.
 *
 * So the course title merely STARTING WITH the section title means one name,
 * not two. The test is deliberately one-directional: a section title that
 * starts with the course title and continues ("Topics in CS: LLMs" under
 * "Topics in CS") is the case where the section genuinely says more, and that
 * must stay distinct.
 *
 * ── What this still lets through ───────────────────────────────────────────
 *
 * Abbreviated variants, because they are not prefixes of anything:
 * "PREDICT MODLNG IN FIN & INSRNC" against "PREDICTIVE MODELING IN FINANCE &
 * INSURAN". Catching those needs fuzzy matching, which would start guessing
 * about real container courses -- and a wrong guess there hides the actual name
 * of a class. Known, bounded, and left alone on purpose.
 */
export function isDistinctSectionTitle(sectionTitle: string | null | undefined, courseTitle?: string): boolean {
  if (!sectionTitle) return false;
  if (courseTitle === undefined) return true;

  const section = foldTitleForCompare(sectionTitle);
  if (!section) return false;

  const course = foldTitleForCompare(courseTitle);
  if (section === course) return false;

  // The truncation case, and the "says nothing the course title did not" case,
  // are the same test.
  return !course.startsWith(section);
}

/**
 * Titles reduced to what they actually SAY, for comparison only.
 *
 * Every separator is DELETED rather than collapsed to a space -- letters and
 * digits only. The directory does not keep punctuation stable between the two
 * fields, and an apostrophe that survives in one row and becomes a space in the
 * next splits a word: "The Actuarys Toolkit" against "The Actuary s Toolkit".
 * Collapsing to a space leaves those unequal; deleting makes them one string.
 * Measured across Fall 2026 this merges exactly four more titles than the
 * space-collapsing version, and all four are that same apostrophe -- no title
 * that means something different is swallowed by it.
 *
 * Separate from `foldForCompare`, which feeds `queryTokens` -- query
 * tokenisation needs its word boundaries and must not drift into this.
 */
function foldTitleForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
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
