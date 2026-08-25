import { RiCalendarLine } from "@remixicon/react";

import { WEEKDAY_LABEL, WEEKDAY_SHORT, ZONE_LABEL } from "@/lib/constants";
import type { Meeting, Weekday } from "@/lib/types";
import { cx } from "@/utils/cx";

import { guessCampusZone, meetingLines, type MeetingLine } from "./format";

/**
 * When and where a section meets — drawn, not spelled out.
 *
 * "TuTh 10:10am–11:25am" is a string a reader has to parse: find the day
 * codes, remember that Th is Thursday and not Tuesday, then place them in the
 * week. A filled-in week strip is answered by the shape alone, before any
 * reading happens, which is the difference between a fact you look up and one
 * you absorb while scanning. Every student who opens this surface is asking
 * "does this collide with what I already have" — a question about position in
 * the week, so the answer should have a position in the week.
 *
 * The letters stay under the cells rather than being replaced by colour: seat
 * state is not the only thing this product refuses to convey by colour alone
 * (spec §18), and a strip of unlabelled squares would be exactly that.
 *
 * ── One row per distinct time, not one row per meeting ─────────────────────
 *
 * `meetingLines` has already collapsed "Tuesday 10:10" + "Thursday 10:10" into
 * a single line with two days. A lecture that also has a Friday lab at another
 * hour stays two lines, because those are genuinely two commitments — and each
 * carries its own room, so the Friday row can name Pupin while the lecture row
 * names Hamilton. The old aggregated `placeSummary` joined both into one
 * "Hamilton Hall 517 · Pupin 301" string that told you the rooms but not which
 * was which.
 */

/** Monday-first, the way a student reads a week. `ALL_WEEKDAYS` starts Sunday. */
const WEEK_ORDER: Weekday[] = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const WEEKDAY_CORE: Weekday[] = ["Mo", "Tu", "We", "Th", "Fr"];

/** "Mo" → "M", "Th" → "T". Calendars have always doubled up T and S. */
function dayInitial(day: Weekday): string {
  return WEEKDAY_SHORT[day].charAt(0);
}

function daySentence(days: Weekday[]): string {
  const names = days.map((day) => WEEKDAY_LABEL[day]);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function WeekStrip({ days, className }: { days: Weekday[]; className?: string }) {
  const active = new Set(days);
  // Weekend columns only exist when something actually meets there — a strip
  // that is empty two sevenths of the time is two sevenths noise.
  const columns = WEEK_ORDER.filter((day) => WEEKDAY_CORE.includes(day) || active.has(day));

  return (
    <div className={cx("flex shrink-0 items-center gap-1", className)}>
      <span className="sr-only">{daySentence(days)}</span>
      {columns.map((day) => (
        <span
          key={day}
          aria-hidden
          className={cx(
            "inline-flex size-7 items-center justify-center rounded-md",
            "text-caption-1-semibold tracking-normal",
            active.has(day)
              ? "bg-accent-600 text-text-white"
              : "bg-background-tertiary-default text-text-tertiary",
          )}
        >
          {dayInitial(day)}
        </span>
      ))}
    </div>
  );
}

/**
 * Where a meeting happens, or that we do not know yet.
 *
 * The unknown case used to render nothing at all, which left a row showing a
 * confident time above empty space — indistinguishable from a room that simply
 * had not loaded. Saying "Location TBD" costs one line and answers the question
 * the blank space raised, so nobody goes hunting for a room that was never
 * printed.
 */
function PlaceLine({ place }: { place: string | null }) {
  if (!place) {
    return <p className="text-caption-1-regular text-text-tertiary">Location TBD</p>;
  }

  const zone = guessCampusZone(place);
  const zoneLabel = zone === "unknown" || zone === "other" ? null : ZONE_LABEL[zone];
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="text-caption-1-regular text-text-secondary">{place}</p>
      {zoneLabel ? (
        <p className="text-caption-1-regular text-text-tertiary">{zoneLabel}</p>
      ) : null}
    </div>
  );
}

function ScheduleRow({ line }: { line: MeetingLine }) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      {/*
        Top-align the strip with the time headline so a chip in the same row
        can share the strip's top edge instead of floating against the row's
        vertical center (which includes the room line below).
      */}
      <WeekStrip days={line.days} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-headline-medium tabular-nums text-text-primary">{line.timeLabel}</p>
        <PlaceLine place={line.placeLabel} />
      </div>
    </div>
  );
}

/**
 * The whole schedule block. Renders its own unknown state rather than making
 * every caller decide what an empty meeting list looks like — a section with no
 * published times is common (independent study, some seminars) and is not an
 * error.
 *
 * ── "Time TBD", not "No meeting pattern published" ─────────────────────────
 *
 * The old wording was the registrar's sentence, not the student's. "Meeting
 * pattern" is scheduling-office vocabulary, and putting "No …" in front of it
 * reads as a failure — the same shape as "no results", which is what a blank
 * row already looks like. Students met the phrase and asked whether the page
 * was broken.
 *
 * "TBD" is the answer to the question actually being asked, in the words the
 * rest of the catalog already uses for a fact that is not in yet, and it stays
 * true whether the time is genuinely undecided or merely not published here.
 */
export function MeetingSchedule({
  meetings,
  className,
}: {
  meetings: Meeting[];
  className?: string;
}) {
  const lines = meetingLines(meetings);

  if (lines.length === 0) {
    return (
      <p className={cx("flex items-center gap-2 text-body-regular text-text-tertiary", className)}>
        <RiCalendarLine aria-hidden className="size-4 shrink-0" />
        Time TBD
      </p>
    );
  }

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      {lines.map((line) => (
        <ScheduleRow key={`${line.daysLabel}-${line.timeLabel}-${line.placeLabel ?? ""}`} line={line} />
      ))}
    </div>
  );
}
