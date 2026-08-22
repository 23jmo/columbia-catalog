import { decodeHtml, stripTags } from "./html";
import type { Meeting } from "./types";

export type BulletinMeeting = {
  callNumber: string;
  courseDigits: string;
  section: string;
  meetings: Meeting[];
};

// Bulletin schedule rows:
//   COMS 4113 | 001/19581 | M 7:00pm - 9:30pm  142 Uris Hall
const TABLE_RE =
  /<table class="scheduletbl[\s\S]*?<\/table>/gi;
const TERM_RE = /Fall\s*2026/i;
const ROW_RE = /<tr>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<td[^>]*>([\s\S]*?)<\/td>/gi;

function parseMeetingCell(raw: string): Meeting | null {
  const text = stripTags(raw).replace(/\s+/g, " ").trim();
  if (!text || /TBA|to be announced/i.test(text)) return null;

  const match = text.match(
    /^([A-Za-z][A-Za-z ]*?)\s+(\d{1,2}:\d{2}\s*[ap]m)\s*-\s*(\d{1,2}:\d{2}\s*[ap]m)(?:\s+(.+))?$/i,
  );
  if (!match) return null;

  return {
    days: decodeHtml(match[1]),
    start: decodeHtml(match[2]),
    end: decodeHtml(match[3]),
    location: match[4] ? decodeHtml(match[4]) : undefined,
  };
}

function cellsOf(row: string): string[] {
  return [...row.matchAll(CELL_RE)].map((cell) => cell[1]);
}

export function parseBulletinMeetings(html: string): BulletinMeeting[] {
  const results: BulletinMeeting[] = [];

  for (const tableHtml of html.matchAll(TABLE_RE)) {
    const table = tableHtml[0];
    if (!TERM_RE.test(table)) continue;

    for (const rowMatch of table.matchAll(ROW_RE)) {
      const cells = cellsOf(rowMatch[1]);
      if (cells.length < 3) continue;

      const course = stripTags(cells[0]);
      const sectionCall = stripTags(cells[1]);
      const parsed = sectionCall.match(/^(\w+)\/(\d{4,6})$/);
      const courseDigits = course.match(/(\d{4})/)?.[1];
      if (!parsed || !courseDigits) continue;

      const meeting = parseMeetingCell(cells[2]);
      results.push({
        callNumber: parsed[2],
        courseDigits,
        section: parsed[1],
        meetings: meeting ? [meeting] : [],
      });
    }
  }

  return results;
}

export function joinBulletinMeetings(
  sections: import("./types").Section[],
  bulletin: BulletinMeeting[],
): void {
  const byCall = new Map(bulletin.map((row) => [row.callNumber, row]));
  const byCourseSection = new Map(
    bulletin.map((row) => [`${row.courseDigits}-${row.section}`, row]),
  );

  for (const section of sections) {
    const digits = section.courseNumber.match(/(\d{4})/)?.[1] ?? "";
    const hit =
      byCall.get(section.callNumber) ??
      byCourseSection.get(`${digits}-${section.section}`);
    if (!hit || hit.meetings.length === 0) continue;
    section.meetings = hit.meetings;
    section.source = "directory+bulletin";
  }
}
