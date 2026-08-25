/**
 * LionPlan — review ingest operator.
 *
 *   npx tsx --env-file=.env.local scripts/ingest-reviews.ts status
 *   npx tsx --env-file=.env.local scripts/ingest-reviews.ts run --source=reddit --courses=20
 *   npx tsx --env-file=.env.local scripts/ingest-reviews.ts run --course=COMS4118
 *   npx tsx --env-file=.env.local scripts/ingest-reviews.ts run --instructor="Jae Woo Lee"
 *
 * ── Why a script and not a cron route ──────────────────────────────────────
 *
 * Seat data is a live signal and has to be swept continuously. Reviews are
 * not: a course accumulates a handful a semester, and CULPA's corpus is
 * historical. Ingest is therefore an operator action — run it when a source
 * becomes available, not every five minutes forever.
 *
 * ── Why nothing runs today ─────────────────────────────────────────────────
 *
 * v1 ships with the pipeline built and no review data (.plans/BLOCKERS.md #3).
 *
 *   · Reddit needs REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USER_AGENT.
 *     Without them `status` says so and `run` exits without a single request.
 *
 *   · CULPA is a PARTNERSHIP, not a scrape (spec §12). This script will not
 *     touch culpa.info unless CULPA_PARTNER_OK=1 is set, and that variable
 *     means "a human has confirmed we are allowed to" — it is not a switch to
 *     flip because the data would be nice to have. There is no default-on path
 *     and no way to reach the adapter by accident.
 *
 * ── Extraction ─────────────────────────────────────────────────────────────
 *
 * Dimensions are extracted ONCE, here, and stored. Set ANTHROPIC_API_KEY to
 * use the Claude extractor; otherwise the deterministic heuristic runs. The
 * chosen extractor's name is stamped into `review_dimensions.model_version`,
 * so a later re-extraction campaign can find exactly the rows an older
 * extractor produced.
 */

import { createServiceRoleClient } from "@/lib/db/client";
import { EXTRACTOR_VERSION, writeReviews } from "@/lib/db/review-writer";
import {
  createClaudeExtractor,
  DEFAULT_CLAUDE_MODEL,
  defaultExtractor,
  extractDimensions,
  type DimensionExtractor,
} from "@/lib/reviews/extract";
import {
  createFetchPageFetcher,
  mergeResults,
  type ReviewFetchResult,
  type ReviewSourceAdapter,
} from "@/lib/reviews/sources/contract";
import { CulpaApiAdapter } from "@/lib/reviews/sources/culpa-api";
import { RedditAdapter, readRedditCredentialsFromEnv } from "@/lib/reviews/sources/reddit";

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** How many courses `run` covers when no explicit target is given. */
const DEFAULT_COURSE_BUDGET = 25;

// ---------------------------------------------------------------------------
// Which adapters are allowed to run
// ---------------------------------------------------------------------------

interface SourceStatus {
  kind: "reddit" | "culpa";
  available: boolean;
  reason: string;
}

function redditStatus(): SourceStatus {
  const credentials = readRedditCredentialsFromEnv();
  return credentials
    ? { kind: "reddit", available: true, reason: "credentials present" }
    : {
        kind: "reddit",
        available: false,
        reason: "set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT",
      };
}

function culpaStatus(): SourceStatus {
  return process.env.CULPA_PARTNER_OK === "1"
    ? { kind: "culpa", available: true, reason: "CULPA_PARTNER_OK=1 — partnership confirmed" }
    : {
        kind: "culpa",
        available: false,
        reason: "partnership required (spec §12); set CULPA_PARTNER_OK=1 only once it exists",
      };
}

function adapterFor(kind: "reddit" | "culpa"): ReviewSourceAdapter {
  return kind === "reddit"
    ? new RedditAdapter()
    : new CulpaApiAdapter({ fetcher: createFetchPageFetcher() });
}

/**
 * Claude when a key is present, the heuristic otherwise.
 *
 * Both are returned with the version string that will be stamped onto every
 * row they produce — the extractor and its label must never drift apart.
 */
function chooseExtractor(): { extractor: DimensionExtractor; version: string } {
  if (process.env.ANTHROPIC_API_KEY) {
    return { extractor: createClaudeExtractor(), version: DEFAULT_CLAUDE_MODEL };
  }
  return { extractor: defaultExtractor, version: EXTRACTOR_VERSION };
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/**
 * Which courses to ask about, busiest first.
 *
 * Reviews are worth the most where the most students are choosing, and every
 * source charges a request per lookup — so a bounded run should spend its
 * budget on the courses a reader is actually likely to open.
 */
async function busiestCourses(limit: number): Promise<string[]> {
  const db = createServiceRoleClient();
  if (!db) return [];
  const { data, error } = await db
    .from("sections")
    .select("course_id, enrollment_count")
    .not("enrollment_count", "is", null)
    .order("enrollment_count", { ascending: false })
    .limit(limit * 8);
  if (error || !data) return [];

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const row of data) {
    if (!row.course_id || seen.has(row.course_id)) continue;
    seen.add(row.course_id);
    ordered.push(row.course_id);
    if (ordered.length >= limit) break;
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function status(): Promise<void> {
  const sources = [redditStatus(), culpaStatus()];
  console.log("Review sources");
  for (const source of sources) {
    console.log(`  ${source.available ? "✓" : "✗"} ${source.kind.padEnd(7)} ${source.reason}`);
  }

  const { version } = chooseExtractor();
  console.log(`\nExtractor        ${version}`);

  const db = createServiceRoleClient();
  if (!db) {
    console.log("\nDatabase         not configured (SUPABASE_SERVICE_ROLE_KEY missing)");
    return;
  }
  const { count: reviewCount } = await db
    .from("reviews_raw")
    .select("review_id", { count: "exact", head: true });
  const { count: dimensionCount } = await db
    .from("review_dimensions")
    .select("review_id", { count: "exact", head: true });
  console.log(`\nreviews_raw      ${reviewCount ?? 0}`);
  console.log(`review_dimensions ${dimensionCount ?? 0}`);
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const requested = flag("source", "reddit") as "reddit" | "culpa";
  const source = requested === "culpa" ? culpaStatus() : redditStatus();
  if (!source.available) {
    console.error(`Source "${source.kind}" is unavailable: ${source.reason}`);
    console.error("Nothing was fetched.");
    process.exitCode = 1;
    return;
  }

  const adapter = adapterFor(source.kind);
  const singleCourse = flag("course", "");
  const singleInstructor = flag("instructor", "");

  const courses = singleCourse
    ? [singleCourse]
    : singleInstructor
      ? []
      : await busiestCourses(Number(flag("courses", String(DEFAULT_COURSE_BUDGET))));
  const instructors = singleInstructor ? [singleInstructor] : [];

  if (courses.length === 0 && instructors.length === 0) {
    console.error("No targets. Pass --course=…, --instructor=… or seed the catalog first.");
    process.exitCode = 1;
    return;
  }

  console.log(
    `Fetching from ${source.kind}: ${courses.length} course(s), ${instructors.length} instructor(s)`,
  );

  const results: ReviewFetchResult[] = [];
  for (const courseId of courses) {
    const result = await adapter.fetchForCourse(courseId);
    console.log(`  ${courseId} — ${result.records.length} review(s), ${result.pagesFetched} page(s)`);
    results.push(result);
  }
  for (const name of instructors) {
    const result = await adapter.fetchForInstructor(name);
    console.log(`  ${name} — ${result.records.length} review(s), ${result.pagesFetched} page(s)`);
    results.push(result);
  }

  const merged = mergeResults(...results);
  for (const warning of merged.warnings) console.warn(`  ! ${warning}`);
  if (merged.records.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  const { extractor, version } = chooseExtractor();
  const annotated = await extractDimensions(merged.records, extractor);
  const summary = await writeReviews({
    records: annotated,
    documents: merged.documents,
    extractorVersion: version,
  });

  console.log("─".repeat(46));
  console.log(`  reviews written        ${summary.reviewsWritten}`);
  console.log(`  dimensions written     ${summary.dimensionsWritten}`);
  console.log(`  unresolved courses     ${summary.unresolvedCourses}`);
  console.log(`  unresolved instructors ${summary.unresolvedInstructors}`);
  for (const warning of summary.warnings) console.warn(`  ! ${warning}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const command = process.argv[2] ?? "status";
  switch (command) {
    case "status":
      await status();
      return;
    case "run":
      await run();
      return;
    default:
      console.error(`Unknown command "${command}". Expected status | run.`);
      process.exitCode = 1;
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exitCode = 1;
});
