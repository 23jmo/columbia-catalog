/**
 * Watchlist.
 *
 * Spec §14 draws a sharp line this file exists to keep: **watcher counts are
 * public, individual watches are not.** "34 people are watching this section"
 * is useful and fair — it tells you what you are up against. "Alice is watching
 * this section" is surveillance of a classmate.
 *
 * That line is enforced by the database, not here. `watches` carries
 * owner-only RLS (migration 0005), so the row listing below can only ever
 * return the caller's own watches no matter what it asks for. Counts come from
 * `watch_counts()`, a definer-rights function that returns an aggregate — there
 * is no shape of its result that can name a watcher, which is a stronger
 * guarantee than a policy that merely happens to be right today.
 *
 * Unlike plans, watches are NOT local-first. A watch is a promise to email
 * someone; storing one that never reached the server would be a promise we
 * silently cannot keep. So every mutation here is awaited and reported.
 */

import type { TermCode } from "@/lib/types";

import { getBrowserClient, isConfigured } from "./client";

export interface WatchRecord {
  sectionId: string;
  createdAt: string;
  /** Seat count when the watch was created, stamped by a trigger. */
  enrollmentCountAtWatch: number | null;
  notifyEmail: boolean;
}

export class WatchNotAvailableError extends Error {
  constructor() {
    super("Sign in with your Columbia account to watch a section.");
    this.name = "WatchNotAvailableError";
  }
}

function client() {
  const supabase = isConfigured() ? getBrowserClient() : null;
  if (!supabase) throw new WatchNotAvailableError();
  return supabase;
}

/** The caller's own watches. RLS makes "own" structural rather than a filter. */
export async function listWatches(termCode?: TermCode): Promise<WatchRecord[]> {
  const supabase = client();
  let query = supabase
    .from("watches")
    .select("section_id, created_at, enrollment_count_at_watch, notify_email")
    .order("created_at", { ascending: false });

  // Term lives on `sections`, and section ids are prefixed with the term code,
  // so the filter is a prefix match rather than a join — one round trip, and
  // no dependency on an embedded resource the RLS policy would also have to
  // permit.
  if (termCode) query = query.like("section_id", `${termCode}%`);

  const { data, error } = await query;
  if (error) throw new Error(`listWatches failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    sectionId: row.section_id,
    createdAt: row.created_at,
    enrollmentCountAtWatch: row.enrollment_count_at_watch,
    notifyEmail: row.notify_email,
  }));
}

/**
 * Idempotent: watching an already-watched section is a no-op, not an error.
 * The button is a toggle and a double click must not surface a failure.
 */
export async function addWatch(sectionId: string, notifyEmail = true): Promise<void> {
  const supabase = client();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new WatchNotAvailableError();

  const { error } = await supabase
    .from("watches")
    .upsert(
      { user_id: auth.user.id, section_id: sectionId, notify_email: notifyEmail },
      { onConflict: "user_id,section_id" },
    );
  // enrollment_count_at_watch is deliberately not sent: `watches_stamp_baseline`
  // fills it from the section's current reading, so a client cannot forget to
  // set the baseline and cannot fake it.
  if (error) throw new Error(`addWatch failed: ${error.message}`);
}

export async function removeWatch(sectionId: string): Promise<void> {
  const supabase = client();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new WatchNotAvailableError();

  const { error } = await supabase
    .from("watches")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("section_id", sectionId);
  if (error) throw new Error(`removeWatch failed: ${error.message}`);
}

/**
 * Public watcher counts for the sections on screen.
 *
 * Sections nobody watches are absent from the result rather than present with
 * zero, so callers should default to 0. Never throws: a missing count is a
 * missing badge, and it must not take a course page down.
 */
export async function getWatchCounts(sectionIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (sectionIds.length === 0 || !isConfigured()) return counts;

  const supabase = getBrowserClient();
  if (!supabase) return counts;

  const { data, error } = await supabase.rpc("watch_counts", { p_section_ids: sectionIds });
  if (error || !data) return counts;
  for (const row of data) counts.set(row.section_id, Number(row.watcher_count));
  return counts;
}
