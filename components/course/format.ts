/**
 * Presentation helpers local to the course drawer.
 *
 * Nothing here is domain logic another lane would want — it is string shaping
 * for this surface only. Shared vocabulary (weekday labels, minute → clock)
 * comes from `@/lib/constants`.
 */

import { minutesToLabel, WEEKDAY_SHORT } from "@/lib/constants";
import type { CampusZone, Meeting, Section, Weekday } from "@/lib/types";

/** "COMS4118W" → "COMS 4118". The qualifier letter is registrar plumbing. */
export function courseCodeLabel(subjectCode: string, number: number): string {
  return `${subjectCode} ${number}`;
}

/** Title Case a registrar ALL-CAPS title without mangling acronyms of ≤3 chars. */
export function prettyTitle(title: string): string {
  if (title !== title.toUpperCase()) return title;
  const small = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
  return title
    .toLowerCase()
    .split(/(\s+|[-/])/)
    .map((word, index) => {
      if (!/[a-z]/.test(word)) return word;
      if (index > 0 && small.has(word)) return word;
      if (word.length <= 2 && /^(ii|iv|vi|ix|xi)$/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");
}

export function creditsLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const lo = min ?? max;
  const hi = max ?? min;
  if (lo == null || hi == null) return null;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (lo === hi) return `${fmt(lo)} ${lo === 1 ? "credit" : "credits"}`;
  return `${fmt(lo)}–${fmt(hi)} credits`;
}

/** Groups meetings that share a time+place into one "MoWe 10:10–11:25am" line. */
export interface MeetingLine {
  days: Weekday[];
  daysLabel: string;
  timeLabel: string;
  placeLabel: string | null;
  startMinute: number;
  endMinute: number;
}

export function meetingLines(meetings: Meeting[]): MeetingLine[] {
  const buckets = new Map<string, MeetingLine>();
  for (const meeting of meetings) {
    const place = [meeting.buildingName, meeting.room].filter(Boolean).join(" ") || null;
    const key = `${meeting.startMinute}-${meeting.endMinute}-${place ?? ""}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.days.push(meeting.weekday);
      existing.daysLabel = existing.days.map((d) => WEEKDAY_SHORT[d]).join("");
      continue;
    }
    buckets.set(key, {
      days: [meeting.weekday],
      daysLabel: WEEKDAY_SHORT[meeting.weekday],
      timeLabel: `${minutesToLabel(meeting.startMinute)}–${minutesToLabel(meeting.endMinute)}`,
      placeLabel: place,
      startMinute: meeting.startMinute,
      endMinute: meeting.endMinute,
    });
  }
  return [...buckets.values()].sort((a, b) => a.startMinute - b.startMinute);
}

export function meetingSummary(meetings: Meeting[]): string | null {
  const lines = meetingLines(meetings);
  if (lines.length === 0) return null;
  return lines.map((line) => `${line.daysLabel} ${line.timeLabel}`).join(" · ");
}

export function placeSummary(meetings: Meeting[]): string | null {
  const places = [...new Set(meetingLines(meetings).map((l) => l.placeLabel).filter(Boolean))];
  return places.length ? (places as string[]).join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

export interface SeatReading {
  /** null when the directory never published a cap. */
  remaining: number | null;
  enrolled: number | null;
  capacity: number | null;
  /** 0–1, null when unknowable. */
  fillRatio: number | null;
  waitlistCount: number | null;
  waitlistCap: number | null;
  /** Short human phrase. Never conveys state by colour alone (spec §18). */
  headline: string;
  tone: "open" | "tight" | "full" | "waitlist" | "unknown";
}

export function readSeats(section: Pick<Section,
  "enrollmentCount" | "enrollmentCap" | "waitlistCount" | "waitlistCap" | "status">): SeatReading {
  const enrolled = section.enrollmentCount;
  const capacity = section.enrollmentCap;
  const remaining = enrolled != null && capacity != null ? Math.max(0, capacity - enrolled) : null;
  const fillRatio = enrolled != null && capacity != null && capacity > 0
    ? Math.min(1, enrolled / capacity)
    : null;

  let tone: SeatReading["tone"] = "unknown";
  let headline = "Seat count unavailable";

  if (section.status === "waitlist" || (section.waitlistCount ?? 0) > 0) {
    tone = "waitlist";
    headline = section.waitlistCount != null
      ? `Waitlist · ${section.waitlistCount} waiting`
      : "Waitlist open";
  } else if (remaining != null && capacity != null) {
    if (remaining === 0 || section.status === "full" || section.status === "closed") {
      tone = "full";
      headline = "Full";
    } else if (fillRatio != null && fillRatio >= 0.9) {
      tone = "tight";
      headline = `${remaining} of ${capacity} seats left`;
    } else {
      tone = "open";
      headline = `${remaining} of ${capacity} seats left`;
    }
  } else if (section.status === "full" || section.status === "closed") {
    tone = "full";
    headline = "Full";
  } else if (section.status === "open") {
    tone = "open";
    headline = "Open";
  }

  return {
    remaining,
    enrolled,
    capacity,
    fillRatio,
    waitlistCount: section.waitlistCount,
    waitlistCap: section.waitlistCap,
    headline,
    tone,
  };
}

/**
 * The directory hands us its own "as of" string — sometimes ISO, sometimes
 * "August 22, 2026", sometimes with a "/ Full" suffix glued on. Whatever it
 * hands us travels with the number (spec §3, principle 2). We normalise for
 * display but never invent a timestamp we were not given.
 */
export function provenanceLabel(sourceAsOf: string | null): string | null {
  if (!sourceAsOf) return null;
  const cleaned = sourceAsOf.replace(/\s*\/\s*(Full|Open|Closed|Waitlist)\s*$/i, "").trim();
  if (!cleaned) return null;
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return parsed.toLocaleString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return cleaned;
}

export function instructorLabel(instructors: string[]): string {
  if (instructors.length === 0) return "Instructor TBA";
  if (instructors.length <= 2) return instructors.join(" · ");
  return `${instructors[0]} +${instructors.length - 1} more`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Campus geography
// ---------------------------------------------------------------------------

const ZONE_HINTS: { zone: CampusZone; test: RegExp }[] = [
  { zone: "barnard", test: /barnard|milbank|diana|altschul|lehman hall|sulzberger|milstein/i },
  { zone: "manhattanville", test: /lenfest|jerome greene|the forum|studebaker|nash building|manhattanville/i },
  { zone: "cuimc", test: /hammer|black building|vagelos|presbyterian|haven ave|russ berrie|allan rosenfield/i },
  {
    zone: "morningside",
    test: /mudd|pupin|hamilton|butler|uris|schermerhorn|havemeyer|lerner|dodge|avery|fayerweather|kent|international affairs|northwest corner|knox|low library|philosophy hall|mathematics|chandler|engineering terrace|schapiro|casa italiana|journalism|st\.? paul/i,
  },
];

/** Local fallback used until the geocoding lane supplies a real mapping. */
export function guessCampusZone(buildingName: string | null): CampusZone {
  if (!buildingName) return "unknown";
  for (const hint of ZONE_HINTS) if (hint.test.test(buildingName)) return hint.zone;
  return "unknown";
}
