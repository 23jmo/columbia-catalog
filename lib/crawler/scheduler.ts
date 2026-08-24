/**
 * Columbia Catalog — crawl scheduling.
 *
 * The scheduler owns exactly one question: *when should this job next be
 * fetched?* `next_fetch_at` IS the recency cache (spec §10), so this file is
 * the only place allowed to decide it. Two rules make it safe:
 *
 *  1. Every write is jittered by ±CADENCE_JITTER of the tier interval, so a
 *     wave of jobs scheduled together never re-clusters into a synchronized
 *     wave later. Without this, one backfill produces a herd that hits
 *     Columbia in lockstep forever.
 *  2. Failures back off exponentially, capped, and are also jittered.
 */

import {
  CADENCE_JITTER,
  CADENCE_SECONDS,
  DOC_BASE,
  subjectTermUrl,
} from "@/lib/constants";
import type { CrawlJob, CrawlJobKind, CrawlTier, TermCode } from "@/lib/types";
import type { CrawlJobStore } from "./contracts";

// ---------------------------------------------------------------------------
// Local tuning constants (not shared — deliberately local to this lane)
// ---------------------------------------------------------------------------

/** First retry waits this long; doubles per consecutive failure. */
export const FAILURE_BACKOFF_BASE_SECONDS = 120;
/** A job never backs off past this, or a transient outage would orphan it. */
export const FAILURE_BACKOFF_MAX_SECONDS = 6 * 60 * 60;
/** Failures beyond this contribute no further doubling (guards overflow). */
export const FAILURE_BACKOFF_MAX_DOUBLINGS = 12;

/**
 * How much longer than its tier's cadence a given job kind should wait.
 *
 * ── Why cadence cannot be a function of tier alone ─────────────────────────
 *
 * `CADENCE_SECONDS` is keyed by tier, and a tier answers "how urgent is this
 * subject right now?" — watched, registering, or neither. It says nothing
 * about *what page* is being fetched, and those are independent questions. A
 * seat count on a subject page is worth re-reading every hour because it
 * changes every hour. A course description on a section-detail page is worth
 * re-reading roughly never: the title, the points, and the prose are set when
 * the term is published and then sit still.
 *
 * Every kind landed in `baseline` because that is the enum's default, and
 * baseline means hourly. Nobody chose hourly for section detail — it was
 * inherited. The result was 5,433 jobs re-fetching pages that had not changed,
 * on top of the 1,156 that genuinely needed to, which put steady state over
 * seven times the ~900 requests/hour spec §10 budgets for a full refresh.
 * That is not an error anyone would see: the crawler reports success, the data
 * is correct, and the entire cost is borne by Columbia's servers.
 *
 * A multiplier rather than a second cadence table because the tier's answer is
 * still the right starting point — a watched subject should get its detail
 * pages sooner than an unwatched one, just not hourly.
 */
export const KIND_CADENCE_MULTIPLIER: Record<CrawlJobKind, number> = {
  /** The seat-count refresh. This is the cadence the tier interval is for. */
  subject_term: 1,
  /** Descriptions and prerequisites; seat counts here are already covered by
   *  the subject page, which is fetched hourly and is authoritative. Weekly. */
  section_detail: 24 * 7,
  /** Bulletin meeting times — spec §10 budgets these weekly by name. */
  bulletin_department: 24 * 7,
  /** The subject list changes when a term is published, not within one. */
  subject_index: 24 * 7,
  /**
   * Daily, not weekly, and the difference matters: these are the registration
   * windows that decide when subjects escalate to the 30s tier. A week-stale
   * calendar means finding out a window opened after it opened, which is the
   * one moment the whole tier system exists to be ready for.
   */
  academic_calendar: 24,
};

/** Randomness source, injectable so tests can pin the jitter. */
export type RandomSource = () => number;

const defaultRandom: RandomSource = Math.random;

// ---------------------------------------------------------------------------
// Jitter
// ---------------------------------------------------------------------------

/**
 * Multiply `seconds` by a factor uniformly drawn from
 * [1 - CADENCE_JITTER, 1 + CADENCE_JITTER].
 */
export function jitterSeconds(seconds: number, random: RandomSource = defaultRandom): number {
  const factor = 1 - CADENCE_JITTER + random() * (2 * CADENCE_JITTER);
  return seconds * factor;
}

/**
 * The one function every consumer calls before writing `next_fetch_at`.
 * Returns an ISO 8601 timestamp.
 */
export function computeNextFetchAt(
  tier: CrawlTier,
  now: Date,
  random: RandomSource = defaultRandom,
  kind?: CrawlJobKind,
): string {
  const seconds = jitterSeconds(CADENCE_SECONDS[tier] * kindMultiplier(tier, kind), random);
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

/**
 * The multiplier only applies at baseline, and that restriction is the whole
 * safety argument for this feature.
 *
 * Promotion to `hot` or `registration` is someone saying "I need this page
 * now" — a student is watching it, or registration is open. Stretching that
 * by a factor of 168 would silently convert an escalation into a longer wait
 * than the job had before it was promoted, which is worse than not promoting
 * at all. Nothing promotes a non-`subject_term` job today, so this branch is
 * currently unreachable; it exists so that the day something does, the
 * escalation still means what it says.
 */
function kindMultiplier(tier: CrawlTier, kind: CrawlJobKind | undefined): number {
  if (kind === undefined || tier !== "baseline") return 1;
  return KIND_CADENCE_MULTIPLIER[kind];
}

/**
 * Backoff after a failed fetch. Exponential in `consecutiveFailures`, clamped,
 * jittered, and never shorter than the tier's own cadence — a failing job must
 * not be retried harder than a healthy one.
 */
export function computeBackoffFetchAt(
  tier: CrawlTier,
  consecutiveFailures: number,
  now: Date,
  random: RandomSource = defaultRandom,
): string {
  const doublings = Math.min(Math.max(consecutiveFailures, 1) - 1, FAILURE_BACKOFF_MAX_DOUBLINGS);
  const raw = FAILURE_BACKOFF_BASE_SECONDS * 2 ** doublings;
  const clamped = Math.min(Math.max(raw, CADENCE_SECONDS[tier]), FAILURE_BACKOFF_MAX_SECONDS);
  const seconds = jitterSeconds(clamped, random);
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Registration windows
// ---------------------------------------------------------------------------

/**
 * Appointments stagger by school and class year over roughly two weeks, so
 * escalation is per-window rather than a single global flag (spec §10).
 * Windows are produced by ingesting Columbia's published academic calendar.
 */
export interface RegistrationWindow {
  termCode: TermCode;
  label: string;
  /** ISO 8601. */
  opensAt: string;
  /** ISO 8601. */
  closesAt: string;
}

export function isWindowActive(window: RegistrationWindow, now: Date): boolean {
  const opens = Date.parse(window.opensAt);
  const closes = Date.parse(window.closesAt);
  if (Number.isNaN(opens) || Number.isNaN(closes)) return false;
  const t = now.getTime();
  return t >= opens && t < closes;
}

export function activeRegistrationWindows(
  windows: readonly RegistrationWindow[],
  now: Date,
): RegistrationWindow[] {
  return windows.filter((w) => isWindowActive(w, now));
}

/** Terms currently inside at least one registration window. */
export function termsInRegistration(
  windows: readonly RegistrationWindow[],
  now: Date,
): Set<TermCode> {
  return new Set(activeRegistrationWindows(windows, now).map((w) => w.termCode));
}

// ---------------------------------------------------------------------------
// Tier assignment
// ---------------------------------------------------------------------------

export interface TierContext {
  /** `${subjectCode}:${termCode}` keys with at least one watched section. */
  hotKeys: ReadonlySet<string>;
  /** Terms inside an active registration window. */
  registrationTerms: ReadonlySet<TermCode>;
}

export function emptyTierContext(): TierContext {
  return { hotKeys: new Set<string>(), registrationTerms: new Set<TermCode>() };
}

/** The key hot-tier membership is tracked under. */
export function hotKey(subjectCode: string, termCode: TermCode | null): string {
  return `${subjectCode.toUpperCase()}:${termCode ?? "-"}`;
}

/**
 * Tier assignment, highest escalation first:
 *
 *   registration — the job's term is inside an active appointment window AND
 *                  the job is watched. Escalating an unwatched subject to 30s
 *                  would burn request budget on pages nobody is waiting on.
 *   hot          — the subject contains a watched section.
 *   baseline     — everything else.
 *
 * Only live section data escalates. Bulletin, subject index and calendar jobs
 * describe things that change weekly at most and stay at baseline forever.
 */
export function assignTier(
  job: Pick<CrawlJob, "kind" | "targetKey" | "termCode">,
  context: TierContext,
): CrawlTier {
  if (!isLiveDataKind(job.kind)) return "baseline";
  const key = hotKey(subjectOfTargetKey(job.targetKey), job.termCode);
  const watched = context.hotKeys.has(key);
  if (!watched) return "baseline";
  if (job.termCode && context.registrationTerms.has(job.termCode)) return "registration";
  return "hot";
}

/** Kinds whose content moves minute-to-minute during registration. */
export function isLiveDataKind(kind: CrawlJobKind): boolean {
  return kind === "subject_term" || kind === "section_detail";
}

/**
 * `targetKey` is a subject code for `subject_term` jobs and a section id for
 * `section_detail` jobs; both start with the subject's letters.
 */
export function subjectOfTargetKey(targetKey: string): string {
  const match = /^[0-9]{5}([A-Za-z]+)|^([A-Za-z]+)/.exec(targetKey);
  const letters = match?.[1] ?? match?.[2] ?? "";
  return letters.toUpperCase();
}

// ---------------------------------------------------------------------------
// Section id decomposition
// ---------------------------------------------------------------------------

/**
 * `sectionId` is `${termCode}${courseId}${sectionCode}`, e.g.
 * `20263COMS4113W001` → term 20263, subject COMS.
 */
export interface DecomposedSectionId {
  sectionId: string;
  termCode: TermCode;
  subjectCode: string;
}

export function decomposeSectionId(sectionId: string): DecomposedSectionId | null {
  const match = /^(\d{5})([A-Za-z]{2,8})\d{3,5}[A-Za-z]?(\d{3})$/.exec(sectionId.trim());
  if (!match) return null;
  return { sectionId, termCode: match[1], subjectCode: match[2].toUpperCase() };
}

/** Distinct `(subjectCode, termCode)` pairs covering the given sections. */
export function subjectTermsForSections(
  sectionIds: readonly string[],
): { subjectCode: string; termCode: TermCode }[] {
  const seen = new Map<string, { subjectCode: string; termCode: TermCode }>();
  for (const id of sectionIds) {
    const parts = decomposeSectionId(id);
    if (!parts) continue;
    seen.set(hotKey(parts.subjectCode, parts.termCode), {
      subjectCode: parts.subjectCode,
      termCode: parts.termCode,
    });
  }
  return [...seen.values()];
}

/** Hot keys implied by a set of watched sections. */
export function hotKeysForSections(sectionIds: readonly string[]): Set<string> {
  return new Set(subjectTermsForSections(sectionIds).map((s) => hotKey(s.subjectCode, s.termCode)));
}

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

export interface PromoteResult {
  /** Subject-term pairs that were moved. */
  promoted: { subjectCode: string; termCode: TermCode }[];
  /** Rows the store reported as updated. */
  rowsUpdated: number;
  tier: CrawlTier;
}

/**
 * Subjects containing watched sections move to the hot tier (spec §10). When
 * the subject's term is inside an active registration window the escalation
 * goes all the way to the 30s registration tier instead.
 *
 * Promotion pulls `nextFetchAt` forward to the new tier's cadence immediately,
 * because the point of promoting is to stop waiting an hour.
 */
export async function promoteToHot(
  sectionIds: readonly string[],
  deps: {
    store: Pick<CrawlJobStore, "setTier">;
    now?: Date;
    registrationWindows?: readonly RegistrationWindow[];
    random?: RandomSource;
  },
): Promise<PromoteResult> {
  const now = deps.now ?? new Date();
  const random = deps.random ?? defaultRandom;
  const pairs = subjectTermsForSections(sectionIds);
  if (pairs.length === 0) {
    return { promoted: [], rowsUpdated: 0, tier: "hot" };
  }

  const registrationTerms = termsInRegistration(deps.registrationWindows ?? [], now);

  // Split so each tier gets its own cadence; a single setTier call cannot
  // express two different tiers.
  const byTier = new Map<CrawlTier, { subjectCode: string; termCode: TermCode }[]>();
  for (const pair of pairs) {
    const tier: CrawlTier = registrationTerms.has(pair.termCode) ? "registration" : "hot";
    const bucket = byTier.get(tier) ?? [];
    bucket.push(pair);
    byTier.set(tier, bucket);
  }

  let rowsUpdated = 0;
  let highestTier: CrawlTier = "hot";
  for (const [tier, bucket] of byTier) {
    if (tier === "registration") highestTier = "registration";
    rowsUpdated += await deps.store.setTier(
      bucket.map((pair) => ({
        kind: "subject_term" as const,
        targetKey: pair.subjectCode,
        termCode: pair.termCode,
      })),
      tier,
      computeNextFetchAt(tier, now, random),
    );
  }

  return { promoted: pairs, rowsUpdated, tier: highestTier };
}

/**
 * Demote everything that is no longer watched back to baseline. Run alongside
 * `promoteToHot` so the hot tier does not grow monotonically as watches are
 * deleted.
 */
export async function demoteToBaseline(
  pairs: readonly { subjectCode: string; termCode: TermCode }[],
  deps: { store: Pick<CrawlJobStore, "setTier">; now?: Date; random?: RandomSource },
): Promise<number> {
  if (pairs.length === 0) return 0;
  const now = deps.now ?? new Date();
  return deps.store.setTier(
    pairs.map((pair) => ({
      kind: "subject_term" as const,
      targetKey: pair.subjectCode,
      termCode: pair.termCode,
    })),
    "baseline",
    computeNextFetchAt("baseline", now, deps.random ?? defaultRandom),
  );
}

// ---------------------------------------------------------------------------
// Due-ness
// ---------------------------------------------------------------------------

/** A job is due only when `now > nextFetchAt` and it is not currently leased. */
export function isDue(job: Pick<CrawlJob, "nextFetchAt" | "leasedUntil">, now: Date): boolean {
  const due = Date.parse(job.nextFetchAt);
  if (Number.isNaN(due) || due > now.getTime()) return false;
  if (job.leasedUntil) {
    const held = Date.parse(job.leasedUntil);
    if (!Number.isNaN(held) && held > now.getTime()) return false;
  }
  return true;
}

/** Seconds a job is past due; negative when still fresh. */
export function overdueSeconds(job: Pick<CrawlJob, "nextFetchAt">, now: Date): number {
  return (now.getTime() - Date.parse(job.nextFetchAt)) / 1000;
}

// ---------------------------------------------------------------------------
// URL construction for scheduled work
// ---------------------------------------------------------------------------

/** Canonical URL for a subject-term job. Re-exported so callers stay honest. */
export function urlForSubjectTerm(subjectCode: string, termCode: TermCode): string {
  return subjectTermUrl(subjectCode, termCode);
}

/**
 * Directory SUBJECT index, split across `sel/subj-{A..Z}.html`.
 *
 * Not `sel/dept-{A..Z}.html`. Both exist and both are tables of name + term
 * links, which is why the confusion is easy: the directory home page links only
 * to the `dept-` pages, and that is what the doc-root fixture captures. But
 * they are different namespaces. The `dept-` pages key on DEPARTMENT codes and
 * link to `sel/{DEPT}_{Term}.html`; the crawler's unit of work is a SUBJECT and
 * its URL is `subj/{SUBJ}/_{Term}.html`. Pointing discovery at `dept-` yields
 * pages with no `subj/` hrefs at all, so `parseSubjectIndex` correctly returns
 * nothing and the backfill enqueues zero subjects — silently.
 */
export function urlForSubjectIndexLetter(letter: string): string {
  return `${DOC_BASE}/sel/subj-${letter.toUpperCase()}.html`;
}
