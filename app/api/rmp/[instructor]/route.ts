/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/rmp/[instructor] — LIVE RateMyProfessor lookup. NEVER PERSISTED.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── COMPLIANCE RATIONALE — READ BEFORE CHANGING ANYTHING IN THIS FILE ──
 *
 * RateMyProfessor data is fetched live when a drawer opens, rendered with
 * explicit attribution and a link out to the professor's RMP page, and then
 * discarded. It is NEVER ingested and NEVER stored.
 *
 * This is a deliberate legal posture, not an oversight and not a TODO:
 *
 *   · Displaying current third-party data with attribution and a link back is
 *     a materially better position than holding a mirror of someone's corpus.
 *     The user sees RMP's numbers, credited to RMP, and can click through to
 *     the source. We are a viewer, not a competing copy.
 *   · RMP is the one source in this product with real litigation history
 *     around scraping. A stored copy converts a live view into a database of
 *     someone else's content, which is exactly the fact pattern to avoid.
 *   · CULPA — Columbia-specific, student-written, and pursued via partnership —
 *     is the primary reputation source. RMP is a courtesy cross-reference. It
 *     is never worth the exposure a cache would create.
 *
 * Therefore, in this file and anywhere else RMP is touched:
 *
 *   ✗ NO database table for RMP. Not `rmp_snapshots`, not a JSONB column on
 *     `instructors`, not "just the rating", not "denormalized for speed".
 *   ✗ NO disk cache. No file writes, no Next.js data cache, no ISR, no
 *     `revalidate`, no `unstable_cache`, no Redis, no KV, no edge cache.
 *   ✗ NO response caching by an intermediary — the handler sends
 *     `Cache-Control: no-store, private` for exactly this reason.
 *   ✗ NO bulk or background fetching. This route runs only in response to a
 *     user opening a drawer for one instructor.
 *
 * The ONLY permitted retention is `snapshotCache` below: a process-local Map
 * with a five-minute TTL, whose entire purpose is to avoid hammering RMP when
 * a student opens and closes the same drawer repeatedly. It lives in RAM,
 * dies with the process, is capped in size, and MUST NOT be lifted into any
 * durable store. If you find yourself raising `CACHE_TTL_MS` past a few
 * minutes, or moving this Map somewhere it survives a restart, stop: that is
 * the thing this comment exists to prevent.
 *
 * If RMP is slow, blocked, rate-limiting us, or has changed its API, this
 * route returns `null` with a 200. The drawer renders without an RMP row.
 * Degrading quietly is required — an instructor drawer must never break
 * because a third party had a bad day.
 */

import { NextResponse } from "next/server";

import type { RmpSnapshot } from "@/lib/types";

// Always run per-request. No static optimization, no revalidation window.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql";

/**
 * RMP's own web client sends this fixed public credential on every request
 * from ratemyprofessors.com. It is not a secret and grants nothing beyond what
 * the public site shows.
 */
const RMP_PUBLIC_CLIENT_AUTH = "Basic dGVzdDp0ZXN0";

/**
 * RMP school ids, base64 of `School-<legacyId>`, as used by their GraphQL API.
 * Isolated here because they are the most likely thing to need updating.
 */
const RMP_SCHOOL_IDS: string[] = [
  "U2Nob29sLTI3OA==", // School-278   — Columbia University      (~1,195 professors)
  "U2Nob29sLTgz", //     School-83    — Barnard College          (~102 professors)
  "U2Nob29sLTk5Ng==", // School-996   — Teachers College         (~411 professors)
];

/*
 * A note on the id that used to be second in that list.
 *
 * It was `U2Nob29sLTE2OA==` — School-168 — labelled "Barnard College". School-168
 * is California State University Monterey Bay. Barnard is School-83. Because the
 * loop below falls through to the next school when the first yields nothing, every
 * Columbia instructor without an RMP profile was being matched against 859
 * professors at a university 3,000 miles away, and the name matcher below was
 * lenient enough to find one. Verified against RMP's own `school { name }` field
 * before changing it.
 */

/** Public profile URL for a professor's numeric legacy id. */
function profileUrlFor(legacyId: number | string): string {
  return `https://www.ratemyprofessors.com/professor/${legacyId}`;
}

/** Search URL, used when we can identify no specific professor page. */
function searchUrlFor(name: string): string {
  return `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name)}`;
}

/** Upstream must not hold a request open — the drawer is waiting. */
const UPSTREAM_TIMEOUT_MS = 3_500;

// ---------------------------------------------------------------------------
// In-memory TTL cache — RAM only, minutes only. See the compliance block.
// ---------------------------------------------------------------------------

/**
 * Five minutes. Long enough that opening, closing, and reopening a drawer
 * costs RMP one request; short enough that what a student sees is genuinely
 * current. This is the maximum reasonable value — do not raise it, and do not
 * move this Map anywhere that outlives the process.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Bounded so a long-lived server process cannot accumulate a shadow corpus. */
const CACHE_MAX_ENTRIES = 300;

interface CacheEntry {
  expiresAt: number;
  /** `null` is cached too — a miss is worth remembering for five minutes. */
  snapshot: RmpSnapshot | null;
}

const snapshotCache = new Map<string, CacheEntry>();

function cacheKey(instructorName: string): string {
  return instructorName.toLowerCase().replace(/\s+/g, " ").trim();
}

function readCache(key: string): CacheEntry | null {
  const entry = snapshotCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    snapshotCache.delete(key);
    return null;
  }
  return entry;
}

function writeCache(key: string, snapshot: RmpSnapshot | null): void {
  // Simple FIFO eviction. This is a politeness buffer, not a real cache.
  if (snapshotCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = snapshotCache.keys().next();
    if (!oldest.done) snapshotCache.delete(oldest.value);
  }
  snapshotCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, snapshot });
}

// ---------------------------------------------------------------------------
// Upstream query
// ---------------------------------------------------------------------------

const TEACHER_SEARCH_QUERY = `
query TeacherSearch($text: String!, $schoolID: ID!) {
  newSearch {
    teachers(query: {text: $text, schoolID: $schoolID}, first: 5) {
      edges {
        node {
          legacyId
          firstName
          lastName
          avgRating
          avgDifficulty
          wouldTakeAgainPercent
          numRatings
          school { name }
        }
      }
    }
  }
}`;

interface RmpTeacherNode {
  legacyId?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  avgRating?: unknown;
  avgDifficulty?: unknown;
  wouldTakeAgainPercent?: unknown;
  numRatings?: unknown;
}

function finiteOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // RMP uses -1 as its "no data" sentinel for wouldTakeAgainPercent.
  if (value < 0) return null;
  return value;
}

/** Tokens of a name, lowercased, punctuation stripped. Keeps single letters. */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((token) => token.length > 0);
}

/**
 * Are these two GIVEN names plausibly the same person?
 *
 * Deliberately strict, and the strictness is the whole point — see
 * `pickBestMatch`. Accepts:
 *
 *   · the same name                      "daniel"  ~ "daniel"
 *   · a nickname/short form by prefix    "jae"     ~ "jae woo"   (registrar
 *                                                    prints "Jae W Lee", RMP
 *                                                    has "Jae Woo Lee")
 *   · an initial against a full name     "a"       ~ "adam"
 *
 * Rejects two different full names that merely share a first letter. That
 * single rule is what stops "Eugene Wu" from becoming Elwin Wu: both are real
 * Columbia professors, both surnamed Wu, and only one of them has the 4.8 we
 * were printing under the other one's name.
 */
function givenNamesAgree(queried: string, candidate: string): boolean {
  if (!queried || !candidate) return false;
  if (queried === candidate) return true;
  // An initial on either side matches a full name starting with it.
  if (queried.length === 1 || candidate.length === 1) return queried[0] === candidate[0];
  // "Jae" ~ "Jae Woo" — one is how the other is shortened. Requires 3+ chars so
  // that "Al" ~ "Alexandr" is not enough on its own.
  const shorter = queried.length <= candidate.length ? queried : candidate;
  const longer = shorter === queried ? candidate : queried;
  return shorter.length >= 3 && longer.startsWith(shorter);
}

/**
 * Pick the best match, or none.
 *
 * ── Why this is as strict as it is ─────────────────────────────────────────
 *
 * The previous version asked only that the queried SURNAME appear somewhere in
 * the candidate's tokens, then broke ties toward whoever had the most ratings.
 * Both halves were wrong, and together they were worse than either:
 *
 *   · Surname-anywhere let a candidate match on their FIRST name. "Antoni
 *     Viros I Martin" ends in "Martin", so `Martin Haugh` matched and we
 *     printed his 4.7 under a different person's name.
 *   · Ranking by rating count means that when several people share a surname —
 *     Wu, Wang, Liu, Lee, Kim, Smith — the one we show is systematically the
 *     one with the most ratings, i.e. the one whose number is most likely to be
 *     seen and least likely to be right.
 *
 * Measured against a 40-name sample of real Fall 2026 COMS instructors, that
 * produced 12 matches of which 4 were a different human being.
 *
 * So the rule is now: the SURNAMES must agree and the GIVEN names must agree.
 * RMP returns `firstName` and `lastName` as separate fields, so there is no
 * need to guess which token is which on their side; only the registrar's
 * single string needs splitting, and its format is "First [Middle] Last".
 *
 * This finds fewer professors. That is the correct trade: an empty RMP row
 * says "we don't know", and the failure it replaces said something false about
 * a named person.
 */
function pickBestMatch(nodes: RmpTeacherNode[], queriedName: string): RmpTeacherNode | null {
  const queried = nameTokens(queriedName);
  if (queried.length < 2) return null;
  const queriedGiven = queried[0];
  const queriedSurname = queried[queried.length - 1];

  let best: RmpTeacherNode | null = null;
  let bestRatings = -1;

  for (const node of nodes) {
    const first = typeof node.firstName === "string" ? node.firstName : "";
    const last = typeof node.lastName === "string" ? node.lastName : "";
    const candidateGiven = nameTokens(first)[0] ?? "";
    const candidateSurnameTokens = nameTokens(last);
    if (candidateSurnameTokens.length === 0) continue;
    /*
     * Compare the LAST token of each surname. Compound surnames are written
     * inconsistently across the two systems ("Viros i Martin" / "Martin"), and
     * the final element is the part that survives every abbreviation of them.
     */
    const candidateSurname = candidateSurnameTokens[candidateSurnameTokens.length - 1];

    if (candidateSurname !== queriedSurname) continue;
    if (!givenNamesAgree(queriedGiven, candidateGiven)) continue;

    /*
     * Only NOW does rating count break a tie, and by this point every remaining
     * candidate agrees on both names — so this is choosing between duplicate
     * profiles for one person, which is exactly what it should be for.
     */
    const ratings = finiteOrNull(node.numRatings) ?? 0;
    if (ratings > bestRatings) {
      bestRatings = ratings;
      best = node;
    }
  }
  return best;
}

async function queryRmp(instructorName: string): Promise<RmpTeacherNode[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const nodes: RmpTeacherNode[] = [];

  try {
    for (const schoolId of RMP_SCHOOL_IDS) {
      const response = await fetch(RMP_GRAPHQL_URL, {
        method: "POST",
        headers: {
          authorization: RMP_PUBLIC_CLIENT_AUTH,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          query: TEACHER_SEARCH_QUERY,
          variables: { text: instructorName, schoolID: schoolId },
        }),
        signal: controller.signal,
        // Belt and braces: never let the framework's data cache retain this.
        cache: "no-store",
      });
      if (!response.ok) continue;

      const payload = (await response.json()) as {
        data?: { newSearch?: { teachers?: { edges?: Array<{ node?: RmpTeacherNode }> } } };
      };
      const edges = payload?.data?.newSearch?.teachers?.edges;
      if (!Array.isArray(edges)) continue;
      for (const edge of edges) {
        if (edge?.node) nodes.push(edge.node);
      }
      if (nodes.length > 0) break; // Columbia matched; skip the Barnard query.
    }
  } catch {
    // Timeout, network failure, malformed JSON — all the same to the caller.
    return [];
  } finally {
    clearTimeout(timer);
  }

  return nodes;
}

/**
 * Fetch a snapshot. Returns `null` for "no usable RMP data", never throws.
 *
 * The returned object is handed straight to the client and then dropped. It is
 * not written anywhere. `profileUrl` is always populated so the UI can always
 * attribute and link out, even when the numbers are missing.
 */
async function fetchRmpSnapshot(instructorName: string): Promise<RmpSnapshot | null> {
  const nodes = await queryRmp(instructorName);
  if (nodes.length === 0) return null;

  const match = pickBestMatch(nodes, instructorName);
  if (!match) return null;

  const legacyId = finiteOrNull(match.legacyId);
  const numRatings = finiteOrNull(match.numRatings);

  // A profile with zero ratings is noise; showing "0.0/5" would be a lie by
  // presentation. Better to render no RMP row at all.
  if (numRatings === null || numRatings === 0) return null;

  return {
    rating: finiteOrNull(match.avgRating),
    difficulty: finiteOrNull(match.avgDifficulty),
    wouldTakeAgainPercent: finiteOrNull(match.wouldTakeAgainPercent),
    numRatings,
    profileUrl: legacyId === null ? searchUrlFor(instructorName) : profileUrlFor(legacyId),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** Headers that keep this response out of every cache between us and the user. */
const NO_STORE_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, private, max-age=0",
  "cdn-cache-control": "no-store",
  pragma: "no-cache",
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ instructor: string }> },
): Promise<NextResponse<RmpSnapshot | null>> {
  let instructorName = "";
  try {
    const params = await context.params;
    instructorName = decodeURIComponent(params.instructor ?? "").trim();
  } catch {
    instructorName = "";
  }

  if (instructorName.length === 0 || instructorName.length > 120) {
    return NextResponse.json(null, { status: 200, headers: NO_STORE_HEADERS });
  }

  const key = cacheKey(instructorName);
  const cached = readCache(key);
  if (cached) {
    return NextResponse.json(cached.snapshot, { status: 200, headers: NO_STORE_HEADERS });
  }

  let snapshot: RmpSnapshot | null = null;
  try {
    snapshot = await fetchRmpSnapshot(instructorName);
  } catch {
    // Unreachable in principle — fetchRmpSnapshot swallows its own failures —
    // but the contract with the drawer is "never throws", so belt and braces.
    snapshot = null;
  }

  writeCache(key, snapshot);
  return NextResponse.json(snapshot, { status: 200, headers: NO_STORE_HEADERS });
}
