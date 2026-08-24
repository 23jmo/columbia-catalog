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
  | "ingest_bulletin_courses"
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

      case "bulletin_department": {
        // One page, two writes: the schedule tables fill meetings on sections
        // the directory already gave us, and the course blocks fill the prose
        // the directory never publishes at all. Both are counted, because both
        // are records this fetch committed.
        const meetings = await this.call("ingest_bulletin", {
          p_department: payload.department,
          p_rows: payload.rows,
          p_observed_at: observedAt,
        });
        const courses = await this.call("ingest_bulletin_courses", {
          p_department: payload.department,
          p_courses: payload.courses,
          p_observed_at: observedAt,
        });
        return meetings + courses;
      }

      case "subject_index":
        return this.call("ingest_subject_index", { p_payload: payload.index });

      case "academic_calendar":
        return this.call("ingest_academic_calendar", { p_payload: payload.calendar });
    }
  }

  /**
   * Stamp a section Columbia has stopped publishing.
   *
   * Does not go through `call`, because that helper is narrowed to the ingest
   * writers on purpose and this is not one — no payload, no `p_observed_at`,
   * and a return value that means "rows changed" rather than "records
   * committed".
   *
   * A zero here is reported, not thrown. The section may already be marked, or
   * we may never have carried a row for it: a section can be pulled between
   * the subject page that listed it and the detail crawl that reached it, and
   * a tombstone for a section we never had is not a failure of anything.
   */
  async markSectionWithdrawn(sectionId: string, at: string): Promise<number> {
    const { data, error } = await this.db.rpc("mark_section_withdrawn", {
      p_section_id: sectionId,
      p_at: at,
    });
    if (error) {
      throw new Error(`mark_section_withdrawn failed: ${error.message}`);
    }
    return typeof data === "number" ? data : 0;
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
