/**
 * Resolving a review source's spelling of a name to our catalog's spelling.
 *
 * ── The problem, concretely ────────────────────────────────────────────────
 *
 * One professor, three spellings:
 *
 *   our `instructors.full_name`   "Jae W Lee"     ← what every page queries with
 *   CULPA                          "Jae Lee"
 *   the search we sent CULPA       "Jae Woo Lee"
 *
 * The registrar prints a middle initial; CULPA prints first and last. Storing
 * CULPA's spelling verbatim leaves 55 reviews that exist, aggregate correctly,
 * and are invisible on the professor's page — `scopeToInstructor` requires an
 * exact normalised match, and `getInstructorReputation` filters on the stored
 * `subject_ref`. Neither is wrong to be strict: fuzzy matching at READ time is
 * how a review of the wrong person lands on someone's profile.
 *
 * So the reconciliation happens once, at write time, against the real
 * instructor list — and everything downstream keeps its exact matching.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * An exact normalised match wins. Otherwise a candidate must agree on BOTH the
 * first and last token, which accepts a middle name or initial on either side
 * and nothing else. `Jae Lee` → `Jae W Lee` resolves; `Jae Lee` → `Seok-Woo
 * Lee` does not.
 *
 * If two candidates survive, we resolve to NOTHING. A `Jae W Lee` and a `Jae K
 * Lee` in the same directory is exactly the situation where a guess attributes
 * one person's reviews to another, and an unresolved review is merely invisible
 * — which is recoverable, where a misattributed one is not.
 */

/** Case-, punctuation- and spacing-insensitive. Mirrors `aggregate.ts`. */
export function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(name: string): string[] {
  const normalized = normalizeForMatch(name);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * The surname, used to narrow the candidate query before matching.
 *
 * Returns null for a single-token name ("Staff", "TBA"), which must never be
 * resolved to a person.
 */
export function surnameOf(name: string): string | null {
  const tokens = tokensOf(name);
  return tokens.length >= 2 ? tokens[tokens.length - 1] : null;
}

export interface NameCandidate {
  id: string;
  fullName: string;
}

/**
 * Pick the one catalog instructor a source's spelling refers to, or null.
 *
 * `null` is a correct and expected answer — see this module's header.
 */
export function resolveInstructorName(
  sourceName: string,
  candidates: NameCandidate[],
): NameCandidate | null {
  const wanted = normalizeForMatch(sourceName);
  if (wanted.length === 0 || candidates.length === 0) return null;

  const exact = candidates.filter((candidate) => normalizeForMatch(candidate.fullName) === wanted);
  if (exact.length === 1) return exact[0];
  // Two identical names in the directory: nothing distinguishes them here.
  if (exact.length > 1) return null;

  const wantedTokens = wanted.split(" ");
  if (wantedTokens.length < 2) return null;
  const wantedFirst = wantedTokens[0];
  const wantedLast = wantedTokens[wantedTokens.length - 1];

  const compatible = candidates.filter((candidate) => {
    const tokens = tokensOf(candidate.fullName);
    if (tokens.length < 2) return false;
    return tokens[0] === wantedFirst && tokens[tokens.length - 1] === wantedLast;
  });

  return compatible.length === 1 ? compatible[0] : null;
}
