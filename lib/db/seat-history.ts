/**
 * Reads over `enrollment_snapshots`.
 *
 * The table is append-only and records every look: a poll that sees the same
 * count as last time still writes a row. Two consequences shape everything here.
 *
 * ── Consecutive rows are consecutive looks, not consecutive changes ────────
 *
 * A flat stretch of equal counts is proof we kept checking. Charts still draw
 * with step-after interpolation (see components/charts/seat-history-chart.tsx)
 * so equal points stay flat and a real jump stays a jump, never a slope.
 *
 * ── The Home movement feed is the exception ────────────────────────────────
 *
 * That feed wants changes, not heartbeats. `keepChangedReadings` drops rows
 * whose seat fields match the previous look for that section.
 *
 * Both functions here read a world-readable table, so they work signed out.
 * Which sections a *particular* person cares about is the caller's business
 * and stays behind RLS in `watches`.
 */

import { createAnonServerClient, getBrowserClient, isConfigured } from "./client";
import type { EnrollmentStatusCode } from "@/lib/types";

/** Points per section on a chart read. Two terms of hourly looks, roughly. */
const MAX_HISTORY_POINTS = 500;

/**
 * How many newest rows to pull before filtering heartbeats out of the
 * movement feed. The table now stores every look, so `limit` raw rows would
 * often be a run of unchanged polls.
 */
const MOVEMENT_OVERFETCH = 50;
const MOVEMENT_OVERFETCH_CAP = 2000;

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

function sameReading(a: SeatSnapshot, b: SeatSnapshot): boolean {
  return (
    a.enrollmentCount === b.enrollmentCount &&
    a.enrollmentCap === b.enrollmentCap &&
    a.waitlistCount === b.waitlistCount &&
    a.status === b.status
  );
}

/**
 * Drop heartbeat rows. `rows` is newest-first, mixed sections.
 *
 * Walks each section oldest-first and keeps a row when it differs from the
 * previous look. The oldest row in the fetched window is kept — we cannot
 * see the look before it, so a heartbeat at the window edge can leak through.
 * Over-fetching on the query keeps that edge far from "recent".
 */
export function keepChangedReadings(rows: SeatSnapshot[], limit: number): SeatSnapshot[] {
  const bySection = new Map<string, SeatSnapshot[]>();
  for (const row of rows) {
    const bucket = bySection.get(row.sectionId);
    if (bucket) bucket.push(row);
    else bySection.set(row.sectionId, [row]);
  }

  const changed: SeatSnapshot[] = [];
  for (const bucket of bySection.values()) {
    // Query returns newest-first; oldest-first is what "differs from previous" needs.
    const oldestFirst = bucket.slice().reverse();
    let previous: SeatSnapshot | null = null;
    for (const row of oldestFirst) {
      if (!previous || !sameReading(previous, row)) changed.push(row);
      previous = row;
    }
  }

  changed.sort((a, b) => (a.observedAt < b.observedAt ? 1 : a.observedAt > b.observedAt ? -1 : 0));
  return changed.slice(0, limit);
}

/**
 * Full look history for one section, oldest first — the order a chart wants
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
 * Look history for several sections at once, oldest first.
 *
 * The chart draws one line per section of a course, and a course can have
 * twenty. Calling `getSeatHistory` in a loop would be twenty round trips for
 * one page render, so this is a single `in` query grouped afterwards.
 *
 * Rows arrive newest-first so truncation keeps the recent end of a long
 * history. A chart that silently dropped last week to keep the first look
 * would be worse than one that showed a shorter window.
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
 * Heartbeats are stripped so a quiet hour of polls does not look like news.
 * Deliberately not filtered to "seats opened". A section going from 3 open to
 * 1 open is the movement that tells someone to stop deliberating.
 */
export async function getRecentSeatMovement(
  sectionIds: string[],
  limit = 20,
): Promise<SeatSnapshot[]> {
  if (sectionIds.length === 0) return [];
  const db = readClient();
  if (!db) return [];

  const overfetch = Math.min(Math.max(limit * MOVEMENT_OVERFETCH, limit), MOVEMENT_OVERFETCH_CAP);

  const { data, error } = await db
    .from("enrollment_snapshots")
    .select("section_id, observed_at, enrollment_count, enrollment_cap, waitlist_count, status")
    .in("section_id", sectionIds)
    .order("observed_at", { ascending: false })
    .limit(overfetch);

  // Never throws: the feed is the least important thing on Home, and it must
  // not be able to take the week grid down with it.
  if (error) return [];
  return keepChangedReadings((data ?? []).map(toSnapshot), limit);
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
