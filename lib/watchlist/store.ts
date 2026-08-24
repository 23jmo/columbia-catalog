/**
 * The watchlist store.
 *
 * One module-level store shared by every watch button, the course drawer and
 * the Home rail, exposed through `useSyncExternalStore`. Two buttons for the
 * same section on the same screen must never disagree, and they will if each
 * owns its own `useState`.
 *
 * ── Server-authoritative, unlike plans ─────────────────────────────────────
 *
 * `lib/schedule/plans.ts` is local-first: a plan that never reaches the server
 * is still a real plan on this device. A watch is not like that. A watch is a
 * promise to email someone, and a promise stored only in a browser tab is one
 * we silently cannot keep — so the database is the source of truth here and
 * this store is a cache of it.
 *
 * The toggle is still optimistic, because during a registration scramble a
 * button that waits on a round trip before acknowledging a click reads as
 * broken and gets clicked again. So the flip is immediate and rolls back —
 * loudly, with the error kept — if the write is refused.
 *
 * ── Three kinds of state, three lifetimes ──────────────────────────────────
 *
 *   · `watched` — the caller's own section ids. Private, RLS-scoped, loaded
 *     once per session and mutated by the toggle.
 *   · `counts` — how many people watch each section. Public aggregates from
 *     `watch_counts()`, which cannot name a watcher no matter what it is
 *     asked. Fetched per screen, best-effort, never fatal.
 *   · `seats` — live seat readings pushed by Postgres realtime. These
 *     *override* whatever the server rendered, because a page that has been
 *     open for ten minutes during registration is showing history.
 *
 * ── Why realtime is filtered to watched sections ───────────────────────────
 *
 * Subscribing to every UPDATE on `sections` would deliver the entire crawl —
 * thousands of rows an hour — to every open tab so that a handful could be
 * used. The subscription is filtered server-side to the ids on the watchlist
 * and resubscribes when that set changes.
 */

import { getBrowserClient, isConfigured } from "@/lib/db/client";
import { getSeatStates, type SeatState } from "@/lib/db/catalog-queries";
import {
  addWatch,
  getWatchCounts,
  listWatches,
  removeWatch,
  WatchNotAvailableError,
} from "@/lib/db/watches";
import type { EnrollmentStatusCode } from "@/lib/types";

/**
 * Realtime filters travel in the subscription topic, so the id list has to fit
 * in a URL. Well above any real watchlist; past it the tail simply does not
 * push and falls back to whatever the page rendered.
 */
const MAX_REALTIME_SECTIONS = 60;

export type WatchlistStatus = "idle" | "loading" | "ready" | "signed_out";

export interface WatchlistSnapshot {
  status: WatchlistStatus;
  /** The caller's own watched section ids. */
  watched: ReadonlySet<string>;
  /** Public watcher counts for sections some screen has asked about. */
  counts: ReadonlyMap<string, number>;
  /** Realtime seat readings, newer than anything the server rendered. */
  seats: ReadonlyMap<string, SeatState>;
  /** Sections with a toggle in flight, so the button can show it. */
  pending: ReadonlySet<string>;
  /** Last mutation error, cleared by the next successful mutation. */
  error: string | null;
}

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map();
const EMPTY_SEATS: ReadonlyMap<string, SeatState> = new Map();

/**
 * A single frozen object returned to every server render. `useSyncExternalStore`
 * compares snapshots by identity, so a fresh object here would loop forever.
 */
const SERVER_SNAPSHOT: WatchlistSnapshot = {
  status: "idle",
  watched: EMPTY_SET,
  counts: EMPTY_COUNTS,
  seats: EMPTY_SEATS,
  pending: EMPTY_SET,
  error: null,
};

let snapshot: WatchlistSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(next: Partial<WatchlistSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

export function subscribeWatchlist(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWatchlistSnapshot(): WatchlistSnapshot {
  return snapshot;
}

export function getWatchlistServerSnapshot(): WatchlistSnapshot {
  return SERVER_SNAPSHOT;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

let loadPromise: Promise<void> | null = null;

/**
 * Loads the caller's watchlist once per session. Idempotent and safe to call
 * from every mounted watch button — the in-flight promise is shared, so twenty
 * buttons on a course page produce one query, not twenty.
 */
export function ensureWatchlistLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (!isConfigured()) {
    emit({ status: "signed_out" });
    return Promise.resolve();
  }

  emit({ status: "loading" });
  loadPromise = (async () => {
    try {
      const records = await listWatches();
      emit({ status: "ready", watched: new Set(records.map((r) => r.sectionId)) });
      openRealtime();
    } catch (cause) {
      // Not signed in is the ordinary case, not a failure: most visitors are
      // reading the catalog, which needs no account.
      if (cause instanceof WatchNotAvailableError) emit({ status: "signed_out" });
      else emit({ status: "signed_out", error: describe(cause) });
    }
  })();

  return loadPromise;
}

/** Called on sign-in/sign-out so the next read reflects the new identity. */
export function resetWatchlist(): void {
  loadPromise = null;
  closeRealtime();
  snapshot = SERVER_SNAPSHOT;
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

const requestedCounts = new Set<string>();

/**
 * Fetches public watcher counts for sections on screen, skipping any already
 * known. Never throws — a missing count is a missing badge, and it must not
 * take a course page down.
 */
export async function trackWatcherCounts(sectionIds: string[]): Promise<void> {
  const missing = sectionIds.filter((id) => !requestedCounts.has(id));
  if (missing.length === 0) return;
  for (const id of missing) requestedCounts.add(id);

  const fetched = await getWatchCounts(missing);
  if (fetched.size === 0) return;

  const counts = new Map(snapshot.counts);
  for (const [sectionId, count] of fetched) counts.set(sectionId, count);
  emit({ counts });
}

/** Adjusts a count locally so the badge moves with the button that changed it. */
function nudgeCount(sectionId: string, delta: number): void {
  const counts = new Map(snapshot.counts);
  const current = counts.get(sectionId) ?? 0;
  counts.set(sectionId, Math.max(0, current + delta));
  emit({ counts });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function toggleWatch(sectionId: string): Promise<void> {
  if (snapshot.pending.has(sectionId)) return;

  const wasWatched = snapshot.watched.has(sectionId);
  const watched = new Set(snapshot.watched);
  const pending = new Set(snapshot.pending).add(sectionId);

  if (wasWatched) watched.delete(sectionId);
  else watched.add(sectionId);
  emit({ watched, pending, error: null });
  nudgeCount(sectionId, wasWatched ? -1 : 1);

  try {
    if (wasWatched) await removeWatch(sectionId);
    else await addWatch(sectionId);
    // The watched set changed, so the realtime filter is now wrong.
    openRealtime();
  } catch (cause) {
    // Roll back both the flag and the count. Showing a section as watched when
    // the promise to email was never stored is the one failure mode this
    // feature cannot have.
    const reverted = new Set(snapshot.watched);
    if (wasWatched) reverted.add(sectionId);
    else reverted.delete(sectionId);
    emit({ watched: reverted, error: describe(cause) });
    nudgeCount(sectionId, wasWatched ? 1 : -1);
  } finally {
    const settled = new Set(snapshot.pending);
    settled.delete(sectionId);
    emit({ pending: settled });
  }
}

/**
 * Drops watches locally, without a write.
 *
 * The database already did the delete: `watches` carries a composite foreign
 * key into `bookmarks` with `on delete cascade`, so removing a bookmark takes
 * its watch with it. This store has no way to hear about that — the cascade
 * fires server-side and there is no realtime channel on `watches` — so the
 * bookmark store tells it, and this reconciles the local view.
 *
 * Without it the bell keeps showing "on" for a section that has no watch row,
 * and the next click tries to *delete* an already-deleted watch instead of
 * creating one. That is the exact shape of "I turned alerts on and never got
 * an email", which is the failure this feature cannot afford.
 *
 * Deliberately not exported as a general-purpose unwatch: it does not write,
 * so calling it anywhere the row still exists would desync in the other,
 * worse direction.
 */
export function forgetWatches(sectionIds: readonly string[]): void {
  const watched = new Set(snapshot.watched);
  let changed = false;

  for (const sectionId of sectionIds) {
    if (!watched.delete(sectionId)) continue;
    changed = true;
    nudgeCount(sectionId, -1);
  }
  if (!changed) return;

  emit({ watched });
  // The watched set shrank, so the realtime filter is now subscribing to
  // sections nobody here is watching.
  openRealtime();
}

function describe(cause: unknown): string {
  if (cause instanceof WatchNotAvailableError) return cause.message;
  return cause instanceof Error ? cause.message : String(cause);
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

type Channel = { unsubscribe: () => void };

let channel: Channel | null = null;
let channelKey = "";

interface SectionChangePayload {
  new?: {
    section_id?: string;
    enrollment_count?: number | null;
    enrollment_cap?: number | null;
    waitlist_count?: number | null;
    status?: string | null;
    source_as_of?: string | null;
  };
}

function openRealtime(): void {
  const supabase = isConfigured() ? getBrowserClient() : null;
  if (!supabase) return;

  const ids = [...snapshot.watched].slice(0, MAX_REALTIME_SECTIONS).sort();
  const key = ids.join(",");
  if (key === channelKey && channel) return;

  closeRealtime();
  if (ids.length === 0) return;
  channelKey = key;

  channel = supabase
    .channel(`seats:${key.length}:${ids[0]}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "sections",
        filter: `section_id=in.(${ids.join(",")})`,
      },
      (payload: SectionChangePayload) => applySectionChange(payload),
    )
    .subscribe();

  // A subscription only carries changes from the moment it opens, so the gap
  // between server render and subscribe is filled with one explicit read.
  // Without it a seat that opened while the page was loading stays invisible
  // until the *next* change, which during registration may be never.
  void refreshSeats(ids);
}

function closeRealtime(): void {
  channel?.unsubscribe();
  channel = null;
  channelKey = "";
}

function applySectionChange(payload: SectionChangePayload): void {
  const row = payload.new;
  if (!row?.section_id) return;

  const seats = new Map(snapshot.seats);
  seats.set(row.section_id, {
    sectionId: row.section_id,
    enrollmentCount: row.enrollment_count ?? null,
    enrollmentCap: row.enrollment_cap ?? null,
    waitlistCount: row.waitlist_count ?? null,
    status: (row.status ?? "unknown") as EnrollmentStatusCode,
    sourceAsOf: row.source_as_of ?? null,
  });
  emit({ seats });
}

/** One-shot catch-up read; failures are silent because the page already has a value. */
export async function refreshSeats(sectionIds: string[]): Promise<void> {
  if (sectionIds.length === 0) return;
  try {
    const states = await getSeatStates(sectionIds);
    if (states.length === 0) return;
    const seats = new Map(snapshot.seats);
    for (const state of states) seats.set(state.sectionId, state);
    emit({ seats });
  } catch {
    // A stale-but-stamped seat number is the fallback, and it is an honest one.
  }
}
