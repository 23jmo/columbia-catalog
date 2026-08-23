/**
 * Shared primitives for the Columbia HTML parsing lane.
 *
 * Everything here is pure and side-effect free so the contract tests can pin
 * exact values. All of it was written against the real captured HTML in
 * `lib/ingest/__fixtures__/` — see the notes on each function for the concrete
 * strings Columbia actually emits.
 *
 * Types come from the authoritative `lib/types.ts`. The imports are relative
 * rather than `@/lib/types` on purpose: vitest runs without a tsconfig-path
 * resolver in this repo, and a relative import resolves to the exact same file.
 */

import type { EnrollmentStatusCode, Meeting, Weekday } from "../../types";

// ---------------------------------------------------------------------------
// Text hygiene
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  eacute: "é",
  egrave: "è",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  ccedil: "ç",
  ntilde: "ñ",
  deg: "°",
  reg: "®",
  copy: "©",
  trade: "™",
};

/**
 * Decode the HTML entities Columbia actually uses. `node-html-parser` already
 * decodes when you read `.text`, but we also split raw `innerHTML` on `<br>`
 * (course headers, bulletin location cells), and those fragments are still
 * encoded.
 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Collapse every run of whitespace — including the U+00A0 that `&nbsp;`
 * decodes to and the U+200B/U+FEFF that occasionally survive — into one space,
 * then trim.
 */
export function normalizeWhitespace(input: string): string {
  return input.replace(/[\s\u00a0\u200b\u200e\u200f\ufeff]+/g, " ").trim();
}

/** Decode entities and normalize whitespace in one step. */
export function cleanText(input: string | null | undefined): string {
  if (input == null) return "";
  return normalizeWhitespace(decodeHtmlEntities(input));
}

/** Lowercase a `<dt>`/`<th>` label and strip its trailing colon. */
export function normalizeLabel(input: string): string {
  return cleanText(input).replace(/\s*:\s*$/, "").toLowerCase();
}

/** `cleanText`, but empty/placeholder values collapse to null. */
export function blankToNull(input: string | null | undefined): string | null {
  const text = cleanText(input);
  if (!text) return null;
  if (/^(n\/a|na|none|tba|tbd|unknown|-{1,3})$/i.test(text)) return null;
  return text;
}

// ---------------------------------------------------------------------------
// Weekdays
// ---------------------------------------------------------------------------

/**
 * Two-letter tokens are matched before one-letter tokens, which is what makes
 * `TTh` → Tu,Th and `MW` → Mo,We both work with a single greedy scan.
 */
const TWO_LETTER_DAYS: Record<string, Weekday> = {
  SU: "Su",
  MO: "Mo",
  TU: "Tu",
  WE: "We",
  TH: "Th",
  FR: "Fr",
  SA: "Sa",
};

/** `R` is the registrar's Thursday, `U` its Sunday. */
const ONE_LETTER_DAYS: Record<string, Weekday> = {
  M: "Mo",
  T: "Tu",
  W: "We",
  R: "Th",
  F: "Fr",
  S: "Sa",
  U: "Su",
};

const FULL_DAY_NAMES: Record<string, Weekday> = {
  SUNDAY: "Su",
  MONDAY: "Mo",
  TUESDAY: "Tu",
  WEDNESDAY: "We",
  THURSDAY: "Th",
  FRIDAY: "Fr",
  SATURDAY: "Sa",
};

/**
 * Normalize any day-code spelling Columbia uses into the `Weekday` union.
 *
 * Handles, all seen in the fixtures or on live pages:
 *   "M W"      (bulletin, space separated)
 *   "T Th"     (bulletin)
 *   "TR"       (directory Notes, concatenated single letters)
 *   "MoWeFr"   (Vergil-style two-letter codes)
 *   "Monday"   (section-detail `<meta name="days">`)
 *
 * Order is preserved and duplicates are dropped.
 */
export function parseWeekdayCodes(raw: string | null | undefined): Weekday[] {
  const text = cleanText(raw).toUpperCase();
  if (!text) return [];

  const found: Weekday[] = [];
  const push = (day: Weekday) => {
    if (!found.includes(day)) found.push(day);
  };

  // Full day names first — "MONDAY" would otherwise tokenize as Mo + N…
  const words = text.split(/[^A-Z]+/).filter(Boolean);
  if (words.length > 0 && words.every((word) => FULL_DAY_NAMES[word] !== undefined)) {
    for (const word of words) push(FULL_DAY_NAMES[word]);
    return found;
  }

  const letters = text.replace(/[^A-Z]/g, "");
  let index = 0;
  while (index < letters.length) {
    const pair = letters.slice(index, index + 2);
    const two = TWO_LETTER_DAYS[pair];
    if (two !== undefined) {
      push(two);
      index += 2;
      continue;
    }
    const one = ONE_LETTER_DAYS[letters[index]];
    if (one !== undefined) push(one);
    index += 1;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Clock times
// ---------------------------------------------------------------------------

/**
 * Parse a single clock time into minutes from midnight.
 *
 * Accepts `7:00pm`, `10:10 AM`, `7:10P` (directory Notes), `12:00pm` (→ 720),
 * `12:30am` (→ 30), and bare 24-hour `1010` / `19:30`.
 * Returns null when the string is not a time.
 */
export function parseClockMinute(raw: string | null | undefined): number | null {
  const text = cleanText(raw).toUpperCase().replace(/\./g, "");
  if (!text) return null;

  const withColon = /^(\d{1,2}):(\d{2})\s*([AP]M?)?$/.exec(text);
  if (withColon) {
    return applyMeridiem(Number(withColon[1]), Number(withColon[2]), withColon[3]);
  }

  const hourOnly = /^(\d{1,2})\s*([AP]M?)$/.exec(text);
  if (hourOnly) {
    return applyMeridiem(Number(hourOnly[1]), 0, hourOnly[2]);
  }

  // Bare 24-hour form, e.g. the "F 1010 1240" pattern seen in directory Notes.
  const military = /^(\d{1,2})(\d{2})$/.exec(text);
  if (military) {
    const hour = Number(military[1]);
    const minute = Number(military[2]);
    if (hour <= 23 && minute <= 59) return hour * 60 + minute;
  }
  return null;
}

function applyMeridiem(hour: number, minute: number, meridiem: string | undefined): number | null {
  if (minute > 59) return null;
  let resolved = hour;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const isPm = meridiem.startsWith("P");
    resolved = hour % 12;
    if (isPm) resolved += 12;
  } else if (hour > 23) {
    return null;
  }
  return resolved * 60 + minute;
}

export interface TimeRange {
  startMinute: number;
  endMinute: number;
}

/**
 * Parse `7:00pm - 9:30pm`, `10:10am-11:25am`, `7:10P - 8:25P`, `1010 1240`.
 * Meridiem carries backwards when only the end has one (`9 - 10:15am`).
 */
export function parseTimeRange(raw: string | null | undefined): TimeRange | null {
  const text = cleanText(raw);
  if (!text) return null;

  const parts = text
    .split(/\s*(?:-|–|—|\bto\b)\s*|\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const startRaw = parts[0];
  const endRaw = parts[parts.length - 1];

  let startMinute = parseClockMinute(startRaw);
  const endMinute = parseClockMinute(endRaw);
  if (endMinute === null) return null;

  // "9:00 - 10:15am": borrow the meridiem from the end of the range.
  if (startMinute === null && /[AP]\.?M?\.?$/i.test(endRaw)) {
    const meridiem = /P/i.test(endRaw.slice(-2)) ? "PM" : "AM";
    startMinute = parseClockMinute(`${startRaw}${meridiem}`);
  }
  if (startMinute === null) return null;

  return { startMinute, endMinute };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export interface ParsedLocation {
  buildingName: string | null;
  room: string | null;
}

/**
 * Split a bulletin location cell into room + building.
 *
 * Real values from `bulletin-cs.html`:
 *   "142 Uris Hall"                → room 142, Uris Hall
 *   "963 Ext Schermerhorn Hall"    → room 963, Ext Schermerhorn Hall
 *   "233 Seeley W. Mudd Building"  → room 233, Seeley W. Mudd Building
 *   "Room TBA" / "None None" / ""  → both null
 *   "Cin Alfred Lerner Hall"       → building only (leading token is not numeric)
 */
export function parseLocation(raw: string | null | undefined): ParsedLocation {
  const text = cleanText(raw);
  if (!text) return { buildingName: null, room: null };
  if (/^(room\s+)?(tba|tbd|to be announced)$/i.test(text)) return { buildingName: null, room: null };
  if (/^none(\s+none)?$/i.test(text)) return { buildingName: null, room: null };

  const numbered = /^(\d+[A-Za-z]?)\s+(.+)$/.exec(text);
  if (numbered) {
    return { room: numbered[1], buildingName: blankToNull(numbered[2]) };
  }
  return { room: null, buildingName: text };
}

/**
 * Build the `Meeting[]` for one "days + time range" pattern, optionally with a
 * location line. One meeting per weekday, which is the shape `Meeting` wants
 * and what the week grid consumes.
 */
export function buildMeetings(
  daysRaw: string | null | undefined,
  timeRaw: string | null | undefined,
  locationRaw?: string | null,
): Meeting[] {
  const weekdays = parseWeekdayCodes(daysRaw);
  const range = parseTimeRange(timeRaw);
  if (weekdays.length === 0 || range === null) return [];
  const { buildingName, room } = parseLocation(locationRaw);
  return weekdays.map((weekday) => ({
    weekday,
    startMinute: range.startMinute,
    endMinute: range.endMinute,
    buildingName,
    room,
  }));
}

/**
 * Parse a free-form "M W 5:40pm - 6:55pm" pattern where days and times are in
 * a single string, plus an optional separate location line.
 */
export function parseMeetingPattern(
  patternRaw: string | null | undefined,
  locationRaw?: string | null,
): Meeting[] {
  const text = cleanText(patternRaw);
  if (!text) return [];
  // Everything up to the first digit is the day block; the rest is the range.
  const split = /^([^0-9]*?)\s*(\d.*)$/.exec(text);
  if (!split) return [];
  return buildMeetings(split[1], split[2], locationRaw);
}

// ---------------------------------------------------------------------------
// Points / credits
// ---------------------------------------------------------------------------

export interface ParsedPoints {
  pointsMin: number | null;
  pointsMax: number | null;
}

/**
 * Parse the Points cell. Directory: `3`, `0`, `1-4`, `1-3`.
 * Bulletin: `3.00`, `0.00`, `1.00-3.00`. Fractional values are preserved.
 */
export function parsePoints(raw: string | null | undefined): ParsedPoints {
  const text = cleanText(raw).replace(/\bpoints?\b/gi, "").trim();
  if (!text) return { pointsMin: null, pointsMax: null };

  const range = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)$/i.exec(text);
  if (range) {
    return { pointsMin: Number(range[1]), pointsMax: Number(range[2]) };
  }
  const single = /^(\d+(?:\.\d+)?)$/.exec(text);
  if (single) {
    const value = Number(single[1]);
    return { pointsMin: value, pointsMax: value };
  }
  // Anything else (e.g. "Variable") is unknown rather than zero.
  return { pointsMin: null, pointsMax: null };
}

// ---------------------------------------------------------------------------
// Instructors
// ---------------------------------------------------------------------------

const NAME_SUFFIXES = /^(jr|sr|ii|iii|iv|v|phd|ph\.d|md|m\.d|esq)\.?$/i;

/**
 * Split an instructor cell into individual names.
 *
 * Directory uses `A and B`; bulletin uses `A, B`; both forms and the mixed
 * `A, B and C` are handled. A trailing generational/degree suffix that got
 * split off by a comma is stitched back onto the preceding name.
 */
export function splitInstructorList(raw: string | null | undefined): string[] {
  const text = cleanText(raw);
  if (!text) return [];
  if (/^(tba|tbd|staff|none|n\/a)$/i.test(text)) return [];

  const pieces = text
    .split(/\s*,\s*|\s+and\s+|\s*&\s*|\s*;\s*/i)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const names: string[] = [];
  for (const piece of pieces) {
    if (NAME_SUFFIXES.test(piece) && names.length > 0) {
      names[names.length - 1] = `${names[names.length - 1]}, ${piece}`;
      continue;
    }
    if (!names.includes(piece)) names.push(piece);
  }
  return names;
}

// ---------------------------------------------------------------------------
// "as of" timestamps — provenance, always displayed. See spec §10.
// ---------------------------------------------------------------------------

/** Columbia's registrar clock is New York wall time on every page. */
const CAMPUS_TIME_ZONE = "America/New_York";

const CAMPUS_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function campusOffsetMinutes(instant: Date): number {
  const parts = CAMPUS_PARTS.formatToParts(instant);
  const lookup: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    lookup.year,
    lookup.month - 1,
    lookup.day,
    lookup.hour,
    lookup.minute,
    lookup.second,
  );
  return (asUtc - instant.getTime()) / 60000;
}

function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, "0");
}

/**
 * Render a New York wall-clock reading as an ISO 8601 string carrying the
 * correct `-04:00`/`-05:00` offset, so the reading survives round-tripping
 * through a `timestamptz` column without losing what the page actually said.
 *
 * Independent of the machine's own timezone.
 */
export function campusWallClockToIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): string {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = campusOffsetMinutes(new Date(naiveUtc));
  let instant = naiveUtc - offset * 60000;
  const settled = campusOffsetMinutes(new Date(instant));
  if (settled !== offset) {
    offset = settled;
    instant = naiveUtc - offset * 60000;
  }
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  return (
    `${pad(year, 4)}-${pad(month)}-${pad(day)}` +
    `T${pad(hour)}:${pad(minute)}:${pad(second)}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}

/**
 * Parse the directory's own "as of" stamp into ISO 8601.
 *
 * Subject page:   "August 22, 2026"                        → midnight
 * Section detail: "5:05PM Saturday, August 22, 2026"       → 17:05
 * Also tolerates "08/22/26" and "August 22, 2026 5:05 PM".
 *
 * Returns null when no date can be recovered — the caller must never invent a
 * provenance stamp.
 */
export function parseAsOfTimestamp(raw: string | null | undefined): string | null {
  const text = cleanText(raw).replace(/^as of\s*/i, "");
  if (!text) return null;

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  const named = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,?\s*(\d{4})\b/.exec(text);
  if (named) {
    const resolved = MONTHS[named[1].toLowerCase()];
    if (resolved !== undefined) {
      month = resolved;
      day = Number(named[2]);
      year = Number(named[3]);
    }
  }

  if (year === null) {
    const numeric = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(text);
    if (numeric) {
      month = Number(numeric[1]);
      day = Number(numeric[2]);
      const rawYear = Number(numeric[3]);
      year = rawYear < 100 ? 2000 + rawYear : rawYear;
    }
  }

  if (year === null || month === null || day === null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let hour = 0;
  let minute = 0;
  const time = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]?\.?/.exec(text);
  if (time) {
    const parsed = parseClockMinute(`${time[1]}:${time[2]}${time[4].toUpperCase()}M`);
    if (parsed !== null) {
      hour = Math.floor(parsed / 60);
      minute = parsed % 60;
    }
  } else {
    const time24 = /\b(\d{1,2}):(\d{2})(?::\d{2})?\b(?!\s*[AaPp])/.exec(text);
    if (time24) {
      const h = Number(time24[1]);
      const m = Number(time24[2]);
      if (h <= 23 && m <= 59) {
        hour = h;
        minute = m;
      }
    }
  }

  return campusWallClockToIso(year, month, day, hour, minute);
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export interface ParsedEnrollment {
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  /** ISO 8601 with campus offset. Never fabricated. */
  sourceAsOf: string | null;
  /** The directory's own `/ Full` marker, which can be set below the cap. */
  isFull: boolean;
}

/**
 * Parse the Enrollment string.
 *
 * Subject page:   "115 students (200 max) as of August 22, 2026"
 *                 "1 student (23 max) as of August 22, 2026"      (singular)
 *                 "45 students (45 max) as of August 22, 2026 / Full"
 * Section detail: "22 students (110 max) as of  5:05PM Saturday, August 22, 2026"
 */
export function parseEnrollment(raw: string | null | undefined): ParsedEnrollment {
  const text = cleanText(raw);
  const empty: ParsedEnrollment = {
    enrollmentCount: null,
    enrollmentCap: null,
    sourceAsOf: null,
    isFull: false,
  };
  if (!text) return empty;

  const isFull = /\/\s*full\s*$/i.test(text);
  const body = text.replace(/\s*\/\s*full\s*$/i, "");

  const counts = /(\d+)\s+students?\s*\(\s*(\d+)\s*max\s*\)/i.exec(body);
  const enrollmentCount = counts ? Number(counts[1]) : null;
  const enrollmentCap = counts ? Number(counts[2]) : null;

  const asOfIndex = body.search(/\bas of\b/i);
  const sourceAsOf = asOfIndex >= 0 ? parseAsOfTimestamp(body.slice(asOfIndex)) : null;

  return { enrollmentCount, enrollmentCap, sourceAsOf, isFull };
}

/**
 * Derive the status code. The directory has no explicit status field on the
 * listing pages — `/ Full` plus the count/cap comparison is all it gives us,
 * so anything we cannot evidence stays `unknown` rather than guessing `open`.
 */
export function deriveStatus(
  enrollmentCount: number | null,
  enrollmentCap: number | null,
  isFull: boolean,
  explicit?: string | null,
): EnrollmentStatusCode {
  const stated = cleanText(explicit).toLowerCase();
  if (stated) {
    if (stated.includes("wait")) return "waitlist";
    if (stated.includes("full")) return "full";
    if (stated.includes("closed") || stated.includes("cancel")) return "closed";
    if (stated.includes("open")) return "open";
  }
  if (isFull) return "full";
  if (enrollmentCount === null || enrollmentCap === null) return "unknown";
  if (enrollmentCap <= 0) return "unknown";
  return enrollmentCount >= enrollmentCap ? "full" : "open";
}

// ---------------------------------------------------------------------------
// Course codes
// ---------------------------------------------------------------------------

export interface ParsedCourseNumber {
  number: number;
  /** School/qualifier letters, e.g. "W", "E", "BC". Null when absent. */
  qualifier: string | null;
}

/**
 * Parse a course-number token into its numeric part and qualifier.
 *
 * The qualifier can lead (`W1002`, `BC1014`, `E6998`) or trail (`1002W`), and
 * may be absent (`4113`). Both spellings appear across Columbia surfaces, so
 * both are accepted.
 */
export function parseCourseNumber(raw: string | null | undefined): ParsedCourseNumber | null {
  const text = cleanText(raw).toUpperCase().replace(/\s+/g, "");
  if (!text) return null;
  const match = /^([A-Z]{0,3})(\d{1,5})([A-Z]{0,3})$/.exec(text);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  const qualifier = prefix || suffix || null;
  return { number: Number(digits), qualifier: qualifier === null ? null : qualifier };
}

/** `courseId` is `${subjectCode}${number}${qualifier}`, e.g. "COMS4113W". */
export function buildCourseId(
  subjectCode: string,
  number: number,
  qualifier: string | null,
): string {
  return `${subjectCode}${number}${qualifier ?? ""}`;
}

/** `sectionId` is `${termCode}${courseId}${sectionCode}`, e.g. "20263COMS4113W001". */
export function buildSectionId(termCode: string, courseId: string, sectionCode: string): string {
  return `${termCode}${courseId}${sectionCode}`;
}

/**
 * Pull the "Prerequisites: …" preamble off a course description.
 *
 * Best effort by necessity: the directory concatenates the prerequisite clause
 * straight onto the description with no markup boundary at all —
 *
 *   "Prerequisites: (COMS W3134 or COMS W3136) and (COMS W3157) Design and
 *    implementation of large-scale distributed and cloud systems. …"
 *
 * so there is nothing to split on but shape. We scan forward accepting only
 * things a prerequisite expression is made of — parenthesized groups, course
 * codes, and the connectors between them — and stop at the first token that is
 * plain prose. Descriptions whose prerequisites are written as prose instead
 * fall back to a first-sentence cut.
 *
 * Naive "cut at the last close paren" does NOT work: descriptions are full of
 * their own parentheticals.
 */
export function extractPrerequisiteText(description: string | null): string | null {
  if (!description) return null;
  const match = /^\s*(Co-?requisites?|Prerequisites?)\s*:\s*/i.exec(description);
  if (!match) return null;
  const body = description.slice(match[0].length);

  const expressionLength = prerequisiteExpressionLength(body);
  if (expressionLength > 0) {
    return normalizeWhitespace(body.slice(0, expressionLength)) || null;
  }

  const sentence = /^(.*?[.;])(?:\s+[A-Z]|\s*$)/.exec(body);
  if (sentence) return normalizeWhitespace(sentence[1]) || null;
  return normalizeWhitespace(body) || null;
}

/** Connectors that may sit between prerequisite terms at paren depth zero. */
const PREREQ_CONNECTOR = /^(?:and\b|or\b|[,;/&+.])/i;
/** "COMS W3134", "CSEE W4119", or a bare "W3134". */
const PREREQ_COURSE_CODE = /^(?:[A-Z]{3,5}\s+)?[A-Z]?\d{3,5}[A-Z]?\b/;

/**
 * Length of the leading substring of `body` that still reads as a prerequisite
 * expression. Returns 0 when the text never looks like one.
 */
function prerequisiteExpressionLength(body: string): number {
  let index = 0;
  let depth = 0;
  let lastAccepted = 0;
  let sawTerm = false;

  while (index < body.length) {
    const char = body[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "(") {
      depth += 1;
      index += 1;
      sawTerm = true;
      continue;
    }
    if (char === ")") {
      if (depth === 0) break;
      depth -= 1;
      index += 1;
      lastAccepted = index;
      continue;
    }
    if (depth > 0) {
      // Inside a group anything goes; jump to the next parenthesis.
      const nextParen = body.slice(index).search(/[()]/);
      if (nextParen < 0) break;
      index += nextParen;
      continue;
    }

    const rest = body.slice(index);
    const code = PREREQ_COURSE_CODE.exec(rest);
    if (code) {
      index += code[0].length;
      lastAccepted = index;
      sawTerm = true;
      continue;
    }
    const connector = PREREQ_CONNECTOR.exec(rest);
    if (connector) {
      index += connector[0].length;
      continue;
    }
    break;
  }

  return sawTerm ? lastAccepted : 0;
}
