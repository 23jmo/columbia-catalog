/**
 * The two reads the course surface needs that nothing else does: the seat
 * chart's series (including the prior-term ghost line) and the registration
 * milestones drawn over it.
 *
 * These live here rather than in `lib/db/seat-history.ts` because that file is
 * generic — "read enrollment_snapshots" — while this one knows what a *chart*
 * wants: which sections belong on it, what to call each line, and which of them
 * is history rather than this term.
 *
 * ── The ghost line is the point (spec §13) ─────────────────────────────────
 *
 * A Fall 2026 line on its own says "37 of 60, holding". The same course's Fall
 * 2025 line behind it says whether 37 at this date is early-and-calm or
 * late-and-nearly-gone. Without it the chart shows movement with no scale to
 * judge it by, which is most of what a student actually wants to know.
 *
 * Ghosts come from the same season where one exists (Fall against Fall), for
 * the same reason `typical_meetings` prefers same-season patterns: a spring
 * offering of a fall course fills on a different calendar and comparing them
 * would mislead more than it informed.
 */

import { createAnonServerClient, getBrowserClient, isConfigured } from "./client";
import { getSeatHistoryForSections, type SeatSnapshot } from "./seat-history";
import type {
  EnrollmentSnapshot,
  RegistrationMilestone,
  RegistrationMilestoneKind,
  TermCode,
} from "@/lib/types";

/** How many prior offerings to draw behind the live lines. One is legible; three is soup. */
const MAX_GHOST_TERMS = 1;

/** Ghost lines are the busiest sections of the prior term, not all of them. */
const MAX_GHOST_SERIES = 3;

export interface CourseHistorySeries {
  seriesId: string;
  label: string;
  points: EnrollmentSnapshot[];
  isGhost?: boolean;
}

function readClient() {
  if (!isConfigured()) return null;
  return typeof window === "undefined" ? createAnonServerClient() : getBrowserClient();
}

/**
 * A chart point needs a cap to be drawn against the capacity line, and
 * `EnrollmentSnapshot` says so in its type. Every row we hold today has one;
 * a capless reading is dropped rather than given an invented ceiling, because
 * the alternative is a point that appears to sit at a fraction of a capacity
 * nobody published.
 */
function toChartPoints(snapshots: SeatSnapshot[]): EnrollmentSnapshot[] {
  return snapshots.flatMap((snapshot) =>
    snapshot.enrollmentCap === null
      ? []
      : [{ ...snapshot, enrollmentCap: snapshot.enrollmentCap }],
  );
}

interface PriorSectionRow {
  section_id: string;
  section_code: string;
  term_code: string;
  enrollment_count: number | null;
}

/**
 * Prior offerings of this course, most recent first, preferring the same
 * season. Returns at most `MAX_GHOST_TERMS` terms' worth.
 */
async function findGhostSections(
  courseId: string,
  termCode: TermCode,
): Promise<PriorSectionRow[]> {
  const db = readClient();
  if (!db) return [];

  const { data, error } = await db
    .from("sections")
    .select("section_id, section_code, term_code, enrollment_count")
    .eq("course_id", courseId)
    .lt("term_code", termCode)
    // A section Columbia withdrew should not shape "what this course is
    // usually like": its enrollment is frozen at whatever it read when the
    // section was pulled, which is not a term that ran.
    .is("withdrawn_at", null)
    .order("term_code", { ascending: false });

  if (error || !data) return [];

  const season = termCode.slice(-1);
  const terms = [...new Set(data.map((row) => row.term_code))].sort((a, b) => {
    const sameSeason = Number(b.endsWith(season)) - Number(a.endsWith(season));
    return sameSeason !== 0 ? sameSeason : b.localeCompare(a);
  });

  const chosen = new Set(terms.slice(0, MAX_GHOST_TERMS));
  return data
    .filter((row) => chosen.has(row.term_code))
    .sort((a, b) => (b.enrollment_count ?? 0) - (a.enrollment_count ?? 0))
    .slice(0, MAX_GHOST_SERIES);
}

/**
 * Section codes for the legend.
 *
 * A `sectionId` ends in its section code today, so slicing it would usually
 * work — and would print nonsense the first time a section code is not three
 * characters. The legend is the label a student reads next to a line; it is
 * worth one query.
 */
async function sectionCodes(sectionIds: string[]): Promise<Map<string, string>> {
  const codes = new Map<string, string>();
  if (sectionIds.length === 0) return codes;

  const db = readClient();
  if (!db) return codes;

  /*
   * Deliberately NOT filtered on `withdrawn_at`. This resolves ids the caller
   * already holds into labels; filtering here would blank the label for a row
   * that plainly exists, turning a withdrawn section into an unnamed one
   * rather than an absent one. Absence is decided by the queries above.
   */
  const { data } = await db
    .from("sections")
    .select("section_id, section_code")
    .in("section_id", sectionIds);

  for (const row of data ?? []) codes.set(row.section_id, row.section_code);
  return codes;
}

/** "20253" → "Fall 2025". Local so this module does not depend on term metadata. */
function termLabel(termCode: string): string {
  const year = termCode.slice(0, 4);
  const season = { "1": "Spring", "2": "Summer", "3": "Fall" }[termCode.slice(-1)] ?? "Term";
  return `${season} ${year}`;
}

export async function loadCourseSeatHistory(args: {
  sectionIds: string[];
  courseId: string;
  termCode: TermCode;
}): Promise<{ series: CourseHistorySeries[]; milestones: RegistrationMilestone[] }> {
  const [live, labels, ghostSections, milestones] = await Promise.all([
    getSeatHistoryForSections(args.sectionIds),
    sectionCodes(args.sectionIds),
    findGhostSections(args.courseId, args.termCode),
    getRegistrationMilestones(args.termCode),
  ]);

  const series: CourseHistorySeries[] = [];

  // Live lines in the caller's order, which is the order the sections panel
  // lists them — so the legend and the list agree.
  for (const sectionId of args.sectionIds) {
    const points = toChartPoints(live.get(sectionId) ?? []);
    // A section with no readings yet contributes no line. The chart's own
    // empty state is a better answer than a legend entry for a flat nothing.
    if (points.length === 0) continue;
    series.push({
      seriesId: sectionId,
      label: `Section ${labels.get(sectionId) ?? sectionId.slice(-3)}`,
      points,
    });
  }

  if (ghostSections.length > 0) {
    const ghostHistory = await getSeatHistoryForSections(
      ghostSections.map((row) => row.section_id),
    );
    for (const row of ghostSections) {
      const points = toChartPoints(ghostHistory.get(row.section_id) ?? []);
      if (points.length === 0) continue;
      series.push({
        // Namespaced so a section id reused across terms cannot collide with a
        // live series key.
        seriesId: `${row.section_id}@${row.term_code}`,
        label: `${termLabel(row.term_code)} · ${row.section_code}`,
        points,
        isGhost: true,
      });
    }
  }

  return { series, milestones };
}

/**
 * Registration milestones for a term.
 *
 * Populated from the Columbia College bulletin's academic calendar, which
 * publishes the same dates the registrar does without the bot challenge that
 * made the registrar unreachable (.plans/BLOCKERS.md #4).
 *
 * Still returns an empty list rather than throwing for a term with no calendar
 * ingested — every term before Fall 2026 is in that position, and an
 * annotation layer must not be able to take the chart down.
 */
export async function getRegistrationMilestones(
  termCode: TermCode,
): Promise<RegistrationMilestone[]> {
  const db = readClient();
  if (!db) return [];

  const { data, error } = await db
    .from("registration_milestones")
    .select("term_code, kind, label, occurs_at")
    .eq("term_code", termCode)
    .order("occurs_at", { ascending: true });

  // Never throws: an annotation layer must not be able to take the chart down.
  if (error || !data) return [];

  return data.map((row) => ({
    termCode: row.term_code as TermCode,
    kind: row.kind as RegistrationMilestoneKind,
    label: row.label,
    occursAt: row.occurs_at,
  }));
}
