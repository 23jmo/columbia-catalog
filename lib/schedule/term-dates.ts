/**
 * Schedule lane — term start/end bounds.
 *
 * The `.ics` export needs a real first and last day of instruction, otherwise a
 * weekly recurrence has nothing to repeat between. `Term` in `lib/types` already
 * carries optional `startsOn` / `endsOn`; nothing populates them yet because the
 * `academic_calendar` crawl job has not landed.
 *
 * TODO(ingest): when the academic-calendar parser lands, delete `FALLBACK_BOUNDS`
 * and read `Term.startsOn` / `Term.endsOn`. `termBounds()` already prefers a
 * supplied `Term`, so that change is a one-line deletion here and nothing else.
 *
 * Dates are plain `YYYY-MM-DD` local calendar days. No timezone maths: a class
 * that meets at 10:10am meets at 10:10am wherever the calendar app is opened.
 */

import type { Season, Term, TermCode } from "../types";
import { parseTermCode } from "../constants";

export interface TermBounds {
  /** First day of instruction, `YYYY-MM-DD`. */
  startsOn: string;
  /** Last day of instruction, `YYYY-MM-DD`. */
  endsOn: string;
  /** True when these came from a real academic calendar rather than the shape below. */
  isAuthoritative: boolean;
}

/**
 * Month/day the semester typically opens and closes, by season. Columbia moves
 * these by a few days each year; they are close enough to bound a recurrence and
 * are replaced wholesale the moment real calendar data exists.
 */
const FALLBACK_BOUNDS: Record<Season, { start: [number, number]; end: [number, number] }> = {
  Spring: { start: [1, 20], end: [5, 4] },
  Summer: { start: [5, 26], end: [8, 14] },
  Fall: { start: [9, 2], end: [12, 12] },
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Bounds for a term, preferring anything the calendar lane has already supplied. */
export function termBounds(termCode: TermCode, term?: Term): TermBounds {
  if (term?.startsOn && term.endsOn) {
    return { startsOn: term.startsOn, endsOn: term.endsOn, isAuthoritative: true };
  }
  const { year, season } = parseTermCode(termCode);
  const shape = FALLBACK_BOUNDS[season];
  return {
    startsOn: `${year}-${pad(shape.start[0])}-${pad(shape.start[1])}`,
    endsOn: `${year}-${pad(shape.end[0])}-${pad(shape.end[1])}`,
    isAuthoritative: false,
  };
}

/** `YYYY-MM-DD` → `[year, month, day]`, month 1-indexed. Throws on a malformed date. */
export function parseCalendarDate(date: string): [number, number, number] {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parsed) throw new Error(`Bad calendar date: ${date}`);
  return [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])];
}
