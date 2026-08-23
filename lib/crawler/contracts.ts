/**
 * Columbia Catalog — crawler lane contracts.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * The crawl runtime sits between two lanes it does not own:
 *
 *   lib/db/**              — the job store and catalog writer (another agent)
 *   lib/ingest/parsers/**  — the HTML parsers (another agent)
 *
 * Rather than importing their modules (which would couple compilation of this
 * lane to theirs), the crawler codes against the narrow interfaces below and
 * resolves concrete implementations at runtime through a tiny registry. The
 * owning lanes call `registerCrawlerRuntime({ ... })` once from their own
 * bootstrap; nothing in `lib/crawler/**` ever reaches into their directories.
 *
 * Everything here is deliberately minimal: only the operations the crawler
 * actually performs. Shared domain shapes come from `@/lib/types`; nothing is
 * redefined.
 */

import type {
  ParsedBulletinCourse,
  ParsedBulletinRowWithTerm,
} from "@/lib/ingest/parsers/bulletin";
import type {
  CrawlJob,
  CrawlJobKind,
  CrawlTier,
  ParsedSectionDetail,
  ParsedSubjectPage,
  TermCode,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Job specification (what backfill/scheduling hands to the store)
// ---------------------------------------------------------------------------

/**
 * A job the crawler wants to exist. The store is expected to upsert on the
 * natural key `(kind, targetKey, termCode)` and must NOT reset `nextFetchAt`
 * for a job that already exists unless `resetSchedule` is true — otherwise a
 * re-run of the backfill would stampede the whole catalog.
 */
export interface CrawlJobSpec {
  kind: CrawlJobKind;
  targetKey: string;
  termCode: TermCode | null;
  url: string;
  tier: CrawlTier;
  nextFetchAt: string;
  resetSchedule?: boolean;
}

/** Filter passed to the store when a consumer claims work. */
export interface ClaimOptions {
  /** Claiming identity, written to `leased_by`. */
  leasedBy: string;
  /** Hard cap on rows returned. Never exceeds MAX_LEASE_BATCH for browsers. */
  limit: number;
  /** Lease expiry the store should write to `leased_until`. */
  leasedUntil: string;
  /**
   * Only claim jobs whose `nextFetchAt <= dueBefore`. Cron passes
   * `now - CRON_GRACE_SECONDS` so it never steals fresh work from browsers.
   */
  dueBefore: string;
  /** When present, only these kinds are eligible. */
  includeKinds?: CrawlJobKind[];
  /** When present, these kinds are never returned (browsers exclude bulletin). */
  excludeKinds?: CrawlJobKind[];
  /** When present, only jobs whose host is in this list are eligible. */
  allowedHosts?: string[];
}

/** Terminal outcome the crawler reports back for a leased job. */
export interface JobOutcome {
  jobId: string;
  ok: boolean;
  /** Jittered next due time computed by the scheduler. Always supplied. */
  nextFetchAt: string;
  /** ISO timestamp of a successful read; omitted on failure. */
  lastOkAt?: string;
  /** Short failure note, stored for operator triage. */
  error?: string;
}

/**
 * Size/shape fingerprint of one ingest run for one key. The quarantine guard
 * compares the incoming run against the last committed one; a run that is
 * smaller or emptier is refused.
 */
export interface IngestFingerprint {
  /** Number of top-level records (sections, bulletin rows, …). */
  recordCount: number;
  /** Number of populated (non-null, non-empty) scalar fields across records. */
  filledFieldCount: number;
  /** ISO timestamp this fingerprint was committed. */
  capturedAt: string;
}

/** One row of `ingest_runs`. */
export interface IngestRunRecord {
  jobId: string;
  /** The quarantine key: `${kind}:${targetKey}:${termCode ?? "-"}`. */
  ingestKey: string;
  startedAt: string;
  finishedAt: string;
  status: "ok" | "quarantined" | "parse_error" | "fetch_error";
  recordsWritten: number;
  quarantined: boolean;
  notes: string | null;
  /** Consumer that produced the run: browser, cron or backfill. */
  source: CrawlConsumer;
}

export type CrawlConsumer = "browser" | "cron" | "backfill";

// ---------------------------------------------------------------------------
// Job store
// ---------------------------------------------------------------------------

/**
 * The persistence surface the crawler needs. Implemented in `lib/db/**` with
 * `SELECT ... FOR UPDATE SKIP LOCKED` semantics for `claimDueJobs` — three
 * consumers claim from the same queue concurrently and must never collide.
 */
export interface CrawlJobStore {
  /** Atomically lease up to `limit` due jobs. Must skip already-leased rows. */
  claimDueJobs(options: ClaimOptions): Promise<CrawlJob[]>;

  /** Read one job by id. Used to validate a submission against its lease. */
  getJob(jobId: string): Promise<CrawlJob | null>;

  /**
   * Close out a leased job: clears the lease, writes `nextFetchAt`, and either
   * stamps `lastOkAt` or increments `consecutiveFailures`.
   */
  completeJob(outcome: JobOutcome): Promise<void>;

  /** Return a job to the pool untouched (client declined / lease expired). */
  releaseJob(jobId: string, leasedBy: string): Promise<void>;

  /** Upsert job specs on `(kind, targetKey, termCode)`. Returns rows created. */
  upsertJobs(specs: CrawlJobSpec[]): Promise<number>;

  /** Move jobs to a tier and re-schedule them at that tier's cadence. */
  setTier(
    selector: { kind: CrawlJobKind; targetKey: string; termCode: TermCode | null }[],
    tier: CrawlTier,
    nextFetchAt: string,
  ): Promise<number>;

  /** Jobs a client has been leased since `since`. Backs the hourly cap. */
  countClientJobsSince(clientId: string, since: string): Promise<number>;

  /** Record that `count` jobs were handed to `clientId`. */
  recordClientLease(clientId: string, count: number, at: string): Promise<void>;

  /** Append an `ingest_runs` row. */
  recordIngestRun(run: IngestRunRecord): Promise<void>;

  /** Last committed fingerprint for a quarantine key, or null if first run. */
  getIngestFingerprint(ingestKey: string): Promise<IngestFingerprint | null>;

  /** Store the fingerprint of a run that was actually committed. */
  putIngestFingerprint(ingestKey: string, fingerprint: IngestFingerprint): Promise<void>;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/** Context a parser may need that is not recoverable from the HTML itself. */
export interface ParseContext {
  url: string;
  targetKey: string;
  termCode: TermCode | null;
  fetchedAt: string;
}

/** Subject codes and names lifted from a directory `sel/dept-X.html` page. */
export interface ParsedSubjectIndex {
  subjects: { subjectCode: string; subjectName: string; school: string | null }[];
  /**
   * Which terms each subject actually offers, as directory labels
   * ("Fall2026"). Optional because only the index pages carry it.
   *
   * The backfill uses it to avoid enqueueing subject-term pages that cannot
   * exist. A subject-term page for an unoffered term answers 200 with an empty
   * listing rather than 404, so without this the crawl spends hundreds of
   * requests confirming emptiness and records each as a successful ingest.
   */
  availability?: { subjectCode: string; termLabels: string[] }[];
}

/**
 * Registration milestones lifted from the published academic calendar.
 *
 * `endsAt` is not optional decoration: appointments stagger by school and class
 * year over roughly two weeks (spec §10), so a window is a range, and
 * `isWindowActive()` in `./scheduler.ts` cannot answer "are we inside a window
 * right now" from a start instant alone. A milestone with no end is a
 * point-in-time event — an add/drop deadline, the first day of classes.
 */
export interface ParsedAcademicCalendar {
  termCode: TermCode | null;
  milestones: {
    kind: string;
    label: string;
    occursAt: string;
    /** Closing edge of a window. Absent for point-in-time milestones. */
    endsAt?: string;
    /** Which school / class year this window belongs to, when printed. */
    audience?: string;
    /** Page the date came from, so a wrong annotation is traceable. */
    sourceUrl?: string;
  }[];
}

/**
 * Implemented in `lib/ingest/parsers/**`. Parsers are pure: HTML in, records
 * out, no I/O. They throw on structurally unrecognisable input — the crawler
 * treats a throw as a parse error and never commits.
 */
export interface ParserRegistry {
  parseSubjectPage(html: string, context: ParseContext): ParsedSubjectPage;
  parseSectionDetail(html: string, context: ParseContext): ParsedSectionDetail;
  /**
   * Rows carry their OWN term, resolved from each schedule table's
   * "Fall 2026: COMS W4113" header, because one department page mixes terms.
   *
   * Declared as `ParsedBulletinRowWithTerm[]` rather than `ParsedBulletinRow[]`
   * on purpose. The parser has always returned the term; declaring the narrower
   * supertype hid it from every downstream reader, and `ingest_bulletin` was
   * written to guess the term from `order by term_code desc limit 1` as a
   * result — filing Spring listings onto Fall sections. See migration 0020.
   */
  parseBulletinPage(html: string, context: ParseContext): ParsedBulletinRowWithTerm[];
  /**
   * The course prose on the same page. Separate from `parseBulletinPage`
   * because the two are not one-to-one: a course block may have no schedule
   * table (not offered this year) and is still worth reading, while a schedule
   * table may belong to a cross-listed code with no block of its own.
   */
  parseBulletinCourses(html: string, context: ParseContext): ParsedBulletinCourse[];
  parseSubjectIndex(html: string, context: ParseContext): ParsedSubjectIndex;
  parseAcademicCalendar(html: string, context: ParseContext): ParsedAcademicCalendar;
}

// ---------------------------------------------------------------------------
// Catalog writer
// ---------------------------------------------------------------------------

/** Discriminated payload handed to the writer once quarantine has passed. */
export type IngestPayload =
  | { kind: "subject_term"; page: ParsedSubjectPage }
  | { kind: "section_detail"; detail: ParsedSectionDetail }
  | {
      kind: "bulletin_department";
      department: string;
      // Term-bearing: this is the value that reaches `ingest_bulletin` as
      // jsonb, and the SQL matches sections on the row's own `termCode`.
      rows: ParsedBulletinRowWithTerm[];
      courses: ParsedBulletinCourse[];
    }
  | { kind: "subject_index"; index: ParsedSubjectIndex }
  | { kind: "academic_calendar"; calendar: ParsedAcademicCalendar };

/**
 * Implemented in `lib/db/**`. Writes are expected to be transactional and to
 * apply change-only semantics to `enrollment_snapshots` (spec §11).
 */
export interface CatalogWriter {
  applyIngest(payload: IngestPayload, observedAt: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Watch source (drives hot-tier promotion)
// ---------------------------------------------------------------------------

export interface WatchSource {
  /** Section ids with at least one active watcher. */
  watchedSectionIds(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Runtime registry
// ---------------------------------------------------------------------------

export interface CrawlerRuntime {
  jobStore: CrawlJobStore;
  parsers: ParserRegistry;
  writer: CatalogWriter;
  watches?: WatchSource;
}

let runtime: CrawlerRuntime | null = null;

/** Called once by the owning lanes' bootstrap (or by tests). */
export function registerCrawlerRuntime(next: CrawlerRuntime): void {
  runtime = next;
}

/** Test/teardown helper. */
export function clearCrawlerRuntime(): void {
  runtime = null;
}

export function tryGetCrawlerRuntime(): CrawlerRuntime | null {
  return runtime;
}

/**
 * Throws rather than returning a half-wired runtime: a crawler that silently
 * no-ops would look healthy while the catalog rots.
 */
export function getCrawlerRuntime(): CrawlerRuntime {
  if (!runtime) {
    throw new Error(
      "Crawler runtime not registered. Call registerCrawlerRuntime({ jobStore, parsers, writer }) " +
        "from the db/parser lane bootstrap before serving /api/crawl/*.",
    );
  }
  return runtime;
}

/** The quarantine key a job's records are compared under. */
export function ingestKeyFor(job: Pick<CrawlJob, "kind" | "targetKey" | "termCode">): string {
  return `${job.kind}:${job.targetKey}:${job.termCode ?? "-"}`;
}
