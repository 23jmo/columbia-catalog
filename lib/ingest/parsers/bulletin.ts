/**
 * Parser for a Columbia Bulletin department page, e.g.
 * `https://bulletin.columbia.edu/columbia-college/departments-instruction/computer-science/`
 *
 * WHY THIS EXISTS: the Directory of Classes no longer publishes day/time/room
 * anywhere — it links out to Vergil instead. The bulletin's schedule tables are
 * the only public HTML source for meeting patterns, so this parser is where
 * `Meeting[]` comes from.
 *
 * STRUCTURE — verified against `__fixtures__/bulletin-cs.html`:
 *
 *   <div class="courseblock">
 *     <p class="courseblocktitle"><strong>COMS W4113 FUND-LARGE-SCALE DIST SYSTEMS.</strong>
 *                                 <strong><em>3.00 points</em>.</strong></p>
 *     <p class="courseblockdesc"><span class="prereq">…</span>…</p>
 *     <div class="desc_sched">
 *       <table class="scheduletbl unifyBorder">
 *         <tr><td colspan="6" class="unifyTerm">
 *             <div class="desc_sched_header"><strong>Fall 2026: COMS W4113</strong></div></td></tr>
 *         <tr><th>Course Number</th><th>Section/Call Number</th><th>Times/Location</th>
 *             <th>Instructor</th><th>Points</th><th>Enrollment</th></tr>
 *         <tr>
 *           <td class="unifyRow1">COMS 4113</td>
 *           <td class="unifyRow1">001/19581</td>
 *           <td class="unifyRow1">M 7:00pm - 9:30pm<br/>142 Uris Hall</td>
 *           <td class="unifyRow1">Hubertus Franke</td>
 *           <td class="unifyRow1">3.00</td>
 *           <td class="unifyRow1">8/110</td>
 *         </tr>
 *       </table>
 *     </div>
 *   </div>
 *
 * TWO TRAPS worth knowing:
 *
 * 1. The row's own Course Number cell drops the qualifier ("COMS 4113"), but
 *    `COMS E4115` and `COMS W4115` are DIFFERENT courses. The qualifier is only
 *    in the `.desc_sched_header` ("Fall 2026: COMS W4113"), so that header — not
 *    the row cell — is the authoritative course identity.
 * 2. One department page mixes TERMS. `bulletin-cs.html` carries both Fall 2026
 *    and Spring 2026 tables, and cross-listed subjects (CSEE, CBMF) as well.
 *    `ParsedBulletinRow` has no term field, so pass `termCode` to filter, or the
 *    rows of two terms will collide on the same section key.
 */

import { parse, type HTMLElement } from "node-html-parser";

import { SEASON_DIGIT } from "../../constants";
import type { Meeting, ParsedBulletinRow, Season, TermCode } from "../../types";
import {
  blankToNull,
  buildCourseId,
  cleanText,
  parseCourseNumber,
  parseMeetingPattern,
  parsePoints,
} from "./shared";

export interface BulletinParseOptions {
  /**
   * Keep only rows whose schedule table header names this term. Strongly
   * recommended: a department page mixes terms.
   */
  termCode?: TermCode;
}

/** A parsed row plus the term it came from, which `ParsedBulletinRow` omits. */
export interface ParsedBulletinRowWithTerm extends ParsedBulletinRow {
  /** Resolved from the "Fall 2026: COMS W4113" table header. Null if unreadable. */
  termCode: TermCode | null;
}

/**
 * Parse every schedule row on a bulletin department page.
 *
 * `courseCode` on each row is emitted in the same canonical form as
 * `Course.courseId` (`${subject}${number}${qualifier}`, e.g. "COMS4113W") so
 * bulletin meetings join straight onto directory sections. Never throws.
 */
export function parseBulletinDepartment(
  html: string,
  options: BulletinParseOptions = {},
): ParsedBulletinRowWithTerm[] {
  const root = parse(html);
  const rows: ParsedBulletinRowWithTerm[] = [];

  for (const table of root.querySelectorAll("table.scheduletbl")) {
    const heading = readScheduleHeading(table);

    if (options.termCode && heading.termCode !== options.termCode) continue;

    for (const row of table.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("td");
      // Header rows use `<th>`; the term banner is a single colspan-6 `<td>`.
      if (cells.length < 6) continue;

      const parsed = parseScheduleRow(cells, heading);
      if (parsed) rows.push(parsed);
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------

interface ScheduleHeading {
  courseCode: string | null;
  subjectCode: string | null;
  termCode: TermCode | null;
}

function readScheduleHeading(table: HTMLElement): ScheduleHeading {
  const empty: ScheduleHeading = { courseCode: null, subjectCode: null, termCode: null };
  const text = cleanText(table.querySelector(".desc_sched_header")?.text ?? "");
  if (!text) return empty;

  // "Fall 2026: COMS W4113"
  const match = /^(.*?):\s*([A-Za-z]{2,5})\s+([A-Za-z]{0,3}\d{1,5}[A-Za-z]{0,3})\s*$/.exec(text);
  if (!match) return empty;

  const subjectCode = match[2].toUpperCase();
  const parsedNumber = parseCourseNumber(match[3]);
  return {
    subjectCode,
    courseCode: parsedNumber
      ? buildCourseId(subjectCode, parsedNumber.number, parsedNumber.qualifier)
      : null,
    termCode: parseTermLabel(match[1]),
  };
}

/** "Fall 2026" → "20263". Returns null for anything unrecognized. */
export function parseTermLabel(label: string | null | undefined): TermCode | null {
  const text = cleanText(label);
  const match = /\b(Spring|Summer|Fall)\b[^0-9]*(\d{4})/i.exec(text);
  if (!match) return null;
  const season = (match[1][0].toUpperCase() + match[1].slice(1).toLowerCase()) as Season;
  const digit = SEASON_DIGIT[season];
  if (!digit) return null;
  return `${match[2]}${digit}`;
}

function parseScheduleRow(
  cells: HTMLElement[],
  heading: ScheduleHeading,
): ParsedBulletinRowWithTerm | null {
  const section = parseSectionCell(cells[1]);
  if (!section) return null;

  const courseCode = heading.courseCode ?? courseCodeFromRowCell(cells[0]);
  if (!courseCode) return null;

  const enrollment = parseEnrollmentCell(cells[5]);
  const points = parsePoints(cells[4].text);

  return {
    courseCode,
    sectionCode: section.sectionCode,
    callNumber: section.callNumber,
    meetings: parseTimesCell(cells[2]),
    instructor: blankToNull(cells[3].text),
    // The bulletin prints one figure per row; a range would come from the
    // directory instead, so min doubles as the single value here.
    points: points.pointsMin,
    enrollmentCount: enrollment.count,
    enrollmentCap: enrollment.cap,
    termCode: heading.termCode,
  };
}

/** "001/19581" → section 001, call number 19581. Call number can be absent. */
function parseSectionCell(cell: HTMLElement): {
  sectionCode: string;
  callNumber: string | null;
} | null {
  const text = cleanText(cell.text);
  if (!text) return null;
  const match = /^([A-Za-z0-9]+)\s*(?:\/\s*([A-Za-z0-9]+))?$/.exec(text);
  if (!match) return null;
  return { sectionCode: match[1], callNumber: match[2] ?? null };
}

/** Fallback identity from "COMS 4113" when the table header is missing. */
function courseCodeFromRowCell(cell: HTMLElement): string | null {
  const text = cleanText(cell.text);
  const match = /^([A-Za-z]{2,5})\s+([A-Za-z]{0,3}\d{1,5}[A-Za-z]{0,3})$/.exec(text);
  if (!match) return null;
  const parsed = parseCourseNumber(match[2]);
  if (!parsed) return null;
  return buildCourseId(match[1].toUpperCase(), parsed.number, parsed.qualifier);
}

/**
 * "M 7:00pm - 9:30pm<br/>142 Uris Hall" → one `Meeting` per weekday.
 *
 * The cell is `<br>`-delimited: the first line is the day+time pattern, the
 * second the location. Rows with no scheduled time contain only a `<br>` and
 * correctly yield `[]`. A cell holding several `<br>`-separated patterns is
 * handled too, though none appear in the current fixture.
 */
function parseTimesCell(cell: HTMLElement): Meeting[] {
  const lines = cell.innerHTML
    .split(/<br\s*\/?>/i)
    .map((line) => cleanText(line))
    .filter(Boolean);
  if (lines.length === 0) return [];

  const meetings: Meeting[] = [];
  let index = 0;
  while (index < lines.length) {
    const pattern = lines[index];
    const next = lines[index + 1];
    // A following line that has no time in it is this pattern's location.
    const looksLikeLocation = next !== undefined && !/\d{1,2}:\d{2}/.test(next);
    meetings.push(...parseMeetingPattern(pattern, looksLikeLocation ? next : null));
    index += looksLikeLocation ? 2 : 1;
  }
  return meetings;
}

/** "8/110" → 8 enrolled, 110 cap. */
function parseEnrollmentCell(cell: HTMLElement): { count: number | null; cap: number | null } {
  const text = cleanText(cell.text);
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (!match) return { count: null, cap: null };
  return { count: Number(match[1]), cap: Number(match[2]) };
}
