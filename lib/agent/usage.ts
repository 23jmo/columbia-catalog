/**
 * The prompt budget: 20 per student per 6 hours.
 *
 * ── What is metered, and what deliberately is not ──────────────────────────
 *
 * A *prompt* is one thing a student typed. A turn may run fifteen tool calls
 * underneath it and still costs one. That asymmetry is the spec's, and it is
 * the right one: tool calls hit our own database, while prompts hit a paid
 * model. Capping tool calls would make the agent worse at the exact moment it
 * was working hardest — a hard question is precisely the one that needs to
 * search, then check prerequisites, then check seats — and would save nothing.
 *
 * ── Why rows and not a counter ─────────────────────────────────────────────
 *
 * `agent_usage` stores one row per prompt (migration 0032). A single integer
 * would be smaller and could not answer "when does this lift", and a limit that
 * cannot say when it lifts is indistinguishable from a bug. With rows, the
 * reset time is the oldest row in the window plus the window — an exact
 * timestamp, not an estimate.
 *
 * ── The window slides ──────────────────────────────────────────────────────
 *
 * Not "20 per calendar 6-hour block". A fixed block hands a student 40 prompts
 * across a boundary and then zero for six hours, which is both more expensive
 * and more frustrating than the sliding version.
 */

import type { CatalogClient } from "@/lib/db/client";

export const PROMPT_LIMIT = 20;
export const WINDOW_HOURS = 6;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

export interface UsageDecision {
  allowed: boolean;
  /** Prompts already spent inside the window. */
  used: number;
  limit: number;
  /**
   * When the next prompt frees up. Null while under the limit — there is
   * nothing to wait for, and returning `now` there would render as "resets in
   * 0 seconds" next to a working input box.
   */
  resetsAt: Date | null;
}

/**
 * Decide from a window of timestamps.
 *
 * Split out from the query so the rule is testable without a database — the
 * assertion that the 21st prompt in six hours is refused should not require
 * Postgres to be running, and the boundary cases (exactly 20, exactly at the
 * window edge) are where a limiter is actually wrong.
 */
export function decide(promptTimestamps: readonly Date[], now: Date): UsageDecision {
  const cutoff = now.getTime() - WINDOW_MS;
  /*
   * `>` rather than `>=`: a prompt exactly one window old has served its time.
   * The difference is one millisecond and it is the difference between a limit
   * that lifts when it says it will and one that lifts a moment later, which is
   * the version users report as broken.
   */
  const inWindow = promptTimestamps.filter((at) => at.getTime() > cutoff);

  if (inWindow.length < PROMPT_LIMIT) {
    return { allowed: true, used: inWindow.length, limit: PROMPT_LIMIT, resetsAt: null };
  }

  /*
   * The oldest prompt in the window is the one whose expiry frees a slot, so
   * that — not the newest, and not `now + 6h` — is when the student can ask
   * again. Sorting rather than trusting query order: this function is pure and
   * should not inherit an ordering assumption from a caller it cannot see.
   */
  const oldest = [...inWindow].sort((a, b) => a.getTime() - b.getTime())[0];
  return {
    allowed: false,
    used: inWindow.length,
    limit: PROMPT_LIMIT,
    resetsAt: new Date(oldest.getTime() + WINDOW_MS),
  };
}

/**
 * Read a student's window and decide.
 *
 * Fetches `PROMPT_LIMIT + 1` rows, not all of them. Anything past the 21st
 * cannot change the answer — the count is already over the limit and the
 * *oldest* row that matters is still inside what we read — so a chatty user
 * with a thousand rows costs the same query as a quiet one.
 */
export async function checkPromptBudget(
  db: CatalogClient,
  userId: string,
  now: Date = new Date(),
): Promise<UsageDecision> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();

  const { data, error } = await db
    .from("agent_usage")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(PROMPT_LIMIT + 1);

  if (error) {
    /*
     * Fail OPEN, and this is the one place in the agent where that is right.
     * The downside of a wrongly-allowed prompt is a few cents; the downside of
     * a wrongly-refused one is a student who is told they are out of questions
     * when they have asked none. Compare `lib/recommend/sources.ts`, which
     * fails closed — there the cost of being wrong is recommending a course a
     * first-year cannot take, which is a trust failure rather than a billing
     * one.
     */
    console.error("agent usage check failed, allowing the prompt:", error.message);
    return { allowed: true, used: 0, limit: PROMPT_LIMIT, resetsAt: null };
  }

  return decide((data ?? []).map((row) => new Date(row.created_at)), now);
}

/**
 * Record that a prompt was spent.
 *
 * Called after the budget check passes and before the model is invoked, so a
 * turn that fails mid-stream still counts. Charging only on success would let
 * a student retry a failing query without limit, which is the shape of request
 * most likely to be failing because it is expensive.
 */
export async function recordPrompt(db: CatalogClient, userId: string): Promise<void> {
  const { error } = await db.from("agent_usage").insert({ user_id: userId });
  if (error) console.error("agent usage insert failed:", error.message);
}
