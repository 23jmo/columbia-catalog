/**
 * Pure helpers for the saved-thread list.
 *
 * Kept out of the server module so the sidebar can format timestamps without
 * pulling the database client into the browser bundle.
 */

/** How many recent threads hang under Home. Older ones live in search. */
export const SIDEBAR_THREAD_CAP = 5;

/** Hard ceiling on a search result page — enough to scan, not a dump. */
export const SEARCH_THREAD_LIMIT = 40;

/** Query param that opens a saved thread on `/`. */
export const THREAD_QUERY_PARAM = "c";

export const THREADS_CHANGED_EVENT = "catalog:threads-changed";

export type ChatThread = {
  conversationId: string;
  title: string;
  updatedAt: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isConversationId(value: string): boolean {
  return UUID.test(value);
}

/** Build `/?c=<id>` so a thread is a real URL, not only client state. */
export function threadHref(conversationId: string): string {
  return `/?${THREAD_QUERY_PARAM}=${encodeURIComponent(conversationId)}`;
}

/**
 * Escape `%`, `_`, and `\` so a student's search is matched literally.
 * PostgREST `ilike` treats those as wildcards unless they are escaped.
 */
export function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Compact relative age, matching the sidebar badges: `now`, `34m`, `5h`.
 *
 * `nowMs` is injectable so tests do not depend on the clock.
 */
export function relativeAge(iso: string, nowMs = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const delta = Math.max(0, nowMs - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (delta < minute) return "now";
  if (delta < hour) return `${Math.floor(delta / minute)}m`;
  if (delta < day) return `${Math.floor(delta / hour)}h`;
  if (delta < week) return `${Math.floor(delta / day)}d`;
  if (delta < 8 * week) return `${Math.floor(delta / week)}w`;

  const months = Math.max(1, Math.floor(delta / (30 * day)));
  return `${months}mo`;
}

/** Tell the sidebar a thread was created or touched, so it refetches. */
export function notifyThreadsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(THREADS_CHANGED_EVENT));
}
