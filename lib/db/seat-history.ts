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
