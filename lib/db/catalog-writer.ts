/**
 * Supabase-backed `CatalogWriter`.
 *
 * The second half of the seam the crawler declared and did not implement. Every
 * method here is one RPC call, and that is the whole design:
 *
 * ── Why the writes live in SQL ─────────────────────────────────────────────
 *
 * Applying a subject page means upserting a subject, then its courses, then its
 * sections, then replacing each section's meetings and instructors. Through
 * PostgREST that is dozens of independent HTTP requests with no shared
 * transaction. A failure partway leaves sections updated against courses that
 * were not, and meetings deleted but not yet reinserted — a section that
 * silently loses its meeting times looks exactly like a section that has none.
 *
 * Spec §10 forbids exactly this ("never overwrite good data with worse data"),
 * so the multi-table write is a single plpgsql function per ingest kind
 * (`supabase/migrations/0009_ingest_writers.sql`). A function body is one
 * transaction: it commits whole or not at all.
 *
 * ── What this file deliberately does not do ────────────────────────────────
 *
 * No quarantine decision. `lib/crawler/ingest.ts` runs the guard and only calls
 * `applyIngest` for payloads that already passed it. Putting the check here too
 * would mean two implementations of the rule that decides whether the catalog
 * is allowed to shrink.
 *
 * No enrollment-snapshot write either. `trg_sections_capture_snapshot` mirrors
 * every seat reading into `enrollment_snapshots` with change-only semantics
 * (spec §11) as part of the same transaction — writing them from here would
 * double every row.
 */

import type { CatalogWriter, IngestPayload } from "@/lib/crawler/contracts";

import { requireServiceRoleClient, type CatalogClient } from "./client";
import type { Database } from "./schema";

/** The five transactional ingest writers from migration 0009. */
type IngestFunction =
  | "ingest_subject_page"
  | "ingest_section_detail"
  | "ingest_bulletin"
  | "ingest_subject_index"
  | "ingest_academic_calendar";

export class SupabaseCatalogWriter implements CatalogWriter {
  private readonly db: CatalogClient;

  constructor(db?: CatalogClient) {
    this.db = db ?? requireServiceRoleClient();
  }

  /**
   * Returns the number of records committed, which the caller records on the
   * `ingest_runs` row. Zero is a legitimate answer — a bulletin page whose
   * courses we do not carry yet writes nothing and has not failed.
   */
  async applyIngest(payload: IngestPayload, observedAt: string): Promise<number> {
    switch (payload.kind) {
      case "subject_term":
        return this.call("ingest_subject_page", {
          p_payload: payload.page,
          p_observed_at: observedAt,
        });

      case "section_detail":
        return this.call("ingest_section_detail", {
          p_payload: payload.detail,
          p_observed_at: observedAt,
        });

      case "bulletin_department":
        return this.call("ingest_bulletin", {
          p_department: payload.department,
          p_rows: payload.rows,
          p_observed_at: observedAt,
        });

      case "subject_index":
        return this.call("ingest_subject_index", { p_payload: payload.index });

      case "academic_calendar":
        return this.call("ingest_academic_calendar", { p_payload: payload.calendar });
    }
  }

  /**
   * Narrowed to the five ingest writers rather than taking a bare `string`, so
   * a typo in a function name is a compile error instead of a runtime
   * `PGRST202` that would look, from the crawler's side, like a page that
   * simply wrote nothing.
   */
  private async call<Fn extends IngestFunction>(
    fn: Fn,
    args: Database["public"]["Functions"][Fn]["Args"],
  ): Promise<number> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw new Error(`${fn} failed: ${error.message}`);
    return typeof data === "number" ? data : 0;
  }
}
