/**
 * How a follow-up recommend stays on the thing the student asked about.
 *
 * The unfiltered feed is the same ranked list every time. A CS major's
 * outstanding CS groups dominate it, so "switch to Global Core" still
 * reprints Computer Vision unless the pool is cut to that group's
 * candidates — and, after ranking, to rows whose reason actually names it.
 */

import { REQUIREMENT_FILTERS } from "@/lib/constants";

import type { RecommendationReason } from "./types";

/** The fields ranking needs from an outstanding group. Not the whole audit. */
export interface ClearsGroup {
  group: { id: string; label: string };
  candidates: readonly string[];
}

/**
 * Keep this recommendation when `clears` is set.
 *
 * Taste-only and unlock reasons do not name a requirement, so they drop.
 * Matching is a case-insensitive substring on the label *or* the group id,
 * because the model may copy either from `get_unmet_requirements`.
 */
export function recommendationClears(
  reasons: readonly RecommendationReason[],
  clears: string | undefined,
): boolean {
  const needle = clears?.trim().toLowerCase();
  if (!needle) return true;

  return reasons.some((reason) => {
    if (reason.kind !== "required" && reason.kind !== "interesting_and_counts") {
      return false;
    }
    return (
      reason.groupLabel.toLowerCase().includes(needle) ||
      reason.groupId.toLowerCase().includes(needle)
    );
  });
}

/**
 * Course ids the audit already knows would count for `clears`.
 *
 * Returns `undefined` when there is no needle or no matching group. An
 * empty candidate list on a matching group also returns `undefined` —
 * that is the open selector before expansion, and `resolveClearsPool`
 * is what fills it from flags / the Bulletin list rather than ranking
 * the whole catalog.
 */
export function candidateIdsForClears(
  outstanding: readonly ClearsGroup[],
  clears: string | undefined,
): Set<string> | undefined {
  const needle = clears?.trim().toLowerCase();
  if (!needle) return undefined;

  const matching = outstanding.filter((entry) => groupMatchesNeedle(entry, needle));
  if (matching.length === 0) return undefined;

  const ids = matching.flatMap((entry) => entry.candidates);
  if (ids.length === 0) return undefined;
  return new Set(ids);
}

/** True when this outstanding group is the one `clears` named. */
export function groupMatchesNeedle(entry: ClearsGroup, needle: string): boolean {
  return (
    entry.group.label.toLowerCase().includes(needle) ||
    entry.group.id.toLowerCase().includes(needle)
  );
}

/**
 * Map a `clears` string onto a `requirement_flags` key.
 *
 * Accepts the filter label ("Global Core"), the flag key ("globalCore"),
 * and the kebab group id the audit uses ("global-core"). Unknown needles
 * return null — those are named program groups, not catalog flags.
 */
export function flagKeyForClears(clears: string | undefined): string | null {
  const needle = clears?.trim().toLowerCase();
  if (!needle) return null;

  const compacted = needle.replace(/[\s_-]+/g, "");
  for (const filter of REQUIREMENT_FILTERS) {
    const key = filter.key.toLowerCase();
    const label = filter.label.toLowerCase();
    if (needle === key || needle === label) return filter.key;
    if (compacted === key) return filter.key;
    // Substring only for a substantial needle. "core" sits inside every
    // Core Curriculum label and must not become Global Core.
    if (needle.length >= 6 && (label.includes(needle) || needle.includes(label))) {
      return filter.key;
    }
  }
  return null;
}
