/**
 * Where the onboarding flow meets the database.
 *
 * `./guess.ts` and `./migrate.ts` are pure so their rules can be tested against
 * ten courses in memory. This module is the other half — it fetches the catalog
 * facts, builds the prerequisite source, and runs the audit that expands
 * open-ended requirement groups into real candidate ids.
 *
 * ── It uses the SAME audit path as the profile page ─────────────────────────
 *
 *     auditProfile() → expandCandidatesForPrograms()
 *
 * That is not convenience. If onboarding evaluated requirements by its own
 * route it would eventually disagree with the audit on `/profile`, and "the
 * setup wizard said I still need Global Core but my audit says I don't" costs
 * more trust than the whole flow earns. Every subtlety that path already
 * handles — the Core resolved from the school rather than picked, planned
 * courses counting, cross-counted courses reported rather than silently
 * resolved — is inherited instead of reimplemented.
 *
 * The one difference from `/profile`: there is no signed-in student. Everything
 * here takes a guest state and returns a result, so the exact same code path
 * serves a visitor with no account.
 *
 * ── Two degradations, both deliberate ───────────────────────────────────────
 *
 *   PREREQUISITES  `loadProgressionGraph` throws rather than returning an empty
 *                  graph, because an empty graph reports every course as `met`
 *                  and would silently disable the hard filter. Caught here and
 *                  degraded to `unknownPrereqSource()`, which reports every
 *                  course as `unknown` — the safe direction.
 *
 *   VECTORS        `loadCourseVectorSource()` decodes the LSA artifacts under
 *                  `public/index/`. When they are missing it resolves to
 *                  `VECTOR_SOURCE_UNAVAILABLE` rather than throwing, and the
 *                  engine then scores taste at zero and falls back to
 *                  requirement fit and unlock — a real, useful deck, just
 *                  without the "you might like this" half. Nothing in the
 *                  tiering rules depends on a vector, so the degradation costs
 *                  only the ORDER within a tier.
 */

import { getCourseListings, getCoursesByIds } from "@/lib/data/catalog";
import { createSupabaseCandidateProviderWithIncludes } from "@/lib/db/candidate-source";
import { ACTIVE_TERMS } from "@/lib/constants";
import { auditProfile, programsFor } from "@/lib/profile/audit";
import { EMPTY_PROFILE, type StudentProfile as AppStudentProfile } from "@/lib/profile/types";
import {
  noVectorSource,
  recommend,
  type PrereqSource,
} from "@/lib/recommend";
import {
  assembleFeedCards,
  GRADUATE_LEVEL_FLOOR,
  SHORTLIST_MULTIPLIER,
  type FeedCard,
} from "@/lib/recommend/feed";
import {
  hydrateCourses,
  loadCatalog,
  loadPrereqSource,
  loadVectorSource,
  toEngineProfile,
} from "@/lib/recommend/pipeline";
import { expandCandidatesForPrograms } from "@/lib/requirements/candidates";
import { formatCourseId, toCourseId, type CourseId } from "@/lib/requirements/code";
import type { CourseFacts } from "@/lib/requirements/evaluate";
import type { GroupResult, Program } from "@/lib/requirements/types";
import type { CourseWithSections } from "@/lib/types";

import { FEED_PREVIEW_LIMIT } from "./feed-preview";
import {
  buildGuessDeck,
  DEFAULT_TIER_LIMIT,
  levelCeilingFor,
  satisfiedOnlyCourseIds,
  unambiguousPrereqChain,
  yearsCompleted,
  type GuessDeck,
} from "./guess";
import { declaredProgramIds } from "./program-ids";
import type { GuestOnboardingState } from "./state";
import { typicalGuesses } from "./typical";
import { knownCatalogFact } from "./known-titles";

/* ==========================================================================
 * Catalog facts
 * ========================================================================== */

export interface CatalogFact {
  code: string;
  title: string | null;
  points: number | null;
}

/**
 * Catalog rows for a set of course ids, across both active terms.
 *
 * Two terms because a student's record is mostly PAST courses and we hold no
 * archive of retired offerings — the only honest source of facts about
 * `MATH1201UN` is that MATH1201UN is still taught. First term to supply a
 * record wins; both describe the same course. Mirrors `loadFacts` in
 * `lib/profile/page-data.ts` so the two cannot report different titles.
 */
export async function loadCatalogFacts(
  courseIds: readonly string[],
): Promise<Map<string, CatalogFact>> {
  const facts = new Map<string, CatalogFact>();
  const wanted = [...new Set(courseIds)];
  if (wanted.length === 0) return facts;

  const perTerm = await Promise.all(
    ACTIVE_TERMS.map((termCode) => getCoursesByIds(wanted, termCode)),
  );

  for (const courses of perTerm) {
    for (const course of courses) {
      if (facts.has(course.courseId)) continue;
      facts.set(course.courseId, toCatalogFact(course));
    }
  }

  // Cores the deck names that have no live-term row still need a title on the
  // chip, or the strip mixes "University Writing / ENGL CC1010" with bare
  // codes and looks broken.
  for (const courseId of wanted) {
    const current = facts.get(courseId);
    if (current?.title) continue;
    const known = knownCatalogFact(courseId);
    if (!known) continue;
    facts.set(courseId, {
      code: current?.code ?? known.code,
      title: known.title,
      points: current?.points ?? null,
    });
  }

  return facts;
}

function toCatalogFact(course: CourseWithSections): CatalogFact {
  return {
    code: formatCourseId(course.courseId),
    title: course.title,
    // `pointsMin`, matching the audit. Counting a variable-credit course at its
    // maximum would let a points requirement look satisfied on credit the
    // student may not have earned.
    points: course.pointsMin ?? course.pointsMax,
  };
}

/* ==========================================================================
 * The audit, for a guest
 * ========================================================================== */

/**
 * The guest state as the audit engine's `StudentProfile`.
 *
 * `source` is coerced to `"picker"` because `lib/profile/types.ts`'s
 * `CourseSource` union predates migration 0032 and does not yet carry
 * `onboarding_guess`. Nothing in the audit reads `source` except to check for
 * `"plan"`, and onboarding never produces a planned course, so the coercion
 * changes no outcome — it is a type-level accommodation, and widening that
 * union belongs to whoever owns that file.
 */
function toAuditProfile(state: GuestOnboardingState): AppStudentProfile {
  return {
    ...EMPTY_PROFILE,
    userId: "",
    school: state.school,
    programIds: declaredProgramIds(state.programIds),
    classYear: state.classYear,
    interestTags: state.interestTags,
    courses: state.courses.map((course) => ({
      courseId: course.courseId,
      termCode: null,
      termLabel: course.termLabel,
      points: course.points,
      liked: course.liked,
      source: "picker" as const,
      addedAt: state.updatedAt,
    })),
  };
}

export interface GuestAudit {
  programs: Program[];
  /** Every group still outstanding, with open-ended ones expanded. */
  outstanding: GroupResult[];
  /**
   * Courses named ONLY by groups this student has finished. The complement of
   * `outstanding` at course granularity, and the guess deck's suppression list
   * — see `satisfiedOnlyCourseIds`.
   */
  satisfiedOnly: string[];
  /** Courses on the record our catalog could not resolve. */
  unmatchedCourseIds: string[];
}

/**
 * Audit a guest's declared programs against their confirmed coursework.
 *
 * The expansion pass is what makes this worth running at all: without it every
 * `n_matching` group — Global Core, the Science requirement, CS electives, i.e.
 * every requirement a student actually needs help with — comes back with an
 * empty candidate list, and the guess grid can only ever offer the handful of
 * courses a program names outright.
 */
export async function auditGuest(state: GuestOnboardingState): Promise<GuestAudit> {
  const profile = toAuditProfile(state);
  const programs = programsFor(profile);
  const recordIds = profile.courses.map((course) => course.courseId);

  // One fetch per term — reused for both audit facts and unmatched detection.
  const perTerm = await Promise.all(
    ACTIVE_TERMS.map((termCode) => getCoursesByIds(recordIds, termCode)),
  );

  const factsForRecord = new Map<string, CatalogFact>();
  const catalog = new Map<CourseId, CourseFacts>();

  for (const courses of perTerm) {
    for (const course of courses) {
      if (!factsForRecord.has(course.courseId)) {
        factsForRecord.set(course.courseId, toCatalogFact(course));
      }
      if (!catalog.has(course.courseId)) {
        catalog.set(course.courseId, {
          courseId: course.courseId,
          title: course.title,
          points: course.pointsMin ?? course.pointsMax,
          requirementFlags: course.requirementFlags,
        });
      }
    }
  }

  const audit = auditProfile({ profile, catalog });

  const expanded = await expandCandidatesForPrograms(audit.programs, {
    provider: createSupabaseCandidateProviderWithIncludes({ terms: ACTIVE_TERMS }),
    exclude: recordIds,
  });

  /*
   * Computed over EVERY group, satisfied ones included — which is the whole
   * reason it cannot be derived from `outstanding` downstream. `outstanding`
   * is the finished groups already thrown away, and "this course belongs to a
   * group that no longer needs it" is exactly the fact that throwing them away
   * destroys.
   */
  const allGroups = expanded.flatMap((result) => result.groups);

  return {
    programs,
    outstanding: allGroups.filter((group) => group.status !== "satisfied"),
    satisfiedOnly: [...satisfiedOnlyCourseIds(allGroups)],
    unmatchedCourseIds: recordIds.filter((courseId) => !factsForRecord.has(courseId)),
  };
}

async function auditGuestOrFallback(state: GuestOnboardingState): Promise<GuestAudit> {
  try {
    return await auditGuest(state);
  } catch (cause) {
    console.error("onboarding: audit failed, using declared programs only:", cause);
    const profile = toAuditProfile(state);
    return {
      programs: programsFor(profile),
      outstanding: [],
      // No audit ran, so nothing is known to be finished. Suppressing on a
      // guess here would silently shrink the deck on every database hiccup.
      satisfiedOnly: [],
      unmatchedCourseIds: profile.courses
        .map((course) => course.courseId)
        .filter((courseId) => courseId.length > 0),
    };
  }
}

/* ==========================================================================
 * Prerequisites
 * ========================================================================== */

/**
 * Memoized prerequisite source — same 5-minute cache as the signed-in feed.
 */
export async function prereqSourceOrDegrade(): Promise<PrereqSource> {
  return loadPrereqSource();
}

/* ==========================================================================
 * The deck
 * ========================================================================== */

export async function loadGuessDeck(state: GuestOnboardingState): Promise<GuessDeck> {
  const [audit, prereqs, vectors] = await Promise.all([
    auditGuestOrFallback(state),
    loadPrereqSource(),
    loadVectorSource().catch((cause) => {
      console.error("onboarding: course vectors unavailable, ranking without taste:", cause);
      return noVectorSource();
    }),
  ]);

  /*
   * Facts for everything the deck might name: the courses the programs list
   * outright, the ids the expansion produced, and the student's own record —
   * the last because the "implied by" chip prints the code of a confirmed
   * course.
   */
  const wanted = new Set<string>(state.courses.map((course) => course.courseId));
  for (const program of audit.programs) {
    for (const group of program.groups) {
      const rule = group.rule;
      if (rule.kind === "all_of" || rule.kind === "n_of") {
        for (const code of rule.courses) {
          const courseId = toCourseId(code);
          if (courseId) wanted.add(courseId);
        }
      } else if (rule.kind === "sequence_choice") {
        for (const sequence of rule.sequences) {
          for (const code of sequence.courses) {
            const courseId = toCourseId(code);
            if (courseId) wanted.add(courseId);
          }
        }
      }
    }
  }
  for (const group of audit.outstanding) {
    for (const courseId of group.candidates) wanted.add(courseId);
  }
  // School-year cores and named alternatives the guess deck will offer even
  // when they are not in `outstanding` — Calc I is a prereq of a CC CS calc
  // option, not a named requirement, and still needs a title on the chip.
  const years = yearsCompleted(state.classYear);
  for (const guess of typicalGuesses({
    school: state.school,
    yearsCompleted: years,
    ceiling: levelCeilingFor(
      years,
      state.courses.map((course) => course.courseId),
    ),
    programs: audit.programs,
  })) {
    wanted.add(guess.courseId);
  }
  // Titles for every hop of "and therefore you took Intro", not just the
  // course sitting immediately under the confirmation.
  for (const courseId of [...wanted]) {
    for (const prereqId of unambiguousPrereqChain(courseId as CourseId, prereqs)) {
      wanted.add(prereqId);
    }
  }

  let catalog: Map<string, CatalogFact>;
  try {
    catalog = await loadCatalogFacts([...wanted]);
  } catch (cause) {
    console.error("onboarding: catalog facts failed, course titles may be missing:", cause);
    catalog = new Map();
  }

  return buildGuessDeck({
    programs: audit.programs,
    school: state.school,
    classYear: state.classYear,
    confirmed: state.courses,
    dismissed: state.dismissedCourseIds,
    catalog,
    prereqs,
    vectors,
    outstanding: audit.outstanding,
    satisfiedOnly: new Set(audit.satisfiedOnly),
    limit: DEFAULT_TIER_LIMIT,
  });
}

/* ==========================================================================
 * Feed preview — real recommendations from guest state
 * ========================================================================== */

/**
 * Rank courses for the last onboarding screen before sign-in.
 *
 * Same audit + `recommend()` + section assembly as the signed-in feed, so the
 * cards behind the blur are the cards that land in the catalog chat — not a
 * skinnier cousin that has to be regenerated after Google returns.
 */
export async function loadOnboardingFeedPreview(
  state: GuestOnboardingState,
): Promise<FeedCard[]> {
  const [audit, catalog, prereqs, vectors] = await Promise.all([
    auditGuestOrFallback(state),
    loadCatalog(ACTIVE_TERMS),
    loadPrereqSource(),
    loadVectorSource().catch((cause) => {
      console.error("onboarding: feed preview vectors unavailable:", cause);
      return noVectorSource();
    }),
  ]);

  const profile = toAuditProfile(state);
  const engine = toEngineProfile(profile);
  const personalized = engine.taken.length > 0 || audit.outstanding.length > 0;
  const taken = new Set(state.courses.map((course) => course.courseId));
  const listingById = new Map(catalog.listings.map((listing) => [listing.courseId, listing]));

  const candidates = catalog.candidates.filter((candidate) => {
    if (taken.has(candidate.courseId)) return false;
    if (!personalized) {
      const listing = listingById.get(candidate.courseId);
      if (listing && listing.number >= GRADUATE_LEVEL_FLOOR) return false;
    }
    return true;
  });

  const ranked = recommend({
    profile: engine,
    candidates,
    outstanding: audit.outstanding,
    prereqs,
    vectors,
    limit: FEED_PREVIEW_LIMIT * SHORTLIST_MULTIPLIER,
    withheldLimit: 0,
  });

  const coursesById = await hydrateCourses(
    ranked.recommendations.map((entry) => entry.course.courseId),
    ACTIVE_TERMS,
  );

  return assembleFeedCards({
    recommendations: ranked.recommendations,
    coursesById,
    limit: FEED_PREVIEW_LIMIT,
    terms: ACTIVE_TERMS,
  });
}

/* ==========================================================================
 * The search escape hatch
 * ========================================================================== */

export interface CourseHit {
  courseId: string;
  code: string;
  title: string;
  points: number | null;
}

const SEARCH_LIMIT = 20;

/** Same window as `getCourseListings`. One merged scan, not two term dumps. */
const SEARCH_LISTING_TTL_MS = 5 * 60 * 1000;

interface SearchListing {
  courseId: string;
  title: string;
  points: number | null;
  /** Lowercased id, spaces already gone — course codes are typed with spaces. */
  idNorm: string;
  titleLower: string;
}

let searchListingsCache: { expiresAt: number; listings: Promise<SearchListing[]> } | null = null;

/**
 * Find a course by code or title, for the grid's "I took something else" box.
 *
 * Uses `getCourseListings` — id, title, points — not `getAllCourses`. The
 * full dump nested every meeting and took ~3s on a cold function; this box
 * does not need a meeting. Same two active terms the audit sees, so a hit
 * here is a course the record can actually store.
 *
 * Warm this during degree questions (`warmCourseSearch`). The first keystroke
 * then scans memory instead of waiting on PostgREST.
 */
export async function searchCourses(query: string): Promise<CourseHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const listings = await listingsForSearch();
  return matchCourseHits(trimmed, listings);
}

/**
 * Pull both terms into the listing cache so the first keystroke is a scan,
 * not a five-page PostgREST dump.
 */
export async function warmCourseSearch(): Promise<void> {
  await listingsForSearch();
}

async function listingsForSearch(): Promise<SearchListing[]> {
  const now = Date.now();
  if (searchListingsCache && searchListingsCache.expiresAt > now) {
    return searchListingsCache.listings;
  }

  const listings = buildSearchListings();
  searchListingsCache = { expiresAt: now + SEARCH_LISTING_TTL_MS, listings };
  listings.catch(() => {
    if (searchListingsCache?.listings === listings) searchListingsCache = null;
  });
  return listings;
}

async function buildSearchListings(): Promise<SearchListing[]> {
  const catalogs = await Promise.all(ACTIVE_TERMS.map((termCode) => getCourseListings(termCode)));
  const byId = new Map<string, SearchListing>();
  for (const listings of catalogs) {
    for (const listing of listings) {
      if (byId.has(listing.courseId)) continue;
      byId.set(listing.courseId, {
        courseId: listing.courseId,
        title: listing.title,
        points: listing.pointsMin ?? listing.pointsMax,
        idNorm: listing.courseId.toLowerCase(),
        titleLower: listing.title.toLowerCase(),
      });
    }
  }
  return [...byId.values()];
}

function matchCourseHits(trimmed: string, listings: readonly SearchListing[]): CourseHit[] {
  const normalized = trimmed.toLowerCase().replace(/\s+/g, "");
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: CourseHit[] = [];

  for (const listing of listings) {
    const idMatch = listing.idNorm.includes(normalized);
    const titleMatch = words.every((word) => listing.titleLower.includes(word));
    if (!idMatch && !titleMatch) continue;
    hits.push({
      courseId: listing.courseId,
      code: formatCourseId(listing.courseId),
      title: listing.title,
      points: listing.points,
    });
  }

  /*
   * Code matches first, then shorter titles. Someone who typed "COMS 3134"
   * wants that course and nothing else; someone who typed "algorithms" is
   * browsing, and the shortest title is the least specialised course, which is
   * the better first guess.
   */
  return hits
    .sort((a, b) => {
      const aCode = a.courseId.toLowerCase().includes(normalized) ? 0 : 1;
      const bCode = b.courseId.toLowerCase().includes(normalized) ? 0 : 1;
      return aCode - bCode || a.title.length - b.title.length || a.code.localeCompare(b.code);
    })
    .slice(0, SEARCH_LIMIT);
}

/* ==========================================================================
 * Resolving what a student typed or a transcript produced
 * ========================================================================== */

export interface ResolvedCourse {
  courseId: string;
  code: string;
  title: string | null;
  points: number | null;
  /**
   * False when our catalog holds no row for this id.
   *
   * The row is still returned, and the caller still stores it. Transfer credit,
   * AP credit, study abroad and un-backfilled archived terms all land here, and
   * they are exactly the coursework a student most needs recorded —
   * `student_courses.course_id` is deliberately not a foreign key so they fit.
   * The UI marks them "not in our catalog"; nothing rejects them.
   */
  inCatalog: boolean;
}

/**
 * Turn typed codes into storable rows.
 *
 * Anything `toCourseId` cannot even shape into a course id is dropped, because
 * that is a typo rather than a course — but anything code-SHAPED survives
 * whether or not the catalog knows it.
 */
export async function resolveCourseCodes(codes: readonly string[]): Promise<ResolvedCourse[]> {
  const parsed = codes
    .map((code) => ({ raw: code, courseId: toCourseId(code) }))
    .filter((entry): entry is { raw: string; courseId: CourseId } => entry.courseId !== null);

  if (parsed.length === 0) return [];

  const facts = await loadCatalogFacts(parsed.map((entry) => entry.courseId));

  const seen = new Set<string>();
  const resolved: ResolvedCourse[] = [];

  for (const { courseId } of parsed) {
    if (seen.has(courseId)) continue;
    seen.add(courseId);

    const fact = facts.get(courseId);
    resolved.push({
      courseId,
      code: fact?.code ?? formatCourseId(courseId),
      title: fact?.title ?? null,
      points: fact?.points ?? null,
      inCatalog: fact !== undefined,
    });
  }

  return resolved;
}
