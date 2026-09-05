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
 * name, so it decides once -- for search rows, the home feed card, the drawer
 * heading, the sections panel and the MCP payload alike. Anything that renders
 * or ships a section title asks here first, or the same section acquires a
 * name on one surface and loses it on the next.
 *
 * ── Why equality is not enough ─────────────────────────────────────────────
 *
 * The directory prints a title on EVERY section row, and on an ordinary course
 * it is the course's own name again. But the registrar stores the two fields
 * with different caps -- section titles at 25 characters, course titles at 40 --
 * and abbreviates independently into each, so "the same name" arrives in three
 * damaged shapes rather than one:
 *
 *   clipped   section "Private Equity and Ventur"    course "Private Equity and Venture Cap"
 *   clipped   section "CONTEMP WESTERN CIVILIZAT"    course "CONTEMP WESTERN CIVILIZATION I"
 *   shortened section "Clin Pract Impl Dntrty II"    course "Clin Practice Implant Dentistry II"
 *
 * A plain inequality test calls all three distinct. In Fall 2026 that was 2,748
 * of the 5,001 sections we considered "named", 55% of them, and every one would
 * have led its row with a word broken off mid-syllable. A truncated repeat of
 * the course title is strictly worse than showing the course title: it is the
 * same information, damaged.
 *
 * ── The test ───────────────────────────────────────────────────────────────
 *
 * Neither prefix nor subsequence survives the third shape: the registrar
 * abbreviates word-internally and drops vowels, so "Dntrty" is not a prefix of
 * "Dentistry" and "PREDICT MODLNG IN FIN & INSRNC" shares no leading run with
 * "PREDICTIVE MODELING IN FINANCE & INSURAN".
 *
 * What DOES survive is the first few letters of each word -- abbreviation
 * shortens words, it does not reorder or replace them. So compare 4-character
 * word stems and ask how much of the section's name is already in the course's:
 *
 *     "Clin Pract Impl Dntrty II"  → clin prac impl dntr ii
 *     "Clin Practice Implant …"    → clin prac impl dent ii    → 4/5 shared
 *     "LLM Based Generative AI"    → llm base gene ai
 *     "Topics in Computer Science" → topi in comp scie         → 0/4 shared
 *
 * Above the threshold the two strings are one name and the section is not
 * saying anything new. Below it, the section genuinely names a different class:
 * COMS 6998 is one course called "Topics in Computer Science" whose 20 sections
 * are 20 unrelated seminars, and those names live nowhere else.
 *
 * The threshold is deliberately loose. A false "same name" costs a slightly
 * shorter headline; a false "different name" prints a registrar abbreviation as
 * though it were a class, which is the failure being avoided.
 *
 * ── What this still lets through ───────────────────────────────────────────
 *
 * Abbreviations that drop vowels rather than shortening from the end:
 * "PREDICT MODLNG IN FIN & INSRNC" against "PREDICTIVE MODELING IN FINANCE &
 * INSURAN", where `modl` and `mode` are different stems. Catching those needs
 * fuzzy matching, which would start guessing about real container courses --
 * and a wrong guess there hides the actual name of a class, which is the more
 * expensive mistake. Known, bounded, and left alone on purpose.
 *
 * ── One exception, kept on purpose ─────────────────────────────────────────
 *
 * A section whose name is the course's name plus more of it ("Topics in CS:
 * LLMs" under "Topics in CS") scores as the same name, because it is -- but it
 * is also the only place the specific class is named. So when the stems agree,
 * the longer of the two strings wins, and the section counts as distinct only
 * when it is the one that says more.
 */
export function isDistinctSectionTitle(
  sectionTitle: string | null | undefined,
  courseTitle?: string,
): boolean {
  if (!sectionTitle) return false;
  // No course to compare against: any non-empty title is all the caller has.
  if (courseTitle === undefined) return true;

  const sectionStems = titleStems(sectionTitle);
  // Punctuation only ("--"). It folds away to nothing, so it names nothing.
  if (sectionStems.length === 0) return false;

  const courseStems = new Set(titleStems(courseTitle));
  const shared = sectionStems.filter((stem) => courseStems.has(stem)).length;

  if (shared / sectionStems.length < SAME_NAME_RATIO) return true;

  /*
   * Same name, two spellings -- distinct only when the section's says more.
   *
   * Measured on the folded strings, not the raw ones. The directory does not
   * keep spacing or punctuation stable between the two fields, and a section
   * row that arrives as "computer   science theory" under "COMPUTER SCIENCE
   * THEORY" is longer by three spaces while saying nothing extra.
   */
  return foldTitleForCompare(sectionTitle).length > foldTitleForCompare(courseTitle).length;
}

/**
 * A title reduced to its letters and digits, for measuring how much it SAYS.
 *
 * Separators are deleted rather than collapsed, so an apostrophe that survives
 * in one row and becomes a space in the next ("The Actuarys Toolkit" against
 * "The Actuary s Toolkit") does not make one of them look longer than the other.
 */
function foldTitleForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * A title reduced to the opening letters of each word, for comparison only.
 *
 * Four characters because that is where Columbia's abbreviations stop being
 * ambiguous: "Prac"/"Pract"/"Practice" and "Dntr"/"Dntrty" collapse, while
 * "Comp" (Computer) and "Comm" (Communication) stay apart. Three would merge
 * those two; five splits "Dsgn" from "Design".
 *
 * Splitting on every non-alphanumeric run also absorbs the punctuation the
 * directory does not keep stable between the two fields -- an apostrophe that
 * survives in one row and becomes a space in the next ("The Actuarys Toolkit"
 * against "The Actuary s Toolkit") changes the word count but not the stems
 * that matter.
 *
 * Separate from `foldForCompare`, which feeds `queryTokens` -- query
 * tokenisation needs its word boundaries and must not drift into this.
 */
const STEM_LENGTH = 4;
const SAME_NAME_RATIO = 0.7;

export function titleStems(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.slice(0, STEM_LENGTH));
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
