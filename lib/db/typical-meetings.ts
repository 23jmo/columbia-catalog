/**
 * Historical meeting times, never presented as current ones.
 *
 * Columbia stopped publishing meeting days, times and rooms in the public
 * directory after Spring 2025 (.plans/BLOCKERS.md #5). The catalog still holds
 * real times for earlier terms, and a course that met TR 11:40 the last time it
 * ran will probably meet at a similar time again — but probably is not a fact.
 *
 * Every type in this file carries `sourceTerm` next to the times, and nothing
 * exported here produces a `Meeting` that would be indistinguishable from a
 * confirmed one. That is deliberate: the moment these can be passed to a
 * component that renders meetings, someone will, and the label will be lost.
 *
 * Hard conflicts must not be raised from these. "You cannot be in two places at
 * once" is a claim about the actual timetable; two historical patterns
 * overlapping means "these usually clash", which is a warning, not an error.
 */

import type { CourseWithSections, Meeting, Weekday } from "@/lib/types";

import { getBrowserClient, createAnonServerClient, isConfigured } from "./client";

const RPC_CHUNK = 500;

function typicalToMeeting(meeting: TypicalMeeting): Meeting {
  return {
    weekday: meeting.weekday,
    startMinute: meeting.startMinute,
    endMinute: meeting.endMinute,
    buildingName: meeting.buildingName,
    room: meeting.room,
  };
}

export interface TypicalMeeting {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  buildingId: string | null;
  buildingName: string | null;
  room: string | null;
}

export interface TypicalMeetingPattern {
  sectionId: string;
  /** The term these times were actually observed in, e.g. "20251". */
  sourceTerm: string;
  /** Section code they were observed under — same code, previous term. */
  sourceSection: string;
  meetings: TypicalMeeting[];
}

/**
 * Patterns for whichever of `sectionIds` have no meetings of their own.
 *
 * Sections that already have real times are absent from the result rather than
 * present with a duplicate, so a caller merging this in cannot accidentally
 * shadow confirmed data with a guess.
 *
 * Never throws. A missing historical pattern is a missing hint; it must not
 * take a course page down.
 */
export async function getTypicalMeetings(
  sectionIds: string[],
): Promise<Map<string, TypicalMeetingPattern>> {
  const out = new Map<string, TypicalMeetingPattern>();
  if (sectionIds.length === 0 || !isConfigured()) return out;

  const client =
    typeof window === "undefined" ? createAnonServerClient() : getBrowserClient();
  if (!client) return out;

  const { data, error } = await client.rpc("typical_meetings", {
    p_section_ids: sectionIds,
  });
  if (error || !data) return out;

  for (const row of data) {
    const existing = out.get(row.section_id);
    const meeting: TypicalMeeting = {
      weekday: row.weekday,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      buildingId: row.building_id,
      buildingName: row.building_name,
      room: row.room,
    };
    if (existing) {
      existing.meetings.push(meeting);
    } else {
      out.set(row.section_id, {
        sectionId: row.section_id,
        sourceTerm: row.source_term,
        sourceSection: row.source_section,
        meetings: [meeting],
      });
    }
  }
  return out;
}

/**
 * Deep-clone courses and attach historical meeting patterns on sections that
 * have none. Used only when building the search index so day/time filters have
 * something to match — the DISP block still comes from the un-enriched catalog
 * so the UI never presents a guess as a confirmed time.
 */
export async function cloneCoursesWithTypicalMeetings(
  courses: CourseWithSections[],
): Promise<{ courses: CourseWithSections[]; enrichedSections: number }> {
  const cloned = JSON.parse(JSON.stringify(courses)) as CourseWithSections[];
  const bareIds = cloned.flatMap((course) =>
    course.sections.filter((section) => section.meetings.length === 0).map((s) => s.sectionId),
  );
  if (bareIds.length === 0 || !isConfigured()) {
    return { courses: cloned, enrichedSections: 0 };
  }

  let enrichedSections = 0;
  for (let i = 0; i < bareIds.length; i += RPC_CHUNK) {
    const patterns = await getTypicalMeetings(bareIds.slice(i, i + RPC_CHUNK));
    if (patterns.size === 0) continue;

    for (const course of cloned) {
      for (const section of course.sections) {
        const pattern = patterns.get(section.sectionId);
        if (!pattern || section.meetings.length > 0) continue;
        section.meetings = pattern.meetings.map(typicalToMeeting);
        enrichedSections++;
      }
    }
  }

  return { courses: cloned, enrichedSections };
}
