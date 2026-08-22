import type { Credits, Enrollment, Meeting, Section } from "./types";

export function formatCredits(credits: Credits): string {
  if (credits.min === credits.max) {
    return credits.min === 1 ? "1 pt" : `${credits.min} pts`;
  }
  return `${credits.min}–${credits.max} pts`;
}

export function formatEnrollment(enrollment: Enrollment): string {
  return `${enrollment.enrolled}/${enrollment.capacity}`;
}

export function remainingSeats(enrollment: Enrollment): number {
  return Math.max(0, enrollment.capacity - enrollment.enrolled);
}

export function formatMeeting(meeting: Meeting): string {
  const when = `${meeting.days} ${meeting.start}–${meeting.end}`;
  return meeting.location ? `${when} · ${meeting.location}` : when;
}

export function formatFetchedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function courseHeading(section: Section): string {
  return section.courseIdentifier;
}
