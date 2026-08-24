/**
 * Columbia Catalog — crawler runtime tests.
 *
 * These cover the properties whose failure makes the product *wrong* rather
 * than merely down: jitter bounds, lease-token forgery, the quarantine guard,
 * the cron grace window, and the per-client hourly cap.
 */

import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CADENCE_JITTER,
  CADENCE_SECONDS,
  CLIENT_HOURLY_JOB_CAP,
  CRON_GRACE_SECONDS,
  MAX_LEASE_BATCH,
} from "@/lib/constants";
import type { CrawlJob, CrawlTier, ParsedSubjectPage } from "@/lib/types";

import {
  clearCrawlerRuntime,
  ingestKeyFor,
  registerCrawlerRuntime,
  type CatalogWriter,
  type ClaimOptions,
  type CrawlJobStore,
  type CrawlerRuntime,
  type IngestFingerprint,
  type IngestRunRecord,
  type JobOutcome,
  type ParserRegistry,
} from "./contracts";
import {
  assertCrawlableUrl,
  backoffDelayMs,
  CrawlPolicyError,
  isBrowserFetchable,
  isNonProductionHost,
  parseRetryAfter,
  politeFetch,
} from "./fetcher";
import { ingestHtml, isAbsentReason, recordFetchFailure } from "./ingest";
import {
  checkClientQuota,
  clampLeaseBatch,
  deriveClientId,
  issueLeaseToken,
  signLeaseToken,
  suggestNextDelayMs,
  verifyLeaseToken,
} from "./lease";
import {
  countFilledFields,
  evaluateQuarantine,
  fingerprintPayload,
} from "./quarantine";
import {
  assignTier,
  computeBackoffFetchAt,
  computeNextFetchAt,
  decomposeSectionId,
  emptyTierContext,
  hotKey,
  hotKeysForSections,
  isDue,
  jitterSeconds,
  promoteToHot,
  subjectTermsForSections,
  type RegistrationWindow,
} from "./scheduler";
import { buildBackfillPlan, DEFAULT_BACKFILL_OPTIONS, seededRandom } from "./backfill";

const SECRET = "test-secret-that-is-long-enough";
const NOW = new Date("2026-08-22T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<CrawlJob> = {}): CrawlJob {
  return {
    jobId: "job-1",
    kind: "subject_term",
    targetKey: "COMS",
    termCode: "20263",
    url: "https://doc.sis.columbia.edu/subj/COMS/_Fall2026.html",
    tier: "baseline",
    nextFetchAt: new Date(NOW.getTime() - 60_000).toISOString(),
    leasedUntil: null,
    leasedBy: null,
    lastOkAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

function makePage(sectionCount: number, instructorName = "Ansaf Salleb-Aouissi"): ParsedSubjectPage {
  return {
    subjectCode: "COMS",
    termCode: "20263",
    courses: [
      {
        courseId: "COMS4113W",
        subjectCode: "COMS",
        number: 4113,
        qualifier: "W",
        title: "Distributed Systems",
        sections: Array.from({ length: sectionCount }, (_, index) => ({
          sectionId: `20263COMS4113W${String(index + 1).padStart(3, "0")}`,
          courseId: "COMS4113W",
          termCode: "20263",
          callNumber: String(10000 + index),
          sectionCode: String(index + 1).padStart(3, "0"),
          title: "Distributed Systems",
          pointsMin: 3,
          pointsMax: 3,
          instructors: instructorName ? [instructorName] : [],
          enrollmentCount: 40,
          enrollmentCap: 80,
          status: "open" as const,
          sourceAsOf: "2026-08-22T11:55:00Z",
          detailUrl: "https://doc.sis.columbia.edu/subj/COMS/W4113-20263-001/",
          meetings: [],
        })),
      },
    ],
  };
}

interface FakeStoreState {
  claims: ClaimOptions[];
  outcomes: JobOutcome[];
  runs: IngestRunRecord[];
  fingerprints: Map<string, IngestFingerprint>;
  leaseCounts: Map<string, number>;
  released: string[];
  tierCalls: { tier: CrawlTier; count: number; nextFetchAt: string }[];
}

function makeStore(options: {
  dueJobs?: CrawlJob[];
  job?: CrawlJob | null;
  clientJobsUsed?: number;
  previousFingerprint?: IngestFingerprint | null;
} = {}): { store: CrawlJobStore; state: FakeStoreState } {
  const state: FakeStoreState = {
    claims: [],
    outcomes: [],
    runs: [],
    fingerprints: new Map(),
    leaseCounts: new Map(),
    released: [],
    tierCalls: [],
  };

  const store: CrawlJobStore = {
    async claimDueJobs(claimOptions) {
      state.claims.push(claimOptions);
      return (options.dueJobs ?? []).slice(0, claimOptions.limit);
    },
    async getJob() {
      return options.job ?? null;
    },
    async completeJob(outcome) {
      state.outcomes.push(outcome);
    },
    async releaseJob(jobId) {
      state.released.push(jobId);
    },
    async upsertJobs(specs) {
      return specs.length;
    },
    async setTier(selector, tier, nextFetchAt) {
      state.tierCalls.push({ tier, count: selector.length, nextFetchAt });
      return selector.length;
    },
    async countClientJobsSince(clientId) {
      return state.leaseCounts.get(clientId) ?? options.clientJobsUsed ?? 0;
    },
    async recordClientLease(clientId, count) {
      state.leaseCounts.set(clientId, (state.leaseCounts.get(clientId) ?? 0) + count);
    },
    async recordIngestRun(run) {
      state.runs.push(run);
    },
    async getIngestFingerprint(key) {
      return state.fingerprints.get(key) ?? options.previousFingerprint ?? null;
    },
    async putIngestFingerprint(key, fingerprint) {
      state.fingerprints.set(key, fingerprint);
    },
  };

  return { store, state };
}

function makeRuntime(
  store: CrawlJobStore,
  overrides: { page?: ParsedSubjectPage; parseThrows?: boolean; writer?: CatalogWriter } = {},
): { runtime: CrawlerRuntime; written: ParsedSubjectPage[]; withdrawn: string[] } {
  const written: ParsedSubjectPage[] = [];
  const withdrawn: string[] = [];
  const parsers = {
    parseSubjectPage: () => {
      if (overrides.parseThrows) throw new Error("selector no longer matches");
      return overrides.page ?? makePage(5);
    },
    parseSectionDetail: () => {
      throw new Error("not used");
    },
    parseBulletinPage: () => [],
    parseBulletinCourses: () => [],
    parseSubjectIndex: () => ({ subjects: [] }),
    parseAcademicCalendar: () => ({ termCode: null, milestones: [] }),
  } as unknown as ParserRegistry;

  const writer: CatalogWriter = overrides.writer ?? {
    async applyIngest(payload) {
      if (payload.kind === "subject_term") {
        written.push(payload.page);
        return payload.page.courses.flatMap((course) => course.sections).length;
      }
      return 0;
    },
    async markSectionWithdrawn(sectionId) {
      withdrawn.push(sectionId);
      return 1;
    },
  };

  return { runtime: { jobStore: store, parsers, writer }, written, withdrawn };
}

afterEach(() => {
  clearCrawlerRuntime();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Jitter
// ---------------------------------------------------------------------------

describe("cadence jitter", () => {
  const tiers: CrawlTier[] = ["baseline", "hot", "registration"];

  it("keeps every scheduled time inside the +/- CADENCE_JITTER band", () => {
    for (const tier of tiers) {
      const interval = CADENCE_SECONDS[tier];
      for (let i = 0; i < 500; i += 1) {
        const iso = computeNextFetchAt(tier, NOW);
        const deltaSeconds = (Date.parse(iso) - NOW.getTime()) / 1000;
        expect(deltaSeconds).toBeGreaterThanOrEqual(interval * (1 - CADENCE_JITTER) - 1e-6);
        expect(deltaSeconds).toBeLessThanOrEqual(interval * (1 + CADENCE_JITTER) + 1e-6);
      }
    }
  });

  it("hits both ends of the band at the extremes of the random source", () => {
    const low = (Date.parse(computeNextFetchAt("hot", NOW, () => 0)) - NOW.getTime()) / 1000;
    const high = (Date.parse(computeNextFetchAt("hot", NOW, () => 0.999999)) - NOW.getTime()) / 1000;
    expect(low).toBeCloseTo(CADENCE_SECONDS.hot * (1 - CADENCE_JITTER), 2);
    expect(high).toBeCloseTo(CADENCE_SECONDS.hot * (1 + CADENCE_JITTER), 2);
  });

  it("actually spreads a cohort of jobs scheduled at the same instant", () => {
    const times = new Set(
      Array.from({ length: 200 }, () => computeNextFetchAt("baseline", NOW)),
    );
    // A synchronized wave would collapse to one value.
    expect(times.size).toBeGreaterThan(150);
  });

  it("jitterSeconds is symmetric around the input", () => {
    expect(jitterSeconds(100, () => 0.5)).toBeCloseTo(100, 6);
  });

  /**
   * The load bug this guards against did not look like a bug. Every kind
   * defaulted to `baseline`, baseline means hourly, and 5,433 section-detail
   * jobs re-fetched unchanged pages every hour without a single error. These
   * assert the multiplier both applies and knows when not to.
   */
  const midpoint = () => 0.5;
  const secondsUntil = (iso: string) => (Date.parse(iso) - NOW.getTime()) / 1000;

  it("stretches section detail to weekly while leaving the seat refresh hourly", () => {
    const detail = secondsUntil(
      computeNextFetchAt("baseline", NOW, midpoint, "section_detail"),
    );
    const seats = secondsUntil(
      computeNextFetchAt("baseline", NOW, midpoint, "subject_term"),
    );
    expect(seats).toBeCloseTo(CADENCE_SECONDS.baseline, 6);
    expect(detail).toBeCloseTo(CADENCE_SECONDS.baseline * 24 * 7, 6);
  });

  it("never stretches a promoted job — escalation must still mean sooner", () => {
    for (const tier of ["hot", "registration"] as CrawlTier[]) {
      const promoted = secondsUntil(
        computeNextFetchAt(tier, NOW, midpoint, "section_detail"),
      );
      expect(promoted).toBeCloseTo(CADENCE_SECONDS[tier], 6);
      // The point of the guard: promoting must not schedule further out than
      // leaving the job at baseline would have.
      expect(promoted).toBeLessThan(
        secondsUntil(computeNextFetchAt("baseline", NOW, midpoint, "section_detail")),
      );
    }
  });

  it("omitting the kind changes nothing, so existing callers are unaffected", () => {
    for (const tier of tiers) {
      expect(secondsUntil(computeNextFetchAt(tier, NOW, midpoint))).toBeCloseTo(
        CADENCE_SECONDS[tier],
        6,
      );
    }
  });

  it("backs off exponentially, clamped, and never faster than the tier cadence", () => {
    const first = (Date.parse(computeBackoffFetchAt("hot", 1, NOW, () => 0.5)) - NOW.getTime()) / 1000;
    const fourth = (Date.parse(computeBackoffFetchAt("hot", 4, NOW, () => 0.5)) - NOW.getTime()) / 1000;
    const huge = (Date.parse(computeBackoffFetchAt("hot", 40, NOW, () => 0.5)) - NOW.getTime()) / 1000;
    expect(first).toBeGreaterThanOrEqual(CADENCE_SECONDS.hot);
    expect(fourth).toBeGreaterThan(first);
    expect(huge).toBeLessThanOrEqual(6 * 60 * 60 * (1 + CADENCE_JITTER));
  });
});

// ---------------------------------------------------------------------------
// Tiering & promotion
// ---------------------------------------------------------------------------

describe("tier assignment", () => {
  it("decomposes section ids into subject and term", () => {
    expect(decomposeSectionId("20263COMS4113W001")).toEqual({
      sectionId: "20263COMS4113W001",
      termCode: "20263",
      subjectCode: "COMS",
    });
    expect(decomposeSectionId("garbage")).toBeNull();
  });

  it("promotes watched subjects to hot and unwatched stay baseline", () => {
    const context = {
      hotKeys: hotKeysForSections(["20263COMS4113W001"]),
      registrationTerms: new Set<string>(),
    };
    expect(assignTier({ kind: "subject_term", targetKey: "COMS", termCode: "20263" }, context)).toBe("hot");
    expect(assignTier({ kind: "subject_term", targetKey: "MATH", termCode: "20263" }, context)).toBe("baseline");
  });

  it("escalates a watched subject to the registration tier inside a window", () => {
    const context = {
      hotKeys: new Set([hotKey("COMS", "20263")]),
      registrationTerms: new Set(["20263"]),
    };
    expect(assignTier({ kind: "subject_term", targetKey: "COMS", termCode: "20263" }, context)).toBe("registration");
  });

  it("never escalates non-live kinds", () => {
    const context = {
      hotKeys: new Set([hotKey("COMS", "20263")]),
      registrationTerms: new Set(["20263"]),
    };
    expect(assignTier({ kind: "bulletin_department", targetKey: "COMS", termCode: "20263" }, context)).toBe("baseline");
    expect(assignTier({ kind: "subject_index", targetKey: "C", termCode: null }, emptyTierContext())).toBe("baseline");
  });

  it("collapses many watched sections into distinct subject-term pairs", () => {
    const pairs = subjectTermsForSections([
      "20263COMS4113W001",
      "20263COMS4113W002",
      "20271MATH1101001",
      "not-a-section",
    ]);
    expect(pairs).toHaveLength(2);
  });

  it("promoteToHot writes the registration tier when the term is in a window", async () => {
    const { store, state } = makeStore();
    const windows: RegistrationWindow[] = [
      {
        termCode: "20263",
        label: "SEAS seniors",
        opensAt: new Date(NOW.getTime() - 3600_000).toISOString(),
        closesAt: new Date(NOW.getTime() + 3600_000).toISOString(),
      },
    ];
    const result = await promoteToHot(["20263COMS4113W001", "20271MATH1101001"], {
      store,
      now: NOW,
      registrationWindows: windows,
    });
    expect(result.promoted).toHaveLength(2);
    const tiers = state.tierCalls.map((call) => call.tier).sort();
    expect(tiers).toEqual(["hot", "registration"]);
  });

  it("is a no-op for an empty watch list", async () => {
    const { store, state } = makeStore();
    const result = await promoteToHot([], { store, now: NOW });
    expect(result.rowsUpdated).toBe(0);
    expect(state.tierCalls).toHaveLength(0);
  });

  it("treats a job as due only when past nextFetchAt and unleased", () => {
    expect(isDue({ nextFetchAt: new Date(NOW.getTime() - 1000).toISOString(), leasedUntil: null }, NOW)).toBe(true);
    expect(isDue({ nextFetchAt: new Date(NOW.getTime() + 1000).toISOString(), leasedUntil: null }, NOW)).toBe(false);
    expect(
      isDue(
        {
          nextFetchAt: new Date(NOW.getTime() - 1000).toISOString(),
          leasedUntil: new Date(NOW.getTime() + 30_000).toISOString(),
        },
        NOW,
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lease tokens
// ---------------------------------------------------------------------------

describe("lease tokens", () => {
  it("round-trips a signed token", () => {
    const { token, payload } = issueLeaseToken({
      jobId: "job-1",
      clientId: "client-a",
      now: NOW,
      secret: SECRET,
    });
    const verified = verifyLeaseToken(token, { secret: SECRET, now: NOW, jobId: "job-1", clientId: "client-a" });
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.payload.nonce).toBe(payload.nonce);
  });

  it("rejects a token signed with a different secret (forgery)", () => {
    const forged = signLeaseToken(
      { jobId: "job-1", clientId: "client-a", expiresAt: NOW.getTime() + 60_000, nonce: "x" },
      "attacker-secret-long-enough",
    );
    expect(verifyLeaseToken(forged, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a token whose payload was edited after signing", () => {
    const { token } = issueLeaseToken({ jobId: "job-1", clientId: "client-a", now: NOW, secret: SECRET });
    const [version, body, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.jobId = "job-999";
    const tampered = [
      version,
      Buffer.from(JSON.stringify(decoded)).toString("base64url"),
      signature,
    ].join(".");
    expect(verifyLeaseToken(tampered, { secret: SECRET, now: NOW }).ok).toBe(false);
  });

  it("refuses a valid token presented for a different job", () => {
    const { token } = issueLeaseToken({ jobId: "job-1", clientId: "client-a", now: NOW, secret: SECRET });
    expect(verifyLeaseToken(token, { secret: SECRET, now: NOW, jobId: "job-2" })).toEqual({
      ok: false,
      reason: "job_mismatch",
    });
  });

  it("refuses one client replaying another client's token", () => {
    const { token } = issueLeaseToken({ jobId: "job-1", clientId: "client-a", now: NOW, secret: SECRET });
    expect(verifyLeaseToken(token, { secret: SECRET, now: NOW, clientId: "client-b" })).toEqual({
      ok: false,
      reason: "client_mismatch",
    });
  });

  it("expires with the lease", () => {
    const { token } = issueLeaseToken({
      jobId: "job-1",
      clientId: "client-a",
      now: NOW,
      secret: SECRET,
      leaseSeconds: 30,
    });
    const later = new Date(NOW.getTime() + 120_000);
    expect(verifyLeaseToken(token, { secret: SECRET, now: later })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects structurally malformed tokens without throwing", () => {
    for (const bad of ["", "not-a-token", "v1.only-two", "v2.a.b", "a.b.c.d", "x".repeat(4000)]) {
      expect(verifyLeaseToken(bad, { secret: SECRET, now: NOW }).ok).toBe(false);
    }
  });

  it("derives a stable client id that changes with the network address", () => {
    const a = deriveClientId({ ip: "1.2.3.4", userAgent: "UA", secret: SECRET });
    const again = deriveClientId({ ip: "1.2.3.4", userAgent: "UA", secret: SECRET });
    const other = deriveClientId({ ip: "5.6.7.8", userAgent: "UA", secret: SECRET });
    expect(a).toBe(again);
    expect(a).not.toBe(other);
  });
});

// ---------------------------------------------------------------------------
// Batch sizing and pacing
// ---------------------------------------------------------------------------

describe("lease batch and pacing", () => {
  it("never hands out more than MAX_LEASE_BATCH jobs", () => {
    expect(clampLeaseBatch(999)).toBe(MAX_LEASE_BATCH);
    expect(clampLeaseBatch(0)).toBe(1);
    expect(clampLeaseBatch(undefined)).toBe(1);
    expect(clampLeaseBatch(Number.NaN)).toBe(1);
    expect(clampLeaseBatch(2)).toBeLessThanOrEqual(MAX_LEASE_BATCH);
  });

  it("suggests a jittered delay that keeps a compliant worker under the hourly cap", () => {
    const samples = Array.from({ length: 200 }, () => suggestNextDelayMs(MAX_LEASE_BATCH));
    const distinct = new Set(samples);
    expect(distinct.size).toBeGreaterThan(50); // randomized, not fixed
    const mean = samples.reduce((total, value) => total + value, 0) / samples.length;
    const jobsPerHour = (3600_000 / mean) * MAX_LEASE_BATCH;
    expect(jobsPerHour).toBeLessThanOrEqual(CLIENT_HOURLY_JOB_CAP * 1.15);
  });

  it("backs off further when nothing was due", () => {
    expect(suggestNextDelayMs(0, () => 0.5)).toBeGreaterThan(suggestNextDelayMs(3, () => 0.5));
  });
});

// ---------------------------------------------------------------------------
// Hourly client cap
// ---------------------------------------------------------------------------

describe("per-client hourly cap", () => {
  it("grants the full request when the client is well under the cap", async () => {
    const { store } = makeStore({ clientJobsUsed: 3 });
    const decision = await checkClientQuota(store, { clientId: "c", now: NOW, requested: 3 });
    expect(decision.granted).toBe(3);
    expect(decision.remaining).toBe(CLIENT_HOURLY_JOB_CAP - 3);
  });

  it("clips the grant to what remains of the hourly budget", async () => {
    const { store } = makeStore({ clientJobsUsed: CLIENT_HOURLY_JOB_CAP - 1 });
    const decision = await checkClientQuota(store, { clientId: "c", now: NOW, requested: 3 });
    expect(decision.granted).toBe(1);
  });

  it("grants nothing once the cap is reached and asks the client to wait", async () => {
    const { store } = makeStore({ clientJobsUsed: CLIENT_HOURLY_JOB_CAP });
    const decision = await checkClientQuota(store, { clientId: "c", now: NOW, requested: 3 });
    expect(decision.granted).toBe(0);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts against a trailing one-hour window", async () => {
    const seen: string[] = [];
    const store = {
      async countClientJobsSince(_clientId: string, since: string) {
        seen.push(since);
        return 0;
      },
    };
    await checkClientQuota(store, { clientId: "c", now: NOW, requested: 1 });
    expect(Date.parse(seen[0])).toBe(NOW.getTime() - 3600_000);
  });

  it("accumulates across successive leases until the cap bites", async () => {
    const { store } = makeStore();
    let granted = 0;
    for (let i = 0; i < 30; i += 1) {
      const decision = await checkClientQuota(store, { clientId: "c", now: NOW, requested: 3 });
      if (decision.granted === 0) break;
      granted += decision.granted;
      await store.recordClientLease("c", decision.granted, NOW.toISOString());
    }
    expect(granted).toBe(CLIENT_HOURLY_JOB_CAP);
  });
});

// ---------------------------------------------------------------------------
// Quarantine
// ---------------------------------------------------------------------------

describe("quarantine guard", () => {
  it("counts populated leaves and ignores blanks", () => {
    expect(countFilledFields({ a: "x", b: "", c: null, d: 0, e: false, f: ["y", "  "] })).toBe(4);
  });

  it("commits the first run for a key", () => {
    const incoming = fingerprintPayload({ kind: "subject_term", page: makePage(3) });
    expect(evaluateQuarantine(incoming, null).quarantined).toBe(false);
  });

  it("quarantines a run with fewer records than the previous one", () => {
    const previous = { ...fingerprintPayload({ kind: "subject_term", page: makePage(10) }), capturedAt: NOW.toISOString() };
    const incoming = fingerprintPayload({ kind: "subject_term", page: makePage(9) });
    const decision = evaluateQuarantine(incoming, previous);
    expect(decision.quarantined).toBe(true);
    expect(decision.reason).toContain("record count fell");
  });

  it("quarantines a run with the same records but far emptier fields", () => {
    const previous = { ...fingerprintPayload({ kind: "subject_term", page: makePage(10) }), capturedAt: NOW.toISOString() };
    const incoming = fingerprintPayload({ kind: "subject_term", page: makePage(10, "") });
    const decision = evaluateQuarantine(incoming, previous);
    expect(decision.quarantined).toBe(true);
    expect(decision.reason).toContain("populated fields fell");
  });

  it("commits a run that grew", () => {
    const previous = { ...fingerprintPayload({ kind: "subject_term", page: makePage(10) }), capturedAt: NOW.toISOString() };
    const incoming = fingerprintPayload({ kind: "subject_term", page: makePage(12) });
    expect(evaluateQuarantine(incoming, previous).quarantined).toBe(false);
  });

  it("quarantines a total collapse to zero records", () => {
    const previous = { ...fingerprintPayload({ kind: "subject_term", page: makePage(138) }), capturedAt: NOW.toISOString() };
    const incoming = fingerprintPayload({ kind: "subject_term", page: makePage(0) });
    expect(evaluateQuarantine(incoming, previous).quarantined).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ingest pipeline
// ---------------------------------------------------------------------------

describe("ingest pipeline", () => {
  const html = `<html><body>${"x".repeat(500)}</body></html>`;

  it("writes, fingerprints and reschedules a healthy run", async () => {
    const { store, state } = makeStore();
    const { runtime, written } = makeRuntime(store, { page: makePage(5) });
    const job = makeJob();

    const result = await ingestHtml(
      { job, html, fetchedAt: NOW.toISOString(), source: "browser" },
      { runtime, now: NOW },
    );

    expect(result.quarantined).toBe(false);
    expect(result.recordsWritten).toBe(5);
    expect(written).toHaveLength(1);
    expect(state.fingerprints.get(ingestKeyFor(job))?.recordCount).toBe(5);
    expect(state.outcomes[0].ok).toBe(true);
    expect(state.runs[0].status).toBe("ok");
  });

  it("never writes a shrinking run and records the quarantine", async () => {
    const { store, state } = makeStore({
      previousFingerprint: { recordCount: 138, filledFieldCount: 5_000, capturedAt: NOW.toISOString() },
    });
    const applyIngest = vi.fn(async () => 1);
    const { runtime } = makeRuntime(store, { page: makePage(2), writer: { applyIngest, markSectionWithdrawn: vi.fn(async () => 1) } });

    const result = await ingestHtml(
      { job: makeJob(), html, fetchedAt: NOW.toISOString(), source: "browser" },
      { runtime, now: NOW },
    );

    expect(result.quarantined).toBe(true);
    expect(applyIngest).not.toHaveBeenCalled();
    expect(state.runs[0].status).toBe("quarantined");
    expect(state.runs[0].quarantined).toBe(true);
    expect(state.outcomes[0].ok).toBe(false);
    expect(state.fingerprints.size).toBe(0);
  });

  /*
   * A section Columbia has pulled.
   *
   * The Directory does not 404 — it serves HTTP 200 and a ~474 byte "Section
   * Removed" page, which clears the plausibility floor and then fails to
   * parse. That combination produced a job that failed, backed off, and
   * retried a permanently unchanging page forever, while the section itself
   * stayed in the catalog and kept rendering.
   */
  describe("withdrawn sections", () => {
    /*
     * The REAL page, captured from the Directory, not a hand-written stand-in.
     * The first draft of this test used an inline string and every assertion
     * failed for one reason: it was under MIN_PLAUSIBLE_HTML_CHARS, so it was
     * rejected as a truncated response and never reached the branch at all.
     * The genuine tombstone is 474 bytes — comfortably over the floor, which
     * is precisely why this bug existed in production instead of being caught
     * by the short-response guard.
     */
    const TOMBSTONE = readFileSync(
      new URL("../ingest/__fixtures__/doc-section-removed.html", import.meta.url),
      "utf8",
    );
    const detailJob = () =>
      makeJob({
        jobId: "job-withdrawn",
        kind: "section_detail",
        targetKey: "20251GNPH8090PD01",
        termCode: "20251",
        url: "https://doc.sis.columbia.edu/subj/GNPH/P8090-20251-D01/",
      });

    it("marks the section withdrawn and closes the job as done, not failed", async () => {
      const { store, state } = makeStore();
      const { runtime, withdrawn } = makeRuntime(store);

      const result = await ingestHtml(
        { job: detailJob(), html: TOMBSTONE, fetchedAt: NOW.toISOString(), source: "cron" },
        { runtime, now: NOW },
      );

      expect(withdrawn).toEqual(["20251GNPH8090PD01"]);
      expect(state.runs[0].status).toBe("ok");
      expect(state.runs[0].notes).toMatch(/no longer publishes/);
      // The whole point: OK, so the job stops backing off exponentially
      // against a page whose answer will never change.
      expect(state.outcomes[0].ok).toBe(true);
      expect(result.quarantined).toBe(false);
    });

    it("re-reads at the ordinary cadence rather than being disabled", async () => {
      const { store, state } = makeStore();
      const { runtime } = makeRuntime(store);

      await ingestHtml(
        { job: detailJob(), html: TOMBSTONE, fetchedAt: NOW.toISOString(), source: "cron" },
        { runtime, now: NOW, random: () => 0.5 },
      );

      // Weekly, per KIND_CADENCE_MULTIPLIER — far enough out to be harmless,
      // near enough that a restored section is noticed rather than never.
      const waitSeconds =
        (Date.parse(state.outcomes[0].nextFetchAt) - NOW.getTime()) / 1000;
      expect(waitSeconds).toBeCloseTo(CADENCE_SECONDS.baseline * 24 * 7, 6);
    });

    it("does not overwrite the fingerprint of the real page it replaces", async () => {
      const { store, state } = makeStore();
      const { runtime } = makeRuntime(store);

      await ingestHtml(
        { job: detailJob(), html: TOMBSTONE, fetchedAt: NOW.toISOString(), source: "cron" },
        { runtime, now: NOW },
      );

      /*
       * A tombstone carries zero records. Fingerprinting it would give the
       * quarantine guard a baseline of nothing, so a section coming back would
       * read as a suspicious jump and be REFUSED — the guard would block the
       * recovery it exists to protect.
       */
      expect(state.fingerprints.size).toBe(0);
    });

    it("leaves other job kinds alone even on an identical body", async () => {
      const { store, state } = makeStore();
      const { runtime, withdrawn } = makeRuntime(store);

      // Same bytes, a subject_term job: nothing is withdrawn, and it fails to
      // parse as it always would. The branch keys on kind, not on text alone.
      await ingestHtml(
        { job: makeJob(), html: TOMBSTONE, fetchedAt: NOW.toISOString(), source: "cron" },
        { runtime, now: NOW },
      );

      expect(withdrawn).toEqual([]);
      expect(state.outcomes[0].ok).toBe(true);
    });
  });

  /*
   * A subject that offers nothing in a term.
   *
   * The Directory's root index lists every subject code that has ever run, so
   * 115 subjects legitimately have no page for a given term. Their 404 was
   * being treated as a transient fault: 196 jobs pinned at the 6h backoff
   * ceiling, retrying a question already answered, and a failure count that
   * never returned to zero.
   */
  describe("subjects with no page for a term", () => {
    it("treats an observed 404 on a subject page as a correct answer", async () => {
      const { store, state } = makeStore();
      const { runtime } = makeRuntime(store);

      const result = await recordFetchFailure(makeJob(), "HTTP 404", "cron", {
        runtime,
        now: NOW,
        random: () => 0.5,
        status: 404,
      });

      expect(isAbsentReason(result.reason)).toBe(true);
      expect(state.outcomes[0].ok).toBe(true);
      // Scheduled, not disabled: a subject can start offering classes again,
      // and the ordinary re-read is what would notice.
      const waitSeconds = (Date.parse(state.outcomes[0].nextFetchAt) - NOW.getTime()) / 1000;
      expect(waitSeconds).toBeCloseTo(CADENCE_SECONDS.baseline, 6);
    });

    it("does NOT trust a 404 the client merely reported", async () => {
      const { store, state } = makeStore();
      const { runtime } = makeRuntime(store);

      // The browser submit route passes no status, by design: honouring a
      // client's claim would let any browser mark a subject permanently
      // absent for everyone.
      const result = await recordFetchFailure(makeJob(), "HTTP 404", "browser", {
        runtime,
        now: NOW,
      });

      expect(isAbsentReason(result.reason)).toBe(false);
      expect(state.outcomes[0].ok).toBe(false);
    });

    it("keeps a 404 loud on kinds where it means a URL we build is wrong", async () => {
      for (const kind of ["bulletin_department", "subject_index"] as const) {
        const { store, state } = makeStore();
        const { runtime } = makeRuntime(store);

        const result = await recordFetchFailure(makeJob({ kind }), "HTTP 404", "cron", {
          runtime,
          now: NOW,
          status: 404,
        });

        expect(isAbsentReason(result.reason)).toBe(false);
        expect(state.outcomes[0].ok).toBe(false);
      }
    });

    it("leaves a 500 backing off exponentially", async () => {
      const { store, state } = makeStore();
      const { runtime } = makeRuntime(store);

      const result = await recordFetchFailure(makeJob(), "HTTP 500", "cron", {
        runtime,
        now: NOW,
        status: 500,
      });

      expect(isAbsentReason(result.reason)).toBe(false);
      expect(state.outcomes[0].ok).toBe(false);
    });
  });

  it("records a parse failure without writing", async () => {
    const { store, state } = makeStore();
    const applyIngest = vi.fn(async () => 1);
    const { runtime } = makeRuntime(store, { parseThrows: true, writer: { applyIngest, markSectionWithdrawn: vi.fn(async () => 1) } });

    const result = await ingestHtml(
      { job: makeJob(), html, fetchedAt: NOW.toISOString(), source: "cron" },
      { runtime, now: NOW },
    );

    expect(result.recordsWritten).toBe(0);
    expect(applyIngest).not.toHaveBeenCalled();
    expect(state.runs[0].status).toBe("parse_error");
    expect(state.outcomes[0].ok).toBe(false);
  });

  it("refuses an implausibly short response", async () => {
    const { store, state } = makeStore();
    const { runtime } = makeRuntime(store);
    const result = await ingestHtml(
      { job: makeJob(), html: "<html></html>", fetchedAt: NOW.toISOString(), source: "browser" },
      { runtime, now: NOW },
    );
    expect(result.recordsWritten).toBe(0);
    expect(state.runs[0].status).toBe("fetch_error");
  });
});

// ---------------------------------------------------------------------------
// Fetcher policy
// ---------------------------------------------------------------------------

describe("fetcher policy", () => {
  it("refuses any method other than GET against Columbia", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(() =>
        assertCrawlableUrl("https://doc.sis.columbia.edu/subj/COMS/_Fall2026.html", method),
      ).toThrow(CrawlPolicyError);
    }
  });

  it("refuses non-production Columbia hosts", () => {
    for (const host of ["dev-doc.columbia.edu", "test-doc.columbia.edu", "stage-doc.columbia.edu", "uat-doc.columbia.edu", "failover-doc.columbia.edu"]) {
      expect(isNonProductionHost(host)).toBe(true);
      expect(() => assertCrawlableUrl(`https://${host}/x.html`)).toThrow(CrawlPolicyError);
    }
  });

  it("refuses hosts that are not on the allowlist", () => {
    expect(() => assertCrawlableUrl("https://evil.example.com/x")).toThrow(CrawlPolicyError);
    expect(() => assertCrawlableUrl("http://doc.sis.columbia.edu/x")).toThrow(CrawlPolicyError);
    expect(() => assertCrawlableUrl("https://user:pw@doc.sis.columbia.edu/x")).toThrow(CrawlPolicyError);
  });

  it("marks bulletin as server-only and doc.sis as browser-fetchable", () => {
    expect(isBrowserFetchable("https://doc.sis.columbia.edu/subj/COMS/_Fall2026.html")).toBe(true);
    expect(isBrowserFetchable("https://bulletin.columbia.edu/columbia-college/departments-instruction/computer-science/")).toBe(false);
  });

  it("returns HTML on a healthy response and sends no credentials", async () => {
    const fetchImpl = vi.fn(async (_input: string, init: RequestInit) => {
      expect(init.method).toBe("GET");
      expect(init.credentials).toBe("omit");
      return new Response("<html>ok</html>", { status: 200 });
    });
    const outcome = await politeFetch("https://doc.sis.columbia.edu/subj/COMS/_Fall2026.html", {
      fetchImpl,
      skipPacing: true,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.html).toContain("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 404", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 404 }));
    const outcome = await politeFetch("https://doc.sis.columbia.edu/subj/XXXX/_Fall2026.html", {
      fetchImpl,
      skipPacing: true,
    });
    expect(outcome.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reads Retry-After in both seconds and HTTP-date form", () => {
    expect(parseRetryAfter("120", NOW)).toBe(120);
    expect(parseRetryAfter(new Date(NOW.getTime() + 60_000).toUTCString(), NOW)).toBeGreaterThanOrEqual(59);
    expect(parseRetryAfter(null, NOW)).toBeUndefined();
    expect(parseRetryAfter("garbage", NOW)).toBeUndefined();
  });

  it("grows the backoff between attempts", () => {
    const first = backoffDelayMs(1, () => 0.5);
    const third = backoffDelayMs(3, () => 0.5);
    expect(third).toBeGreaterThan(first);
    expect(third).toBeLessThanOrEqual(30_000);
  });
});

// ---------------------------------------------------------------------------
// Routes: cron grace window, browser bulletin refusal, hourly cap
// ---------------------------------------------------------------------------

describe("cron route", () => {
  const CRON_SECRET = "cron-secret-long-enough-value";

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("CRAWL_LEASE_SECRET", SECRET);
    vi.stubEnv("CRAWL_WORKER_DISABLED", "");
  });

  it("rejects a request without the bearer secret", async () => {
    const { POST } = await import("@/app/api/crawl/cron/route");
    const response = await POST(new Request("https://x.test/api/crawl/cron", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("rejects a wrong bearer secret", async () => {
    const { POST } = await import("@/app/api/crawl/cron/route");
    const response = await POST(
      new Request("https://x.test/api/crawl/cron", {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret-long-enough" },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("claims only jobs overdue past the grace window", async () => {
    const { store, state } = makeStore({ dueJobs: [] });
    const { runtime } = makeRuntime(store);
    registerCrawlerRuntime(runtime);

    const { POST } = await import("@/app/api/crawl/cron/route");
    const before = Date.now();
    const response = await POST(
      new Request("https://x.test/api/crawl/cron", {
        method: "POST",
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(state.claims).toHaveLength(1);

    const dueBefore = Date.parse(state.claims[0].dueBefore);
    const graceMs = CRON_GRACE_SECONDS * 1000;
    expect(dueBefore).toBeLessThanOrEqual(before - graceMs + 1_000);
    expect(dueBefore).toBeGreaterThanOrEqual(before - graceMs - 5_000);
  });

  it("exits cleanly and reports why when the queue is empty", async () => {
    const { store } = makeStore({ dueJobs: [] });
    registerCrawlerRuntime(makeRuntime(store).runtime);
    const { GET } = await import("@/app/api/crawl/cron/route");
    const response = await GET(
      new Request("https://x.test/api/crawl/cron", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    const body = (await response.json()) as { stoppedBecause: string; elapsedMs: number };
    expect(body.stoppedBecause).toBe("queue_empty");
    expect(body.elapsedMs).toBeLessThan(45_000);
  });
});

describe("lease route", () => {
  beforeEach(() => {
    vi.stubEnv("CRAWL_LEASE_SECRET", SECRET);
    vi.stubEnv("CRAWL_WORKER_DISABLED", "");
  });

  function leaseRequest(body: unknown = { maxJobs: 3 }): Request {
    return new Request("https://x.test/api/crawl/lease", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", "user-agent": "Test/1.0" },
      body: JSON.stringify(body),
    });
  }

  it("hands out at most MAX_LEASE_BATCH jobs with signed tokens and a delay", async () => {
    const dueJobs = Array.from({ length: 10 }, (_, i) => makeJob({ jobId: `job-${i}` }));
    const { store } = makeStore({ dueJobs });
    registerCrawlerRuntime(makeRuntime(store).runtime);

    const { POST } = await import("@/app/api/crawl/lease/route");
    const response = await POST(leaseRequest({ maxJobs: 3 }));
    const body = (await response.json()) as {
      jobs: { jobId: string; leaseToken: string }[];
      nextDelayMs: number;
    };

    expect(body.jobs.length).toBeLessThanOrEqual(MAX_LEASE_BATCH);
    expect(body.nextDelayMs).toBeGreaterThan(0);
    for (const job of body.jobs) {
      expect(verifyLeaseToken(job.leaseToken, { secret: SECRET, now: new Date(), jobId: job.jobId }).ok).toBe(true);
    }
  });

  it("refuses to hand a bulletin job to a browser (no CORS on that host)", async () => {
    const bulletinJob = makeJob({
      jobId: "job-bulletin",
      kind: "bulletin_department",
      url: "https://bulletin.columbia.edu/columbia-college/departments-instruction/computer-science/",
    });
    const { store, state } = makeStore({ dueJobs: [bulletinJob] });
    registerCrawlerRuntime(makeRuntime(store).runtime);

    const { POST } = await import("@/app/api/crawl/lease/route");
    const response = await POST(leaseRequest());
    const body = (await response.json()) as { jobs: unknown[] };

    expect(body.jobs).toHaveLength(0);
    expect(state.released).toContain("job-bulletin");
    // The store is also told never to consider bulletin work for browsers.
    expect(state.claims[0].excludeKinds).toContain("bulletin_department");
    expect(state.claims[0].allowedHosts).toEqual(["doc.sis.columbia.edu"]);
  });

  it("hands out nothing once the client's hourly cap is reached", async () => {
    const { store } = makeStore({
      dueJobs: [makeJob()],
      clientJobsUsed: CLIENT_HOURLY_JOB_CAP,
    });
    registerCrawlerRuntime(makeRuntime(store).runtime);

    const { POST } = await import("@/app/api/crawl/lease/route");
    const response = await POST(leaseRequest());
    const body = (await response.json()) as { jobs: unknown[]; reason: string };
    expect(body.jobs).toHaveLength(0);
    expect(body.reason).toBe("hourly_cap_reached");
    expect(response.headers.get("retry-after")).toBeTruthy();
  });

  it("goes quiet when the hard off switch is set", async () => {
    vi.stubEnv("CRAWL_WORKER_DISABLED", "1");
    registerCrawlerRuntime(makeRuntime(makeStore({ dueJobs: [makeJob()] }).store).runtime);
    const { POST } = await import("@/app/api/crawl/lease/route");
    const body = (await (await POST(leaseRequest())).json()) as { jobs: unknown[]; reason: string };
    expect(body.jobs).toHaveLength(0);
    expect(body.reason).toBe("worker_disabled");
  });

  it("rejects a malformed body", async () => {
    registerCrawlerRuntime(makeRuntime(makeStore().store).runtime);
    const { POST } = await import("@/app/api/crawl/lease/route");
    const response = await POST(leaseRequest({ maxJobs: 99, sneaky: true }));
    expect(response.status).toBe(400);
  });
});

describe("submit route", () => {
  beforeEach(() => {
    vi.stubEnv("CRAWL_LEASE_SECRET", SECRET);
    vi.stubEnv("CRAWL_WORKER_DISABLED", "");
  });

  const CLIENT_HEADERS = {
    "content-type": "application/json",
    "x-forwarded-for": "203.0.113.7",
    "user-agent": "Test/1.0",
  };

  function clientId(): string {
    return deriveClientId({ ip: "203.0.113.7", userAgent: "Test/1.0", secret: SECRET });
  }

  it("refuses a forged lease token", async () => {
    const job = makeJob({ leasedBy: clientId(), leasedUntil: new Date(Date.now() + 60_000).toISOString() });
    registerCrawlerRuntime(makeRuntime(makeStore({ job }).store).runtime);

    const forged = signLeaseToken(
      { jobId: job.jobId, clientId: clientId(), expiresAt: Date.now() + 60_000, nonce: "n" },
      "attacker-secret-long-enough",
    );
    const { POST } = await import("@/app/api/crawl/submit/route");
    const response = await POST(
      new Request("https://x.test/api/crawl/submit", {
        method: "POST",
        headers: CLIENT_HEADERS,
        body: JSON.stringify({
          jobId: job.jobId,
          leaseToken: forged,
          ok: true,
          html: `<html>${"x".repeat(400)}</html>`,
          fetchedAt: new Date().toISOString(),
        }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("refuses a submission for a job the client does not hold", async () => {
    const job = makeJob({ leasedBy: "someone-else", leasedUntil: new Date(Date.now() + 60_000).toISOString() });
    registerCrawlerRuntime(makeRuntime(makeStore({ job }).store).runtime);

    const { token } = issueLeaseToken({
      jobId: job.jobId,
      clientId: clientId(),
      now: new Date(),
      secret: SECRET,
    });
    const { POST } = await import("@/app/api/crawl/submit/route");
    const response = await POST(
      new Request("https://x.test/api/crawl/submit", {
        method: "POST",
        headers: CLIENT_HEADERS,
        body: JSON.stringify({
          jobId: job.jobId,
          leaseToken: token,
          ok: true,
          html: `<html>${"x".repeat(400)}</html>`,
          fetchedAt: new Date().toISOString(),
        }),
      }),
    );
    expect(response.status).toBe(409);
  });

  it("parses server-side and commits a valid submission", async () => {
    const job = makeJob({ leasedBy: clientId(), leasedUntil: new Date(Date.now() + 60_000).toISOString() });
    const { store, state } = makeStore({ job });
    registerCrawlerRuntime(makeRuntime(store, { page: makePage(7) }).runtime);

    const { token } = issueLeaseToken({
      jobId: job.jobId,
      clientId: clientId(),
      now: new Date(),
      secret: SECRET,
    });
    const { POST } = await import("@/app/api/crawl/submit/route");
    const response = await POST(
      new Request("https://x.test/api/crawl/submit", {
        method: "POST",
        headers: CLIENT_HEADERS,
        body: JSON.stringify({
          jobId: job.jobId,
          leaseToken: token,
          ok: true,
          html: `<html>${"x".repeat(400)}</html>`,
          fetchedAt: new Date().toISOString(),
        }),
      }),
    );
    const body = (await response.json()) as { recordsWritten: number; quarantined: boolean };
    expect(response.status).toBe(200);
    expect(body.recordsWritten).toBe(7);
    expect(body.quarantined).toBe(false);
    expect(state.runs[0].source).toBe("browser");
  });

  it("rejects an oversized payload before parsing it", async () => {
    registerCrawlerRuntime(makeRuntime(makeStore().store).runtime);
    const { POST } = await import("@/app/api/crawl/submit/route");
    const response = await POST(
      new Request("https://x.test/api/crawl/submit", {
        method: "POST",
        headers: { ...CLIENT_HEADERS, "content-length": String(50 * 1024 * 1024) },
        body: JSON.stringify({ jobId: "j", leaseToken: "x".repeat(20), ok: true, html: "y", fetchedAt: "now" }),
      }),
    );
    expect(response.status).toBe(413);
  });

  it("rejects an ok submission carrying no html", async () => {
    registerCrawlerRuntime(makeRuntime(makeStore().store).runtime);
    const { POST } = await import("@/app/api/crawl/submit/route");
    const response = await POST(
      new Request("https://x.test/api/crawl/submit", {
        method: "POST",
        headers: CLIENT_HEADERS,
        body: JSON.stringify({
          jobId: "j",
          leaseToken: "x".repeat(20),
          ok: true,
          fetchedAt: new Date().toISOString(),
        }),
      }),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------

describe("backfill plan", () => {
  it("seeds one job per subject per term plus the index pages", () => {
    const subjects = ["COMS", "MATH", "PHYS"];
    const plan = buildBackfillPlan(subjects, {
      ...DEFAULT_BACKFILL_OPTIONS,
      terms: ["20263", "20271"],
    }, NOW);
    expect(plan.countsByKind.subject_term).toBe(6);
    expect(plan.countsByKind.subject_index).toBe(26);
  });

  it("paces conservatively — roughly 1/spacing requests per second", () => {
    const subjects = Array.from({ length: 100 }, (_, i) => `S${i}`);
    const plan = buildBackfillPlan(subjects, {
      ...DEFAULT_BACKFILL_OPTIONS,
      terms: ["20263"],
      spacingSeconds: 4,
      includeSubjectIndex: false,
    }, NOW);
    expect(plan.requestsPerSecond).toBeLessThan(0.4);
    expect(plan.specs.every((spec) => Date.parse(spec.nextFetchAt) >= NOW.getTime())).toBe(true);
  });

  it("does not march alphabetically through the directory", () => {
    const subjects = Array.from({ length: 60 }, (_, i) => `S${String(i).padStart(3, "0")}`);
    const plan = buildBackfillPlan(subjects, {
      ...DEFAULT_BACKFILL_OPTIONS,
      terms: ["20263"],
      includeSubjectIndex: false,
    }, NOW);
    const keys = plan.specs.map((spec) => spec.targetKey);
    const sorted = [...keys].sort();
    expect(keys).not.toEqual(sorted);
  });

  it("is deterministic for a given seed", () => {
    const subjects = ["COMS", "MATH", "PHYS", "ECON"];
    const options = { ...DEFAULT_BACKFILL_OPTIONS, terms: ["20263"] as string[] };
    const a = buildBackfillPlan(subjects, options, NOW);
    const b = buildBackfillPlan(subjects, options, NOW);
    expect(a.specs.map((s) => s.url)).toEqual(b.specs.map((s) => s.url));
  });

  it("never targets a non-production host", () => {
    const plan = buildBackfillPlan(["COMS"], { ...DEFAULT_BACKFILL_OPTIONS, terms: ["20263"] }, NOW);
    for (const spec of plan.specs) {
      expect(() => assertCrawlableUrl(spec.url)).not.toThrow();
    }
  });

  it("seeded PRNG is stable", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
