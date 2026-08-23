/**
 * Schedule lane — `.ics` export.
 *
 * Spec §8: "the plan escapes our app and becomes their actual week." A plan that
 * only exists on our grid is a worse product than one the student never has to
 * open again, so the export is a first-class feature, not a footnote.
 *
 * Shape of the output:
 *
 *   - One VEVENT per *meeting*, not per section. A section that meets Mon/Wed in
 *     Mudd and Fri in Pupin produces three events, each with its own room, which
 *     is what a calendar app can actually show you at 9am.
 *   - Each event recurs `FREQ=WEEKLY` on its own weekday, bounded by the term's
 *     last day of instruction, so nothing bleeds into January.
 *   - Custom blocks export too. "Work, Tue/Thu 3–6" is part of the week.
 *   - Times are floating local. A 10:10am class is 10:10am; we do not guess at
 *     the reader's timezone and we do not shift anyone's morning by five hours.
 *
 * Read-only toward Columbia: the only Columbia URL that appears is the Vergil
 * deep link a student would click themselves.
 *
 * Pure apart from `ics`. Importable from the MCP server and from a route handler.
 */

import { createEvents, type EventAttributes } from "ics";
import type { Course, Plan, Section, Term, TermCode, Weekday } from "../types";
import { WEEKDAY_LABEL, minutesToLabel, vergilSectionUrl } from "../constants";
import { courseLabel, sectionLabel } from "./timeline";
import { parseCalendarDate, termBounds } from "./term-dates";

/** RFC 5545 BYDAY codes, keyed by our own weekday codes. */
const ICS_BYDAY: Record<Weekday, string> = {
  Su: "SU",
  Mo: "MO",
  Tu: "TU",
  We: "WE",
  Th: "TH",
  Fr: "FR",
  Sa: "SA",
};

/** JS `Date.getDay()` index for each weekday code. */
const JS_DAY_INDEX: Record<Weekday, number> = {
  Su: 0,
  Mo: 1,
  Tu: 2,
  We: 3,
  Th: 4,
  Fr: 5,
  Sa: 6,
};

export interface PlanIcsInput {
  plan: Plan;
  sections: readonly Section[];
  /** Courses for those sections. Supplies the human title on each event. */
  courses?: readonly Course[];
  /** Real term bounds when the calendar lane has them. Otherwise estimated. */
  term?: Term;
}

export interface PlanIcsResult {
  /** The full calendar text, ready to write to a file or serve as text/calendar. */
  content: string;
  /** Suggested download name, e.g. `plan-a-fall-2026.ics`. */
  filename: string;
  /** How many VEVENTs were produced. Zero means nothing in the plan has a time. */
  eventCount: number;
  /** False when term bounds were estimated rather than read from a real calendar. */
  termDatesAreAuthoritative: boolean;
}

/**
 * First calendar date on or after `from` that falls on `weekday`.
 * Returns `[year, month, day]` with a 1-indexed month, the shape `ics` wants.
 */
export function firstOccurrence(
  from: readonly [number, number, number],
  weekday: Weekday,
): [number, number, number] {
  const cursor = new Date(from[0], from[1] - 1, from[2]);
  const delta = (JS_DAY_INDEX[weekday] - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + delta);
  return [cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()];
}

/**
 * `FREQ=WEEKLY` bounded by the last day of instruction.
 *
 * `UNTIL` is written as a floating date-time to match the floating `DTSTART`.
 * RFC 5545 requires the two to agree, and a `Z`-suffixed `UNTIL` against a local
 * `DTSTART` is exactly the mismatch that makes Google Calendar drop the last week.
 */
export function weeklyRule(weekday: Weekday, endsOn: string): string {
  const [year, month, day] = parseCalendarDate(endsOn);
  const until = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}T235959`;
  return `FREQ=WEEKLY;BYDAY=${ICS_BYDAY[weekday]};UNTIL=${until}`;
}

function timeParts(minute: number): [number, number] {
  return [Math.floor(minute / 60), minute % 60];
}

function locationOf(buildingName: string | null, room: string | null): string | undefined {
  const parts = [room, buildingName].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/** Uid stable across exports, so re-importing updates events instead of duplicating them. */
function uid(planId: string, itemId: string, weekday: Weekday, startMinute: number): string {
  return `${planId}-${itemId}-${weekday}-${startMinute}@columbia-catalog`;
}

function sectionDescription(
  section: Section,
  course: Course | undefined,
  meetingLabel: string,
): string {
  const lines = [
    course ? course.title : courseLabel(section.courseId),
    `Call number ${section.callNumber}`,
    meetingLabel,
  ];
  if (section.instructors.length > 0) lines.push(section.instructors.join(", "));
  if (section.sourceAsOf) lines.push(`Seat data as of ${section.sourceAsOf}`);
  // Deep link only. We never register anyone; this is the page they would open.
  lines.push(vergilSectionUrl(section.termCode, section.callNumber));
  return lines.join("\n");
}

/** Every VEVENT a plan implies, sections and custom blocks alike. */
export function planEvents(input: PlanIcsInput): EventAttributes[] {
  const { plan, sections } = input;
  const termCode: TermCode = plan.termCode;
  const bounds = termBounds(termCode, input.term);
  const start = parseCalendarDate(bounds.startsOn);
  const coursesById = new Map((input.courses ?? []).map((course) => [course.courseId, course]));

  const events: EventAttributes[] = [];

  for (const section of sections) {
    const course = coursesById.get(section.courseId);
    for (const meeting of section.meetings) {
      if (meeting.endMinute <= meeting.startMinute) continue;
      const day = firstOccurrence(start, meeting.weekday);
      const [startHour, startMin] = timeParts(meeting.startMinute);
      const [endHour, endMin] = timeParts(meeting.endMinute);
      const meetingLabel = `${WEEKDAY_LABEL[meeting.weekday]} ${minutesToLabel(
        meeting.startMinute,
      )}–${minutesToLabel(meeting.endMinute)}`;

      events.push({
        uid: uid(plan.planId, section.sectionId, meeting.weekday, meeting.startMinute),
        title: course
          ? `${sectionLabel(section)} — ${course.title}`
          : sectionLabel(section),
        start: [day[0], day[1], day[2], startHour, startMin],
        end: [day[0], day[1], day[2], endHour, endMin],
        startInputType: "local",
        startOutputType: "local",
        endInputType: "local",
        endOutputType: "local",
        recurrenceRule: weeklyRule(meeting.weekday, bounds.endsOn),
        location: locationOf(meeting.buildingName, meeting.room),
        description: sectionDescription(section, course, meetingLabel),
        url: vergilSectionUrl(section.termCode, section.callNumber),
        categories: ["Columbia", section.termCode],
        busyStatus: "BUSY",
        calName: plan.name,
      });
    }
  }

  for (const block of plan.customBlocks) {
    if (block.endMinute <= block.startMinute) continue;
    const day = firstOccurrence(start, block.weekday);
    const [startHour, startMin] = timeParts(block.startMinute);
    const [endHour, endMin] = timeParts(block.endMinute);

    events.push({
      uid: uid(plan.planId, block.blockId, block.weekday, block.startMinute),
      title: block.label,
      start: [day[0], day[1], day[2], startHour, startMin],
      end: [day[0], day[1], day[2], endHour, endMin],
      startInputType: "local",
      startOutputType: "local",
      endInputType: "local",
      endOutputType: "local",
      recurrenceRule: weeklyRule(block.weekday, bounds.endsOn),
      description: "Personal commitment, planned in Columbia Catalog.",
      categories: ["Personal"],
      busyStatus: "BUSY",
      calName: plan.name,
    });
  }

  return events;
}

/** Slug used for the download filename. */
export function icsFilename(plan: Plan): string {
  const slug = plan.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "plan"}-${plan.termCode}.ics`;
}

/**
 * Render a plan as an iCalendar document.
 *
 * Throws when `ics` rejects the event set — a malformed calendar is worse than
 * a visible failure, because the student would only find out when their week
 * silently did not appear.
 */
export function planToIcs(input: PlanIcsInput): PlanIcsResult {
  const events = planEvents(input);
  const bounds = termBounds(input.plan.termCode, input.term);

  if (events.length === 0) {
    // `ics` refuses an empty event list; an empty-but-valid calendar is a
    // friendlier answer than an exception for a plan that has no meeting times.
    return {
      content: emptyCalendar(input.plan.name),
      filename: icsFilename(input.plan),
      eventCount: 0,
      termDatesAreAuthoritative: bounds.isAuthoritative,
    };
  }

  const { error, value } = createEvents(events, {
    productId: "-//Columbia Catalog//Schedule//EN",
    calName: input.plan.name,
  });
  if (error || !value) {
    throw error ?? new Error("Calendar export produced no output");
  }

  return {
    content: value,
    filename: icsFilename(input.plan),
    eventCount: events.length,
    termDatesAreAuthoritative: bounds.isAuthoritative,
  };
}

function emptyCalendar(calName: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//Columbia Catalog//Schedule//EN",
    `X-WR-CALNAME:${calName}`,
    "END:VCALENDAR",
  ].join("\r\n");
}
