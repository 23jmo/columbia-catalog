/**
 * Columbia Catalog — local crawl operator.
 *
 *   npx tsx --env-file=.env.local scripts/crawl.ts seed --terms=20263,20271
 *   npx tsx --env-file=.env.local scripts/crawl.ts status
 *   npx tsx --env-file=.env.local scripts/crawl.ts enqueue --terms=20263,20271 --spacing=0.5 --start-in=0
 *   npx tsx --env-file=.env.local scripts/crawl.ts drain --minutes=90
 *   npx tsx --env-file=.env.local scripts/crawl.ts descriptions --limit=6000
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * In production the queue has two consumers: browsers (the engine) and the
 * Vercel cron (the safety net). Neither can do a cold start. Browsers only
 * appear once there is a catalog worth visiting, and the cron deliberately
 * claims nothing that is not already overdue past CRON_GRACE_SECONDS, budgets
 * 45s per tick, and runs on a schedule — filling ~1,800 empty subject-terms
 * through it would take days.
 *
 * So the first fill is a one-shot: the same store, the same fetcher, the same
 * ingest path, driven from a laptop until the queue is dry. After that this
 * script is never needed again.
 *
 * ── Pacing ─────────────────────────────────────────────────────────────────
 *
 * This does NOT set the request rate — `withHostLane` inside the fetcher does,
 * with a randomized 1.2–3.5s gap per host and a per-host concurrency of one.
 * A serialized drain therefore runs at ~0.4 req/s to doc.sis no matter what
 * this file asks for, which is the point: politeness is a property of the
 * fetcher, not a discipline the caller has to remember.
 *
 * Reads only. Every request is a GET (spec §2 — the catalog is read-only
 * toward Columbia).
 */

import { CAMPUS_BUILDINGS } from "@/lib/campus/zones";
import { ALL_TERMS, LEASE_SECONDS } from "@/lib/constants";
import { parseBackfillArgs, runBackfill } from "@/lib/crawler/backfill";
import { getCrawlerRuntime } from "@/lib/crawler/contracts";
import { politeFetch } from "@/lib/crawler/fetcher";
import { ingestHtml, recordFetchFailure } from "@/lib/crawler/ingest";
import { requireServiceRoleClient } from "@/lib/db/client";
import type { CrawlJobKind, TermCode } from "@/lib/types";
import type { CrawlJobSpec } from "@/lib/crawler/contracts";
import { crawlerBootstrapError, ensureCrawlerRuntime } from "@/lib/db/crawler-runtime";

/** Identity written to `leased_by`, so these leases are distinguishable in SQL. */
const WORKER_ID = "local-backfill";
/** Jobs per claim round-trip. Service role is allowed up to 500. */
const CLAIM_BATCH = 25;

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------

/**
 * Creates the rows every crawl depends on but no crawl can produce.
 *
 * `crawl_jobs.term_code` is a foreign key into `terms`, so a term row has to
 * exist before a single subject-term job can be enqueued — the queue cannot
 * bootstrap itself. `ensure_term` derives the season, year and labels from the
 * term code, so the only input is the code itself.
 *
 * Buildings come from `lib/campus/zones.ts` rather than from the crawl because
 * Columbia's directory prints a room string ("501 NWC"), not a building
 * identity. `resolve_building()` maps those strings onto these rows, which is
 * what makes the inter-campus commute warnings (spec §8) possible at all. Run
 * before enqueue; idempotent.
 */
async function seed(): Promise<void> {
  const db = requireServiceRoleClient();
  const terms = flag("terms", ALL_TERMS.join(",")).split(",").map((t) => t.trim()).filter(Boolean);

  for (const termCode of terms) {
    const { error } = await db.rpc("ensure_term", { p_term_code: termCode });
    if (error) throw new Error(`ensure_term(${termCode}): ${error.message}`);
  }
  console.log(`  terms      ${terms.length} ensured (${terms.join(", ")})`);

  const { error: buildingError } = await db.from("buildings").upsert(
    CAMPUS_BUILDINGS.map((building) => ({
      building_id: building.buildingId,
      name: building.name,
      lat: building.lat,
      lng: building.lng,
      campus_zone: building.campusZone,
    })),
    { onConflict: "building_id" },
  );
  if (buildingError) throw new Error(`buildings: ${buildingError.message}`);
  console.log(`  buildings  ${CAMPUS_BUILDINGS.length} upserted`);
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function status(): Promise<void> {
  const db = requireServiceRoleClient();

  const countOf = async (table: string): Promise<number> => {
    const { count, error } = await db
      .from(table as "courses")
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    return count ?? 0;
  };

  const tables = [
    "terms",
    "subjects",
    "courses",
    "sections",
    "meetings",
    "instructors",
    "buildings",
    "enrollment_snapshots",
    "crawl_jobs",
    "ingest_runs",
  ];

  console.log("Catalog");
  console.log("─".repeat(46));
  for (const table of tables) {
    console.log(`  ${table.padEnd(22)} ${String(await countOf(table)).padStart(8)}`);
  }

  // Queue health: due-now is the number a drain would pick up immediately.
  const nowIso = new Date().toISOString();
  const { count: due } = await db
    .from("crawl_jobs")
    .select("*", { count: "exact", head: true })
    .lte("next_fetch_at", nowIso)
    .is("leased_until", null);
  const { count: failing } = await db
    .from("crawl_jobs")
    .select("*", { count: "exact", head: true })
    .gt("consecutive_failures", 0);

  console.log("─".repeat(46));
  console.log(`  due now                ${String(due ?? 0).padStart(8)}`);
  console.log(`  with failures          ${String(failing ?? 0).padStart(8)}`);

  const { data: recent } = await db
    .from("ingest_runs")
    .select("kind,target_key,term_code,status,records_written,notes")
    .order("started_at", { ascending: false })
    .limit(8);
  if (recent?.length) {
    console.log("");
    console.log("Recent ingest runs");
    for (const run of recent) {
      const note = run.notes ? `  ${run.notes.slice(0, 60)}` : "";
      const target = `${run.kind ?? "?"}:${run.target_key ?? "?"}${run.term_code ? `:${run.term_code}` : ""}`;
      console.log(
        `  ${String(run.status).padEnd(11)} ${String(run.records_written ?? 0).padStart(5)}  ${target}${note}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// drain
// ---------------------------------------------------------------------------

interface DrainTally {
  claimed: number;
  ingested: number;
  quarantined: number;
  failed: number;
  records: number;
}

async function drain(): Promise<void> {
  const minutes = Number(flag("minutes", "90"));
  const kindsArg = flag("kinds", "");
  const includeKinds = kindsArg
    ? (kindsArg.split(",").map((k) => k.trim()).filter(Boolean) as CrawlJobKind[])
    : undefined;

  const deadline = Date.now() + minutes * 60_000;
  const { jobStore } = getCrawlerRuntime();
  const tally: DrainTally = { claimed: 0, ingested: 0, quarantined: 0, failed: 0, records: 0 };
  const startedAt = Date.now();

  console.log(
    `Draining for up to ${minutes} min${includeKinds ? ` (kinds: ${includeKinds.join(", ")})` : ""}…`,
  );

  while (Date.now() < deadline) {
    const now = new Date();
    const jobs = await jobStore.claimDueJobs({
      leasedBy: WORKER_ID,
      limit: CLAIM_BATCH,
      leasedUntil: new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString(),
      // Unlike cron there is no grace window: during a cold fill nobody else is
      // competing for this queue, and holding back due work would just idle.
      dueBefore: now.toISOString(),
      includeKinds,
    });

    if (jobs.length === 0) {
      console.log("Queue is dry.");
      break;
    }
    tally.claimed += jobs.length;

    for (const job of jobs) {
      if (Date.now() >= deadline) {
        // Hand back what we cannot honour rather than letting the lease lapse.
        await jobStore.releaseJob(job.jobId, WORKER_ID).catch(() => undefined);
        continue;
      }

      const outcome = await politeFetch(job.url, { timeoutMs: 20_000 });
      if (!outcome.ok || !outcome.html) {
        await recordFetchFailure(job, outcome.error ?? `HTTP ${outcome.status}`, "backfill");
        tally.failed += 1;
        console.log(`  ✗ ${job.kind}/${job.targetKey} — ${outcome.error ?? outcome.status}`);
        continue;
      }

      const result = await ingestHtml({
        job,
        html: outcome.html,
        fetchedAt: outcome.fetchedAt,
        source: "backfill",
      });

      if (result.quarantined) {
        tally.quarantined += 1;
        console.log(`  ⚠ ${job.kind}/${job.targetKey} quarantined — ${result.reason ?? "?"}`);
      } else if (result.reason) {
        tally.failed += 1;
        console.log(`  ✗ ${job.kind}/${job.targetKey} — ${result.reason}`);
      } else {
        tally.ingested += 1;
        tally.records += result.recordsWritten;
        const term = job.termCode ? ` ${job.termCode}` : "";
        console.log(
          `  ✓ ${job.targetKey}${term} — ${result.recordsWritten} record(s)` +
            `  [${tally.ingested} ok / ${tally.claimed} claimed]`,
        );
      }
    }
  }

  const elapsedMin = (Date.now() - startedAt) / 60_000;
  console.log("─".repeat(46));
  console.log(`  elapsed        ${elapsedMin.toFixed(1)} min`);
  console.log(`  claimed        ${tally.claimed}`);
  console.log(`  ingested       ${tally.ingested}`);
  console.log(`  records        ${tally.records}`);
  console.log(`  quarantined    ${tally.quarantined}`);
  console.log(`  failed         ${tally.failed}`);
}

// ---------------------------------------------------------------------------
// descriptions
// ---------------------------------------------------------------------------

/**
 * Enqueue one `section_detail` job per course that has no description.
 *
 * ── Why this is needed at all ──────────────────────────────────────────────
 *
 * The bulletin backfill fills descriptions, points and prerequisites — but
 * `bulletin.columbia.edu` only publishes course listings for Columbia College,
 * Engineering and Barnard. Law, Business, Nursing, Social Work, Public Health,
 * SPS, the Arts and GSAPP are not on it in any form; their departments do not
 * appear in its sitemap. That is ~5,000 courses with a title, a call number and
 * nothing else — which is most of what a reader wants to know before choosing.
 *
 * The section detail page has the description for every one of them. FINC
 * B8439's page prints "Course Description", "Department", "Grading Mode",
 * "Method of Instruction", "Type", "Open To" and "Note" — the four section
 * columns we have never written, plus the course prose the bulletin lane could
 * not reach.
 *
 * ── One job per COURSE, not per section ───────────────────────────────────
 *
 * The description belongs to the course, so a second section of the same course
 * would fetch a page to learn something we already know. Picking one section
 * per course turns ~17,000 fetches into ~5,000. The section-scoped fields
 * (component, grading mode, open-to) are then filled for that one section only,
 * which is honest: we know what that page said, and nothing about its siblings.
 *
 * ── Baseline tier ─────────────────────────────────────────────────────────
 *
 * Descriptions do not change during registration. These queue behind every seat
 * refresh by design — `claim_crawl_jobs` orders by tier first, so a backlog of
 * 5,000 prose fetches can never delay a watched section's seat reading.
 */
async function descriptions(): Promise<void> {
  const db = requireServiceRoleClient();
  const limit = Number(flag("limit", "6000"));
  const spacingSeconds = Number(flag("spacing", "1"));
  const startInSeconds = Number(flag("start-in", "30"));

  /*
   * PostgREST caps a single response at 1,000 rows regardless of the SQL
   * `limit`, and it does so silently — the first version of this command
   * reported "upserted 1000/1000" and looked finished while 4,400 courses
   * still had no description. Page through with `range()` instead, and trust
   * a short page rather than the requested limit to say when we are done.
   */
  const PAGE = 1000;
  const rows: Awaited<ReturnType<typeof fetchPage>> = [];

  async function fetchPage(offset: number) {
    const { data, error } = await db
      .rpc("courses_missing_description", { p_limit: limit })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`courses_missing_description failed: ${error.message}`);
    return data ?? [];
  }

  try {
    for (let offset = 0; offset < limit; offset += PAGE) {
      const page = await fetchPage(offset);
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
    return;
  }
  if (rows.length === 0) {
    console.log("Every course already has a description. Nothing to enqueue.");
    return;
  }

  const runtime = getCrawlerRuntime();
  const now = Date.now();
  const specs: CrawlJobSpec[] = rows.map((row, index) => ({
    kind: "section_detail" as CrawlJobKind,
    // Section id, so `subjectOfTargetKey` can still find the subject and the
    // hot-tier escalation keeps working for these rows like any other.
    targetKey: row.section_id,
    termCode: row.term_code as TermCode,
    url: row.detail_url,
    tier: "baseline" as const,
    nextFetchAt: new Date(now + (startInSeconds + index * spacingSeconds) * 1000).toISOString(),
  }));

  console.log(`Enqueuing ${specs.length} section_detail job(s) for courses with no description…`);
  let created = 0;
  for (let start = 0; start < specs.length; start += 100) {
    created += await runtime.jobStore.upsertJobs(specs.slice(start, start + 100));
    console.log(`  upserted ${Math.min(start + 100, specs.length)}/${specs.length}`);
  }
  console.log(`Done. ${created} new job(s) created.`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!ensureCrawlerRuntime()) {
    console.error(`Crawler runtime unavailable: ${crawlerBootstrapError()}`);
    console.error("Run with: npx tsx --env-file=.env.local scripts/crawl.ts …");
    process.exitCode = 1;
    return;
  }

  const command = process.argv[2] ?? "status";
  switch (command) {
    case "status":
      await status();
      return;
    case "seed":
      await seed();
      return;
    case "enqueue":
      await runBackfill(parseBackfillArgs(process.argv.slice(3)));
      return;
    case "drain":
      await drain();
      return;
    case "descriptions":
      await descriptions();
      return;
    default:
      console.error(`Unknown command "${command}". Expected seed | status | enqueue | drain | descriptions.`);
      process.exitCode = 1;
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exitCode = 1;
});
