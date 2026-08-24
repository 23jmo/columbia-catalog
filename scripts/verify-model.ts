/**
 * Prove the assistant's model credential works, before a student asks anything.
 *
 *   npx tsx --env-file=.env.local scripts/verify-model.ts
 *
 * WHY THIS EXISTS. The agent runs on whichever of two credentials is present —
 * `OPENAI_API_KEY` first, otherwise the Vercel AI Gateway — and the ways that
 * arrangement goes wrong all look identical from the app: a 503 preflight, or a
 * stream that dies mid-answer and reaches the student as "something went
 * wrong". Worse, a spent prompt is deducted before the model is called, so
 * debugging a bad key by asking the assistant questions costs a student's
 * budget twenty times over.
 *
 * This makes one real call, through the exact provider resolution the route
 * uses, and checks the thing that actually matters for a tool loop: not that
 * the model can talk, but that it can CALL A TOOL. A cheap tier that has quietly
 * dropped tool support answers politely in prose and is completely useless
 * here, and that is not a failure any smoke test asking "say hello" would find.
 *
 * It reads no database and contacts no Columbia host. The tool it offers is a
 * fake with an unguessable answer, so a model that skips the call cannot get
 * the right result by knowing it.
 *
 * Exit code is 0 only if the model called the tool and used what it returned.
 */

import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";

import { agentModelId, resolveAgentModel, usingOpenAI } from "../lib/agent/agent";

/**
 * The answer is arbitrary and not in any training set, which is the point: a
 * model that answers without calling the tool answers WRONG, and this script
 * fails. That distinguishes "tool calling works" from "the model happened to
 * know", which a question with a real answer cannot.
 */
const SECRET_SEAT_COUNT = 4173;

async function main(): Promise<void> {
  const route = usingOpenAI() ? "OpenAI" : "Vercel AI Gateway";
  const modelId = agentModelId();

  if (!usingOpenAI() && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    console.error(
      "No model credential set.\n" +
        "  Put OPENAI_API_KEY=sk-... in .env.local (see the AI assistant section at the\n" +
        "  bottom of that file), or set AI_GATEWAY_API_KEY / run `vercel env pull` to use\n" +
        "  the Vercel AI Gateway instead.",
    );
    process.exit(1);
  }

  console.log(`route  ${route}`);
  console.log(`model  ${modelId}`);
  console.log("");

  let toolCallCount = 0;

  const result = await generateText({
    model: resolveAgentModel(),
    stopWhen: isStepCount(4),
    system:
      "You check facts with tools. Never answer a question about seat counts from " +
      "memory — always call the tool. Reply with the number alone.",
    prompt: "How many seats are open in section TEST 0000?",
    tools: {
      seatCount: tool({
        description: "The number of open seats in a section. Takes a section code.",
        inputSchema: z.object({ sectionCode: z.string() }),
        execute: async () => {
          toolCallCount += 1;
          return { seatsOpen: SECRET_SEAT_COUNT };
        },
      }),
    },
  });

  const text = result.text.trim();
  console.log(`tool calls  ${toolCallCount}`);
  console.log(`answer      ${text || "(empty)"}`);
  console.log("");

  if (toolCallCount === 0) {
    console.error(
      `FAILED — ${modelId} answered without calling the tool.\n` +
        "  The credential works, but this model tier is not usable for the assistant:\n" +
        "  every fact it states has to come from a tool call. Check the capability table\n" +
        "  in node_modules/@ai-sdk/openai/docs/03-openai.mdx and set AGENT_MODEL to a\n" +
        "  tier with tool support.",
    );
    process.exit(1);
  }

  if (!text.includes(String(SECRET_SEAT_COUNT))) {
    console.error(
      `FAILED — ${modelId} called the tool but did not use the result.\n` +
        `  Expected the answer to contain ${SECRET_SEAT_COUNT}.`,
    );
    process.exit(1);
  }

  console.log(`OK — ${modelId} is reachable on ${route} and calls tools correctly.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAILED — ${message}`);

  if (/credit card|customer_verification_required/i.test(message)) {
    console.error(
      "\n  The gateway has no card on file. Either add one, or set OPENAI_API_KEY in\n" +
        "  .env.local to route around it entirely.",
    );
  } else if (/insufficient_quota|exceeded your current quota/i.test(message)) {
    console.error("\n  The OpenAI account has no credit available.");
  } else if (/401|invalid.?api.?key|incorrect api key/i.test(message)) {
    console.error("\n  The key was rejected. Check it was pasted whole, with no trailing space.");
  } else if (/model.*not.?found|404|does not exist/i.test(message)) {
    console.error(
      `\n  ${agentModelId()} was not recognised. Model ids differ between the two routes —\n` +
        "  the gateway wants a 'provider/model' string, OpenAI wants a bare one.",
    );
  }
  process.exit(1);
});
