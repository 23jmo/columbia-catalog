/**
 * Shareable schedule links — the browser half.
 *
 * A share is a property of the student's ONE schedule for a term (the primary
 * plan), so both calls are keyed by term. That is deliberate: local plans carry
 * `plan_*` ids until the first sync lands, and keying a share by plan id would
 * make "Share" race the write-through. See migration 0038.
 *
 * The token is a uuid the server mints; the link is `/schedule/s/<token>`. It
 * is unguessable and the only credential — turning sharing off nulls it, and
 * turning it back on mints a fresh one, so an old link does not come back to
 * life by accident.
 */

import type { TermCode } from "@/lib/types";

import { getBrowserClient } from "./client";

export const SHARED_SCHEDULE_PATH = "/schedule/s";

export function sharedScheduleUrl(token: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${SHARED_SCHEDULE_PATH}/${token}`;
}

/** The current token, or `null` when the schedule is private or nobody is signed in. */
export async function readScheduleShareToken(termCode: TermCode): Promise<string | null> {
  const client = getBrowserClient();
  if (!client) return null;
  const { data, error } = await client.rpc("primary_plan_share_token", { p_term_code: termCode });
  if (error) return null;
  return typeof data === "string" && data.length > 0 ? data : null;
}

/** Turn sharing on (returns the token) or off (returns `null`). Throws when refused. */
export async function setScheduleShared(termCode: TermCode, enabled: boolean): Promise<string | null> {
  const client = getBrowserClient();
  if (!client) throw new Error("Sharing needs an account.");
  const { data, error } = await client.rpc("share_primary_plan", {
    p_term_code: termCode,
    p_enabled: enabled,
  });
  if (error) throw new Error(error.message);
  return typeof data === "string" && data.length > 0 ? data : null;
}
