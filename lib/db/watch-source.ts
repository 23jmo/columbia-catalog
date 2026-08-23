/**
 * Supabase-backed `WatchSource`.
 *
 * Drives hot-tier promotion: a subject containing a watched section moves from
 * the 1-hour baseline to the 2-minute hot tier, and to 30 seconds when its term
 * is inside an active registration window (spec §10).
 *
 * ── Why this is its own file ───────────────────────────────────────────────
 *
 * `watches` is user data under row-level security. Reading it needs the service
 * role, and the crawler must be able to ask "which sections does anyone watch?"
 * without ever learning *who* watches them — the answer it needs is a set of
 * section ids, and nothing downstream should be able to attribute one to a
 * person. Returning a bare `string[]` makes that structural rather than a
 * discipline the caller has to maintain.
 */

import type { WatchSource } from "@/lib/crawler/contracts";

import { requireServiceRoleClient, type CatalogClient } from "./client";

/**
 * A promotion pass reads every watched section in one query. The ceiling exists
 * so a runaway watch table cannot turn the pre-claim tier refresh — which runs
 * on every cron tick — into a multi-megabyte read.
 */
const MAX_WATCHED_SECTIONS = 20_000;

export class SupabaseWatchSource implements WatchSource {
  private readonly db: CatalogClient;

  constructor(db?: CatalogClient) {
    this.db = db ?? requireServiceRoleClient();
  }

  async watchedSectionIds(): Promise<string[]> {
    const { data, error } = await this.db
      .from("watches")
      .select("section_id")
      .limit(MAX_WATCHED_SECTIONS);

    if (error) throw new Error(`watchedSectionIds failed: ${error.message}`);

    // Distinct: many students watch the same popular section, and the caller
    // only needs the set.
    return [...new Set((data ?? []).map((row) => row.section_id))];
  }
}
