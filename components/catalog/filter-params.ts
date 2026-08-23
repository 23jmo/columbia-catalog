/**
 * Filter state <-> URL query string.
 *
 * The query string is the shareable source of truth for a search: paste a URL
 * into a group chat and the recipient sees the same results. It is also what
 * makes browser back/forward work.
 *
 * Encoding is deliberately terse and human-readable so a shared link stays
 * legible: `?q=operating+systems&days=Mo,We&after=600&open=1`.
 */

import type { Weekday } from "@/lib/types";
import { ALL_WEEKDAYS, COURSE_LEVELS, REQUIREMENT_FILTERS } from "@/lib/constants";
import type { CatalogSearchFilters } from "./search-source";

/** Everything the URL can carry. Values are already parsed and validated. */
export type ParamRecord = Record<string, string | string[] | undefined>;

const WEEKDAY_SET = new Set<string>(ALL_WEEKDAYS);
const REQUIREMENT_KEY_SET = new Set(REQUIREMENT_FILTERS.map((r) => r.key));

export const DEFAULT_FILTERS: CatalogSearchFilters = {
  includeUnrated: true,
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function csv(value: string | string[] | undefined): string[] {
  const raw = first(value);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function int(value: string | string[] | undefined): number | undefined {
  const raw = first(value);
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Parse a Next.js `searchParams` object (or a `URLSearchParams`) into filters. */
export function paramsToFilters(params: ParamRecord): CatalogSearchFilters {
  const filters: CatalogSearchFilters = { includeUnrated: first(params.unrated) !== "0" };

  const q = first(params.q);
  if (q) filters.q = q;

  const term = first(params.term);
  if (term) filters.termCode = term;

  const subjects = csv(params.subj);
  if (subjects.length) filters.subjects = subjects;

  const schools = csv(params.school);
  if (schools.length) filters.schools = schools;

  const instructors = csv(params.instr);
  if (instructors.length) filters.instructors = instructors;

  const days = csv(params.days).filter((d): d is Weekday => WEEKDAY_SET.has(d));
  if (days.length) filters.days = days;

  const requirements = csv(params.req).filter((k) => REQUIREMENT_KEY_SET.has(k));
  if (requirements.length) filters.requirements = requirements;

  const level = first(params.lvl);
  if (level) {
    const [lo, hi] = level.split("-").map(Number);
    if (Number.isFinite(lo) && Number.isFinite(hi)) filters.levelRange = [lo, hi];
  }

  const creditsMin = int(params.cmin);
  if (creditsMin !== undefined) filters.creditsMin = creditsMin;
  const creditsMax = int(params.cmax);
  if (creditsMax !== undefined) filters.creditsMax = creditsMax;

  const after = int(params.after);
  if (after !== undefined) filters.startAfterMinute = clamp(after, 0, 1439);
  const before = int(params.before);
  if (before !== undefined) filters.endBeforeMinute = clamp(before, 0, 1440);

  if (first(params.open) === "1") filters.openSeatsOnly = true;

  const workload = int(params.wl);
  if (workload !== undefined) filters.maxWorkload = clamp(workload, 1, 5);
  const difficulty = int(params.diff);
  if (difficulty !== undefined) filters.maxDifficulty = clamp(difficulty, 1, 5);
  const teaching = int(params.tq);
  if (teaching !== undefined) filters.minTeachingQuality = clamp(teaching, 1, 5);

  return filters;
}

/** Serialize filters back into a query string (no leading `?`). */
export function filtersToQueryString(filters: CatalogSearchFilters): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== "") params.set(key, value);
  };

  set("q", filters.q?.trim() || undefined);
  set("term", filters.termCode);
  set("subj", filters.subjects?.length ? filters.subjects.join(",") : undefined);
  set("school", filters.schools?.length ? filters.schools.join(",") : undefined);
  set("instr", filters.instructors?.length ? filters.instructors.join(",") : undefined);
  set("days", filters.days?.length ? filters.days.join(",") : undefined);
  set("req", filters.requirements?.length ? filters.requirements.join(",") : undefined);
  set("lvl", filters.levelRange ? `${filters.levelRange[0]}-${filters.levelRange[1]}` : undefined);
  set("cmin", filters.creditsMin !== undefined ? String(filters.creditsMin) : undefined);
  set("cmax", filters.creditsMax !== undefined ? String(filters.creditsMax) : undefined);
  set("after", filters.startAfterMinute !== undefined ? String(filters.startAfterMinute) : undefined);
  set("before", filters.endBeforeMinute !== undefined ? String(filters.endBeforeMinute) : undefined);
  set("open", filters.openSeatsOnly ? "1" : undefined);
  set("wl", filters.maxWorkload !== undefined ? String(filters.maxWorkload) : undefined);
  set("diff", filters.maxDifficulty !== undefined ? String(filters.maxDifficulty) : undefined);
  set("tq", filters.minTeachingQuality !== undefined ? String(filters.minTeachingQuality) : undefined);
  // Only written when it deviates from the safe default.
  if (filters.includeUnrated === false) params.set("unrated", "0");

  return params.toString();
}

/** Read filters straight off `window.location` (used on popstate). */
export function filtersFromLocation(search: string): CatalogSearchFilters {
  const usp = new URLSearchParams(search);
  const record: ParamRecord = {};
  usp.forEach((value, key) => {
    record[key] = value;
  });
  return paramsToFilters(record);
}

/* -------------------------------------------------------------------------- */
/*  Active-filter descriptors                                                 */
/* -------------------------------------------------------------------------- */

/** One removable chip in the active-filter rail. */
export interface ActiveFilter {
  /** Stable identity, unique across the whole rail. */
  id: string;
  /** Filter group, used by the empty state to suggest what to relax. */
  group: "text" | "time" | "requirements" | "org" | "reputation";
  label: string;
  /** Filters with this one removed. */
  clear: (filters: CatalogSearchFilters) => CatalogSearchFilters;
}

function without<K extends keyof CatalogSearchFilters>(
  filters: CatalogSearchFilters,
  key: K,
): CatalogSearchFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

function removeFrom<K extends "subjects" | "schools" | "instructors" | "requirements">(
  filters: CatalogSearchFilters,
  key: K,
  value: string,
): CatalogSearchFilters {
  const rest = (filters[key] ?? []).filter((v) => v !== value);
  const next = { ...filters };
  if (rest.length) next[key] = rest;
  else delete next[key];
  return next;
}

const LEVEL_LABEL_BY_RANGE = new Map(
  COURSE_LEVELS.map((l) => [`${l.range[0]}-${l.range[1]}`, l.label]),
);

const REQUIREMENT_LABEL_BY_KEY = new Map(REQUIREMENT_FILTERS.map((r) => [r.key, r.label]));

/**
 * Every active filter, as removable chips. Order matches the panel so the
 * rail reads top-to-bottom the same way the controls do.
 */
export function describeActiveFilters(
  filters: CatalogSearchFilters,
  minutesToLabel: (minute: number) => string,
): ActiveFilter[] {
  const out: ActiveFilter[] = [];

  if (filters.days?.length) {
    out.push({
      id: "days",
      group: "time",
      label: `Days: ${filters.days.join(" ")}`,
      clear: (f) => without(f, "days"),
    });
  }
  if (filters.startAfterMinute !== undefined) {
    out.push({
      id: "after",
      group: "time",
      label: `Starts after ${minutesToLabel(filters.startAfterMinute)}`,
      clear: (f) => without(f, "startAfterMinute"),
    });
  }
  if (filters.endBeforeMinute !== undefined) {
    out.push({
      id: "before",
      group: "time",
      label: `Ends before ${minutesToLabel(filters.endBeforeMinute)}`,
      clear: (f) => without(f, "endBeforeMinute"),
    });
  }
  if (filters.openSeatsOnly) {
    out.push({
      id: "open",
      group: "time",
      label: "Open seats only",
      clear: (f) => without(f, "openSeatsOnly"),
    });
  }
  if (filters.creditsMin !== undefined || filters.creditsMax !== undefined) {
    const lo = filters.creditsMin ?? 0;
    const hi = filters.creditsMax ?? 99;
    out.push({
      id: "credits",
      group: "time",
      label: `${lo}-${hi} credits`,
      clear: (f) => without(without(f, "creditsMin"), "creditsMax"),
    });
  }
  if (filters.levelRange) {
    const key = `${filters.levelRange[0]}-${filters.levelRange[1]}`;
    out.push({
      id: "level",
      group: "time",
      label: LEVEL_LABEL_BY_RANGE.get(key) ?? `Level ${key}`,
      clear: (f) => without(f, "levelRange"),
    });
  }

  for (const key of filters.requirements ?? []) {
    out.push({
      id: `req:${key}`,
      group: "requirements",
      label: REQUIREMENT_LABEL_BY_KEY.get(key) ?? key,
      clear: (f) => removeFrom(f, "requirements", key),
    });
  }

  for (const value of filters.schools ?? []) {
    out.push({
      id: `school:${value}`,
      group: "org",
      label: value,
      clear: (f) => removeFrom(f, "schools", value),
    });
  }
  for (const value of filters.subjects ?? []) {
    out.push({
      id: `subj:${value}`,
      group: "org",
      label: value,
      clear: (f) => removeFrom(f, "subjects", value),
    });
  }
  for (const value of filters.instructors ?? []) {
    out.push({
      id: `instr:${value}`,
      group: "org",
      label: value,
      clear: (f) => removeFrom(f, "instructors", value),
    });
  }

  if (filters.maxWorkload !== undefined) {
    out.push({
      id: "wl",
      group: "reputation",
      label: `Workload at most ${filters.maxWorkload}`,
      clear: (f) => without(f, "maxWorkload"),
    });
  }
  if (filters.maxDifficulty !== undefined) {
    out.push({
      id: "diff",
      group: "reputation",
      label: `Difficulty at most ${filters.maxDifficulty}`,
      clear: (f) => without(f, "maxDifficulty"),
    });
  }
  if (filters.minTeachingQuality !== undefined) {
    out.push({
      id: "tq",
      group: "reputation",
      label: `Teaching at least ${filters.minTeachingQuality}`,
      clear: (f) => without(f, "minTeachingQuality"),
    });
  }
  if (filters.includeUnrated === false) {
    out.push({
      id: "unrated",
      group: "reputation",
      label: "Rated courses only",
      clear: (f) => ({ ...f, includeUnrated: true }),
    });
  }

  return out;
}

/** Filters minus everything except the free-text query and the term. */
export function clearAllFilters(filters: CatalogSearchFilters): CatalogSearchFilters {
  return {
    ...DEFAULT_FILTERS,
    q: filters.q,
    termCode: filters.termCode,
  };
}

/** True when anything beyond the free-text query is narrowing the results. */
export function hasAnyFilter(filters: CatalogSearchFilters): boolean {
  return describeActiveFilters(filters, () => "").length > 0;
}
