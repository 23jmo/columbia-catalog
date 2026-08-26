/**
 * The course pool a filtered recommend is allowed to rank.
 *
 * `candidateIdsForClears` only sees the audit. That is the right source
 * when the student has a program whose open selector already expanded.
 * It is the wrong source for "easy Global Cores" from a student with no
 * program on file: there is no outstanding group, the feed ranked the
 * whole catalog, then `recommendationClears` dropped every card, and the
 * withheld list filled with whatever is alphabetically first (architecture,
 * intermediate language).
 *
 * This module unions three sources, in order of freshness:
 *
 *   1. Audit candidates, when the matching group actually expanded.
 *   2. Live `requirement_flags` on this term's listings.
 *   3. The Bulletin approved-course list, intersected with what's offered.
 *
 * An empty pool is a real answer — "we have no Global Core sections this
 * term" — and must not fall back to ranking everything.
 */

import { REQUIREMENT_FILTERS } from "@/lib/constants";
import type { RequirementFlags } from "@/lib/types";
import type { GroupResult } from "@/lib/requirements/types";

import {
  candidateIdsForClears,
  flagKeyForClears,
  groupMatchesNeedle,
  type ClearsGroup,
} from "./clears";
import { offeredFallbackIds } from "./core-flag-ids";

/** The listing fields the pool needs. Number is used by the easy-level filter. */
export interface ClearsListing {
  courseId: string;
  number: number;
  requirementFlags: RequirementFlags;
}

/**
 * Ids to keep when `clears` is set.
 *
 * `undefined` means "do not restrict" — no needle. An empty set means
 * restrict to nothing.
 */
export function resolveClearsPool(args: {
  outstanding: readonly ClearsGroup[];
  clears: string | undefined;
  listings: readonly ClearsListing[];
}): Set<string> | undefined {
  const needle = args.clears?.trim().toLowerCase();
  if (!needle) return undefined;

  const fromAudit = candidateIdsForClears(args.outstanding, args.clears);
  const flag = flagKeyForClears(args.clears);

  const fromFlags = new Set<string>();
  if (flag) {
    for (const listing of args.listings) {
      if (listing.requirementFlags[flag]) fromFlags.add(listing.courseId);
    }
  }

  // Live flags empty: the ingest has not run, or this term has none tagged.
  // Fall back to the Bulletin list, but only for courses actually offered.
  const fromBulletin =
    flag && fromFlags.size === 0
      ? offeredFallbackIds(
          flag,
          args.listings.map((listing) => listing.courseId),
        )
      : new Set<string>();

  const pool = new Set<string>([
    ...(fromAudit ?? []),
    ...fromFlags,
    ...fromBulletin,
  ]);

  if (pool.size > 0) return pool;

  // Named a real flag or a matching group, and still found nothing. Empty
  // is honest. Ranking the catalog here is how architecture shows up under
  // a Global Core question.
  if (flag || fromAudit !== undefined || args.outstanding.some((entry) => groupMatchesNeedle(entry, needle))) {
    return new Set();
  }

  return undefined;
}

/**
 * Outstanding groups the engine will score, with `clears` candidates filled in.
 *
 * Without this, a flag-only pool has no `required` reason, and
 * `recommendationClears` drops every card after ranking — the same empty
 * answer as ranking the whole catalog.
 */
export function outstandingForClears(
  outstanding: readonly GroupResult[],
  clears: string | undefined,
  pool: Set<string> | undefined,
): GroupResult[] {
  if (!pool || pool.size === 0) return [...outstanding];

  const needle = clears?.trim().toLowerCase();
  if (!needle) return [...outstanding];

  const candidates = [...pool];
  const matchIndex = outstanding.findIndex((entry) => groupMatchesNeedle(entry, needle));
  if (matchIndex >= 0) {
    return outstanding.map((entry, index) =>
      index === matchIndex ? { ...entry, candidates } : entry,
    );
  }

  const synthetic = syntheticClearsGroup(clears, candidates);
  return synthetic ? [...outstanding, synthetic] : [...outstanding];
}

function syntheticClearsGroup(clears: string | undefined, candidates: string[]): GroupResult | null {
  const flag = flagKeyForClears(clears);
  if (!flag) return null;

  const filter = REQUIREMENT_FILTERS.find((entry) => entry.key === flag);
  const label = filter?.label ?? clears?.trim() ?? flag;
  // Kebab of the flag key matches the authored program ids (`global-core`).
  const id = flag.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);

  return {
    group: {
      id,
      label,
      rule: { kind: "n_matching", n: 2, select: { flag: flag as keyof RequirementFlags } },
    },
    status: "unmet",
    verification: "flagged",
    matched: [],
    completed: 0,
    required: 2,
    unit: "courses",
    candidates,
  };
}
