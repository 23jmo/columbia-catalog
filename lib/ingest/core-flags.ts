/**
 * Which Core requirement a course is approved for.
 *
 * `./parsers/core-lists.ts` reads the Bulletin's approved-course tables and
 * hands back entries tagged with the heading they sat under. This module makes
 * the one judgement that parser deliberately refuses to make: what a heading on
 * a given page *means* in terms of `RequirementFlags`.
 *
 * It is separated from the parser because the two change for different reasons.
 * The markup changes when CourseLeaf is upgraded; the mapping changes when
 * Columbia reorganises the Core. Neither should be able to break the other.
 *
 * ── The flag keys are not free-form ────────────────────────────────────────
 *
 * `lib/requirements/programs/cc-core.ts` already names exactly two of them:
 *
 *     rule: { kind: "n_matching", n: 2, select: { flag: "scienceRequirement" } }
 *     rule: { kind: "n_matching", n: 2, select: { flag: "globalCore" } }
 *
 * Those two strings are the contract. A typo here does not fail loudly — it
 * produces a requirement with no candidates, which reads exactly like "you have
 * nothing left to take". `CORE_FLAG_KEYS` and the test that pins it against the
 * authored programs exist so that failure mode cannot ship.
 *
 * ── Why Science B and Science C are recorded separately ────────────────────
 *
 * The Bulletin publishes the Science Requirement as three categories and says
 * the three courses "must be distributed across" them. `cc-core.ts` currently
 * models it as two flagged courses, which is a simplification it makes
 * knowingly. Recording `scienceB` / `scienceC` alongside `scienceRequirement`
 * costs one jsonb key each and keeps the distribution information the page
 * publishes, so tightening that rule later is an edit to one program file
 * rather than a re-crawl. Throwing it away here would be the expensive choice.
 *
 * Note the two lists overlap heavily — 59 of Science B's 60 courses are also
 * approved for Science C. That is the Bulletin's own data, not a parse error:
 * the categories constrain which *pairs* form a sequence, not which single
 * courses are science.
 */

import type { RequirementFlags } from "@/lib/types";

import { parseCoreCourseList, type CoreListEntry } from "./parsers/core-lists";

/**
 * Every flag key this module is allowed to write.
 *
 * Anything not in here is a typo. Pinned by `core-flags.test.ts` against the
 * flags the authored programs actually select on.
 */
export const CORE_FLAG_KEYS = [
  "globalCore",
  "scienceRequirement",
  "scienceB",
  "scienceC",
] as const;

export type CoreFlagKey = (typeof CORE_FLAG_KEYS)[number];

/** One Bulletin page, and how to read meaning off its headings. */
export interface CoreFlagSource {
  /** Stable id, used in logs and as the provenance stamp. */
  id: string;
  /** Human label for operator output. */
  label: string;
  url: string;
  /**
   * The flags a course earns from sitting under `heading` on this page.
   *
   * Returning `[]` means "this table is on the page but is not an approval
   * list" — the Bulletin footers and the Global Core's per-term tables both hit
   * this, and silently flagging them would widen a requirement.
   */
  flagsFor(heading: string | null): CoreFlagKey[];
}

/**
 * The Global Core page carries five tables: three per-term lists (Fall 2026,
 * Spring 2026, Summer 2026) and two master lists split by campus.
 *
 * We take the union of ALL of them rather than only the current term. A student
 * entering coursework is entering their PAST — a course approved for Global
 * Core in Spring 2026 counted then, and refusing it now because it is not on
 * the Fall 2026 list would mark a satisfied requirement unmet. The `flagged`
 * verification tier already tells the student this list moves
 * (`lib/requirements/types.ts`), which is the honest way to carry that
 * imprecision.
 */
const GLOBAL_CORE: CoreFlagSource = {
  id: "global-core",
  label: "Global Core Requirement",
  url: "https://bulletin.columbia.edu/columbia-college/core-curriculum/global-core-requirement/",
  flagsFor: () => ["globalCore"],
};

const SCIENCE: CoreFlagSource = {
  id: "science",
  label: "Science Requirement",
  url: "https://bulletin.columbia.edu/columbia-college/core-curriculum/science-requirement/",
  flagsFor: (heading) => {
    const text = (heading ?? "").toLowerCase();
    // Science A is Frontiers of Science, a single named course with no table.
    // It is `all_of` in cc-core.ts and must not become a flag, or every
    // Frontiers-eligible course would count toward the flagged pair as well.
    if (text.includes("science b")) return ["scienceRequirement", "scienceB"];
    if (text.includes("science c")) return ["scienceRequirement", "scienceC"];
    return [];
  },
};

export const CORE_FLAG_SOURCES: CoreFlagSource[] = [GLOBAL_CORE, SCIENCE];

/** What one page contributed, kept for the operator report. */
export interface CoreFlagPageResult {
  source: CoreFlagSource;
  /** Headings seen, so an unmapped one is visible rather than silent. */
  headings: string[];
  /** Headings that mapped to no flag at all. Usually footers; sometimes a bug. */
  unmappedHeadings: string[];
  entries: CoreListEntry[];
  /** Distinct course ids that earned at least one flag from this page. */
  flaggedCourseIds: string[];
  lastUpdatedText: string | null;
}

/** Parse one page's HTML into flag assignments. */
export function readCoreFlagPage(source: CoreFlagSource, html: string): CoreFlagPageResult {
  const parsed = parseCoreCourseList(html);

  const unmapped = parsed.headings.filter((heading) => source.flagsFor(heading).length === 0);
  const flagged = new Set<string>();
  for (const entry of parsed.entries) {
    if (source.flagsFor(entry.heading).length > 0) flagged.add(entry.courseId);
  }

  return {
    source,
    headings: parsed.headings,
    unmappedHeadings: unmapped,
    entries: parsed.entries,
    flaggedCourseIds: [...flagged].sort(),
    lastUpdatedText: parsed.lastUpdatedText,
  };
}

/**
 * Merge every page's assignments into one `courseId -> RequirementFlags` map.
 *
 * Only `true` keys are ever stored, matching the column's documented shape in
 * `0001_catalog.sql` ("Only true keys are stored") and keeping the
 * `requirement_flags @> '{"globalCore":true}'` containment query — the one the
 * GIN index serves — correct.
 */
export function collectCoreFlags(
  pages: CoreFlagPageResult[],
): Map<string, RequirementFlags> {
  const byCourse = new Map<string, RequirementFlags>();

  for (const page of pages) {
    for (const entry of page.entries) {
      const keys = page.source.flagsFor(entry.heading);
      if (keys.length === 0) continue;

      const flags = byCourse.get(entry.courseId) ?? {};
      for (const key of keys) flags[key] = true;
      byCourse.set(entry.courseId, flags);
    }
  }

  return byCourse;
}
