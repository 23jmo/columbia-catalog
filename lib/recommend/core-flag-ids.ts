/**
 * Bulletin-approved course ids for Core flags, used when the live catalog
 * column is still empty.
 *
 * `courses.requirement_flags` is written by an operator script, and the
 * search index is a separate build. Either can lag the Bulletin. The
 * approved lists themselves are already in-repo as captured HTML, so a
 * "Global Core" recommend can still restrict to those ids instead of
 * ranking the whole catalog and then dropping every card.
 *
 * Live flags on a listing always win. This set is the fallback, intersected
 * with what is actually offered this term.
 */

import { readFileSync } from "node:fs";

import {
  CORE_FLAG_SOURCES,
  collectCoreFlags,
  readCoreFlagPage,
} from "@/lib/ingest/core-flags";
import { buildCanonicalIndex, canonicalizeCourseId } from "@/lib/prereqs/canonical";

const FIXTURE_FOR_SOURCE: Record<string, string> = {
  "global-core": "bulletin-core-global-core.html",
  science: "bulletin-core-science.html",
};

let memo: Map<string, Set<string>> | null = null;

/** Course ids the Bulletin lists under `flag`, across every captured table. */
export function fallbackIdsForFlag(flag: string): Set<string> {
  if (!memo) memo = loadFallbackFlags();
  return memo.get(flag) ?? new Set();
}

/**
 * Fallback ids that are actually on offer, with qualifier spelling folded.
 *
 * The Bulletin writes `AFAS UN1001`; the catalog may store `AFAS1001UN` or,
 * after a renumber, a sibling qualifier. Canonicalising against the live
 * listings is what keeps a spelling difference from looking like "not offered".
 */
export function offeredFallbackIds(
  flag: string,
  offeredCourseIds: readonly string[],
): Set<string> {
  const fallback = fallbackIdsForFlag(flag);
  if (fallback.size === 0) return new Set();

  const offered = new Set(offeredCourseIds);
  const index = buildCanonicalIndex(offeredCourseIds);
  const hits = new Set<string>();

  for (const id of fallback) {
    const canonical = canonicalizeCourseId(id, index);
    if (offered.has(canonical)) hits.add(canonical);
    else if (offered.has(id)) hits.add(id);
  }

  return hits;
}

function loadFallbackFlags(): Map<string, Set<string>> {
  const byFlag = new Map<string, Set<string>>();

  const pages = CORE_FLAG_SOURCES.map((source) => {
    const file = FIXTURE_FOR_SOURCE[source.id];
    if (!file) {
      throw new Error(`core-flag-ids: no fixture mapped for source "${source.id}"`);
    }
    const html = readFileSync(new URL(`../ingest/__fixtures__/${file}`, import.meta.url), "utf8");
    return readCoreFlagPage(source, html);
  });

  for (const [courseId, flags] of collectCoreFlags(pages)) {
    for (const [key, on] of Object.entries(flags)) {
      if (!on) continue;
      const set = byFlag.get(key) ?? new Set<string>();
      set.add(courseId);
      byFlag.set(key, set);
    }
  }

  return byFlag;
}
