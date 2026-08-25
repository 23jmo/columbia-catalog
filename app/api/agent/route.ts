/**
 * The agent endpoint.
 *
 * ── The order of the checks is the security model ──────────────────────────
 *
 * Session, then budget, then model. Nothing below a check can run before it
 * passes, and the sequence is what makes the spec's two hard rules true rather
 * than intended:
 *
 *   1. **Signed-out students get zero LLM calls.** The 401 returns before the
 *      agent is even constructed. The box on the page accepts what they type
 *      and the sign-in wall is what they get; no token is ever spent on an
 *      anonymous visitor, which is also why this cannot be turned into a free
 *      public chatbot by anyone who finds the URL.
 *   2. **Twenty prompts per six hours.** Checked before the model is invoked
 *      and RECORDED before it streams, so a turn that dies mid-stream still
 *      counts. Charging only on success would let a student retry a failing
 *      query without limit — and a failing query is disproportionately likely
 *      to be failing because it is expensive.
 *
 * ── Grounding here is a flag, not a gate ───────────────────────────────────
 *
 * This route streams, so the check runs at `onEnd` — after the student has read
 * the text. It cannot prevent display; it records the verdict on the stored
 * message so a bad turn is visible and countable. The gate that actually
 * refuses lives in `lib/agent/answer.ts`, which does not stream. That trade is
 * argued in full in that file's header, and it is a real one, not a papered
 * crack.
 */

import { createAgentUIStreamResponse, validateUIMessages, type UIMessage } from "ai";

import { buildAgent, usingOpenAI } from "@/lib/agent/agent";
import { appendMessage, resolveConversation, textOf } from "@/lib/agent/conversation";
import { checkGrounding } from "@/lib/agent/grounding";
import { shownCourseIds } from "@/lib/agent/transcript";
import { buildAgentToolContext } from "@/lib/agent/tools";
import { checkPromptBudget, recordPrompt } from "@/lib/agent/usage";
import { getSessionUser } from "@/lib/db/auth";
import { createServiceRoleClient } from "@/lib/db/client";

/*
 * Node, not edge. The tools reach `lib/data/catalog`, the Supabase server
 * client and the progression graph, and streaming works on the Node runtime
 * with no configuration — the belief that SSE requires edge is simply wrong.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

function jsonError(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  // --- 1. Session -----------------------------------------------------------
  const account = await getSessionUser();
  if (!account) {
    return jsonError(401, {
      error: "Sign in with your Columbia or Barnard account to ask a question.",
      signInRequired: true,
    });
  }

  const db = createServiceRoleClient();
  if (!db) return jsonError(503, { error: "The database is not configured." });

  /*
   * Preflight the model credential, BEFORE the budget is spent.
   *
   * Either route will do. `OPENAI_API_KEY` is set by hand in `.env.local` or
   * in the project's environment variables; the AI Gateway instead
   * authenticates by OIDC, and on Vercel `VERCEL_OIDC_TOKEN` is injected into
   * the deployment rather than written by anyone — locally it arrives via
   * `vercel env pull`, or an `AI_GATEWAY_API_KEY` stands in for it.
   *
   * With none of them the SDK fails deep inside the stream with an
   * authentication error, which the student sees as a broken answer *and* a
   * spent prompt. Checking here costs nothing and turns that into a plain
   * sentence with nothing deducted. Note this only proves a credential is
   * present, not that it is funded — the gateway in particular answers a
   * perfectly valid OIDC token with `customer_verification_required` until a
   * card is on file, which is why `onError` below still has to translate
   * billing failures into English.
   */
  const hasModelCredential = [
    "OPENAI_API_KEY",
    "AI_GATEWAY_API_KEY",
    "VERCEL_OIDC_TOKEN",
    // Declared-but-blank is not configured. `.env` files hand back `""` for a
    // commented-out key someone half-uncommented, and a `??` chain would take
    // it as the answer and stop looking at the routes that ARE configured.
  ].some((name) => Boolean(process.env[name]?.trim()));
  if (!hasModelCredential) {
    return jsonError(503, {
      error: "The assistant isn't configured on this deployment yet.",
      configurationProblem:
        "No model credential. Set OPENAI_API_KEY, or set AI_GATEWAY_API_KEY / run " +
        "`vercel env pull` to use the Vercel AI Gateway instead.",
    });
  }

  // --- 2. Budget ------------------------------------------------------------
  const budget = await checkPromptBudget(db, account.userId);
  if (!budget.allowed) {
    return jsonError(429, {
      error: `You've used all ${budget.limit} questions for now.`,
      used: budget.used,
      limit: budget.limit,
      resetsAt: budget.resetsAt?.toISOString() ?? null,
    });
  }

  // --- 3. Input -------------------------------------------------------------
  let body: { messages?: unknown; conversationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, { error: "Expected a JSON body." });
  }

  /*
   * `validateUIMessages` rather than a cast. The messages arrive from a browser
   * and carry tool-call parts the SDK will replay to the model; trusting their
   * shape would let a crafted request forge a tool RESULT — the model would
   * then state, grounded and confident, whatever the caller put in it. The
   * grounding check would not catch that, because a forged tool result is
   * indistinguishable from a real one once it is in the transcript.
   */
  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: body.messages });
  } catch {
    return jsonError(400, { error: "Those messages aren't in a shape I can read." });
  }
  if (messages.length === 0) return jsonError(400, { error: "No message to answer." });

  const latest = messages[messages.length - 1];
  if (latest.role !== "user") {
    return jsonError(400, { error: "The last message has to be the student's." });
  }
  const prompt = textOf(latest);
  if (!prompt.trim()) return jsonError(400, { error: "The message is empty." });

  // --- 4. Spend the prompt, then run ---------------------------------------
  await recordPrompt(db, account.userId);

  const conversationId = await resolveConversation(
    db,
    account.userId,
    typeof body.conversationId === "string" ? body.conversationId : null,
    prompt,
  );
  if (conversationId) {
    await appendMessage(db, account.userId, conversationId, {
      role: "user",
      content: prompt,
      parts: latest.parts,
    });
  }

  const baseUrl = new URL(request.url).origin;
  const context = buildAgentToolContext(
    account.userId,
    account.email,
    baseUrl,
    shownCourseIds(messages),
  );
  const agent = buildAgent(context);

  return createAgentUIStreamResponse({
    agent,
    /*
     * The whole thread, not just the latest message — this is what makes "what
     * about mornings" work. The SDK converts these to model messages itself,
     * keeping the tool calls, so the model sees what it actually DID last turn
     * rather than a summary of it.
     *
     * `originalMessages` is deliberately not passed. It exists to put the SDK
     * into its own persistence mode, and this route persists in `onEnd` against
     * `agent_messages` — two writers for one thread is how a history ends up
     * with each turn recorded twice, differently.
     */
    uiMessages: messages,
    headers: {
      "x-agent-prompts-used": String(budget.used + 1),
      "x-agent-prompts-limit": String(budget.limit),
      ...(conversationId ? { "x-agent-conversation-id": conversationId } : {}),
    },
    /*
     * The default handler returns a generic string to avoid leaking server
     * internals, which is right for a stack trace and wrong for the two
     * failures a student can actually do something about. Gateway billing and
     * rate limiting are conditions of the deployment, not secrets, and a
     * student staring at "An error occurred" cannot tell them from a bug in
     * their question. Everything else still degrades to the generic message.
     */
    onError(error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("agent: stream failed:", message);

      /*
       * Both providers refuse an unfunded account, and they say so in their own
       * words: the gateway with `customer_verification_required`, OpenAI with
       * `insufficient_quota` / "exceeded your current quota". Same condition,
       * same sentence for the student — only the name of the account to top up
       * changes, which is why the provider is named rather than assumed.
       */
      if (/credit card|customer_verification_required|insufficient_quota|exceeded your current quota/i.test(message)) {
        const account = usingOpenAI() ? "the OpenAI account" : "the AI Gateway account";
        return `The assistant isn't billable on this deployment yet — ${account} has no credit available. Nothing was deducted from your questions.`;
      }
      if (/rate.?limit|quota|429/i.test(message)) {
        return "The model is rate limited right now. Try again in a moment.";
      }
      return "Something went wrong answering that. It's been logged.";
    },
    async onEnd({ messages: finalMessages, isAborted }) {
      if (isAborted) return;

      const answer = finalMessages[finalMessages.length - 1];
      if (!answer || answer.role !== "assistant") return;

      const text = textOf(answer);
      const verdict = checkGrounding(text, context.transcript);
      if (!verdict.grounded) {
        /*
         * Loud on purpose. This is the model stating a Columbia fact no tool
         * returned — the exact failure the product cannot tolerate — and it has
         * already been shown to a student. It needs to be findable in logs
         * without anyone going looking.
         */
        console.error(
          `agent: UNGROUNDED answer shown to ${account.userId}: ${verdict.ungrounded.join(", ")}`,
        );
      }

      if (!conversationId) return;
      await appendMessage(db, account.userId, conversationId, {
        role: "assistant",
        content: text,
        /*
         * The verdict rides along in the stored parts rather than in a column.
         * It is per-message diagnostic data about one turn, and a column would
         * make every future reader of the table wonder whether it means the
         * message is safe to display — it does not; by the time it exists the
         * message has been displayed.
         */
        parts: [...answer.parts, { type: "data-grounding", data: verdict }],
      });
    },
  });
}
