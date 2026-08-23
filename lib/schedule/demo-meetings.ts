/**
 * Schedule lane — meeting-time scaffolding for the seed extract. UI ONLY.
 *
 * ⚠️  This is the one place in the lane that invents data, and it exists for a
 * single reason: the Fall 2026 seed in `lib/seed/coms-fall2026.json` carries
 * real courses, real call numbers, real seat counts and real instructors — but
 * every `meetings` array is empty, because the directory subject page does not
 * print times. The bulletin parser is the lane that fills them in (spec §10:
 * "Bulletin rows carry the meeting times the directory omits").
 *
 * Until that lands, a week grid built on the seed would be blank, and a blank
 * grid cannot be designed, reviewed, or tested. So the schedule screen runs the
 * seed through `withDemoMeetings` first.
 *
 * Three properties keep this honest:
 *
 *   1. It is a NO-OP on any section that already has meetings. The moment real
 *      times arrive, this function stops touching them, and it can be deleted.
 *   2. Nothing in `lib/schedule` other than the screen calls it. Conflict,
 *      commute, credit and `.ics` logic never sees it, and neither does the MCP
 *      lane — they operate on whatever `Section[]` they are handed.
 *   3. It is deterministic: the same section always gets the same slot, so the
 *      grid does not reshuffle between renders.
 *
 * TODO(ingest): delete this file once the bulletin parser populates
 * `Section.meetings`. Callers keep working — `withDemoMeetings` is identity on
 * sections that already have times.
 */

import type { Meeting, Section, Weekday } from "../types";

interface DemoSlot {
  days: Weekday[];
  startMinute: number;
  endMinute: number;
}

/** Columbia's real standard meeting patterns, in the order the registrar fills them. */
const SLOTS: DemoSlot[] = [
  { days: ["Mo", "We"], startMinute: 8 * 60 + 40, endMinute: 9 * 60 + 55 },
  { days: ["Tu", "Th"], startMinute: 10 * 60 + 10, endMinute: 11 * 60 + 25 },
  { days: ["Mo", "We"], startMinute: 10 * 60 + 10, endMinute: 11 * 60 + 25 },
  { days: ["Tu", "Th"], startMinute: 11 * 60 + 40, endMinute: 12 * 60 + 55 },
  { days: ["Mo", "We"], startMinute: 13 * 60 + 10, endMinute: 14 * 60 + 25 },
  { days: ["Tu", "Th"], startMinute: 14 * 60 + 40, endMinute: 15 * 60 + 55 },
  { days: ["Mo", "We"], startMinute: 16 * 60 + 10, endMinute: 17 * 60 + 25 },
  { days: ["Fr"], startMinute: 10 * 60 + 10, endMinute: 12 * 60 },
  { days: ["Tu"], startMinute: 18 * 60 + 10, endMinute: 20 * 60 + 40 },
  { days: ["We"], startMinute: 19 * 60, endMinute: 21 * 60 + 30 },
];

/** Rooms CS and its neighbours actually use, plus one Manhattanville building. */
const PLACES: { buildingName: string; room: string }[] = [
  { buildingName: "Seeley W. Mudd Building", room: "833" },
  { buildingName: "Seeley W. Mudd Building", room: "545" },
  { buildingName: "Northwest Corner Building", room: "501" },
  { buildingName: "Pupin Laboratories", room: "428" },
  { buildingName: "Mathematics Building", room: "417" },
  { buildingName: "Havemeyer Hall", room: "309" },
  { buildingName: "Schermerhorn Hall", room: "614" },
  { buildingName: "Alfred Lerner Hall", room: "555" },
  { buildingName: "Uris Hall", room: "301" },
  { buildingName: "Jerome L. Greene Science Center", room: "L5-084" },
];

/** Stable non-cryptographic hash so a section keeps its slot across reloads. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Times for one section. Identity when the section already has real ones. */
export function demoMeetings(section: Section): Meeting[] {
  if (section.meetings.length > 0) return section.meetings;

  const seed = hash(section.sectionId);
  const slot = SLOTS[seed % SLOTS.length];
  const place = PLACES[(seed >> 3) % PLACES.length];

  return slot.days.map((weekday) => ({
    weekday,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    buildingName: place.buildingName,
    room: place.room,
  }));
}

/** One section, with times filled in only if it had none. */
export function withDemoMeetings(section: Section): Section {
  if (section.meetings.length > 0) return section;
  return { ...section, meetings: demoMeetings(section) };
}

/** Convenience for a whole list. */
export function withDemoMeetingsAll(sections: readonly Section[]): Section[] {
  return sections.map(withDemoMeetings);
}

/** True when every meeting on a section came from this file rather than ingest. */
export function isDemoTimed(section: Section, original: Section): boolean {
  return original.meetings.length === 0 && section.meetings.length > 0;
}
