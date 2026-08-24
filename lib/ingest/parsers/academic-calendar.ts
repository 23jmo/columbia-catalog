/**
 * Columbia Catalog — academic calendar parser (spec §10, §13).
 *
 * The calendar is what makes the seat-history line mean anything: "it filled in
 * 90 seconds during senior registration" is the insight, and without milestone
 * annotations the chart is a curve with no context. It is also the producer for
 * the registration windows that escalate watched subjects to the 30-second
 * tier, since appointments stagger by school and class year over roughly two
 * weeks rather than opening all at once.
 *
 * ── Access ─────────────────────────────────────────────────────────────────
 *
 * `registrar.columbia.edu` sits behind an interactive Cloudflare challenge and
 * the SAS `/v1/termcalendars` endpoint requires credentials we do not hold.
 * Neither is the only place Columbia publishes the calendar: the Columbia
 * College bulletin carries the same dates, on a host the crawler already talks
 * to, and answers a plain request. That is the source in use.
 *
 * The lesson is worth keeping around — the blocker was recorded against a URL
 * when the requirement was a fact, and the fact had another publisher.
 *
 * Three layouts are handled: the registrar's date/description table, its
 * definition-list variant, and the bulletin's three-column Month / Day / Event
 * grid, which is the one live today.
 *
 * ── Parsing posture ────────────────────────────────────────────────────────
 *
 * Never throws. An unrecognisable page yields zero milestones, which the
 * quarantine guard refuses as a shrink; that is the correct outcome and it is
 * strictly better than an exception taking down a crawl worker.
 *
 * Rows whose text does not clearly name a known milestone kind are **dropped,
 * not guessed**. `registration_milestone_kind` has no catch-all member, and a
 * mislabelled date becomes a permanent wrong annotation on a chart students use
 * to decide when to register.
 */

import { parse, type HTMLElement } from "node-html-parser";

import type { TermCode } from "@/lib/types";
import type { ParsedAcademicCalendar } from "@/lib/crawler/contracts";

import { cleanText, campusWallClockToIso, normalizeLabel } from "./shared";

/** The four members of `registration_milestone_kind`. */
export type MilestoneKind =
  | "registration_open"
  | "appointment_window"
  | "add_drop_deadline"
  | "term_start";

/**
 * Keyword tests, most specific first. Order matters: "last day to add or drop"
 * contains "add", and "registration appointments begin" contains "registration".
 */
/**
 * The row that bounds the term. Columbia prints it as "Last day of classes",
 * usually followed by several grading deadlines, which is why it classifies as
 * `add_drop_deadline` — that is correct for the annotation and useless for the
 * `.ics` recurrence, so the end date is read separately.
 */
const LAST_DAY_OF_CLASSES = /\blast day of (classes|instruction)\b/i;

const KIND_RULES: { kind: MilestoneKind; test: RegExp }[] = [
  { kind: "add_drop_deadline", test: /\b(last day|deadline).{0,40}\b(add|drop|change)\b/i },
  { kind: "add_drop_deadline", test: /\badd[/\s-]*drop\b.{0,30}\b(deadline|ends?|closes?)\b/i },
  { kind: "appointment_window", test: /\bappointment/i },
  { kind: "appointment_window", test: /\b(senior|junior|sophomore|first[- ]year|graduate)s?\b.{0,30}\bregist/i },
  { kind: "registration_open", test: /\bregistration\b.{0,30}\b(opens?|begins?|starts?)\b/i },
  { kind: "registration_open", test: /\b(course|class)\s+registration\b/i },
  { kind: "term_start", test: /\b(first day of|classes begin|instruction begins)\b/i },
];

function classify(label: string): MilestoneKind | null {
  for (const rule of KIND_RULES) {
    if (rule.test.test(label)) return rule.kind;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

/**
 * A calendar cell is frequently a range — "October 27 – November 7" — because
 * an appointment window IS a range. `endsAt` is what makes
 * `isWindowActive()` able to answer "are we inside a window right now", so a
 * range must not be flattened to its first date.
 */
export interface ParsedCalendarDate {
  startsAt: string;
  endsAt: string | null;
}

/**
 * Parses the date forms the registrar actually prints. Year is required from
 * the caller when the cell omits it (the common case — the year lives in the
 * section heading, not the row).
 */
export function parseCalendarDate(raw: string, fallbackYear: number): ParsedCalendarDate | null {
  const text = cleanText(raw ?? "");
  if (!text) return null;

  // "October 27 - November 7, 2026" | "October 27-31" | "Oct 27 – Nov 7"
  const range =
    /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\s*(?:[–—-]|to|through)\s*(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})(?:\s*,?\s*(\d{4}))?/.exec(
      text,
    );
  if (range) {
    const startMonth = MONTHS[range[1].toLowerCase()];
    const endMonth = range[4] ? MONTHS[range[4].toLowerCase()] : startMonth;
    if (startMonth && endMonth) {
      const startYear = range[3] ? Number(range[3]) : (range[6] ? Number(range[6]) : fallbackYear);
      // A range that crosses New Year ends in the following year.
      const endYear = range[6]
        ? Number(range[6])
        : endMonth < startMonth
          ? startYear + 1
          : startYear;
      const startsAt = toIso(startYear, startMonth, Number(range[2]));
      const endsAt = toIso(endYear, endMonth, Number(range[5]), true);
      if (startsAt && endsAt) return { startsAt, endsAt };
    }
  }

  // "October 27, 2026" | "Oct 27" | "October 27"
  const single = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/.exec(text);
  if (single) {
    const month = MONTHS[single[1].toLowerCase()];
    if (month) {
      const startsAt = toIso(single[3] ? Number(single[3]) : fallbackYear, month, Number(single[2]));
      if (startsAt) return { startsAt, endsAt: null };
    }
  }

  return null;
}

/**
 * Campus wall-clock, not UTC. A registration window that opens "October 27"
 * opens at midnight in New York; storing it as midnight UTC would move the
 * window five hours and escalate the crawl tier on the wrong day.
 *
 * `endOfDay` matters for the closing edge of a window: a window "through
 * November 7" includes all of November 7.
 */
function toIso(year: number, month: number, day: number, endOfDay = false): string | null {
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return endOfDay
    ? campusWallClockToIso(year, month, day, 23, 59, 59)
    : campusWallClockToIso(year, month, day);
}

// ---------------------------------------------------------------------------
// Term detection
// ---------------------------------------------------------------------------

const SEASON_DIGIT: Record<string, string> = { spring: "1", summer: "2", fall: "3" };

function seasonDigit(season: string): string | undefined {
  const key = season.toLowerCase() === "autumn" ? "fall" : season.toLowerCase();
  return SEASON_DIGIT[key];
}

/**
 * "Fall 2026", "Fall Term 2026", "2026 Fall" → "20263".
 *
 * A season adjacent to a year wins over a loose scan of the whole heading,
 * because real headings mention more than one season. Columbia College titles
 * its August table "Late Summer Dates and Deadlines related to the Fall 2026
 * term" — first-season-plus-first-year reads that as Summer 2026 and files
 * every Fall registration date under a term that does not exist in our crawl
 * scope. The loose scan is kept as a fallback for headings that separate the
 * two with words we do not anticipate.
 */
export function termCodeFromHeading(heading: string): TermCode | null {
  const text = cleanText(heading ?? "");
  if (!text) return null;

  const adjacent =
    /\b(spring|summer|fall|autumn)\s+(?:term\s+)?(20\d{2})\b/i.exec(text) ??
    /\b(20\d{2})\s+(spring|summer|fall|autumn)\b/i.exec(text);
  if (adjacent) {
    const [season, year] = /^\d/.test(adjacent[1])
      ? [adjacent[2], adjacent[1]]
      : [adjacent[1], adjacent[2]];
    const digit = seasonDigit(season);
    if (digit) return `${year}${digit}` as TermCode;
  }

  const season = /\b(spring|summer|fall|autumn)\b/i.exec(text);
  const year = /\b(20\d{2})\b/.exec(text);
  if (!season || !year) return null;
  const digit = seasonDigit(season[1]);
  return digit ? `${year[1]}${digit}` : null;
}

/**
 * The calendar year a month belongs to, for a page that prints month names but
 * not years — Columbia College's bulletin calendar being the case in hand.
 *
 * An academic year runs August through July, so within one term's section the
 * autumn months belong to the earlier calendar year and everything from
 * January belongs to the later one. Spring 2027 registration happens in
 * November 2026; Fall 2026 grades are due in January 2027. Both fall out of
 * the same rule once the academic year's opening year is known.
 *
 * Summer is exempt: it sits wholly inside one calendar year, so the split
 * would push its own months into the year after it.
 */
export function calendarYearFor(term: TermCode, month: number): number {
  const termYear = Number(term.slice(0, 4));
  const season = term.slice(4);
  if (season === "2") return termYear;
  const academicStartYear = season === "1" ? termYear - 1 : termYear;
  return month >= 8 ? academicStartYear : academicStartYear + 1;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export interface AcademicCalendarOptions {
  /** Restrict output to one term. Rows under other headings are skipped. */
  termCode?: TermCode;
  /** Source page, stored on each milestone so a wrong date is traceable. */
  url?: string;
}

/**
 * Handles both layouts the registrar has used: a `<table>` of date/description
 * rows, and a definition list of `<dt>` date / `<dd>` description pairs. Term
 * scope comes from the nearest preceding heading, so one page covering several
 * terms yields correctly attributed milestones for each.
 */
/**
 * The term a row is *about*, when it says so, versus the terms it merely
 * mentions — which is most of them. Deadline rows reference neighbouring terms
 * routinely: Columbia College's September 18 row ends "Last day to uncover
 * grade for Spring or Summer 2026 course taken Pass/D/Fail", and its January 29
 * row ends "...for Fall 2026 course". Treating any named term as the row's own
 * subject files both under the wrong term — and because the wrong term is
 * usually outside the crawl scope, the row is dropped rather than misdated, so
 * the damage shows up as a short calendar rather than a wrong one.
 *
 * Only registration states its own term unambiguously, in either word order,
 * so only registration re-attributes.
 */
function registrationTermInLabel(label: string): TermCode | null {
  const text = cleanText(label);
  const match =
    /\bregistration\s+(?:for\s+)?(?:the\s+)?(spring|summer|fall|autumn)\s+(20\d{2})/i.exec(text) ??
    /\b(spring|summer|fall|autumn)\s+(20\d{2})\s+(?:\w+\s+){0,2}registration\b/i.exec(text);
  if (!match) return null;
  const digit = seasonDigit(match[1]);
  return digit ? (`${match[2]}${digit}` as TermCode) : null;
}

/**
 * True for the three-column Month / Day / Event layout the Columbia College
 * bulletin uses, where the date is split across two cells and the month is
 * printed once per month rather than once per row.
 */
function isMonthDayTable(table: HTMLElement): boolean {
  const headers = table.querySelectorAll("th").map((cell) => normalizeLabel(cell.text));
  if (headers.length < 2) return false;
  const month = headers.indexOf("month");
  const day = headers.indexOf("day");
  return month === 0 && day === 1;
}

export function parseAcademicCalendar(
  html: string,
  options: AcademicCalendarOptions = {},
): ParsedAcademicCalendar {
  const result: ParsedAcademicCalendar = { termCode: options.termCode ?? null, milestones: [] };

  let root: HTMLElement;
  try {
    root = parse(html ?? "");
  } catch {
    return result;
  }

  const seen = new Set<string>();
  let currentTerm: TermCode | null = options.termCode ?? null;
  let termStartsOn: string | null = null;
  let termEndsOn: string | null = null;

  const push = (
    term: TermCode | null,
    label: string,
    dateText: string,
    audience: string | null,
    /** Exact year, when the layout gives the month and the term gives the rest. */
    yearHint?: number,
  ) => {
    if (!term) return;
    if (options.termCode && term !== options.termCode) return;

    const kind = classify(label);
    if (!kind) return;

    const year = Number(term.slice(0, 4));
    // A Spring term's calendar dates fall in the previous calendar year for
    // anything before January — registration for Spring 2027 happens in 2026.
    const fallbackYear = yearHint ?? (term.endsWith("1") ? year - 1 : year);
    const parsed = parseCalendarDate(dateText, fallbackYear);
    if (!parsed) return;

    const cleanLabel = cleanText(label).slice(0, 200);
    const dedupe = `${term}|${kind}|${cleanLabel}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);

    // Campus midnight is 04:00/05:00Z on the SAME day, so the UTC prefix of a
    // point-in-time milestone is already the right calendar day. Windows are
    // stamped 23:59:59 and would roll over, which is why only `occursAt` is
    // read here and only for rows that bound the term.
    if (options.termCode) {
      const day = parsed.startsAt.slice(0, 10);
      if (kind === "term_start" && (!termStartsOn || day < termStartsOn)) termStartsOn = day;
      if (LAST_DAY_OF_CLASSES.test(cleanLabel) && (!termEndsOn || day > termEndsOn)) {
        termEndsOn = day;
      }
    }

    result.milestones.push({
      kind,
      label: cleanLabel,
      occursAt: parsed.startsAt,
      ...(parsed.endsAt ? { endsAt: parsed.endsAt } : {}),
      ...(audience ? { audience } : {}),
      ...(options.url ? { sourceUrl: options.url } : {}),
    });
  };

  // Walk in document order so a heading scopes everything after it.
  for (const node of root.querySelectorAll("h1, h2, h3, h4, caption, table, dl")) {
    const tag = node.tagName?.toLowerCase();

    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "caption") {
      const term = termCodeFromHeading(node.text);
      if (term) currentTerm = term;
      continue;
    }

    if (tag === "table") {
      const caption = node.querySelector("caption");
      const scoped = (caption && termCodeFromHeading(caption.text)) || currentTerm;

      if (isMonthDayTable(node)) {
        // The month cell is populated on the first row of each month and left
        // empty on every row after it, so it has to carry down. Reading rows
        // independently yields a bare day number with no month, which parses
        // as nothing — the whole table would come back empty rather than wrong,
        // which is exactly the kind of silence that looks like a dead source.
        let stickyMonth = "";
        for (const row of node.querySelectorAll("tr")) {
          const cells = row.querySelectorAll("td");
          if (cells.length < 3) continue;

          const monthCell = cleanText(cells[0].text);
          if (monthCell) stickyMonth = monthCell;
          const monthNumber = MONTHS[stickyMonth.toLowerCase()];
          if (!monthNumber) continue;

          const dayCell = cleanText(cells[1].text);
          const label = cleanText(cells[2].text);
          if (!dayCell || !label) continue;

          // A window can cross a month boundary ("30–September 3"), in which
          // case the day cell names the second month itself.
          const leading = /^([A-Za-z]{3,9})\.?\s+\d/.exec(dayCell);
          const dateText =
            leading && MONTHS[leading[1].toLowerCase()] ? dayCell : `${stickyMonth} ${dayCell}`;

          // Two different terms are in play and they are not interchangeable.
          // The heading says where in the calendar we are, which is what dates
          // the row ("April" under Spring Term 2027 means April 2027). The row
          // itself says which term it is *about*, and a row can advertise a
          // different one: "Online registration for Fall 2027" appears in the
          // spring section. Dating it by the row's term would put it in 2028;
          // filing it under the heading's term would annotate the Spring 2027
          // chart with a window that has nothing to do with Spring 2027. So
          // the year comes from the heading and the attribution from the label.
          const attributed = registrationTermInLabel(label) ?? scoped;
          push(
            attributed,
            label,
            dateText,
            null,
            scoped ? calendarYearFor(scoped, monthNumber) : undefined,
          );
        }
        continue;
      }

      for (const row of node.querySelectorAll("tr")) {
        const cells = row.querySelectorAll("td");
        if (cells.length < 2) continue;
        // Layout is (date, description) or (description, date); whichever cell
        // parses as a date is the date.
        const first = cleanText(cells[0].text);
        const second = cleanText(cells[1].text);
        const audience = cells.length > 2 ? cleanText(cells[2].text) || null : null;

        if (parseCalendarDate(first, 2000)) push(scoped, second, first, audience);
        else if (parseCalendarDate(second, 2000)) push(scoped, first, second, audience);
      }
      continue;
    }

    if (tag === "dl") {
      const terms = node.querySelectorAll("dt");
      const defs = node.querySelectorAll("dd");
      for (let i = 0; i < Math.min(terms.length, defs.length); i += 1) {
        const dt = cleanText(terms[i].text);
        const dd = cleanText(defs[i].text);
        if (parseCalendarDate(dt, 2000)) push(currentTerm, dd, dt, null);
        else if (parseCalendarDate(dd, 2000)) push(currentTerm, dt, dd, null);
      }
    }
  }

  if (!result.termCode && currentTerm) result.termCode = currentTerm;
  if (termStartsOn) result.termStartsOn = termStartsOn;
  if (termEndsOn) result.termEndsOn = termEndsOn;
  return result;
}
