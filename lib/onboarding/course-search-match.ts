/**
 * The onboarding course search's matcher, kept pure so it can be tested
 * against the registrar's actual titles without a database.
 */

import { formatCourseId } from "@/lib/requirements/code";

import type { CourseHit } from "./server";

const SEARCH_LIMIT = 20;

export interface SearchListing {
  courseId: string;
  title: string;
  points: number | null;
  /** Lowercased id, spaces already gone — course codes are typed with spaces. */
  idNorm: string;
  titleLower: string;
  /** `titleLower` split on anything that is not a letter, for abbreviation matching. */
  titleWords: string[];
}

/** The lowercased, pre-split keys a listing is matched on. */
export function searchKeys(
  courseId: string,
  title: string,
): Pick<SearchListing, "idNorm" | "titleLower" | "titleWords"> {
  const titleLower = title.toLowerCase();
  return {
    idNorm: courseId.toLowerCase(),
    titleLower,
    titleWords: titleLower.split(/[^a-z]+/).filter(Boolean),
  };
}

/**
 * Match a query against the catalog's titles, which are the registrar's
 * abbreviations.
 *
 * ── Why not "every word is a substring of the title" ────────────────────────
 *
 * That was the first version, and it could not find "Accelerated
 * Intermediate Spanish": the catalog calls it `COMPREHENSIVE INTER SPANISH`,
 * so "intermediate" is not a substring of anything and "accelerated" is a
 * word the bulletin uses and the registrar does not. A student who knows the
 * course by its real name searched for it and was told nothing matched, and
 * then told us that we did not recognise a course we had all along.
 *
 * Two allowances, both narrow:
 *
 *   ABBREVIATION  A query word matches a title word it *starts with* — the
 *                 student typed the whole word, the registrar cut it. "inter"
 *                 is the head of "intermediate", "calc" of "calculus". Four
 *                 letters minimum on the title side, or "in" matches
 *                 everything.
 *   ONE MISS      With three or more words, one may match nothing. That is
 *                 the word the bulletin uses and the title does not. Two
 *                 misses is a different course.
 *
 * Full matches still rank above partial ones, so the allowance widens the
 * list without moving the top of it for a query that already worked.
 */
export function matchCourseHits(trimmed: string, listings: readonly SearchListing[]): CourseHit[] {
  const normalized = trimmed.toLowerCase().replace(/\s+/g, "");
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const allowedMisses = words.length >= 3 ? 1 : 0;
  const ranked: { hit: CourseHit; rank: number }[] = [];

  for (const listing of listings) {
    const idMatch = listing.idNorm.includes(normalized);
    const misses = words.filter((word) => !titleHasWord(listing, word)).length;
    if (!idMatch && misses > allowedMisses) continue;
    ranked.push({
      hit: {
        courseId: listing.courseId,
        code: formatCourseId(listing.courseId),
        title: listing.title,
        points: listing.points,
      },
      rank: idMatch ? 0 : misses === 0 ? 1 : 2,
    });
  }

  /*
   * Code matches first, then whole-title matches, then shorter titles.
   * Someone who typed "COMS 3134" wants that course and nothing else;
   * someone who typed "algorithms" is browsing, and the shortest title is the
   * least specialised course, which is the better first guess.
   */
  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.hit.title.length - b.hit.title.length ||
        a.hit.code.localeCompare(b.hit.code),
    )
    .map((entry) => entry.hit)
    .slice(0, SEARCH_LIMIT);
}

/** Shortest registrar abbreviation a query word may complete. */
const ABBREVIATION_MIN = 4;

function titleHasWord(listing: SearchListing, word: string): boolean {
  if (listing.titleLower.includes(word)) return true;
  return listing.titleWords.some(
    (titleWord) =>
      titleWord.length >= ABBREVIATION_MIN &&
      word.length > titleWord.length &&
      word.startsWith(titleWord),
  );
}
