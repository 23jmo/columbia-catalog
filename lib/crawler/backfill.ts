/**
 * Columbia Catalog — the one-shot backfill runner.
 *
 *   npx tsx lib/crawler/backfill.ts --dry-run
 *   npx tsx lib/crawler/backfill.ts --terms=20263,20271 --spacing=4
 *
 * Seeds `crawl_jobs` for every subject across ACTIVE_TERMS + ARCHIVED_TERMS —
 * roughly 900 subjects × 8 terms. It does NOT fetch anything itself: it writes
 * a paced schedule and lets the normal consumers (browsers first, cron as the
 * backstop) drain it. That is the whole point. A backfill that fetched 7,000
 * pages itself would be exactly the burst we are trying never to produce.
 *
 * Pacing: jobs are spread `--spacing` seconds apart with jitter, so a full
 * cold catalog lands at roughly 1/spacing requests per second sustained
 * (default 4s ≈ 0.25 req/s, the figure in spec §10). The order is shuffled
 * with a seeded PRNG so the queue does not march alphabetically through the
 * directory, which is the most obviously mechanical pattern available.
 */

import {
  ACTIVE_TERMS,
  ARCHIVED_TERMS,
  BULLETIN_BASE,
  subjectTermUrl,
  termDirectoryLabel,
} from "@/lib/constants";
import type { CrawlJobKind, TermCode } from "@/lib/types";
import {
  tryGetCrawlerRuntime,
  type CrawlJobSpec,
  type CrawlJobStore,
  type CrawlerRuntime,
} from "./contracts";
import { subjectIndexUrls } from "../ingest/parsers/subject-index";
import { politeFetch } from "./fetcher";
import { jitterSeconds, urlForSubjectIndexLetter } from "./scheduler";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface BackfillOptions {
  dryRun: boolean;
  terms: TermCode[];
  /** Explicit subject codes. When empty, they are discovered from the directory. */
  subjects: string[];
  /** Seconds between consecutive scheduled jobs. */
  spacingSeconds: number;
  /** Seconds from now before the first job becomes due. */
  startInSeconds: number;
  /** Also seed the 26 `sel/dept-X.html` subject-index pages. */
  includeSubjectIndex: boolean;
  /** Bulletin department slugs to seed (server-only jobs; no CORS there). */
  bulletinDepartments: string[];
  /** Seed for the shuffle, so a dry run and the real run agree. */
  seed: number;
  /** Batch size for `upsertJobs`. */
  chunkSize: number;
}

export const DEFAULT_BACKFILL_OPTIONS: BackfillOptions = {
  dryRun: false,
  terms: [...ACTIVE_TERMS, ...ARCHIVED_TERMS],
  subjects: [],
  spacingSeconds: 4,
  startInSeconds: 60,
  includeSubjectIndex: true,
  bulletinDepartments: [],
  seed: 20263,
  chunkSize: 250,
};

const INDEX_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function parseBackfillArgs(argv: readonly string[]): BackfillOptions {
  const options: BackfillOptions = { ...DEFAULT_BACKFILL_OPTIONS };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--terms=")) {
      options.terms = arg.slice("--terms=".length).split(",").map((t) => t.trim()).filter(Boolean);
    } else if (arg.startsWith("--subjects=")) {
      options.subjects = arg
        .slice("--subjects=".length)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg.startsWith("--spacing=")) {
      options.spacingSeconds = Math.max(Number(arg.slice("--spacing=".length)) || 0, 0.5);
    } else if (arg.startsWith("--start-in=")) {
      options.startInSeconds = Math.max(Number(arg.slice("--start-in=".length)) || 0, 0);
    } else if (arg === "--no-subject-index") {
      options.includeSubjectIndex = false;
    } else if (arg.startsWith("--bulletin=")) {
      options.bulletinDepartments = arg
        .slice("--bulletin=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--seed=")) {
      options.seed = Number(arg.slice("--seed=".length)) || DEFAULT_BACKFILL_OPTIONS.seed;
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Deterministic shuffle
// ---------------------------------------------------------------------------

/** mulberry32 — small, deterministic, good enough for ordering work. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Plan construction
// ---------------------------------------------------------------------------

export interface BackfillPlan {
  specs: CrawlJobSpec[];
  /** Wall-clock seconds between the first and last scheduled job. */
  spanSeconds: number;
  countsByKind: Record<string, number>;
  subjectCount: number;
  termCount: number;
  requestsPerSecond: number;
  /** Subject-term pairs the directory index says do not exist. */
  skippedUnoffered: number;
}

/**
 * Builds the full job list without touching the network or the database, so
 * `--dry-run` exercises exactly the code the real run uses.
 */
export function buildBackfillPlan(
  subjects: readonly string[],
  options: BackfillOptions,
  now: Date = new Date(),
  /**
   * Subject code -> the terms that subject actually offers. When a subject is
   * absent from the map it is crossed with every requested term, so an
   * incomplete map degrades to the old behaviour instead of dropping work.
   */
  availability?: ReadonlyMap<string, ReadonlySet<TermCode>>,
): BackfillPlan {
  const random = seededRandom(options.seed);

  interface Unit {
    kind: CrawlJobKind;
    targetKey: string;
    termCode: TermCode | null;
    url: string;
  }

  const units: Unit[] = [];

  let skippedUnoffered = 0;
  for (const subject of subjects) {
    const offered = availability?.get(subject.toUpperCase());
    for (const termCode of options.terms) {
      if (offered && !offered.has(termCode)) {
        skippedUnoffered += 1;
        continue;
      }
      units.push({
        kind: "subject_term",
        targetKey: subject.toUpperCase(),
        termCode,
        url: subjectTermUrl(subject.toUpperCase(), termCode),
      });
    }
  }

  if (options.includeSubjectIndex) {
    for (const letter of INDEX_LETTERS) {
      units.push({
        kind: "subject_index",
        targetKey: letter,
        termCode: null,
        url: urlForSubjectIndexLetter(letter),
      });
    }
  }

  for (const department of options.bulletinDepartments) {
    units.push({
      kind: "bulletin_department",
      targetKey: department,
      termCode: null,
      url: `${BULLETIN_BASE}/${department.replace(/^\/+/, "")}`,
    });
  }

  // Shuffle so the queue does not walk the directory alphabetically.
  const ordered = shuffled(units, random);

  const specs: CrawlJobSpec[] = ordered.map((unit, index) => {
    const offsetSeconds =
      options.startInSeconds + jitterSeconds(index * options.spacingSeconds, random);
    return {
      kind: unit.kind,
      targetKey: unit.targetKey,
      termCode: unit.termCode,
      url: unit.url,
      tier: "baseline",
      nextFetchAt: new Date(now.getTime() + offsetSeconds * 1000).toISOString(),
      // A re-run must not drag already-healthy jobs back to the front of the
      // queue; only brand-new rows get this schedule.
      resetSchedule: false,
    };
  });

  const countsByKind: Record<string, number> = {};
  for (const spec of specs) {
    countsByKind[spec.kind] = (countsByKind[spec.kind] ?? 0) + 1;
  }

  const times = specs.map((spec) => Date.parse(spec.nextFetchAt));
  const spanSeconds =
    times.length > 0 ? (Math.max(...times) - Math.min(...times)) / 1000 : 0;

  return {
    specs,
    spanSeconds,
    countsByKind,
    subjectCount: subjects.length,
    termCount: options.terms.length,
    requestsPerSecond: spanSeconds > 0 ? specs.length / spanSeconds : 0,
    skippedUnoffered,
  };
}

// ---------------------------------------------------------------------------
// Subject discovery
// ---------------------------------------------------------------------------

/**
 * Reads the 26 directory index pages and unions their subject codes. Uses the
 * polite fetcher, so it is serialized and paced like everything else.
 */
export interface SubjectDiscovery {
  subjects: string[];
  /** Subject code -> terms the directory says it offers. */
  availability: Map<string, Set<TermCode>>;
}

/**
 * Reads the directory subject index and unions its subject codes.
 *
 * `sel/subjects.html` carries every subject in one page, so it is tried first
 * and the 26 per-letter pages are a fallback for the day it is paginated or
 * dropped — 1 request instead of 26 for identical data. Uses the polite
 * fetcher, so it is serialized and paced like everything else.
 */
export async function discoverSubjectIndex(
  runtime: CrawlerRuntime,
  log: (line: string) => void = console.log,
): Promise<SubjectDiscovery> {
  const codes = new Set<string>();
  const availability = new Map<string, Set<TermCode>>();

  const absorb = (url: string, html: string, targetKey: string): number => {
    const parsed = runtime.parsers.parseSubjectIndex(html, {
      url,
      targetKey,
      termCode: null,
      fetchedAt: new Date().toISOString(),
    });
    for (const subject of parsed.subjects) codes.add(subject.subjectCode.toUpperCase());
    for (const entry of parsed.availability ?? []) {
      const code = entry.subjectCode.toUpperCase();
      const terms = availability.get(code) ?? new Set<TermCode>();
      for (const label of entry.termLabels) {
        const termCode = termCodeFromDirectoryLabel(label);
        // An unrecognized label is dropped rather than guessed. Guessing wrong
        // would either enqueue a page that cannot exist or, worse, silently
        // exclude a term the subject really does offer.
        if (termCode) terms.add(termCode);
      }
      if (terms.size > 0) availability.set(code, terms);
    }
    return parsed.subjects.length;
  };

  const [allSubjectsUrl] = subjectIndexUrls();
  const combined = await politeFetch(allSubjectsUrl);
  if (combined.ok && combined.html) {
    const found = absorb(allSubjectsUrl, combined.html, "ALL");
    if (found > 0) {
      log(`  sel/subjects.html: ${found} subjects`);
      return { subjects: [...codes].sort(), availability };
    }
    log("  sel/subjects.html carried no subjects — falling back to the letter pages");
  } else {
    log(`  ! sel/subjects.html: ${combined.error ?? `HTTP ${combined.status}`}`);
  }

  for (const letter of INDEX_LETTERS) {
    const url = urlForSubjectIndexLetter(letter);
    const outcome = await politeFetch(url);
    if (!outcome.ok || !outcome.html) {
      log(`  ! ${letter}: ${outcome.error ?? `HTTP ${outcome.status}`}`);
      continue;
    }
    try {
      absorb(url, outcome.html, letter);
    } catch (cause) {
      log(`  ! ${letter}: parse failed — ${cause instanceof Error ? cause.message : cause}`);
    }
  }

  return { subjects: [...codes].sort(), availability };
}

/** Back-compat shim: the codes alone, for callers that do not need terms. */
export async function discoverSubjects(
  runtime: CrawlerRuntime,
  log: (line: string) => void = console.log,
): Promise<string[]> {
  return (await discoverSubjectIndex(runtime, log)).subjects;
}

/** "Fall2026" -> "20263". Returns null for anything unrecognized. */
export function termCodeFromDirectoryLabel(label: string): TermCode | null {
  const match = /^(Spring|Summer|Fall)\s*([0-9]{4})$/i.exec(label.trim());
  if (!match) return null;
  const season = match[1].toLowerCase();
  const suffix = season === "spring" ? "1" : season === "summer" ? "2" : "3";
  return `${match[2]}${suffix}`;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface BackfillResult {
  plan: BackfillPlan;
  jobsCreated: number;
  dryRun: boolean;
}

export async function runBackfill(
  options: BackfillOptions,
  deps: {
    runtime?: CrawlerRuntime | null;
    store?: Pick<CrawlJobStore, "upsertJobs">;
    now?: Date;
    log?: (line: string) => void;
  } = {},
): Promise<BackfillResult> {
  const log = deps.log ?? console.log;
  const now = deps.now ?? new Date();
  const runtime = deps.runtime ?? tryGetCrawlerRuntime();

  let subjects = options.subjects;
  let availability: Map<string, Set<TermCode>> | undefined;
  if (subjects.length === 0) {
    if (!runtime) {
      throw new Error(
        "No subjects given and no crawler runtime registered to discover them. " +
          "Pass --subjects=COMS,MATH,... or register the runtime first.",
      );
    }
    log("Discovering subjects from the directory index…");
    const discovery = await discoverSubjectIndex(runtime, log);
    subjects = discovery.subjects;
    availability = discovery.availability;
    log(`  found ${subjects.length} subjects`);
  }

  const plan = buildBackfillPlan(subjects, options, now, availability);

  log("");
  log("Backfill plan");
  log("─".repeat(60));
  log(`  subjects        ${plan.subjectCount}`);
  log(`  terms           ${plan.termCount} (${options.terms.map(termDirectoryLabel).join(", ")})`);
  log(`  jobs            ${plan.specs.length}`);
  for (const [kind, count] of Object.entries(plan.countsByKind)) {
    log(`    ${kind.padEnd(20)} ${count}`);
  }
  if (plan.skippedUnoffered > 0) {
    log(`  skipped         ${plan.skippedUnoffered} subject-term(s) the index says do not exist`);
  }
  log(`  spacing         ${options.spacingSeconds}s (± jitter)`);
  log(`  drains over     ${(plan.spanSeconds / 3600).toFixed(1)}h`);
  log(`  sustained rate  ${plan.requestsPerSecond.toFixed(3)} req/s`);
  log(`  first due       ${plan.specs[0]?.nextFetchAt ?? "—"}`);
  log(`  last due        ${plan.specs.at(-1)?.nextFetchAt ?? "—"}`);
  log("─".repeat(60));

  if (options.dryRun) {
    log("");
    log("DRY RUN — nothing was written. Sample of the first 10 jobs:");
    for (const spec of plan.specs.slice(0, 10)) {
      log(`  ${spec.nextFetchAt}  ${spec.kind.padEnd(18)} ${spec.url}`);
    }
    return { plan, jobsCreated: 0, dryRun: true };
  }

  const store = deps.store ?? runtime?.jobStore;
  if (!store) {
    throw new Error("No job store available. Register the crawler runtime before running.");
  }

  let created = 0;
  for (let i = 0; i < plan.specs.length; i += options.chunkSize) {
    const chunk = plan.specs.slice(i, i + options.chunkSize);
    created += await store.upsertJobs(chunk);
    log(`  upserted ${Math.min(i + chunk.length, plan.specs.length)}/${plan.specs.length}`);
  }

  log(`Done. ${created} new job(s) created.`);
  return { plan, jobsCreated: created, dryRun: false };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseBackfillArgs(process.argv.slice(2));
  try {
    await runBackfill(options);
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exitCode = 1;
  }
}

// Only run when invoked directly (`npx tsx lib/crawler/backfill.ts`), never on
// import — this module is also read by tests.
const invokedPath = process.argv[1] ?? "";
if (invokedPath.endsWith("backfill.ts") || invokedPath.endsWith("backfill.js")) {
  void main();
}
