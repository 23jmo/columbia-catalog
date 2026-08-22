import { DEFAULT_TERM_NAME } from "./constants";
import { decodeHtml, fieldValue } from "./html";
import type { Credits, Enrollment, EnrollmentStatus, Section } from "./types";

const COURSE_HEADER_RE =
  /<th[^>]*>\s*(Fall \d{4})\s+([\s\S]+?)\s+([A-Z]{1,3}\d{4})\s*<br>\s*([^<]+)<\/th>/gi;

const SECTION_LINK_RE =
  /<a href="[^"]*\/subj\/([A-Z0-9_]+)\/([^/"']+)\/">\s*Section\s+([^<]+)\s*<\/a>/i;

function parseCredits(raw: string | undefined): Credits {
  if (!raw) return { min: 0, max: 0 };
  const range = raw.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const single = raw.match(/(\d+(?:\.\d+)?)/);
  const value = single ? Number(single[1]) : 0;
  return { min: value, max: value };
}

function parseInstructors(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\s+and\s+|,\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function parseEnrollment(raw: string | undefined): Enrollment {
  if (!raw) {
    return { enrolled: 0, capacity: 0, status: "unknown" };
  }

  const counts = raw.match(/(\d+)\s+students?\s+\((\d+)\s+max\)/i);
  const enrolled = counts ? Number(counts[1]) : 0;
  const capacity = counts ? Number(counts[2]) : 0;
  const asOf = raw.match(/as of\s+(.+?)(?:\s+\/\s+Full)?$/i)?.[1]?.trim();

  let status: EnrollmentStatus = "unknown";
  if (/\/\s*Full/i.test(raw) || (capacity > 0 && enrolled >= capacity)) {
    status = "full";
  } else if (capacity > 0 && enrolled < capacity) {
    status = "open";
  }

  return { enrolled, capacity, status, asOf };
}

function sectionTitle(block: string, courseTitle: string): string {
  const heading = block.match(/<h1>([\s\S]*?)<\/h1>/i);
  const fromHeading = heading ? decodeHtml(heading[1]) : "";
  // Prefer the section heading when it is a real title, not a truncation.
  if (fromHeading && fromHeading.length >= 8) {
    return fromHeading;
  }
  return courseTitle;
}

function parseSectionBlock(
  block: string,
  course: {
    term: string;
    courseNumber: string;
    courseTitle: string;
    fetchedAt: string;
  },
): Section | null {
  const link = block.match(SECTION_LINK_RE);
  if (!link) return null;

  const subject = link[1];
  const classIdentifier = link[2];
  const section = decodeHtml(link[3]);
  const callNumber = fieldValue(block, "Call Number") ?? "";
  const notes = fieldValue(block, "Notes");

  return {
    courseIdentifier: `${subject} ${course.courseNumber}`,
    classIdentifier,
    callNumber,
    title: sectionTitle(block, course.courseTitle),
    subject,
    courseNumber: course.courseNumber,
    section,
    credits: parseCredits(fieldValue(block, "Points")),
    instructors: parseInstructors(
      fieldValue(block, "Instructors") ?? fieldValue(block, "Instructor"),
    ),
    meetings: [],
    enrollment: parseEnrollment(fieldValue(block, "Enrollment")),
    term: course.term,
    source: "directory",
    fetchedAt: course.fetchedAt,
    notes,
    detailPath: `/section/${subject}/${classIdentifier}`,
  };
}

// Parse one Directory of Classes subject term page into sections.
export function parseSubjectPage(html: string, fetchedAt: string): Section[] {
  const sections: Section[] = [];
  const matches = [...html.matchAll(COURSE_HEADER_RE)];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const start = match.index ?? 0;
    const end = matches[i + 1]?.index ?? html.length;
    const chunk = html.slice(start, end);
    const term = decodeHtml(match[1]) || DEFAULT_TERM_NAME;
    const courseNumber = match[3];
    const courseTitle = decodeHtml(match[4]);

    // Each section is a table row that contains a Section link.
    const rows = chunk.split(/<tr>/i).slice(1);
    for (const row of rows) {
      if (!/Section\s+/i.test(row)) continue;
      const parsed = parseSectionBlock(row, {
        term,
        courseNumber,
        courseTitle,
        fetchedAt,
      });
      if (parsed) sections.push(parsed);
    }
  }

  return sections;
}
