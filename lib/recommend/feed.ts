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
import { getTypicalMeetings } from "@/lib/db/typical-meetings";
import { loadPrimaryPlanSnapshot } from "@/lib/db/primary-plan-snapshot";
import type { CourseWithSections, Meeting, TermCode } from "@/lib/types";

import { recommend, WEIGHTS } from "./index";
import {
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
}

export async function buildFeed(options: BuildFeedOptions = {}): Promise<FeedResult> {
  const limit = options.limit ?? DEFAULT_FEED_LIMIT;
  const terms = options.terms ?? ACTIVE_TERMS;

  /*
   * Everything that can be fetched in parallel is. The prerequisite graph and
   * the catalog are the two expensive reads and neither depends on the other;
   * serialising them would add a second to a page that must feel instant.
   */
  const [student, catalog, prereqs, vectors] = await Promise.all([
    loadStudent(),
    loadCatalog(terms),
    loadPrereqSource(),
    loadVectorSource(),
  ]);

  const personalized = student.engine.taken.length > 0 || student.outstanding.length > 0;

  const wantedSubjects = options.subjects?.map((subject) => subject.toUpperCase());
  const coursesById = new Map(catalog.courses.map((course) => [course.courseId, course]));

  const candidates = catalog.candidates.filter((candidate) => {
    if (wantedSubjects?.length && !wantedSubjects.includes(candidate.code.split(" ")[0])) {
      return false;
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
      const course = coursesById.get(candidate.courseId);
      if (course && course.number >= GRADUATE_LEVEL_FLOOR) return false;
    }
    return true;
  });

  const ranked = recommend({
    profile: student.engine,
    candidates,
    outstanding: student.outstanding,
    prereqs,
    vectors,
    limit: limit * SHORTLIST_MULTIPLIER,
    /*
     * The feed shows none of this. It is counted for the honest line at the
     * bottom of the page and, in time, for answering "why not X" — so a small
     * cap is enough and a large one would build a list longer than the feed.
     */
    withheldLimit: 200,
  });

  /*
   * The student's existing week. Read once and shared across every candidate
   * section; asking per card would be twenty reads of the same plan.
   *
   * Only the currently-registerable term has a plan worth checking against — a
   * student does not have a Spring plan while registering for Fall — so a
   * failure or absence here simply means no conflicts are claimed, which is the
   * same answer a guest gets.
   */
  const busy = student.app ? await loadBusyIntervals(terms[0]) : [];

  /* ── Pass one: choose a section and fold offering into the score ───────── */

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

  for (const entry of ranked.recommendations) {
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

  /* ── Pass two: fill in historical times for the cards that need them ───── */

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

  const cards: FeedCard[] = winners.map((entry) => {
    /*
     * Re-choose with the historical patterns in hand. This can change WHICH
     * section wins — a section that was "time TBA" may now have an estimate and
     * a named instructor — and that is the intended behaviour: the estimate is
     * information the ranking should see, even though it never gets to veto a
     * section on conflict grounds (see `scoreSection`).
     */
    const choice =
      chooseSection(entry.course.sections, { busy, terms, typical }) ?? entry.choice;

    return {
      courseId: entry.course.courseId,
      code: entry.code,
      title: entry.title,
      points: entry.points,
      score: entry.score,
      components: entry.components,
      reasons: entry.reasons,
      caveats: entry.caveats,
      best: toSectionView(choice.best),
      others: choice.others.slice(0, OTHER_SECTIONS_SHOWN).map(toSectionView),
    };
  });

  return {
    cards,
    personalized,
    signedIn: student.app != null,
    takenCount: student.engine.taken.length,
    outstandingCount: student.outstanding.length,
    vectorModel: vectors.size > 0 ? vectors.model : null,
    withheldCount: ranked.withheld.length,
    generatedAt: new Date().toISOString(),
  };
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
