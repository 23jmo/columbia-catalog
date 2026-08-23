/**
 * Reads over `enrollment_snapshots`.
 *
 * The table is change-only: a row exists only where a reading differed from
 * the one before it for that section. Two consequences shape everything here.
 *
 * ── Consecutive rows really are consecutive readings ───────────────────────
 *
 * There is no gap-filling to do and no de-duplication to perform. Every row is
 * a moment something moved. That is why the feed below can be a plain
 * `order by observed_at desc limit n` and still be a true "what changed
 * recently" list rather than a sample of a polling log.
 *
 * ── A flat line is data, not missing data ──────────────────────────────────
 *
 * The absence of rows between two points means the count held steady, not that
 * we stopped looking. The chart draws with step-after interpolation for
 * exactly this reason (see components/charts/seat-history-chart.tsx): sloping
 * between two observations would claim seats drained at a steady rate they
 * never drained at.
 *
 * Both functions here read a world-readable table, so they work signed out.
 * Which sections a *particular* person cares about is the caller's business
 * and stays behind RLS in `watches`.
 */

import { createAnonServerClient, getBrowserClient, isConfigured } from "./client";
import type { EnrollmentStatusCode } from "@/lib/types";

/** Points per section on a chart read. Two terms of change history for a busy section. */
const MAX_HISTORY_POINTS = 500;

export interface SeatSnapshot {
  sectionId: string;
  observedAt: string;
  enrollmentCount: number;
  enrollmentCap: number | null;
  waitlistCount: number | null;
  status: EnrollmentStatusCode;
}

function readClient() {
  if (!isConfigured()) return null;
  return typeof window === "undefined" ? createAnonServerClient() : getBrowserClient();
}

/**
 * Full change history for one section, oldest first — the order a chart wants
 * to draw in.
 */
export async function getSeatHistory(sectionId: string): Promise<SeatSnapshot[]> {
  const db = readClient();
  if (!db) return [];

  const { data, error } = await db
    .from("enrollment_snapshots")
    .select("section_id, observed_at, enrollment_count, enrollment_cap, waitlist_count, status")
    .eq("section_id", sectionId)
    .order("observed_at", { ascending: true })
    .limit(MAX_HISTORY_POINTS);

  if (error) throw new Error(`getSeatHistory failed: ${error.message}`);
  return (data ?? []).map(toSnapshot);
}

/**
 * Change history for several sections at once, oldest first.
 *
 * The chart draws one line per section of a course, and a course can have
 * twenty. Calling `getSeatHistory` in a loop would be twenty round trips for
 * one page render, so this is a single `in` query grouped afterwards.
 *
 * The cap is per section and per read: `MAX_HISTORY_POINTS * sectionIds.length`
 * would let one very busy course pull tens of thousands of rows, so the limit
 * is applied per section after grouping. Rows arrive newest-first for that
 * reason — the truncation has to keep the *recent* end of a long history, and
 * a chart that silently dropped the last week to keep the first would be worse
 * than one that showed a shorter window.
 */
export async function getSeatHistoryForSections(
  sectionIds: string[],
): Promise<Map<string, SeatSnapshot[]>> {
  const grouped = new Map<string, SeatSnapshot[]>();
  if (sectionIds.length === 0) return grouped;

  const db = readClient();
  if (!db) return grouped;

  const { data, error } = await db
    .from("enrollment_snapshots")
    .select("section_id, observed_at, enrollment_count, enrollment_cap, waitlist_count, status")
    .in("section_id", sectionIds)
    .order("observed_at", { ascending: false })
    .limit(MAX_HISTORY_POINTS * Math.min(sectionIds.length, 40));

  if (error) throw new Error(`getSeatHistoryForSections failed: ${error.message}`);

  for (const row of data ?? []) {
    const bucket = grouped.get(row.section_id);
    if (bucket) {
      if (bucket.length < MAX_HISTORY_POINTS) bucket.push(toSnapshot(row));
    } else {
      grouped.set(row.section_id, [toSnapshot(row)]);
    }
  }

  // Back to oldest-first, which is the order a chart draws in.
  for (const bucket of grouped.values()) bucket.reverse();
  return grouped;
}

/**
 * The most recent movements across a set of sections, newest first — the Home
 * feed in spec §5.
 *
 * Deliberately not filtered to "seats opened". A section going from 3 open to
 * 1 open is the movement that tells someone to stop deliberating, and hiding
 * it would leave the feed showing only good news.
 */
export async function getRecentSeatMovement(
  sectionIds: string[],
  limit = 20,
): Promise<SeatSnapshot[]> {
  if (sectionIds.length === 0) return [];
  const db = readClient();
  if (!db) return [];

  const { data, error } = await db
    .from("enrollment_snapshots")
    .select("section_id, observed_at, enrollment_count, enrollment_cap, waitlist_count, status")
    .in("section_id", sectionIds)
    .order("observed_at", { ascending: false })
    .limit(limit);

  // Never throws: the feed is the least important thing on Home, and it must
  // not be able to take the week grid down with it.
  if (error) return [];
  return (data ?? []).map(toSnapshot);
}

function toSnapshot(row: {
  section_id: string;
  observed_at: string;
  enrollment_count: number;
  enrollment_cap: number | null;
  waitlist_count: number | null;
  status: string;
}): SeatSnapshot {
  return {
    sectionId: row.section_id,
    observedAt: row.observed_at,
    enrollmentCount: row.enrollment_count,
    enrollmentCap: row.enrollment_cap,
    waitlistCount: row.waitlist_count,
    status: row.status as EnrollmentStatusCode,
  };
}
