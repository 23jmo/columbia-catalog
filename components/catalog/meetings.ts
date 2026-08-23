import type { Meeting, Section, Weekday } from "@/lib/types";
import { ALL_WEEKDAYS, WEEKDAY_SHORT, minutesToLabel } from "@/lib/constants";

/**
 * Meeting-pattern formatting shared by the course and section rows.
 *
 * The directory publishes one row per weekday. Students read schedules as
 * "MoWe 10:10am-11:25am", so identical time blocks are collapsed back into a
 * single pattern before rendering.
 */

export interface MeetingPattern {
  /** Weekdays in calendar order, e.g. ["Mo", "We"]. */
  days: Weekday[];
  startMinute: number;
  endMinute: number;
  location: string | null;
}

const WEEKDAY_ORDER = new Map<Weekday, number>(ALL_WEEKDAYS.map((d, i) => [d, i]));

function locationOf(meeting: Meeting): string | null {
  if (!meeting.buildingName && !meeting.room) return null;
  return [meeting.buildingName, meeting.room].filter(Boolean).join(" ");
}

/** Collapse per-day meeting rows into distinct time-and-place patterns. */
export function toMeetingPatterns(meetings: Meeting[]): MeetingPattern[] {
  const byBlock = new Map<string, MeetingPattern>();

  for (const meeting of meetings) {
    const location = locationOf(meeting);
    const key = `${meeting.startMinute}-${meeting.endMinute}-${location ?? ""}`;
    const existing = byBlock.get(key);
    if (existing) {
      if (!existing.days.includes(meeting.weekday)) existing.days.push(meeting.weekday);
    } else {
      byBlock.set(key, {
        days: [meeting.weekday],
        startMinute: meeting.startMinute,
        endMinute: meeting.endMinute,
        location,
      });
    }
  }

  const patterns = [...byBlock.values()];
  for (const pattern of patterns) {
    pattern.days.sort((a, b) => (WEEKDAY_ORDER.get(a) ?? 0) - (WEEKDAY_ORDER.get(b) ?? 0));
  }
  return patterns.sort((a, b) => a.startMinute - b.startMinute);
}

/** "MoWe 10:10am-11:25am" */
export function formatPattern(pattern: MeetingPattern): string {
  const days = pattern.days.map((d) => WEEKDAY_SHORT[d]).join("");
  return `${days} ${minutesToLabel(pattern.startMinute)}-${minutesToLabel(pattern.endMinute)}`;
}

/**
 * One line for a section's whole meeting pattern. Returns null when the
 * directory published no times -- callers say so rather than inventing a
 * placeholder, because "time not published" is real information.
 */
export function formatSectionMeetings(section: Pick<Section, "meetings">): string | null {
  if (section.meetings.length === 0) return null;
  return toMeetingPatterns(section.meetings).map(formatPattern).join(", ");
}

/** Distinct instructors across a course's sections, in first-seen order. */
export function courseInstructors(sections: Pick<Section, "instructors">[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const section of sections) {
    for (const name of section.instructors) {
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

/** "4 credits" / "3-4 credits" / null when the catalog has no points. */
export function formatCredits(pointsMin: number | null, pointsMax: number | null): string | null {
  if (pointsMin === null && pointsMax === null) return null;
  const lo = pointsMin ?? pointsMax;
  const hi = pointsMax ?? pointsMin;
  if (lo === null || hi === null) return null;
  const value = lo === hi ? String(lo) : `${lo}-${hi}`;
  return `${value} ${hi === 1 && lo === 1 ? "credit" : "credits"}`;
}

/** "COMS 4118" from the parts the catalog stores separately. */
export function formatCourseCode(subjectCode: string, number: number): string {
  return `${subjectCode} ${number}`;
}
