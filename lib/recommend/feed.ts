/**
 * The feed: recommendations turned into section cards.
 *
 * `recommend()` ranks COURSES and knows nothing about seats, meeting times or
 * the student's own week — deliberately, because those are what make it
 * untestable. This module is the other half: it takes the ranked courses, picks
 * the section of each that the student could actually take, folds that back
 * into the score as the `offering` term the engine leaves at zero, and produces
 * a list of cards.
 *
 * ── Two ranking passes, and why ────────────────────────────────────────────
 *
 * The engine is asked for more courses than the feed shows, then the offering
 * signal re-ranks that shortlist and the feed keeps the top slice. Doing it in
 * one pass is impossible — offering cannot be computed before a section has
 * been chosen, and choosing a section for all 4,878 candidates would mean
 * scoring ~9,500 sections to throw away 99.6% of the work. Over-fetching by 4×
 * gets the same answer for a twentieth of the cost, and the multiplier is
 * visible here rather than buried as a constant.
 *
 * ── A signed-out visitor gets a real feed, not an error ────────────────────
 *
 * With no profile there is no taste vector and no outstanding requirement, so
 * the blend collapses to unlock + offering. That turns out to be a genuinely
 * sensible cold-start ordering rather than a degenerate one, for a reason worth
 * writing down: the prerequisite hard filter runs against an EMPTY completed
 * set, so the only courses that survive are the ones a student with no record
 * could actually register for today — and among those, `unlock` prefers the
 * ones that open the most doors. That is "here is where you could start",
 * arrived at honestly.
 *
 * The cards still say what they are. `personalized: false` travels with the
 * result so the UI can say "this is what is broadly on offer, not what is right
 * for you", which is the difference between a cold start and a lie.
 */

import { ACTIVE_TERMS, termLabel } from "@/lib/constants";
import { getInstructorReputations } from "@/lib/db/reputation";
import { getTypicalMeetings } from "@/lib/db/typical-meetings";
import { loadPrimaryPlanSnapshot } from "@/lib/db/primary-plan-snapshot";
import type {
  CourseWithSections,
  Meeting,
  ReputationSummary,
  TermCode,
} from "@/lib/types";

import { recommendationClears } from "./clears";
import { outstandingForClears, resolveClearsPool } from "./clears-pool";
import { recommend, WEIGHTS } from "./index";
import {
  hydrateCourses,
  loadCatalog,
  loadPrereqSource,
  loadStudent,
  loadVectorSource,
} from "./pipeline";
import {
  chooseSection,
  offeringScore,
  type BusyInterval,
  type SectionFit,
} from "./section-fit";
import type {
  RecommendationCaveat,
  RecommendationReason,
  ScoreComponents,
  ScoredRecommendation,
  WithheldCourse,
} from "./types";

/* ==========================================================================
 * The card
 * ========================================================================== */

/**
 * One section, flattened for rendering.
 *
 * A plain object rather than the `Section` record because this crosses the
 * server-action boundary, and because a card should not be able to reach for a
 * field the feed never decided how to present.
 */
export interface FeedSectionView {
  sectionId: string;
  sectionCode: string;
  callNumber: string;
  termCode: TermCode;
  termLabel: string;
  /** Distinct topic for this section, when it has one. */
  title: string | null;
  instructors: string[];
  /** Times to render. Empty only when `timeKind` is `"tba"`. */
  meetings: Meeting[];
  /** ALWAYS rendered. An estimate that is not labelled is a fabrication. */
  timeKind: "published" | "estimated" | "tba";
  /** Set only when `timeKind` is `"estimated"`: the term the pattern came from. */
  estimatedFromTerm: string | null;
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  waitlistCount: number | null;
  waitlistCap: number | null;
  status: CourseWithSections["sections"][number]["status"];
  /** Spec §3: a seat number never renders without the directory's own stamp. */
  sourceAsOf: string | null;
  conflictsWithPlan: boolean;
  /** The one Columbia URL we ever send a student to. */
  vergilUrl: string;
}

export interface FeedCard {
  courseId: string;
  /** `"COMS 4111"` — as printed, not as stored. */
  code: string;
  title: string;
  points: number | null;
  /** The blended total, offering included. Comparable within one feed only. */
  score: number;
  components: ScoreComponents;
  /** Why this card is here. Rendered as distinct kinds, never averaged. */
  reasons: RecommendationReason[];
  /** What we could not vouch for. `prereq_unknown` MUST reach the screen. */
  caveats: RecommendationCaveat[];
  /**
   * What students have said about whoever teaches `best`.
   *
   * On the CARD rather than on `FeedSectionView` on purpose: the card names
   * one instructor — the primary on the best section — and putting this on the
   * section view would imply we had fetched it for `others` too, which we have
   * not and should not. Null is the majority case and means only "nobody has
   * reviewed this person"; see `lib/db/reputation.ts`.
   */
  instructorReputation: ReputationSummary | null;
  /** The best-fitting section — the one the card is about. */
  best: FeedSectionView;
  /** The rest, best-first. Rendered as "and N other sections". */
  others: FeedSectionView[];
}

export interface FeedResult {
  cards: FeedCard[];
  /** Whether anything about this feed is about THIS student. */
  personalized: boolean;
  signedIn: boolean;
  /** Courses on the student's record that fed the taste vector. */
  takenCount: number;
  /** Outstanding requirement groups the audit found. */
  outstandingCount: number;
  /**
   * The LSA build backing taste scoring, or `null` when the artifact could not
   * be read and taste is off. Surfaced rather than swallowed: a feed running
   * without semantics should be visible, not silently worse.
   */
  vectorModel: string | null;
  /**
   * How many courses the prerequisite filter held back. Never rendered as
   * cards — see `RecommendResult.withheld` — but counted, because "we excluded
   * 40 courses you are not ready for" is a true and reassuring sentence.
   */
  withheldCount: number;
  /**
   * The held-back courses themselves, with the gate that failed.
   *
   * Computed all along — `buildFeed` asks the engine for up to 200 of these to
   * produce `withheldCount` — and previously discarded. It is returned because
   * the assistant needs it to answer "why not that one", and specifically to
   * spot `prereq_unmet_but_permission`: a student who is one prerequisite short
   * of a course whose registrar wording allows instructor permission can still
   * get in by emailing, and that is the single most useful thing this app knows
   * that a catalog search does not.
   *
   * The feed itself renders none of it. A card for a course the student cannot
   * register for would be a worse feed.
   */
  withheld: WithheldCourse[];
  generatedAt: string;
}

/* ==========================================================================
 * Tuning
 * ========================================================================== */

/** How many cards the feed renders by default. */
export const DEFAULT_FEED_LIMIT = 12;

/**
 * How many courses to ask the engine for, per card shown.
 *
 * Four, because the offering re-rank can only demote — a course with no open
 * section, or whose every section clashes, drops. A 4× shortlist means the feed
 * still fills even if three quarters of the top slice turns out to be
 * unattendable, which is a realistic week-of-registration state.
 */
export const SHORTLIST_MULTIPLIER = 4;

/** How many sibling sections a card lists before it stops. */
export const OTHER_SECTIONS_SHOWN = 4;

/**
 * Course numbers at or above this are graduate-only, and are withheld from a
 * feed built for someone we know nothing about. See the filter in `buildFeed`.
 */
export const GRADUATE_LEVEL_FLOOR = 6000;

/* ==========================================================================
 * Building it
 * ========================================================================== */

export interface BuildFeedOptions {
  limit?: number;
  /** Terms to recommend from. Defaults to the active pair. */
  terms?: readonly TermCode[];
  /** Restrict to these subject codes, e.g. `["COMS"]`. Used by the UI filter. */
  subjects?: readonly string[];
  /** Drop these course ids — already on screen this conversation. */
  excludeCourseIds?: readonly string[];
  /**
   * Keep only courses whose requirement reason matches this label, e.g.
   * `"Global Core"`. Substring, case-insensitive. The unfiltered feed is
   * dominated by a CS major's outstanding CS groups; without this, asking
   * for Core reprints Computer Vision.
   *
   * Works without a program on file: the pool falls back to live
   * `requirement_flags` and then to the Bulletin approved-course list.
   */
  clears?: string;
  /** Inclusive course-number floor. `1000` keeps 1000-level and up. */
  levelMin?: number;
  /**
   * Inclusive course-number ceiling. `3999` is the "easy / intro /
   * manageable" cut: undergraduate listings, no graduate seminars.
   */
  levelMax?: number;
}

export async function buildFeed(options: BuildFeedOptions = {}): Promise<FeedResult> {
  const limit = options.limit ?? DEFAULT_FEED_LIMIT;
  const terms = options.terms ?? ACTIVE_TERMS;

  /*
   * Rank from a skinny listing (id, code, title, points, number). Sections
   * are loaded after `recommend()` for the shortlist only — see hydrate below.
   */
  const [student, catalog, prereqs, vectors] = await Promise.all([
    loadStudent(),
    loadCatalog(terms),
    loadPrereqSource(),
    loadVectorSource(),
  ]);

  const personalized = student.engine.taken.length > 0 || student.outstanding.length > 0;

  const wantedSubjects = options.subjects?.map((subject) => subject.toUpperCase());
  const skip = new Set(options.excludeCourseIds ?? []);
  const listingById = new Map(catalog.listings.map((listing) => [listing.courseId, listing]));

  const auditPool = resolveClearsPool({
    outstanding: student.outstanding,
    clears: options.clears,
    listings: catalog.listings,
  });
  const outstanding = outstandingForClears(
    student.outstanding,
    options.clears,
    auditPool,
  );

  const candidates = catalog.candidates.filter((candidate) => {
    if (skip.has(candidate.courseId)) return false;
    if (auditPool && !auditPool.has(candidate.courseId)) return false;
    if (wantedSubjects?.length && !wantedSubjects.includes(candidate.code.split(" ")[0])) {
      return false;
    }
    /*
     * Level cut for "easy Global Cores" and similar. Applied here, not in
     * the engine, so an unfiltered feed still ranks 4000-level majors.
     */
    if (options.levelMin != null || options.levelMax != null) {
      const listing = listingById.get(candidate.courseId);
      if (!listing) return false;
      if (options.levelMin != null && listing.number < options.levelMin) return false;
      if (options.levelMax != null && listing.number > options.levelMax) return false;
    }
    /*
     * Graduate-only listings are held back from a COLD feed, and only from a
     * cold feed.
     *
     * With no record the prerequisite filter has almost nothing to bite on, so
     * a course like ECON 6211 "Microeconomic Analysis I" — whose only gate is
     * "the director of graduate studies' permission", which parses to `unknown`
     * with nothing outstanding — survives and ranks well on unlock. Putting a
     * PhD core course at the top of a first-time visitor's screen is not a
     * defensible first impression.
     *
     * 6000 rather than 4000 because Columbia's 4000-level is genuinely mixed:
     * COMS W4111 and half the CS major live there and are exactly what a junior
     * should be shown. 6000 and above is unambiguously graduate.
     *
     * The moment we know anything about the student — one course on their
     * record, one declared program — this stops applying, because then a
     * graduate student's record speaks for itself.
     */
    if (!personalized) {
      const listing = listingById.get(candidate.courseId);
      if (listing && listing.number >= GRADUATE_LEVEL_FLOOR) return false;
    }
    return true;
  });

  const rankLimit = options.clears?.trim()
    ? Math.max(limit * SHORTLIST_MULTIPLIER, 80)
    : limit * SHORTLIST_MULTIPLIER;

  const ranked = recommend({
    profile: student.engine,
    candidates,
    outstanding,
    prereqs,
    vectors,
    limit: rankLimit,
    /*
     * The feed shows none of this. It is counted for the honest line at the
     * bottom of the page and, in time, for answering "why not X" — so a small
     * cap is enough and a large one would build a list longer than the feed.
     */
    withheldLimit: 200,
  });

  /*
   * Restricting the candidate pool is not enough on its own. A CS course can
   * still rank when the audit list was empty (open Core selector) or when the
   * needle was loose. Drop anything whose reason does not name the group.
   */
  const recommendations = options.clears?.trim()
    ? ranked.recommendations.filter((entry) =>
        recommendationClears(entry.reasons, options.clears),
      )
    : ranked.recommendations;

  const shortlistIds = recommendations.map((entry) => entry.course.courseId);

  /*
   * The student's existing week. Read once and shared across every candidate
   * section; asking per card would be twenty reads of the same plan.
   *
   * Only the currently-registerable term has a plan worth checking against — a
   * student does not have a Spring plan while registering for Fall — so a
   * failure or absence here simply means no conflicts are claimed, which is the
   * same answer a guest gets.
   *
   * Hydrate runs in parallel: the shortlist is a few dozen ids, not the term.
   */
  const [busy, coursesById] = await Promise.all([
    student.app ? loadBusyIntervals(terms[0]) : Promise.resolve([] as BusyInterval[]),
    hydrateCourses(shortlistIds, terms),
  ]);

  const cards = await assembleFeedCards({
    recommendations,
    coursesById,
    limit,
    terms,
    busy,
  });

  /*
   * Withheld must stay inside the same pool as the cards. Before the pool
   * fallback existed, a Global Core ask ranked the whole catalog, returned
   * zero cards (no required-reason), and filled withheld with the first 200
   * gated courses alphabetically — architecture, intermediate language —
   * which the assistant then narrated as the answer.
   */
  const withheld = ranked.withheld
    .filter((entry) => !auditPool || auditPool.has(entry.course.courseId))
    .sort((a, b) => {
      const aActionable = a.reason === "prereq_unmet_but_permission" ? 0 : 1;
      const bActionable = b.reason === "prereq_unmet_but_permission" ? 0 : 1;
      const aNum = listingById.get(a.course.courseId)?.number ?? 9999;
      const bNum = listingById.get(b.course.courseId)?.number ?? 9999;
      return aActionable - bActionable || aNum - bNum || a.course.courseId.localeCompare(b.course.courseId);
    });

  return {
    cards,
    personalized,
    signedIn: student.app != null,
    takenCount: student.engine.taken.length,
    outstandingCount: student.outstanding.length,
    vectorModel: vectors.size > 0 ? vectors.model : null,
    withheldCount: withheld.length,
    withheld,
    generatedAt: new Date().toISOString(),
  };
}

/* ==========================================================================
 * Section assembly — shared by the home feed and the onboarding preview
 * ========================================================================== */

/**
 * Turn ranked COURSES into the section cards the UI actually renders.
 *
 * Onboarding used to pick "the first section with an instructor" and throw
 * away meetings, seats, and Vergil. That made the last wizard screen a
 * different object from the home feed, and a second generate after sign-in
 * was the only way to get the real cards. Both surfaces now go through this
 * so the teaser and the catalog are the same recommendation.
 */
export async function assembleFeedCards(input: {
  recommendations: readonly ScoredRecommendation[];
  coursesById: Map<string, CourseWithSections>;
  limit: number;
  terms: readonly TermCode[];
  busy?: BusyInterval[];
}): Promise<FeedCard[]> {
  const busy = input.busy ?? [];
  const { terms, coursesById, limit } = input;

  interface Shortlisted {
    course: CourseWithSections;
    code: string;
    title: string;
    points: number | null;
    score: number;
    components: ScoreComponents;
    reasons: RecommendationReason[];
    caveats: RecommendationCaveat[];
    choice: NonNullable<ReturnType<typeof chooseSection>>;
  }

  const shortlist: Shortlisted[] = [];

  for (const entry of input.recommendations) {
    const course = coursesById.get(entry.course.courseId);
    if (!course) continue;

    const choice = chooseSection(course.sections, { busy, terms });
    // No live section means no call number, no time and no Vergil link. There
    // is nothing to render, so the recommendation is dropped rather than shown
    // as an empty shell.
    if (!choice) continue;

    const offering = WEIGHTS.offering * offeringScore(choice.best);
    const components: ScoreComponents = { ...entry.components, offering };

    shortlist.push({
      course,
      code: entry.course.code,
      title: entry.course.title,
      points: entry.course.points,
      score: entry.score + offering,
      components,
      reasons: entry.reasons,
      caveats: entry.caveats,
      choice,
    });
  }

  shortlist.sort((a, b) => b.score - a.score || a.course.courseId.localeCompare(b.course.courseId));
  const winners = shortlist.slice(0, limit);

  /*
   * Only for the cards that will actually render, and only for sections with no
   * published time. 44.8% of sections have none, so asking for the whole
   * shortlist would be an RPC over hundreds of ids to serve a dozen cards.
   */
  const timelessSectionIds = winners.flatMap((entry) =>
    [entry.choice.best, ...entry.choice.others]
      .filter((fit) => fit.section.meetings.length === 0)
      .map((fit) => fit.section.sectionId),
  );

  const typical = timelessSectionIds.length > 0
    ? await getTypicalMeetings(timelessSectionIds)
    : new Map();

  /*
   * Re-choose with the historical patterns in hand. This can change WHICH
   * section wins — a section that was "time TBA" may now have an estimate and
   * a named instructor — and that is the intended behaviour: the estimate is
   * information the ranking should see, even though it never gets to veto a
   * section on conflict grounds (see `scoreSection`).
   *
   * Settled here rather than inside the final `map` because the reputation
   * read below has to ask about the instructor who actually ends up on the
   * card. Asking before this line would sometimes fetch the wrong person.
   */
  const chosen = winners.map((entry) => ({
    entry,
    choice: chooseSection(entry.course.sections, { busy, terms, typical }) ?? entry.choice,
  }));

  /*
   * One read for the whole screen — see `getInstructorReputations`.
   *
   * Only the primary instructor of the winning section, because that is the
   * only name the card prints. Co-teachers trail as a count and unrated is the
   * common answer anyway; fetching for names nobody will read would widen the
   * query to buy nothing.
   */
  const reputations = await getInstructorReputations(
    chosen.map(({ choice }) => primaryInstructor(choice.best)).filter((name): name is string => name != null),
  );

  return chosen.map(({ entry, choice }) => {
    const primary = primaryInstructor(choice.best);
    return {
      courseId: entry.course.courseId,
      code: entry.code,
      title: entry.title,
      points: entry.points,
      score: entry.score,
      components: entry.components,
      reasons: entry.reasons,
      caveats: entry.caveats,
      instructorReputation: (primary ? reputations.get(primary) : null) ?? null,
      best: toSectionView(choice.best),
      others: choice.others.slice(0, OTHER_SECTIONS_SHOWN).map(toSectionView),
    };
  });
}

/**
 * The one name a card prints.
 *
 * The registrar writes empty strings into this field, so "first entry" and
 * "first real name" are different things — `FeedCardView` filters the same way
 * for the same reason. A section with only blanks has no instructor, which is
 * a different statement from having one nobody has reviewed.
 */
function primaryInstructor(fit: SectionFit): string | null {
  return fit.section.instructors.find((name) => name.trim().length > 0)?.trim() ?? null;
}

/* ==========================================================================
 * Helpers
 * ========================================================================== */

function toSectionView(fit: SectionFit): FeedSectionView {
  const { section } = fit;
  return {
    sectionId: section.sectionId,
    sectionCode: section.sectionCode,
    callNumber: section.callNumber,
    termCode: section.termCode,
    termLabel: termLabel(section.termCode),
    title: section.title ?? null,
    instructors: section.instructors,
    meetings: fit.meetings,
    timeKind: fit.provenance.kind,
    estimatedFromTerm:
      fit.provenance.kind === "estimated" ? fit.provenance.sourceTerm : null,
    enrollmentCount: section.enrollmentCount,
    enrollmentCap: section.enrollmentCap,
    waitlistCount: section.waitlistCount,
    waitlistCap: section.waitlistCap,
    status: section.status,
    sourceAsOf: section.sourceAsOf,
    conflictsWithPlan: fit.conflictsWithPlan,
    vergilUrl: fit.vergilUrl,
  };
}

/**
 * The student's occupied hours, from their primary plan for the term.
 *
 * Never throws. A plan read that fails means no conflicts are claimed, which is
 * strictly the safer direction: failing to warn about a clash costs the student
 * one comparison they can make themselves, while inventing a clash hides a
 * section they could have taken.
 */
async function loadBusyIntervals(termCode: TermCode): Promise<BusyInterval[]> {
  try {
    const plan = await loadPrimaryPlanSnapshot(termCode);
    if (!plan) return [];
    return plan.meetings.map((meeting) => ({
      weekday: meeting.weekday,
      startMinute: meeting.startMinute,
      endMinute: meeting.endMinute,
    }));
  } catch (cause) {
    console.error("feed: could not read the primary plan, skipping conflict checks:", cause);
    return [];
  }
}
