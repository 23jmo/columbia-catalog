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
 * `registrar.columbia.edu` currently returns 403 to server-side requests and
 * the SAS `/v1/termcalendars` endpoint requires credentials we do not hold, so
 * nothing enqueues an `academic_calendar` job today (see `.plans/BLOCKERS.md`).
 * This parser exists anyway, fully tested against synthetic fixtures of both
 * layouts the registrar has historically used, because the alternative — an
 * unimplemented member of `ParserRegistry` — is a runtime hole that only shows
 * up the day access is granted.
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

import { cleanText, campusWallClockToIso } from "./shared";

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

/** "Fall 2026", "Fall Term 2026", "2026 Fall" → "20263". */
export function termCodeFromHeading(heading: string): TermCode | null {
  const text = cleanText(heading ?? "");
  if (!text) return null;
  const season = /\b(spring|summer|fall|autumn)\b/i.exec(text);
  const year = /\b(20\d{2})\b/.exec(text);
  if (!season || !year) return null;
  const key = season[1].toLowerCase() === "autumn" ? "fall" : season[1].toLowerCase();
  const digit = SEASON_DIGIT[key];
  return digit ? `${year[1]}${digit}` : null;
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

  const push = (term: TermCode | null, label: string, dateText: string, audience: string | null) => {
    if (!term) return;
    if (options.termCode && term !== options.termCode) return;

    const kind = classify(label);
    if (!kind) return;

    const year = Number(term.slice(0, 4));
    // A Spring term's calendar dates fall in the previous calendar year for
    // anything before January — registration for Spring 2027 happens in 2026.
    const parsed = parseCalendarDate(dateText, term.endsWith("1") ? year - 1 : year);
    if (!parsed) return;

    const cleanLabel = cleanText(label).slice(0, 200);
    const dedupe = `${term}|${kind}|${cleanLabel}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);

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
  return result;
}
