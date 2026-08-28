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

  const [student, catalog, prereqs, vectors] = await Promise.all([
    loadStudent(),
    loadCatalog(ACTIVE_TERMS),
    loadPrereqSource(),
    loadVectorSource(),
  ]);

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

  const [student, catalog, prereqs, vectors] = await Promise.all([
    loadStudent(),
    loadCatalog(ACTIVE_TERMS),
    loadPrereqSource(),
    loadVectorSource(),
  ]);

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
