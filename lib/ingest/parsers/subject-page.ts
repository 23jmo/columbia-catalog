/**
 * Parser for the Directory of Classes subject-term page:
 * `https://doc.sis.columbia.edu/subj/{SUBJ}/_{Season}{Year}.html`
 *
 * This is the unit of crawl work (spec §10): one request returns every section
 * for a subject in one term, enrollment counts included.
 *
 * STRUCTURE — verified against `__fixtures__/doc-subject-COMS-Fall2026.html`:
 *
 *   The whole listing is ONE `<table class="course-listing">`. Courses are not
 *   separate tables; they are delimited by header rows:
 *
 *     <tr><th colspan=2>Fall 2026 Computer Science W1002<br>COMPUTING IN CONTEXT</th></tr>
 *
 *   Every following row until the next `<th>` is a section of that course:
 *
 *     <tr>
 *       <td><a href="../../subj/COMS/W1002-20263-001/">Section 001</a></td>
 *       <td><div class="course-details"><dl>
 *         <h1>COMPUTING IN ECONOMICS</h1>          <- section title, may differ
 *         <dt>Call Number:</dt><dd>13508</dd>
 *         <dt>Points:</dt><dd>4</dd>
 *         <dt>Enrollment:</dt><dd>115 students (200 max) as of August 22, 2026</dd>
 *         <dt>Instructor:</dt><dd>Adam H Cannon</dd>   <- or <dt>Instructors:</dt>
 *       </dl></div></td>
 *     </tr>
 *
 * ── Meeting times: present on old pages, absent on new ones ────────────────
 *
 * Through Spring 2025 each section also printed:
 *
 *     <dt>Day/Time:</dt><dd>TR 11:40am-12:55pm</dd>
 *     <dt>Location:</dt><dd>417 International Affairs Building</dd>
 *
 * From Fall 2025 onward those two rows are gone and the page says so: "Class
 * meeting days, times and classroom assignments are now only appearing in
 * Vergil." So this parser reads them when they exist and returns `[]` when they
 * do not — the same code covers both, and the archive is the only public source
 * of meeting patterns the catalog has (see .plans/BLOCKERS.md #5).
 */

import { parse, type HTMLElement } from "node-html-parser";

import { subjectTermUrl } from "../../constants";
import type { ParsedCourse, ParsedSection, ParsedSubjectPage, TermCode } from "../../types";
import {
  blankToNull,
  buildCourseId,
  buildSectionId,
  cleanText,
  parseMeetingPattern,
  deriveStatus,
  normalizeLabel,
  parseCourseNumber,
  parseEnrollment,
  parsePoints,
  splitInstructorList,
} from "./shared";

/** Leading "Fall 2026 " / "Spring 2027 " on a course header line. */
const TERM_PREFIX = /^(Spring|Summer|Fall|Winter)\s+\d{4}\s+/i;

/**
 * Parse every course and section on a subject-term listing page.
 *
 * Never throws on malformed input: an unrecognizable page yields zero courses
 * so the write-protection guard in `quarantine.ts` can refuse the run rather
 * than the crawler crashing.
 */
export function parseSubjectPage(
  html: string,
  subjectCode: string,
  termCode: TermCode,
): ParsedSubjectPage {
  const page: ParsedSubjectPage = { subjectCode, termCode, courses: [] };

  const root = parse(html);
  const table = root.querySelector("table.course-listing");
  if (!table) return page;

  const baseUrl = safeSubjectTermUrl(subjectCode, termCode);
  let current: ParsedCourse | null = null;

  for (const row of table.querySelectorAll("tr")) {
    const header = row.querySelector("th");
    if (header) {
      current = parseCourseHeader(header, subjectCode);
      if (current) page.courses.push(current);
      continue;
    }

    const details = row.querySelector("div.course-details");
    if (!details || !current) continue;

    const section = parseSectionRow(row, details, current, termCode, baseUrl);
    if (section) current.sections.push(section);
  }

  return page;
}

// ---------------------------------------------------------------------------
// Course headers
// ---------------------------------------------------------------------------

function parseCourseHeader(header: HTMLElement, subjectCode: string): ParsedCourse | null {
  // The `<br>` separates "term + subject name + code" from the course title,
  // so we split the raw HTML rather than reading `.text` (which loses it).
  const [codeFragment, ...titleFragments] = header.innerHTML.split(/<br\s*\/?>/i);
  const codeLine = cleanText(codeFragment).replace(TERM_PREFIX, "");
  const title = cleanText(titleFragments.join(" "));

  // The course code is the final token; everything before it is the subject
  // name, which varies per subject and is not needed here.
  const tokens = codeLine.split(" ").filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const parsed = parseCourseNumber(tokens[index]);
    if (!parsed) continue;
    return {
      courseId: buildCourseId(subjectCode, parsed.number, parsed.qualifier),
      subjectCode,
      number: parsed.number,
      qualifier: parsed.qualifier,
      title,
      sections: [],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Section rows
// ---------------------------------------------------------------------------

function parseSectionRow(
  row: HTMLElement,
  details: HTMLElement,
  course: ParsedCourse,
  termCode: TermCode,
  baseUrl: string | null,
): ParsedSection | null {
  const anchor = row.querySelector("a");
  const href = anchor?.getAttribute("href") ?? null;

  const sectionCode = readSectionCode(href, anchor?.text ?? null);
  if (!sectionCode) return null;

  const fields = readDefinitionList(details);
  const enrollment = parseEnrollment(fields.get("enrollment"));
  const points = parsePoints(fields.get("points"));
  const instructors = splitInstructorList(
    fields.get("instructors") ?? fields.get("instructor") ?? null,
  );

  const sectionTitle = cleanText(details.querySelector("h1")?.text ?? "");
  const courseId = course.courseId;

  return {
    sectionId: buildSectionId(termCode, courseId, sectionCode),
    courseId,
    termCode,
    callNumber: cleanText(fields.get("call number")),
    sectionCode,
    // Section-specific titles ("COMPUTING IN ECONOMICS") are common and are the
    // more useful label; fall back to the course title when absent.
    title: sectionTitle || course.title,
    pointsMin: points.pointsMin,
    pointsMax: points.pointsMax,
    instructors,
    enrollmentCount: enrollment.enrollmentCount,
    enrollmentCap: enrollment.enrollmentCap,
    status: deriveStatus(
      enrollment.enrollmentCount,
      enrollment.enrollmentCap,
      enrollment.isFull,
      fields.get("status") ?? null,
    ),
    sourceAsOf: enrollment.sourceAsOf,
    detailUrl: resolveDetailUrl(href, baseUrl),
    // Empty from Fall 2025 onward, populated for archived terms. Both are
    // correct answers about the page in front of us.
    meetings: parseMeetingPattern(
      fields.get("day/time") ?? fields.get("day time") ?? null,
      fields.get("location") ?? null,
    ),
  };
}

/**
 * Section code from the anchor. The href (`.../W1002-20263-001/`) is the more
 * reliable source; the link text ("Section 001") is the fallback.
 */
function readSectionCode(href: string | null, linkText: string | null): string | null {
  if (href) {
    const fromHref = /-(\d{5})-([A-Za-z0-9]+)\/?$/.exec(href.replace(/[?#].*$/, ""));
    if (fromHref) return fromHref[2];
  }
  const fromText = /section\s+([A-Za-z0-9]+)/i.exec(cleanText(linkText));
  return fromText ? fromText[1] : null;
}

function resolveDetailUrl(href: string | null, baseUrl: string | null): string | null {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (!baseUrl) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    // Unparseable relative href — better to lose the link than the section.
    return null;
  }
}

function safeSubjectTermUrl(subjectCode: string, termCode: TermCode): string | null {
  try {
    return subjectTermUrl(subjectCode, termCode);
  } catch {
    // `parseTermCode` throws on a malformed term code; the sections are still
    // worth returning, just without absolute detail URLs.
    return null;
  }
}

/**
 * Read the `<dt>`/`<dd>` pairs out of a `.course-details` block.
 *
 * The `<dl>` also contains an `<h1>`, a Vergil `<span>` link, `<br>`s and stray
 * text nodes, so we walk children in order and pair each `<dt>` with the next
 * `<dd>` rather than zipping two `querySelectorAll` results.
 */
function readDefinitionList(details: HTMLElement): Map<string, string> {
  const fields = new Map<string, string>();
  const list = details.querySelector("dl") ?? details;

  let pendingLabel: string | null = null;
  for (const node of list.childNodes) {
    const element = node as Partial<HTMLElement>;
    const tag = typeof element.rawTagName === "string" ? element.rawTagName.toLowerCase() : null;
    if (!tag) continue;

    if (tag === "dt") {
      pendingLabel = normalizeLabel(element.text ?? "");
      continue;
    }
    if (tag === "dd" && pendingLabel) {
      const value = cleanText(element.text ?? "");
      const existing = fields.get(pendingLabel);
      fields.set(pendingLabel, existing ? `${existing}; ${value}` : value);
      pendingLabel = null;
    }
  }
  return fields;
}

/**
 * Section `Notes:` values, keyed by `sectionId`.
 *
 * `ParsedSection` has no field for them, but they are worth keeping: a handful
 * carry the meeting pattern the rest of the page omits ("TR 7:10P - 8:25P"),
 * others carry the real topic title for a topics course ("Title - NETWORKS FOR
 * AI"). Feed them to `parseMeetingPattern` in `shared.ts` when you want the
 * former.
 */
export function parseSubjectPageNotes(
  html: string,
  subjectCode: string,
  termCode: TermCode,
): Map<string, string> {
  const notes = new Map<string, string>();
  const root = parse(html);
  const table = root.querySelector("table.course-listing");
  if (!table) return notes;

  let courseId: string | null = null;
  for (const row of table.querySelectorAll("tr")) {
    const header = row.querySelector("th");
    if (header) {
      courseId = parseCourseHeader(header, subjectCode)?.courseId ?? null;
      continue;
    }
    const details = row.querySelector("div.course-details");
    if (!details || !courseId) continue;

    const anchor = row.querySelector("a");
    const sectionCode = readSectionCode(
      anchor?.getAttribute("href") ?? null,
      anchor?.text ?? null,
    );
    if (!sectionCode) continue;

    const fields = readDefinitionList(details);
    const note = blankToNull(fields.get("notes") ?? fields.get("note") ?? null);
    if (note) notes.set(buildSectionId(termCode, courseId, sectionCode), note);
  }
  return notes;
}
