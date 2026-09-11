"use server";

/**
 * The recommendation engine, reachable from the UI.
 *
 * Until this file existed the engine had no callers outside the agent's tool
 * layer: `lib/recommend/` was complete, tested, and unreachable from any screen.
 * These are the three entry points every surface in Lane C needs — the feed's
 * refresh, the onboarding grid's re-rank, and the direct question "why not this
 * one" — and they exist here rather than as route handlers because a server
 * action carries the caller's session cookie automatically, which is the whole
 * reason the audit path can be RLS'd with no user id in any signature.
 *
 * ── Every VALUE export is an async function, and that is a hard constraint ─
 *
 * A `"use server"` module may only export async functions. Type-only exports
 * are fine — they are erased before the checker sees them — but a constant, a
 * schema, or a synchronous helper exported from here is a build error rather
 * than a lint warning. So `feedInputSchema` and friends stay module-private,
 * and anything a caller needs at runtime lives in `./feed` or `./types`.
 *
 * ── Inputs are validated even though they look harmless ────────────────────
 *
 * A server action is a public HTTP endpoint with a generated name. Nothing here
 * reads another student's data — every read goes through RLS as the invoker, so
 * there is no user id to tamper with — but `limit` reaches a database query and
 * `subjects` reaches a filter, so both are bounded and typed at the edge rather
 * than trusted because the only caller today is our own button.
 */

import { z } from "zod";

import { ACTIVE_TERMS } from "@/lib/constants";
import type { TermCode } from "@/lib/types";

import { buildFeed, DEFAULT_FEED_LIMIT, type FeedResult } from "./feed";
import { recommend } from "./index";
import {
  loadCatalog,
  loadPrereqSource,
  loadStudent,
  loadVectorSource,
} from "./pipeline";
import { gateCatalogForSchool } from "./school-gate";
import type { ScoredRecommendation, WithheldCourse } from "./types";

/* ==========================================================================
 * Input schemas
 * ========================================================================== */

const subjectSchema = z
  .array(z.string().trim().min(2).max(8))
  .max(20)
  .optional();

const courseIdSchema = z.string().trim().min(4).max(24);

const feedInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  subjects: subjectSchema,
  /**
   * Terms are validated against `ACTIVE_TERMS` rather than a shape, because the
   * only defensible answer to "recommend me something from Fall 2023" is that
   * we do not, and a regex would let it through.
   */
  terms: z.array(z.enum(ACTIVE_TERMS as [TermCode, ...TermCode[]])).min(1).optional(),
  /** Already shown, already saved, or already discarded this session. */
  excludeCourseIds: z.array(courseIdSchema).max(500).optional(),
  /**
   * Discarded courses. Ranked down as a neighbourhood, not just dropped — the
   * next page should not be the same class with a different number.
   */
  demoteCourseIds: z.array(courseIdSchema).max(400).optional(),
});

export type FeedActionInput = z.infer<typeof feedInputSchema>;

/* ==========================================================================
 * The feed
 * ========================================================================== */

/**
 * Rebuild the home feed.
 *
 * Called by the page on first render and by the feed's own controls afterwards
 * (subject filter, "show me something else"). Returns the same shape both
 * times, so the client never has to reconcile two versions of a card.
 */
export async function getFeedAction(input: FeedActionInput = {}): Promise<FeedResult> {
  const parsed = feedInputSchema.parse(input);
  return buildFeed({
    limit: parsed.limit ?? DEFAULT_FEED_LIMIT,
    subjects: parsed.subjects,
    terms: parsed.terms,
    excludeCourseIds: parsed.excludeCourseIds,
    demoteCourseIds: parsed.demoteCourseIds,
  });
}

/* ==========================================================================
 * Raw recommendations, without sections
 * ========================================================================== */

const recommendInputSchema = z.object({
  limit: z.number().int().min(1).max(60).optional(),
  subjects: subjectSchema,
  /**
   * Also return what the prerequisite filter held back. Off by default: an
   * unsolicited suggestion a student cannot act on is the failure the filter
   * exists to prevent. On, it is the most useful answer the product has.
   */
  includeWithheld: z.boolean().optional(),
});

export type RecommendActionInput = z.infer<typeof recommendInputSchema>;

export interface RecommendActionResult {
  recommendations: ScoredRecommendation[];
  withheld: WithheldCourse[];
  personalized: boolean;
  signedIn: boolean;
  /** The LSA build backing taste, or null when the artifact is unreadable. */
  vectorModel: string | null;
}

/**
 * Course-level recommendations, no sections attached.
 *
 * This is what the onboarding guess grid re-ranks against between confirmations
 * (spec: "re-ranks every 3-5 confirmations"). It skips section selection, the
 * plan read and the historical-meetings RPC — all of which the grid has no use
 * for — so it is meaningfully cheaper than `getFeedAction` and can run on the
 * cadence the grid needs without the grid reshuffling under a student's finger.
 */
export async function recommendCoursesAction(
  input: RecommendActionInput = {},
): Promise<RecommendActionResult> {
  const parsed = recommendInputSchema.parse(input);

  const [student, ungated, prereqs, vectors] = await Promise.all([
    loadStudent(),
    loadCatalog(ACTIVE_TERMS),
    loadPrereqSource(),
    loadVectorSource(),
  ]);
  const catalog = gateCatalogForSchool(ungated, student.app?.school ?? null);

  const wanted = parsed.subjects?.map((subject) => subject.toUpperCase());
  const candidates = wanted?.length
    ? catalog.candidates.filter((course) => wanted.includes(course.code.split(" ")[0]))
    : catalog.candidates;

  const result = recommend({
    profile: student.engine,
    candidates,
    outstanding: student.outstanding,
    prereqs,
    vectors,
    limit: parsed.limit ?? 20,
    withheldLimit: parsed.includeWithheld ? (parsed.limit ?? 20) : 0,
  });

  return {
    recommendations: result.recommendations,
    withheld: result.withheld,
    personalized: student.engine.taken.length > 0 || student.outstanding.length > 0,
    signedIn: student.app != null,
    vectorModel: vectors.size > 0 ? vectors.model : null,
  };
}

/* ==========================================================================
 * One course, answered directly
 * ========================================================================== */

const explainInputSchema = z.object({
  /** Stored form (`"COMS4111W"`) or printed form (`"COMS W4111"`). */
  courseId: z.string().trim().min(4).max(24),
});

export type ExplainActionInput = z.infer<typeof explainInputSchema>;

export interface ExplainActionResult {
  /** `"recommended"` when it survived the filter and ranked. */
  status: "recommended" | "withheld" | "not_offered" | "already_taken";
  recommendation: ScoredRecommendation | null;
  withheld: WithheldCourse | null;
}

/**
 * Why is this course — or why is it not — in front of me?
 *
 * This is the question `RecommendResult.withheld` exists to answer, and the
 * reason the engine's return type keeps a list the feed never renders. Asked
 * directly about COMS W4111, the honest and useful reply is "you are missing
 * COMS W3134, and this one takes instructor permission" — a sentence a catalog
 * search structurally cannot produce.
 *
 * Unsolicited: excluded. Solicited: answered precisely. That is the whole rule,
 * and this action is the "solicited" half of it.
 */
export async function explainCourseAction(
  input: ExplainActionInput,
): Promise<ExplainActionResult> {
  const parsed = explainInputSchema.parse(input);

  // Accept both id spellings. `"COMS W4111"` is what a student types and
  // `"COMS4111W"` is what we store; refusing either would make the action
  // usable only by code that already knew the answer.
  const { toCourseId } = await import("@/lib/requirements/code");
  const courseId = toCourseId(parsed.courseId) ?? parsed.courseId.toUpperCase();

  const [student, ungated, prereqs, vectors] = await Promise.all([
    loadStudent(),
    loadCatalog(ACTIVE_TERMS),
    loadPrereqSource(),
    loadVectorSource(),
  ]);
  const catalog = gateCatalogForSchool(ungated, student.app?.school ?? null);

  const candidate = catalog.candidates.find((course) => course.courseId === courseId);
  if (!candidate) {
    return { status: "not_offered", recommendation: null, withheld: null };
  }

  const decided = new Set<string>([
    ...student.engine.taken.map((course) => course.courseId),
    ...(student.engine.planned ?? []),
  ]);
  if (decided.has(courseId)) {
    return { status: "already_taken", recommendation: null, withheld: null };
  }

  /*
   * Scored against a candidate list of ONE.
   *
   * The score is not comparable to a feed score — `ScoredRecommendation.score`
   * is documented as comparable within a call, not across calls — but every
   * component, reason and caveat is computed by exactly the same code path the
   * feed uses, which is the property that matters: the answer to "why not" can
   * never disagree with the feed that withheld it.
   */
  const result = recommend({
    profile: student.engine,
    candidates: [candidate],
    outstanding: student.outstanding,
    prereqs,
    vectors,
    limit: 1,
    withheldLimit: 1,
  });

  if (result.recommendations.length > 0) {
    return { status: "recommended", recommendation: result.recommendations[0], withheld: null };
  }
  if (result.withheld.length > 0) {
    return { status: "withheld", recommendation: null, withheld: result.withheld[0] };
  }
  return { status: "not_offered", recommendation: null, withheld: null };
}

/* ==========================================================================
 * The catalog's ordering
 * ========================================================================== */

/**
 * One course's personal relevance, as the search engine's overlay wants it.
 *
 * The number is an ORDERING, not a quantity. Nothing renders it, nothing
 * compares it across calls, and its only job is to sort one course above
 * another — so it is min-max normalized per call into bands that stay apart:
 *
 *     +1.0 … +2.0   ranked: the engine scored it and the student can take it
 *      0            absent from the map — no signal either way
 *     -1.0          withheld: prerequisites we can prove are missing
 *     -2.0          already taken or planned: they have decided
 *
 * The gaps matter more than the values. A course we know nothing about must
 * outrank one we know the student is not ready for, and both must outrank one
 * they have already sat through. Collapsing those three into "no score" is what
 * would make the catalog's first screen show a student the class they took last
 * spring.
 */
export interface CatalogRelevanceEntry {
  courseId: string;
  score: number;
}

export interface CatalogRelevanceResult {
  /**
   * False when we have nothing to personalize with. The catalog then keeps its
   * course-number order rather than inventing one: for a signed-out visitor
   * every term in the blend is zero except `unlock`, which would rank the
   * catalog by how many doors each course opens *for nobody in particular* —
   * a fact about the catalog wearing a personal pronoun (see `./index`).
   */
  personalized: boolean;
  entries: CatalogRelevanceEntry[];
}

/** Ranked courses land in [RANKED_FLOOR, RANKED_CEILING]. */
const RANKED_FLOOR = 1;
const RANKED_CEILING = 2;
const WITHHELD_SCORE = -1;
const DECIDED_SCORE = -2;

/**
 * Personal relevance for every course in the active terms.
 *
 * This is the catalog's secondary sort key — the "then" in "query relevance
 * first, then personal relevance". It exists as its own action rather than
 * reusing `recommendCoursesAction` because the two want opposite things from
 * the engine: a feed wants the best twenty courses a student can take, and a
 * catalog must still list all 4,878 including the ones it is ordering last.
 *
 * So `withheldLimit` is raised to the full candidate set and nothing is
 * dropped. A course the prerequisite filter holds back is not hidden from the
 * catalog — it sinks, which is the honest rendering of "not yet".
 *
 * Cost is the same class as the home feed: one profile read, one audit, one
 * candidate expansion, then a scoring pass over the active catalog. The client
 * fetches it in parallel with the index download and applies it when it lands,
 * so nothing on the Catalog screen waits for this.
 */
export async function catalogRelevanceAction(): Promise<CatalogRelevanceResult> {
  /*
   * The student is read alone and first, on purpose. Every other load here is
   * expensive and every one of them is wasted on a visitor with no record --
   * which, on the Catalog screen, is most of them. Answering "nothing to
   * personalize with" costs one profile read.
   */
  const student = await loadStudent();
  const personalized = student.engine.taken.length > 0 || student.outstanding.length > 0;
  if (!personalized) return { personalized: false, entries: [] };

  const [ungated, prereqs, vectors] = await Promise.all([
    loadCatalog(ACTIVE_TERMS),
    loadPrereqSource(),
    loadVectorSource(),
  ]);
  const catalog = gateCatalogForSchool(ungated, student.app?.school ?? null);

  const result = recommend({
    profile: student.engine,
    candidates: catalog.candidates,
    outstanding: student.outstanding,
    prereqs,
    vectors,
    limit: catalog.candidates.length,
    withheldLimit: catalog.candidates.length,
  });

  const entries: CatalogRelevanceEntry[] = [];

  /*
   * Min-max over the ranked scores, not a fixed divisor.
   *
   * `ScoredRecommendation.score` is documented as comparable within a call and
   * not across them, and its range genuinely moves: a student with six
   * outstanding requirement groups tops out near 6, one with none tops out
   * around 0.5 on taste alone. Normalizing against the call's own spread is
   * what keeps the ranked band above the "no signal" zero for both of them.
   */
  const ranked = result.recommendations;
  if (ranked.length > 0) {
    let lowest = Infinity;
    let highest = -Infinity;
    for (const item of ranked) {
      if (item.score < lowest) lowest = item.score;
      if (item.score > highest) highest = item.score;
    }
    const spread = highest - lowest;
    for (const item of ranked) {
      // A flat spread means every candidate scored identically. Sitting them
      // all at the ceiling is right: they are tied, and the engine's own
      // course-number tiebreak takes it from there.
      const position = spread > 0 ? (item.score - lowest) / spread : 1;
      entries.push({
        courseId: item.course.courseId,
        score: RANKED_FLOOR + position * (RANKED_CEILING - RANKED_FLOOR),
      });
    }
  }

  for (const item of result.withheld) {
    entries.push({ courseId: item.course.courseId, score: WITHHELD_SCORE });
  }

  /*
   * Taken and planned courses appear in neither list — `recommend` drops them
   * before scoring, because "already decided" is not a recommendation. The
   * catalog still has to show them, and showing them first would be the worst
   * possible answer, so they are scored here rather than left absent.
   */
  const decided = new Set<string>([
    ...student.engine.taken.map((course) => course.courseId),
    ...(student.engine.planned ?? []),
  ]);
  for (const candidate of catalog.candidates) {
    if (decided.has(candidate.courseId)) {
      entries.push({ courseId: candidate.courseId, score: DECIDED_SCORE });
    }
  }

  return { personalized: true, entries };
}
