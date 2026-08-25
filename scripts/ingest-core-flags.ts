/**
 * LionPlan — Core requirement flag ingest.
 *
 *   npx tsx --env-file=.env.local scripts/ingest-core-flags.ts status
 *   npx tsx --env-file=.env.local scripts/ingest-core-flags.ts run --dry-run
 *   npx tsx --env-file=.env.local scripts/ingest-core-flags.ts run
 *
 * ── What this fixes ────────────────────────────────────────────────────────
 *
 * `courses.requirement_flags` has existed since `0001_catalog.sql`, with a GIN
 * index and a comment naming the one query it serves. Nothing ever wrote to it.
 * All 8,189 rows held `{}`.
 *
 * That made every `flagged` requirement unanswerable. `cc-core.ts` asks for
 * `n_matching` over `flag: "globalCore"` and `flag: "scienceRequirement"`;
 * against an empty column both return nothing, and a requirement with no
 * candidates renders identically to a requirement already satisfied. The Core
 * requirements a student most needs help with were the ones the app could say
 * least about.
 *
 * ── Why an operator script rather than the crawl lane ──────────────────────
 *
 * Same reasoning as `ingest-reviews.ts`. Seat counts are a live signal and are
 * swept continuously; an approved-course list is revised roughly once a term
 * and carries the Bulletin's own "Last updated on …" stamp. Running it on a
 * five-minute cron would be 8,000 writes an hour to change nothing. This is an
 * action an operator takes when the Bulletin publishes a new list.
 *
 * ── Provenance ─────────────────────────────────────────────────────────────
 *
 * The Bulletin's "Last updated on June 23, 2026." is echoed in the report
 * rather than invented here, per the rule that every number travels with where
 * it came from. A course flagged from a list whose freshness we cannot state is
 * a course whose flag we cannot defend.
 */

import { createServiceRoleClient } from "@/lib/db/client";
import {
  CORE_FLAG_SOURCES,
  collectCoreFlags,
  readCoreFlagPage,
  type CoreFlagPageResult,
} from "@/lib/ingest/core-flags";
import type { RequirementFlags } from "@/lib/types";

const USER_AGENT =
  "LionPlan/1.0 (+https://github.com/columbia-catalog; course requirement ingest)";

interface Args {
  command: "status" | "run";
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const command = argv.find((a) => !a.startsWith("--")) ?? "status";
  if (command !== "status" && command !== "run") {
    throw new Error(`Unknown command "${command}". Use "status" or "run".`);
  }
  return { command, dryRun: argv.includes("--dry-run") };
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function readAllPages(): Promise<CoreFlagPageResult[]> {
  const pages: CoreFlagPageResult[] = [];
  for (const source of CORE_FLAG_SOURCES) {
    process.stdout.write(`  fetching ${source.label} … `);
    const html = await fetchPage(source.url);
    const page = readCoreFlagPage(source, html);
    pages.push(page);
    console.log(
      `${page.flaggedCourseIds.length} courses across ${page.headings.length} table(s)` +
        (page.lastUpdatedText ? ` — ${page.lastUpdatedText}` : ""),
    );
    if (page.unmappedHeadings.length > 0) {
      // Loud, not silent: an unmapped heading is a table whose courses earned
      // no flag. That is either page furniture (fine) or a new category we
      // have not taught this script about (not fine, and invisible otherwise).
      console.log(`    unmapped headings: ${page.unmappedHeadings.join(" · ")}`);
    }
  }
  return pages;
}

/**
 * Split the parsed course ids into ones our catalog holds and ones it does not.
 *
 * The misses matter and are reported rather than swallowed. A course on the
 * approved list that we cannot resolve is usually a genuinely archived course
 * — the Global Core list carries codes from terms we never crawled — but a
 * SUDDEN jump in the miss rate means the code parser broke, and the only way to
 * see that is to print the number every run.
 */
async function partitionAgainstCatalog(
  courseIds: string[],
): Promise<{ known: string[]; missing: string[] }> {
  const client = createServiceRoleClient();
  if (!client) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

  const known = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < courseIds.length; i += CHUNK) {
    const slice = courseIds.slice(i, i + CHUNK);
    const { data, error } = await client
      .from("courses")
      .select("course_id")
      .in("course_id", slice);
    if (error) throw new Error(`courses lookup failed: ${error.message}`);
    for (const row of data ?? []) known.add(row.course_id);
  }

  return {
    known: courseIds.filter((id) => known.has(id)),
    missing: courseIds.filter((id) => !known.has(id)),
  };
}

/**
 * Write the flags.
 *
 * A read-modify-write rather than a blind overwrite. Nothing else populates
 * this column today, so an overwrite would be correct right now — and would
 * quietly become a data-loss bug the moment a second source (Barnard's Ways of
 * Knowing, say) starts writing its own keys. Merging costs one extra read.
 */
async function writeFlags(
  flags: Map<string, RequirementFlags>,
  known: string[],
): Promise<number> {
  const client = createServiceRoleClient();
  if (!client) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

  let written = 0;
  const CHUNK = 200;

  for (let i = 0; i < known.length; i += CHUNK) {
    const slice = known.slice(i, i + CHUNK);
    const { data, error } = await client
      .from("courses")
      .select("course_id, requirement_flags")
      .in("course_id", slice);
    if (error) throw new Error(`read failed: ${error.message}`);

    for (const row of data ?? []) {
      const existing = (row.requirement_flags ?? {}) as RequirementFlags;
      const incoming = flags.get(row.course_id) ?? {};
      const merged: RequirementFlags = { ...existing };
      for (const [key, value] of Object.entries(incoming)) {
        if (value === true) merged[key] = true;
      }

      // Skip rows that would not change — an idempotent re-run should not
      // bump `updated_at` on four hundred courses for nothing.
      if (JSON.stringify(merged) === JSON.stringify(existing)) continue;

      const { error: updateError } = await client
        .from("courses")
        .update({ requirement_flags: merged })
        .eq("course_id", row.course_id);
      if (updateError) throw new Error(`write ${row.course_id}: ${updateError.message}`);
      written += 1;
    }
    process.stdout.write(`\r  writing … ${Math.min(i + CHUNK, known.length)}/${known.length}`);
  }
  process.stdout.write("\n");

  return written;
}

/**
 * Match rate per table, which is the number that actually diagnoses a break.
 *
 * The headline miss rate is ~56% and that is FINE: the Bulletin's master list
 * is historical and spans years of courses we never crawled, plus study-abroad
 * offerings the Directory never carries. Judging the parser on it would be
 * judging it on our crawl depth.
 *
 * The current term is the honest test, because every course on it should be in
 * a catalog that holds that term — Fall 2026 sits at 60/61. If THAT number ever
 * falls off a cliff, the code parser has broken; if only the archival rows move,
 * nothing is wrong. One line of output separates the two.
 */
async function reportMatchRateByHeading(
  pages: CoreFlagPageResult[],
  known: Set<string>,
): Promise<void> {
  console.log("\n  match rate by list:");
  for (const page of pages) {
    const byHeading = new Map<string, Set<string>>();
    for (const entry of page.entries) {
      if (page.source.flagsFor(entry.heading).length === 0) continue;
      const key = entry.heading ?? "(no heading)";
      const set = byHeading.get(key) ?? new Set<string>();
      set.add(entry.courseId);
      byHeading.set(key, set);
    }
    for (const [heading, ids] of byHeading) {
      const hit = [...ids].filter((id) => known.has(id)).length;
      const pct = ids.size > 0 ? Math.round((hit / ids.size) * 100) : 0;
      console.log(`    ${heading.padEnd(44)} ${hit}/${ids.size} (${pct}%)`);
    }
  }
}

async function reportCurrentState(): Promise<void> {
  const client = createServiceRoleClient();
  if (!client) {
    console.log("SUPABASE_SERVICE_ROLE_KEY is not set — cannot read the catalog.");
    return;
  }

  const { count: total } = await client
    .from("courses")
    .select("course_id", { count: "exact", head: true });

  const counts: Record<string, number> = {};
  for (const key of ["globalCore", "scienceRequirement", "scienceB", "scienceC"]) {
    const { count } = await client
      .from("courses")
      .select("course_id", { count: "exact", head: true })
      .contains("requirement_flags", { [key]: true });
    counts[key] = count ?? 0;
  }

  console.log(`\ncourses in catalog: ${total ?? 0}`);
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(20)} ${value}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "status") {
    await reportCurrentState();
    return;
  }

  console.log("Reading the Bulletin's approved course lists:");
  const pages = await readAllPages();

  const flags = collectCoreFlags(pages);
  const allIds = [...flags.keys()].sort();
  console.log(`\nparsed ${allIds.length} distinct approved courses`);

  const { known, missing } = await partitionAgainstCatalog(allIds);
  const missRate = allIds.length > 0 ? (missing.length / allIds.length) * 100 : 0;
  console.log(`  in our catalog: ${known.length}`);
  console.log(`  not in our catalog: ${missing.length} (${missRate.toFixed(1)}%)`);
  if (missing.length > 0) {
    console.log(`  e.g. ${missing.slice(0, 12).join(", ")}`);
  }

  await reportMatchRateByHeading(pages, new Set(known));

  if (args.dryRun) {
    console.log("\n--dry-run: nothing written.");
    await reportCurrentState();
    return;
  }

  const written = await writeFlags(flags, known);
  console.log(`\nupdated ${written} course rows`);
  await reportCurrentState();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
