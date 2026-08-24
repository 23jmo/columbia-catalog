/**
 * Presentation helpers local to the instructor profile.
 *
 * Shaping only — no domain logic. Anything another surface would want lives in
 * `@/lib/constants` or `@/components/course/format`.
 */

import type { Weekday } from "@/lib/types";
import { WEEKDAY_LABEL } from "@/lib/constants";

/** 390 → "6h 30m". Matches the template's "12h 54m" stat tile. */
export function durationLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** 1204 → "1,204". Every count on this page is `tabular-nums`, so grouping is safe. */
export function countLabel(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * Big numbers get an abbreviation the way the template abbreviates tokens
 * ("562.7M"), but seat counts never reach that magnitude — so this only kicks
 * in above a thousand and keeps one decimal.
 */
export function compactLabel(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1)}k`;
}

export function percentLabel(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** "Mo","We","Fr" → "Mon, Wed & Fri". Read aloud, not a code. */
export function weekdayListLabel(days: Weekday[]): string {
  const names = days.map((day) => WEEKDAY_LABEL[day].slice(0, 3));
  if (names.length === 0) return "No published meeting days";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** `2026-09-02` → "Sep 2". Used for chart axis captions. */
export function shortDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * A stable 32-bit FNV-1a over a name.
 *
 * Used to pick cover art and a heatmap accent. It must be deterministic: the
 * server and the client render the same profile and a mismatch would hydrate
 * into a flash of different colour.
 */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The accents `.contributions-grid[data-accent]` knows about (styles/globals.css). */
export const HEATMAP_ACCENTS = [
  "violet",
  "blue",
  "indigo",
  "teal",
  "emerald",
  "cyan",
  "rose",
  "amber",
  "green",
] as const;

export type HeatmapAccent = (typeof HEATMAP_ACCENTS)[number];

/**
 * Accent is keyed off the SUBJECT, not the person — so every COMS instructor
 * reads the same colour and the hue means "department" rather than "random".
 */
export function accentForSubject(subjectCode: string): HeatmapAccent {
  return HEATMAP_ACCENTS[stableHash(subjectCode) % HEATMAP_ACCENTS.length];
}

/**
 * Bucket a value into the six tiers `.contribution-cell[data-tier]` paints.
 *
 * Tier 0 is reserved for "nothing happened", so a non-zero value always gets at
 * least tier 1 — a day with one short class must never look like a day off.
 */
export function tierFor(value: number, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (value <= 0) return 0;
  if (max <= 0) return 1;
  const scaled = Math.ceil((value / max) * 5);
  return Math.min(5, Math.max(1, scaled)) as 1 | 2 | 3 | 4 | 5;
}
