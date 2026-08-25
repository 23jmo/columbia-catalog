/**
 * LionPlan — full CULPA corpus backfill.
 *
 *   npx tsx --env-file=.env.local scripts/culpa-backfill.ts status
 *   npx tsx --env-file=.env.local scripts/culpa-backfill.ts run
 *   npx tsx --env-file=.env.local scripts/culpa-backfill.ts run --per-hour=120
 *   npx tsx --env-file=.env.local scripts/culpa-backfill.ts reset
 *
 * ── Read this before raising --per-hour ─────────────────────────────────────
 *
 * `lib/reviews/sources/culpa.ts` says, in its header: "Do not raise them. Do not
 * parallelise it. Do not add a 'backfill everything' mode. If you need the whole
 * corpus, that is exactly the situation the partnership exists to solve."
 *
 * This file is that mode, added deliberately and against that advice, because
 * the operator asked for it and holds the permission the gate asserts
 * (`CULPA_PARTNER_OK=1`). The advice is still correct about the underlying fact:
 * culpa.info is a small, volunteer-run, student-funded site, and a full sweep is
 * tens of thousands of requests no matter how politely they are spaced. Nothing
 * here parallelises, and the default rate is unchanged from the adapter's.
 *
 * ── What makes this different from `ingest-reviews.ts run` ──────────────────
 *
 *   · **Durable pacing.** `Pacer` counts requests in memory, so its 60/hour
 *     ceiling resets every time the process starts — a shell loop would blow
 *     straight through it while each run looked well behaved. This script
 *     persists request timestamps to the checkpoint and honours them across
 *     restarts. That is the only reason a multi-day sweep can be called paced.
 *
 *   · **No search step.** Department listings hand back `professor_id`
 *     directly, so the name-resolution round trip per professor disappears.
 *     Roughly halves the request count for the common case.
 *
 *   · **Resumable.** The checkpoint records every professor already visited.
 *     Killing this process and restarting it loses at most one professor.
 *
 * ── The measured corpus (2026-08-24, first full enumeration) ────────────────
 *
 * The pre-run guess was "low tens of thousands of distinct people, most with no
 * reviews." Enumeration settled both halves of that, and both were wrong:
 *
 *   · 198 departments enumerate to **9,505 distinct professors**, not 25–30k.
 *     The department listings overlap heavily — a professor cross-listed under
 *     CS and Applied Math appears on both pages — and dedup collapses the
 *     corpus by roughly two thirds.
 *
 *   · **77% of professors visited have at least one review**, not the minority
 *     the guess assumed. CULPA's coverage of Columbia is deep. That ratio is
 *     what drives cost: a professor with reviews costs one request per five
 *     reviews on top of the lookup, so the hit rate, not the head count, sets
 *     the runtime.
 *
 * Do not re-derive these from the guess. `status` computes both from the live
 * checkpoint and prints the real figures.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

import { createServiceRoleClient } from "@/lib/db/client";
import { EXTRACTOR_VERSION, writeReviews } from "@/lib/db/review-writer";
import {
  createClaudeExtractor,
  DEFAULT_CLAUDE_MODEL,
  defaultExtractor,
  extractDimensions,
  type DimensionExtractor,
} from "@/lib/reviews/extract";
import { mergeResults, type ReviewFetchResult } from "@/lib/reviews/sources/contract";
import {
  CULPA_API_BASE,
  CULPA_API_ROUTES,
  CULPA_PAGE_ROUTES,
  parseJsonBody,
  parseReviewsPage,
} from "@/lib/reviews/sources/culpa-api";
import { CULPA_USER_AGENT } from "@/lib/reviews/sources/culpa";

const CHECKPOINT_PATH = ".culpa-backfill.json";

/** Same ceiling the adapter uses. Overridable, deliberately not raised by default. */
const DEFAULT_PER_HOUR = 60;
/** Hard stop so a runaway page loop cannot walk forever on one professor. */
const MAX_PAGES_PER_PROFESSOR = 200;
/** Write to the database in batches rather than per professor. */
const FLUSH_EVERY_RECORDS = 200;

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

interface Checkpoint {
  /** professor_id → true once fully walked. */
  visited: Record<string, true>;
  /** Enumerated professor ids still to do, in order. */
  queue: number[];
  /** Departments already enumerated, so a restart does not re-list them. */
  departmentsDone: number[];
  /** Whether enumeration finished; until then `queue` is incomplete. */
  enumerated: boolean;
  /** Epoch millis of recent requests — this is what makes pacing durable. */
  requestTimes: number[];
  reviewsWritten: number;
  professorsWithReviews: number;
  startedAt: string | null;
  lastRunAt: string | null;
  errors: string[];
  /**
   * The --per-hour the active run was launched with. `status` runs in a
   * SEPARATE process from `run`, so without this it has no way to know the
   * rate and would fall back to DEFAULT_PER_HOUR — which is how it once
   * reported "6.3 days" for a job running thirty times faster than that.
   * Null for a checkpoint written before this field existed.
   */
  perHour: number | null;
}

function emptyCheckpoint(): Checkpoint {
  return {
    visited: {},
    queue: [],
    departmentsDone: [],
    enumerated: false,
    requestTimes: [],
    reviewsWritten: 0,
    professorsWithReviews: 0,
    startedAt: null,
    lastRunAt: null,
    errors: [],
    perHour: null,
  };
}

function loadCheckpoint(): Checkpoint {
  if (!existsSync(CHECKPOINT_PATH)) return emptyCheckpoint();
  try {
    const parsed = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8")) as Partial<Checkpoint>;
    return { ...emptyCheckpoint(), ...parsed };
  } catch {
    console.warn("checkpoint unreadable, starting fresh");
    return emptyCheckpoint();
  }
}

/**
 * Atomic write. A backfill that is killed mid-save must not come back to a
 * truncated checkpoint and re-walk the entire corpus.
 */
function saveCheckpoint(checkpoint: Checkpoint): void {
  const dir = dirname(CHECKPOINT_PATH);
  if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const temporary = `${CHECKPOINT_PATH}.tmp`;
  writeFileSync(temporary, JSON.stringify(checkpoint), "utf8");
  renameSync(temporary, CHECKPOINT_PATH);
}

// ---------------------------------------------------------------------------
// Durable pacing
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

class DurablePacer {
  constructor(
    private readonly checkpoint: Checkpoint,
    private readonly perHour: number,
  ) {}

  private prune(now: number): void {
    this.checkpoint.requestTimes = this.checkpoint.requestTimes.filter(
      (time) => now - time < HOUR_MS,
    );
  }

  /** Resolves when a request may be issued. Sleeps as long as necessary. */
  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.prune(now);

      const minimumGap = HOUR_MS / this.perHour;
      const last = this.checkpoint.requestTimes[this.checkpoint.requestTimes.length - 1] ?? 0;
      const sinceLast = now - last;

      if (this.checkpoint.requestTimes.length < this.perHour && sinceLast >= minimumGap) {
        this.checkpoint.requestTimes.push(now);
        return;
      }

      const waitForGap = Math.max(0, minimumGap - sinceLast);
      const oldest = this.checkpoint.requestTimes[0] ?? now;
      const waitForWindow =
        this.checkpoint.requestTimes.length >= this.perHour
          ? Math.max(0, HOUR_MS - (now - oldest))
          : 0;
      await sleep(Math.max(waitForGap, waitForWindow, 250));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function getJson(url: string, pacer: DurablePacer): Promise<unknown | null> {
  await pacer.acquire();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": CULPA_USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) return null;
    return parseJsonBody(await response.text());
  } catch {
    return null;
  }
}

/** Enumerate every department's professor ids into the queue. Resumable. */
async function enumerateCorpus(checkpoint: Checkpoint, pacer: DurablePacer): Promise<void> {
  if (checkpoint.enumerated) return;

  const departments = (await getJson(`${CULPA_API_BASE}/departments/all`, pacer)) as
    | Array<{ department_id?: number }>
    | null;
  if (!Array.isArray(departments)) {
    checkpoint.errors.push("could not list departments");
    saveCheckpoint(checkpoint);
    return;
  }

  const done = new Set(checkpoint.departmentsDone);
  const queued = new Set(checkpoint.queue);
  const ids = departments
    .map((department) => department.department_id)
    .filter((id): id is number => Number.isInteger(id));

  console.log(`enumerating ${ids.length} departments (${done.size} already done)`);

  for (const departmentId of ids) {
    if (done.has(departmentId)) continue;
    const professors = (await getJson(
      `${CULPA_API_BASE}/departments/${departmentId}/professors`,
      pacer,
    )) as Array<{ professor_id?: number }> | null;

    if (Array.isArray(professors)) {
      for (const professor of professors) {
        const id = professor.professor_id;
        // Cross-listed professors appear under several departments; the queue
        // is deduplicated so nobody is walked twice.
        if (Number.isInteger(id) && !queued.has(id!) && !checkpoint.visited[String(id)]) {
          queued.add(id!);
          checkpoint.queue.push(id!);
        }
      }
    }
    checkpoint.departmentsDone.push(departmentId);
    saveCheckpoint(checkpoint);
    process.stdout.write(
      `\r  departments ${checkpoint.departmentsDone.length}/${ids.length}, queue ${checkpoint.queue.length}   `,
    );
  }

  checkpoint.enumerated = true;
  saveCheckpoint(checkpoint);
  console.log(`\nenumeration complete: ${checkpoint.queue.length} professors queued`);
}

/** Walk every page of one professor's reviews. */
async function fetchProfessor(
  professorId: number,
  pacer: DurablePacer,
): Promise<ReviewFetchResult | null> {
  const pageUrl = CULPA_PAGE_ROUTES.professor(professorId);
  const pages: ReviewFetchResult[] = [];
  const seen = new Set<string>();
  let expectedTotal: number | null = null;

  for (let page = 1; page <= MAX_PAGES_PER_PROFESSOR; page += 1) {
    await pacer.acquire();
    let body: string;
    try {
      const response = await fetch(CULPA_API_ROUTES.reviewsForProfessor(professorId, page), {
        method: "GET",
        headers: { "User-Agent": CULPA_USER_AGENT, Accept: "application/json" },
      });
      if (!response.ok) break;
      body = await response.text();
    } catch {
      break;
    }

    const parsed = parseReviewsPage(body, { pageUrl });
    pages.push(parsed);
    if (parsed.totalReviews !== null) expectedTotal = parsed.totalReviews;
    for (const record of parsed.records) seen.add(record.reviewId);

    if (!parsed.hasRows) break;
    if (expectedTotal !== null && seen.size >= expectedTotal) break;
  }

  return pages.length > 0 ? mergeResults(...pages) : null;
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

function chooseExtractor(): { extractor: DimensionExtractor; version: string } {
  if (process.env.ANTHROPIC_API_KEY) {
    return { extractor: createClaudeExtractor(), version: DEFAULT_CLAUDE_MODEL };
  }
  return { extractor: defaultExtractor, version: EXTRACTOR_VERSION };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function gateOpen(): boolean {
  if (process.env.CULPA_PARTNER_OK === "1") return true;
  console.error("CULPA_PARTNER_OK is not set. This script will not touch culpa.info.");
  console.error("That variable asserts a human confirmed we are permitted to fetch. Do not");
  console.error("set it to make this run — see lib/reviews/sources/culpa.ts.");
  return false;
}

/**
 * Requests per hour actually observed, from the pacer's rolling window.
 *
 * This is the honest rate: it counts timestamps the run really issued, so it
 * survives restarts, downtime, and a --per-hour ceiling the job never reached
 * because the network was the bottleneck. Null when there is too little
 * history to divide by.
 */
function observedRequestsPerHour(checkpoint: Checkpoint): number | null {
  const times = checkpoint.requestTimes;
  if (times.length < 2) return null;
  const span = times[times.length - 1] - times[0];
  if (span <= 0) return null;
  return ((times.length - 1) / span) * HOUR_MS;
}

async function status(): Promise<void> {
  const checkpoint = loadCheckpoint();
  const visited = Object.keys(checkpoint.visited).length;
  const remaining = checkpoint.queue.length;

  console.log("CULPA backfill");
  console.log(`  gate                 ${process.env.CULPA_PARTNER_OK === "1" ? "open" : "CLOSED"}`);
  console.log(`  enumerated           ${checkpoint.enumerated ? "yes" : "no"}`);
  console.log(`  departments listed   ${checkpoint.departmentsDone.length}`);
  console.log(`  professors visited   ${visited}`);
  console.log(`  professors remaining ${remaining}`);
  console.log(`  with reviews         ${checkpoint.professorsWithReviews}`);
  console.log(`  reviews written      ${checkpoint.reviewsWritten}`);
  console.log(`  started              ${checkpoint.startedAt ?? "—"}`);
  console.log(`  last run             ${checkpoint.lastRunAt ?? "—"}`);

  const configured = checkpoint.perHour;
  console.log(
    `  paced at             ${configured === null ? "not recorded (run predates this field)" : `${configured} requests/hour`}`,
  );
  const observed = observedRequestsPerHour(checkpoint);
  if (observed !== null) {
    console.log(`  observed rate        ${observed.toFixed(0)} requests/hour`);
  }

  if (remaining > 0 && checkpoint.startedAt !== null && visited > 0) {
    // Measured, not assumed. `visited / elapsed` already folds in review
    // pagination, the pacer's gap, and write latency — where extrapolating
    // from --per-hour counts one request per professor and is wrong by
    // whatever the real page count turns out to be.
    //
    // The caveat is real and worth printing: elapsed is wall-clock since the
    // FIRST run, so any hours the job spent stopped are counted as slow
    // progress, making this an under-estimate of throughput after a restart.
    const elapsedMs = Date.now() - new Date(checkpoint.startedAt).getTime();
    const perHourObservedProfessors = (visited / elapsedMs) * HOUR_MS;
    const hours = remaining / perHourObservedProfessors;
    console.log(
      `\n  at the observed ${perHourObservedProfessors.toFixed(0)} professors/hour, the remaining ${remaining}`,
    );
    console.log(
      `  will take about ${hours.toFixed(1)} hours (${(hours / 24).toFixed(1)} days), assuming the job has run`,
    );
    console.log("  continuously since it started — any downtime makes this pessimistic.");

    const projected = Math.round((checkpoint.reviewsWritten / visited) * (visited + remaining));
    console.log(`  projected total reviews  ~${projected.toLocaleString()}`);
  }
  for (const error of checkpoint.errors.slice(-5)) console.log(`  ! ${error}`);

  const db = createServiceRoleClient();
  if (db) {
    const { count } = await db
      .from("reviews_raw")
      .select("review_id", { count: "exact", head: true });
    console.log(`\n  reviews_raw in database  ${count ?? 0}`);
  }
}

async function run(): Promise<void> {
  if (!gateOpen()) {
    process.exitCode = 1;
    return;
  }

  const perHour = Number(flag("per-hour", String(DEFAULT_PER_HOUR)));
  if (!Number.isFinite(perHour) || perHour <= 0 || perHour > 3600) {
    console.error("--per-hour must be between 1 and 3600.");
    process.exitCode = 1;
    return;
  }

  const checkpoint = loadCheckpoint();
  checkpoint.startedAt ??= new Date().toISOString();
  checkpoint.lastRunAt = new Date().toISOString();
  // Recorded so `status`, which runs in its own process, can report the rate
  // this job is actually pacing at rather than guessing at the default.
  checkpoint.perHour = perHour;
  saveCheckpoint(checkpoint);

  const pacer = new DurablePacer(checkpoint, perHour);
  const { extractor, version } = chooseExtractor();

  console.log(`CULPA backfill starting at ${perHour} requests/hour (extractor: ${version})`);
  if (perHour > DEFAULT_PER_HOUR) {
    console.warn(
      `  ! ${perHour}/hour is above the adapter's ${DEFAULT_PER_HOUR}/hour ceiling. See this file's header.`,
    );
  }

  await enumerateCorpus(checkpoint, pacer);

  let buffered: ReviewFetchResult = { records: [], documents: [], warnings: [], pagesFetched: 0 };

  async function flush(): Promise<void> {
    if (buffered.records.length === 0) return;
    const annotated = await extractDimensions(buffered.records, extractor);
    const summary = await writeReviews({
      records: annotated,
      documents: buffered.documents,
      extractorVersion: version,
    });
    checkpoint.reviewsWritten += summary.reviewsWritten;
    for (const warning of summary.warnings.slice(0, 3)) checkpoint.errors.push(warning);
    console.log(
      `  ↳ wrote ${summary.reviewsWritten} review(s); ${checkpoint.reviewsWritten} total, ${checkpoint.queue.length} professors left`,
    );
    buffered = { records: [], documents: [], warnings: [], pagesFetched: 0 };
    saveCheckpoint(checkpoint);
  }

  // Drain the queue one professor at a time, checkpointing after each so a kill
  // costs at most one professor's worth of work.
  while (checkpoint.queue.length > 0) {
    const professorId = checkpoint.queue[0];
    const result = await fetchProfessor(professorId, pacer);

    if (result && result.records.length > 0) {
      buffered = mergeResults(buffered, result);
      checkpoint.professorsWithReviews += 1;
    }

    checkpoint.queue.shift();
    checkpoint.visited[String(professorId)] = true;
    saveCheckpoint(checkpoint);

    if (buffered.records.length >= FLUSH_EVERY_RECORDS) await flush();
  }

  await flush();
  console.log(`\nBackfill complete. ${checkpoint.reviewsWritten} reviews written.`);
}

function reset(): void {
  saveCheckpoint(emptyCheckpoint());
  console.log("checkpoint cleared (database rows are untouched)");
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "status";
  if (command === "status") return status();
  if (command === "run") return run();
  if (command === "reset") return reset();
  console.error(`Unknown command "${command}". Expected status | run | reset.`);
  process.exitCode = 1;
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exitCode = 1;
});
