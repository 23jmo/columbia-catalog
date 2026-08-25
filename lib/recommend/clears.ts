/**
 * How a follow-up recommend stays on the thing the student asked about.
 *
 * The unfiltered feed is the same ranked list every time. A CS major's
 * outstanding CS groups dominate it, so "switch to Global Core" still
 * reprints Computer Vision unless the pool is cut to that group's
 * candidates — and, after ranking, to rows whose reason actually names it.
 */

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
 * Returns `undefined` when we must not restrict the pool: no needle, no
 * matching group, or a matching group whose candidate list is empty.
 * Empty lists are the open selectors (Global Core, Science) *before*
 * expansion ran — restricting to nothing would return an empty feed.
 */
export function candidateIdsForClears(
  outstanding: readonly ClearsGroup[],
  clears: string | undefined,
): Set<string> | undefined {
  const needle = clears?.trim().toLowerCase();
  if (!needle) return undefined;

  const matching = outstanding.filter(
    (entry) =>
      entry.group.label.toLowerCase().includes(needle) ||
      entry.group.id.toLowerCase().includes(needle),
  );
  if (matching.length === 0) return undefined;

  const ids = matching.flatMap((entry) => entry.candidates);
  if (ids.length === 0) return undefined;
  return new Set(ids);
}
