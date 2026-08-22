import { decodeHtml, stripTags, tableValue } from "./html";
import type { Meeting, Section, SectionDetail } from "./types";

function parseMetaMeeting(html: string): Meeting | undefined {
  const description = html.match(
    /<meta name="description"[^>]*content="([^"]+)"/i,
  )?.[1];
  if (!description) return undefined;

  // Example: "Monday 7:00pm-9:30pm 142 Uris Hall"
  const match = decodeHtml(description).match(
    /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))*)\s+(\d{1,2}:\d{2}\s*[ap]m)\s*-\s*(\d{1,2}:\d{2}\s*[ap]m)(?:\s+(.+))?/i,
  );
  if (!match) return undefined;

  return {
    days: match[1],
    start: match[2],
    end: match[3],
    location: match[4]?.replace(/;.*$/, "").trim(),
  };
}

function splitDescription(raw: string | undefined): {
  description?: string;
  prerequisites?: string;
} {
  if (!raw) return {};
  const text = raw.replace(/\s+/g, " ").trim();
  const match = text.match(/^Prerequisites?:\s*(.*)$/i);
  if (!match) return { description: text };

  // Directory often glues prereqs and the blurb together.
  const rest = match[1];
  // Directory pages often omit a period between the prereq list and the blurb.
  const split = rest.match(/^(.*?\))\s+([A-Z][a-z][\s\S]+)$/)
    ?? rest.match(/^(.*?[.!])\s+(?=[A-Z][^:]{20,})([\s\S]+)$/);
  if (split) {
    return { prerequisites: split[1].trim(), description: split[2].trim() };
  }
  return { description: text, prerequisites: rest };
}

// One section detail page. Used only when a student opens a section.
export function parseSectionDetail(
  html: string,
  fallback: Section | undefined,
  fetchedAt: string,
): SectionDetail | null {
  const heading = stripTags(
    html.match(/<div id="section-header">([\s\S]*?)<\/div>/i)?.[1] ?? "",
  );
  const numberMatch = heading.match(/([A-Z]{1,3}\d{4})\s+section\s+(\S+)/i);
  const title = stripTags(html.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1] ?? "");

  if (!numberMatch && !fallback) return null;

  const courseNumber = numberMatch?.[1] ?? fallback?.courseNumber ?? "";
  const section = numberMatch?.[2] ?? fallback?.section ?? "";
  const subject =
    fallback?.subject ??
    html.match(/subj\/([A-Z0-9_]+)\//)?.[1] ??
    "";

  const { description, prerequisites } = splitDescription(
    tableValue(html, "Course Description"),
  );
  const meeting = parseMetaMeeting(html);
  const instructor =
    tableValue(html, "Instructors") ?? tableValue(html, "Instructor");

  return {
    courseIdentifier: fallback?.courseIdentifier ?? `${subject} ${courseNumber}`,
    classIdentifier: fallback?.classIdentifier ?? `${courseNumber}-detail`,
    callNumber: tableValue(html, "Call Number") ?? fallback?.callNumber ?? "",
    title: title || fallback?.title || courseNumber,
    subject,
    courseNumber,
    section,
    credits: fallback?.credits ?? { min: 0, max: 0 },
    instructors: instructor
      ? instructor.split(/\s+and\s+|,\s+/).map((n) => n.trim()).filter(Boolean)
      : fallback?.instructors ?? [],
    meetings: meeting ? [meeting] : fallback?.meetings ?? [],
    enrollment: fallback?.enrollment ?? {
      enrolled: 0,
      capacity: 0,
      status: "unknown",
    },
    term: fallback?.term ?? "Fall 2026",
    source: fallback?.source ?? "directory",
    fetchedAt,
    notes: fallback?.notes,
    detailPath: fallback?.detailPath,
    description,
    prerequisites,
    type: tableValue(html, "Type"),
    instructionMethod: tableValue(html, "Method of Instruction"),
    openTo: tableValue(html, "Open To"),
    gradingMode: tableValue(html, "Grading Mode"),
  };
}
