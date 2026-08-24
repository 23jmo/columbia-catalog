/**
 * The agent.
 *
 * ── Its one job ────────────────────────────────────────────────────────────
 *
 * Turn "I'm a sophomore CS major interested in AI" into six specific sections a
 * student should register for, each explaining itself. That sentence is the
 * whole product thesis, and it is the thing a search box over 8,189 courses
 * cannot do.
 *
 * ── The constraints are not style preferences ──────────────────────────────
 *
 * Three rules hold this together, and each has a mechanism behind it rather
 * than a request in a prompt:
 *
 *   1. **Grounded only.** The model may state facts a tool returned and nothing
 *      else. Enforced by the instructions below AND by `lib/agent/grounding.ts`
 *      checking every course code in the output against every course code the
 *      tools returned. A model that has read the internet knows what COMS W4111
 *      was in 2023 — that is the hazard, not the help.
 *   2. **Proposes, never acts.** The write tools create a pending proposal and
 *      return a URL; `PlansPort` has no mutation method at all, so this is
 *      structural rather than promised.
 *   3. **Signed-out students get zero LLM calls.** Enforced at the route, not
 *      here: this module is never constructed without a student.
 *
 * ── Why the model is named here and not in an env var ──────────────────────
 *
 * A model id is a behavioural dependency, not a deployment detail. Changing it
 * changes what students are told, and that belongs in a diff someone reviews.
 * The credential is the environment's business; the choice is the code's.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent, isStepCount, type LanguageModel } from "ai";

import { buildAgentTools, type AgentToolContext } from "./tools";

/**
 * Which provider answers, decided by which key is present.
 *
 * Two routes, because the Vercel AI Gateway needs a card on file before it
 * will serve a request and OpenAI credits are a thing people already have.
 * OpenAI wins when its key is set, so putting `OPENAI_API_KEY` in
 * `.env.local` is the whole switch — no code edit, no redeploy.
 *
 * Both model ids were read from the installed packages at implementation
 * time, per the spec's instruction not to use one from memory: the gateway id
 * from a live `/v1/models` call on 2026-08-24, and the OpenAI id from
 * `node_modules/@ai-sdk/openai/docs/03-openai.mdx`, whose capability table is
 * also where "does this tier still do tool calling" was checked rather than
 * assumed. It does — every gpt-5.x tier including mini and nano.
 *
 * A small model on both routes, and that is a considered choice rather than a
 * concession. This is a tool loop where the intelligence lives in the tools:
 * which requirement is outstanding, whether a prerequisite is met, how to
 * rank, are all settled inside `lib/requirements` and `lib/recommend` before
 * the model sees anything. What is left is picking tools and writing four
 * honest sentences over data it is forbidden to embellish. Paying flagship
 * rates for that would buy prose, not correctness, on a surface where every
 * student is metered to twenty prompts.
 *
 * `AGENT_MODEL` overrides the id without touching this file — worth reaching
 * for if answers start missing an obvious tool, since a cheaper tier gives up
 * tool *selection* quality first, long before it gives up grammar.
 */
export const GATEWAY_MODEL = "anthropic/claude-sonnet-5";
export const OPENAI_MODEL = "gpt-5.4-mini";

/**
 * `.env` files hand back `""` for a declared-but-blank variable, and `??`
 * treats that as a value. `AGENT_MODEL=` with nothing after it would then be
 * sent to the provider as the model id — a 404 that reads like a retired
 * model rather than an empty line in a config file. Trim first, and let blank
 * mean absent everywhere in this module.
 */
function envValue(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
}

export function usingOpenAI(): boolean {
  return envValue("OPENAI_API_KEY") !== undefined;
}

/** The id actually in force, for logs and for the route's error messages. */
export function agentModelId(): string {
  return envValue("AGENT_MODEL") ?? (usingOpenAI() ? OPENAI_MODEL : GATEWAY_MODEL);
}

/**
 * Resolved per call rather than at module load.
 *
 * `next dev` keeps a module graph alive across edits, so a provider captured
 * at import time would survive the `.env.local` change that was supposed to
 * switch it — the exact failure mode of "I added the key and nothing
 * happened".
 */
export function resolveAgentModel(): LanguageModel {
  const modelId = agentModelId();
  if (!usingOpenAI()) return modelId;
  // Explicit key rather than the ambient default: this branch is only reached
  // because the key exists, and reading it here keeps the reason visible.
  return createOpenAI({ apiKey: envValue("OPENAI_API_KEY") })(modelId);
}

/**
 * The step ceiling.
 *
 * Twelve, not the SDK's default twenty. A genuinely hard question here costs
 * about six: taken → unmet requirements → recommend → sections for the top few
 * → conflicts. Twelve leaves generous headroom for a question that needs to
 * look something up twice, and still bounds a loop that has started going in
 * circles. Note this caps *steps*, not tool calls per step — the spec's rule
 * that tool calls are uncapped is about metering, and it is honoured: nothing
 * bills the student per call.
 */
const MAX_STEPS = 12;

const INSTRUCTIONS = `
You help Columbia and Barnard students decide what to register for. You are part
of a course catalog app, and the student is looking at their own account.

# The one rule that matters

You may state a fact about a Columbia course only if a tool returned it in THIS
conversation. Not from memory, not from what is usually true, not from what the
course number implies. If you have not looked it up, look it up.

This is enforced. Every course code you write is checked against the codes the
tools returned, and an answer citing anything else is discarded before the
student sees it — so guessing does not produce a fast answer, it produces no
answer. Columbia renumbers courses, retires them, and changes what counts for
what; a confident sentence about a course you did not look up is how a student
ends up in the wrong classroom in September.

If the tools do not have it, say so plainly and say what you do have.

# Which tool

- "What should I take?" — recommend_courses. This is the reason the app exists.
  Do not answer it with search_courses; search cannot see the student's record,
  their requirements, or their prerequisites, and will hand back the catalog.
- "What do I still need?" — get_unmet_requirements, before saying anything.
- "Can I take X?" — get_course for the prose, then recommend_courses with
  includeWithheld to see whether X is blocked and by what.
- A named course or a topic — search_courses, then get_sections for times and
  seats.
- Never guess what the student has taken. get_courses_taken.

Call as many tools as the question needs. Nothing is metered per call.

# What the data means

- **Seats are a reading, not a live number.** Every seat count carries
  \`sourceAsOf\`. Say when it was taken, or say "as of the last check" — never
  present it as the state right now.
- **Empty \`meetings\` with \`meetingsKnown: false\` means we do not know when a
  section meets**, not that it has no meetings. Columbia stopped publishing days
  and times for most sections after Spring 2025. Say "time not published".
- **\`liked: null\` means the student was never asked.** It is not a dislike.
- **\`verification: "attested"\` means the student ticked a box** and nothing has
  been checked against a record. Say so when a conclusion rests on one.
- **\`origin: "parsed"\` means a program was read automatically from the Bulletin
  and not checked by a person.** Flag it when it matters to the answer.
- **\`caveats\` containing \`prereq_unknown\` means we could not parse the
  prerequisite sentence** — about 43% of them. Quote the registrar's own
  advisory text and tell the student to check the course page.
- **\`withheld\` with \`prereq_unmet_but_permission\` is the useful case**: the
  student is missing a prerequisite, but the registrar's own wording allows
  instructor permission. Tell them exactly that, and that emailing the
  instructor is a real option. It is the single most useful thing this app can
  say that a catalog search cannot.
- **Courses marked \`inCatalog: false\`** are transfer, AP or archived credit.
  They are real coursework. Never call them invalid or suggest removing them.

# What you cannot do

You cannot add anything to a schedule, a plan, or a saved list. The add and
remove tools create a PROPOSAL the student reviews and taps to accept, and you
must describe them that way — "I've put this up for you to accept", never "I've
added it". Do not imply you registered them for anything; this app cannot
register anyone for anything, and Vergil is where registration happens.

# How to answer

Lead with the answer in two or three sentences of plain prose, then the courses.
Say why each one is there in the student's terms — "clears your Global Core and
it's the one you're most likely to like, given Machine Learning" beats a score.
Never print internal scores or component numbers; they are for debugging.

Do not hedge on things the tools told you clearly, and do not pad. A student
picking classes wants a recommendation, not a survey of the catalog. If the
honest answer is "only two of these are worth your time", say two.
`.trim();

/**
 * Build an agent bound to one student's tools.
 *
 * Per request, not per process. The tools close over the student's identity and
 * over the `transcript` array the grounding check reads, so a shared instance
 * would either leak one student's record into another's answer or make the
 * grounding check compare against the wrong turn's tool output. Constructing a
 * `ToolLoopAgent` is cheap — it holds settings, not a connection.
 */
export function buildAgent(context: AgentToolContext) {
  return new ToolLoopAgent({
    model: resolveAgentModel(),
    instructions: INSTRUCTIONS,
    tools: buildAgentTools(context),
    stopWhen: isStepCount(MAX_STEPS),
    /*
     * Low, but not zero. The job is reporting what the tools returned, where
     * variation is noise — but a hard zero makes a model that has started a bad
     * sentence unable to recover from it mid-paragraph.
     */
    temperature: 0.2,
  });
}

export type CatalogAgent = ReturnType<typeof buildAgent>;
