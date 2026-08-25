/**
 * LionPlan — shared constants.
 * Authoritative. Import rather than redefining.
 */

import type { CampusZone, CrawlTier, Season, Term, TermCode, Weekday } from "./types";

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Public Directory of Classes. Serves Access-Control-Allow-Origin: * */
export const DOC_BASE = "https://doc.sis.columbia.edu";

/** Public Bulletin. No CORS header — server-side fetch only. */
export const BULLETIN_BASE = "https://bulletin.columbia.edu";

/** Where a student goes to actually register. We only ever deep-link here. */
export const VERGIL_BASE = "https://vergil.columbia.edu";

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export const SEASON_DIGIT: Record<Season, string> = {
  Spring: "1",
  Summer: "2",
  Fall: "3",
};

export const DIGIT_SEASON: Record<string, Season> = {
  "1": "Spring",
  "2": "Summer",
  "3": "Fall",
};

export function parseTermCode(termCode: TermCode): { year: number; season: Season } {
  const year = Number(termCode.slice(0, 4));
  const season = DIGIT_SEASON[termCode.slice(4)];
  if (!season || Number.isNaN(year)) throw new Error(`Bad term code: ${termCode}`);
  return { year, season };
}

export function termLabel(termCode: TermCode): string {
  const { year, season } = parseTermCode(termCode);
  return `${season} ${year}`;
}

/** Directory URLs use "Fall2026", not "20263". */
export function termDirectoryLabel(termCode: TermCode): string {
  const { year, season } = parseTermCode(termCode);
  return `${season}${year}`;
}

/** Currently registerable term. */
export const CURRENT_TERM: TermCode = "20263";
/** Next term to plan against. */
export const NEXT_TERM: TermCode = "20271";
/** Read-only history, powering offering history and year-over-year comparison. */
export const ARCHIVED_TERMS: TermCode[] = ["20261", "20253", "20251", "20243", "20241", "20233"];

export const ACTIVE_TERMS: TermCode[] = [CURRENT_TERM, NEXT_TERM];
export const ALL_TERMS: TermCode[] = [...ACTIVE_TERMS, ...ARCHIVED_TERMS];

export function buildTerm(termCode: TermCode): Term {
  const { year, season } = parseTermCode(termCode);
  return {
    termCode,
    season,
    year,
    directoryLabel: termDirectoryLabel(termCode),
    label: termLabel(termCode),
    isRegisterable: ACTIVE_TERMS.includes(termCode),
    isArchived: ARCHIVED_TERMS.includes(termCode),
  };
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/** Every section for a subject in one term — the unit of crawl work. */
export function subjectTermUrl(subjectCode: string, termCode: TermCode): string {
  return `${DOC_BASE}/subj/${subjectCode}/_${termDirectoryLabel(termCode)}.html`;
}

/** e.g. /subj/COMS/W4113-20263-001/ */
export function sectionDetailUrl(
  subjectCode: string,
  qualifier: string | null,
  number: number,
  termCode: TermCode,
  sectionCode: string,
): string {
  return `${DOC_BASE}/subj/${subjectCode}/${qualifier ?? ""}${number}-${termCode}-${sectionCode}/`;
}

/**
 * Deep link into Vergil for a specific section. Verified from directory HTML:
 * the directory itself links to /vergil/class/{term}/{callNumber}. Requires a
 * UNI login on Vergil's side. This is the only Columbia URL we ever send a
 * student to for registration.
 */
export function vergilSectionUrl(termCode: TermCode, callNumber: string): string {
  return `${VERGIL_BASE}/vergil/class/${termCode}/${callNumber}`;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export const WEEKDAYS: Weekday[] = ["Mo", "Tu", "We", "Th", "Fr"];
export const ALL_WEEKDAYS: Weekday[] = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  Su: "Sunday",
  Mo: "Monday",
  Tu: "Tuesday",
  We: "Wednesday",
  Th: "Thursday",
  Fr: "Friday",
  Sa: "Saturday",
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  Su: "Su", Mo: "M", Tu: "T", We: "W", Th: "Th", Fr: "F", Sa: "Sa",
};

/** Earliest/latest hour rendered on the week grid. */
export const GRID_START_MINUTE = 8 * 60;
export const GRID_END_MINUTE = 23 * 60;

export function minutesToLabel(minute: number): string {
  const h24 = Math.floor(minute / 60);
  const m = minute % 60;
  const ampm = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

// ---------------------------------------------------------------------------
// Campus geography
// ---------------------------------------------------------------------------

export const ZONE_LABEL: Record<CampusZone, string> = {
  morningside: "Morningside",
  barnard: "Barnard",
  manhattanville: "Manhattanville",
  cuimc: "Medical Center",
  other: "Other",
  unknown: "Unknown",
};

/** Approximate walking minutes between campus zones. */
export const ZONE_WALK_MINUTES: Record<CampusZone, Record<CampusZone, number>> = {
  morningside:    { morningside: 6,  barnard: 5,  manhattanville: 14, cuimc: 35, other: 20, unknown: 10 },
  barnard:        { morningside: 5,  barnard: 4,  manhattanville: 12, cuimc: 34, other: 20, unknown: 10 },
  manhattanville: { morningside: 14, barnard: 12, manhattanville: 5,  cuimc: 28, other: 20, unknown: 12 },
  cuimc:          { morningside: 35, barnard: 34, manhattanville: 28, cuimc: 6,  other: 30, unknown: 25 },
  other:          { morningside: 20, barnard: 20, manhattanville: 20, cuimc: 30, other: 10, unknown: 15 },
  unknown:        { morningside: 10, barnard: 10, manhattanville: 12, cuimc: 25, other: 15, unknown: 10 },
};

/** A cross-zone transition always hard-warns; intra-zone warns only if tight. */
export function isCrossCampus(a: CampusZone, b: CampusZone): boolean {
  if (a === b) return false;
  const soft = new Set(["morningside", "barnard"]);
  return !(soft.has(a) && soft.has(b));
}

// ---------------------------------------------------------------------------
// Crawl cadence
// ---------------------------------------------------------------------------

/** Seconds between refreshes, per tier. See spec §10. */
export const CADENCE_SECONDS: Record<CrawlTier, number> = {
  baseline: 60 * 60,
  hot: 2 * 60,
  registration: 30,
};

/**
 * Jitter applied to every nextFetchAt write, as a fraction of the interval.
 * Prevents jobs re-clustering into synchronized waves.
 */
export const CADENCE_JITTER = 0.25;

/** How long a worker holds a job before it returns to the pool. */
export const LEASE_SECONDS = 90;

/** Max jobs handed to a single browser worker in one lease request. */
export const MAX_LEASE_BATCH = 3;

/** Per-client ceiling, so no browser ever walks a dozen pages in a row. */
export const CLIENT_HOURLY_JOB_CAP = 40;

/**
 * Cron only claims jobs overdue by more than this, leaving fresh work to
 * browsers. Cron is the safety net, browsers are the engine.
 */
export const CRON_GRACE_SECONDS = 10 * 60;

// ---------------------------------------------------------------------------
// Performance budget — asserted in tests, see spec §19.
// ---------------------------------------------------------------------------

export const PERF_BUDGET = {
  /** Keystroke to updated results, one frame. */
  searchMs: 16,
  /** Ceiling on the initial client index download. */
  indexBytes: 3 * 1024 * 1024,
} as const;

// ---------------------------------------------------------------------------
// Requirements surfaced as filters
// ---------------------------------------------------------------------------

export const REQUIREMENT_FILTERS: { key: string; label: string; group: string }[] = [
  { key: "globalCore", label: "Global Core", group: "Core Curriculum" },
  { key: "scienceRequirement", label: "Science Requirement", group: "Core Curriculum" },
  { key: "scienceWithLab", label: "Science with Lab", group: "Core Curriculum" },
  { key: "artsAndHumanities", label: "Arts & Humanities", group: "Core Curriculum" },
  { key: "socialScience", label: "Social Science", group: "Core Curriculum" },
  { key: "language", label: "Language", group: "Core Curriculum" },
  { key: "physicalEducation", label: "Physical Education", group: "Core Curriculum" },
  { key: "firstYearSeminar", label: "First-Year Seminar", group: "Core Curriculum" },
  { key: "thinkingLocally", label: "Thinking Locally", group: "Ways of Knowing" },
  { key: "thinkingThroughGlobalInquiry", label: "Global Inquiry", group: "Ways of Knowing" },
  { key: "thinkingAboutSocialDifference", label: "Social Difference", group: "Ways of Knowing" },
  { key: "thinkingWithHistoricalPerspective", label: "Historical Perspective", group: "Ways of Knowing" },
  { key: "thinkingQuantitativelyAndEmpirically", label: "Quantitative & Empirical", group: "Ways of Knowing" },
  { key: "thinkingTechnologicallyAndDigitally", label: "Technological & Digital", group: "Ways of Knowing" },
  { key: "culturesInComparison", label: "Cultures in Comparison", group: "Nine Ways of Knowing" },
  { key: "ethicsAndValues", label: "Ethics & Values", group: "Nine Ways of Knowing" },
  { key: "historicalStudies", label: "Historical Studies", group: "Nine Ways of Knowing" },
  { key: "laboratoryScience", label: "Laboratory Science", group: "Nine Ways of Knowing" },
  { key: "literature", label: "Literature", group: "Nine Ways of Knowing" },
  { key: "quantitativeAndDeductiveReasoning", label: "Quantitative Reasoning", group: "Nine Ways of Knowing" },
  { key: "socialAnalysis", label: "Social Analysis", group: "Nine Ways of Knowing" },
  { key: "visualAndPerformingArts", label: "Visual & Performing Arts", group: "Nine Ways of Knowing" },
];

export const COURSE_LEVELS: { label: string; range: [number, number] }[] = [
  { label: "1000 — Introductory", range: [1000, 1999] },
  { label: "2000 — Intermediate", range: [2000, 2999] },
  { label: "3000 — Advanced", range: [3000, 3999] },
  { label: "4000 — Advanced / Graduate", range: [4000, 4999] },
  { label: "6000+ — Graduate", range: [6000, 9999] },
];
