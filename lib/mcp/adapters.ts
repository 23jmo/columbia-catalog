/**
 * Wiring the MCP ports to the real lanes.
 *
 * `contracts.ts` was written before several of these lanes existed, against
 * narrow ports so no tool handler had to know which of them had landed. Most
 * of them have now landed, and this is where they get bound. `fallbacks.ts`
 * still covers the ones that have not.
 *
 * ── Search reuses the app's own index, on purpose ──────────────────────────
 *
 * The tempting shortcut is to make `search_courses` a substring scan over the
 * catalog. It would be twenty lines and it would be a different product: the
 * agent would rank results differently from the website, so "the third result"
 * in a conversation would not be the third result on screen. So the server
 * reads the same prebuilt artifact the browser downloads (`public/index/`) and
 * runs the same `SearchEngine` over it. Same BM25 weights, same fuzzy
 * matching, same order.
 *
 * The artifact is read from disk once per server instance and the engine is
 * kept — it is ~2 MB and its construction decodes the whole dictionary, which
 * is not something to do per request.
 *
 * Spec §9's "search never touches the network" holds here for a different
 * reason than in the browser: this *is* the server, and the file is local.
 *
 * ── Why the plans port is read-only ────────────────────────────────────────
 *
 * It has no mutation method and must never grow one. Spec §16: write tools
 * propose rather than act. See the note in `contracts.ts`.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  getAllCourses,
  getCourse,
  getCoursesByIds,
  getSection,
  getSections,
} from "../data/catalog";
import { requireServiceRoleClient } from "../db/client";
import { getSeatHistory } from "../db/seat-history";
import { analyzeCommute, detectConflicts } from "../schedule";
import { engineFromBytes } from "../search/client";
import type { SearchEngine } from "../search/engine";
import type {
  CommuteLeg,
  CourseWithSections,
  CustomBlock,
  Plan,
  ScheduleConflict,
  SearchFilters,
  Section,
  TermCode,
  WatchWithState,
} from "../types";

import type {
  CatalogPort,
  PlansPort,
  RequirementReport,
  SchedulePort,
  SearchPort,
  SeatHistoryPoint,
  SeatHistoryPort,
} from "./contracts";
import { requirementReportFrom } from "./fallbacks";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * A direct pass-through. `lib/data/catalog.ts` already decides per call whether
 * to read the database or the bundled seed, and deliberately does not swallow
 * a database error — falling back to 43 seeded courses would answer an agent's
 * question with a confidently wrong catalog.
 */
export const catalogAdapter: CatalogPort = {
  getAllCourses,
  getCourse,
  getCoursesByIds,
  getSection,
  getSections,
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const INDEX_DIR = path.join(process.cwd(), "public", "index");

interface IndexManifest {
  lexical?: { url?: string };
}

let enginePromise: Promise<SearchEngine | null> | null = null;

/**
 * Loads the prebuilt index from disk, once. Returns null when the artifact is
 * absent — a fresh clone that has not run `npm run build:index` yet — and the
 * caller degrades to the linear fallback rather than failing the tool.
 */
function loadEngine(): Promise<SearchEngine | null> {
  enginePromise ??= (async () => {
    try {
      const manifest = JSON.parse(
        await readFile(path.join(INDEX_DIR, "manifest.json"), "utf8"),
      ) as IndexManifest;

      const url = manifest.lexical?.url;
      if (!url) return null;
      // The manifest holds a public URL ("/index/catalog-abc.bin"); on this
      // side of the wire only its basename is meaningful.
      const bytes = await readFile(path.join(INDEX_DIR, path.basename(url)));
      return engineFromBytes(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );
    } catch {
      return null;
    }
  })();
  return enginePromise;
}

export const searchAdapter: SearchPort = {
  async search(filters: SearchFilters, limit: number) {
    const engine = await loadEngine();
    if (!engine) {
      const { fallbackSearch } = await import("./fallbacks");
      return fallbackSearch(catalogAdapter, filters, limit);
    }

    const result = engine.search(filters);
    const ids = result.hits.slice(0, limit).map((hit) => hit.courseId);

    // The engine returns ids and scores, not records — it holds a compressed
    // index, not the catalog. Hydration is a second read, and the order the
    // engine chose is restored afterwards because `getCoursesByIds` makes no
    // promise about ordering.
    const hydrated = await catalogAdapter.getCoursesByIds(ids, filters.termCode);
    const byId = new Map(hydrated.map((course) => [course.courseId, course]));
    const courses = ids
      .map((id) => byId.get(id))
      .filter((course): course is CourseWithSections => Boolean(course));

    return { courses, total: result.total, elapsedMs: result.elapsedMs };
  },
};

// ---------------------------------------------------------------------------
// Schedule analysis
// ---------------------------------------------------------------------------

/**
 * The same pure functions the app runs, so an agent's conflict check and the
 * website's conflict check cannot disagree. These are exactly the questions
 * spec §16 says an external agent is bad at unaided — the value is in them
 * being *our* answer, not a plausible one.
 */
export const scheduleAdapter: SchedulePort = {
  checkConflicts(sections: Section[], customBlocks: CustomBlock[]): ScheduleConflict[] {
    return detectConflicts(sections, customBlocks);
  },

  checkCommute(sections: Section[], customBlocks: CustomBlock[]): CommuteLeg[] {
    // `analyzeCommute` returns CommuteLegDetail, a superset carrying the
    // building records it routed between. The port promises the narrower
    // CommuteLeg, and the extra fields are structurally assignable — so this
    // is a widening read, not a cast that hides anything.
    return analyzeCommute(sections, customBlocks);
  },

  checkRequirements(courses: CourseWithSections[], program: string): RequirementReport {
    return requirementReportFrom(courses, program);
  },
};

// ---------------------------------------------------------------------------
// Seat history
// ---------------------------------------------------------------------------

export const seatHistoryAdapter: SeatHistoryPort = {
  async getSeatHistory(sectionId: string, sinceIso?: string): Promise<SeatHistoryPoint[]> {
    const rows = await getSeatHistory(sectionId);
    const filtered = sinceIso ? rows.filter((row) => row.observedAt >= sinceIso) : rows;
    return filtered.map((row) => ({
      sectionId: row.sectionId,
      observedAt: row.observedAt,
      enrollmentCount: row.enrollmentCount,
      enrollmentCap: row.enrollmentCap,
      waitlistCount: row.waitlistCount,
      status: row.status,
    }));
  },
};

// ---------------------------------------------------------------------------
// The student's own data
// ---------------------------------------------------------------------------

/**
 * Reads the caller's plans and watches with the service role, scoped by an
 * explicit `userId` from the verified access token.
 *
 * The browser reaches this data under RLS, where "own" is structural. An MCP
 * request has no Supabase session — it carries our own OAuth token — so the
 * scoping has to be an explicit predicate here instead. That is a weaker
 * guarantee than a policy, which is why every method below filters on
 * `user_id` as its first condition and none of them accepts a filter from the
 * caller that could widen it.
 */
export const plansAdapter: PlansPort = {
  async listPlans(userId: string, termCode?: TermCode): Promise<Plan[]> {
    const db = requireServiceRoleClient();
    let query = db.from("plans").select("*").eq("user_id", userId);
    if (termCode) query = query.eq("term_code", termCode);

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`listPlans failed: ${error.message}`);

    return Promise.all((data ?? []).map((row) => hydratePlan(row)));
  },

  async getPlan(userId: string, planId: string): Promise<Plan | null> {
    const db = requireServiceRoleClient();
    const { data, error } = await db
      .from("plans")
      .select("*")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .maybeSingle();

    if (error) throw new Error(`getPlan failed: ${error.message}`);
    return data ? hydratePlan(data) : null;
  },

  async listWatches(userId: string): Promise<WatchWithState[]> {
    const db = requireServiceRoleClient();
    const { data, error } = await db
      .from("watches")
      .select("section_id, created_at, enrollment_count_at_watch")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`listWatches failed: ${error.message}`);

    const rows = data ?? [];
    if (rows.length === 0) return [];

    const sectionIds = rows.map((row) => row.section_id);
    const [sections, counts] = await Promise.all([
      getSections(sectionIds),
      watcherCounts(sectionIds),
    ]);
    const sectionById = new Map(sections.map((section) => [section.sectionId, section]));

    return rows.flatMap((row) => {
      const section = sectionById.get(row.section_id);
      // A watch whose section we can no longer resolve is dropped rather than
      // returned hollow: an agent cannot act on a section it cannot read.
      if (!section) return [];
      return [
        {
          userId,
          sectionId: row.section_id,
          createdAt: row.created_at,
          section,
          watcherCount: counts.get(row.section_id) ?? 1,
          deltaSinceWatched:
            row.enrollment_count_at_watch === null || section.enrollmentCount === null
              ? null
              : section.enrollmentCount - row.enrollment_count_at_watch,
        },
      ];
    });
  },

  async addWatch(userId: string, sectionId: string): Promise<WatchWithState> {
    const db = requireServiceRoleClient();
    // Upsert, not insert: watching an already-watched section is a no-op. An
    // agent that retries a tool call must not surface a duplicate-key error to
    // a student who is simply already watching the thing.
    const { error } = await db
      .from("watches")
      .upsert(
        { user_id: userId, section_id: sectionId, notify_email: true },
        { onConflict: "user_id,section_id" },
      );
    if (error) throw new Error(`addWatch failed: ${error.message}`);

    const watches = await plansAdapter.listWatches(userId);
    const created = watches.find((watch) => watch.sectionId === sectionId);
    if (!created) throw new Error(`addWatch: section ${sectionId} not found after write`);
    return created;
  },
};

async function watcherCounts(sectionIds: string[]): Promise<Map<string, number>> {
  const db = requireServiceRoleClient();
  const { data, error } = await db.rpc("watch_counts", { p_section_ids: sectionIds });
  const counts = new Map<string, number>();
  if (error || !data) return counts;
  for (const row of data) counts.set(row.section_id, Number(row.watcher_count));
  return counts;
}

interface PlanRow {
  plan_id: string;
  user_id: string;
  term_code: string;
  name: string;
  is_primary: boolean;
}

async function hydratePlan(row: PlanRow): Promise<Plan> {
  const db = requireServiceRoleClient();
  const [{ data: items }, { data: blocks }] = await Promise.all([
    db.from("plan_items").select("section_id").eq("plan_id", row.plan_id),
    db.from("custom_blocks").select("*").eq("plan_id", row.plan_id),
  ]);

  return {
    planId: row.plan_id,
    userId: row.user_id,
    termCode: row.term_code as TermCode,
    name: row.name,
    isPrimary: row.is_primary,
    sectionIds: (items ?? []).map((item) => item.section_id),
    customBlocks: (blocks ?? []).map((block) => ({
      blockId: block.block_id,
      label: block.label,
      weekday: block.weekday,
      startMinute: block.start_minute,
      endMinute: block.end_minute,
    })) as CustomBlock[],
  };
}
