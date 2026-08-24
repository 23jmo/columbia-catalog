/**
 * Running one turn, with the grounding rule actually enforced.
 *
 * ── The honest limitation, stated first ────────────────────────────────────
 *
 * A *post*-check cannot un-say a streamed sentence. By the time the last token
 * of a fabricated course code has been checked, the student has read it. That
 * is not a bug in this file, it is arithmetic, and any claim that streaming
 * output is "verified before display" would be false.
 *
 * So there are two paths, and the difference between them is deliberate:
 *
 *   - `answerGrounded` does not stream. It generates, checks, gives the model
 *     exactly one corrective retry, and REFUSES if the retry is still
 *     ungrounded. Nothing ungrounded reaches the student. This is the path that
 *     satisfies the spec's rule.
 *   - The streaming route (`app/api/agent/route.ts`) runs the same check at
 *     finish and attaches the verdict to the stored message, so a bad turn is
 *     visible, correctable and countable — but it has already been displayed.
 *
 * The retry is worth having on its own terms. The overwhelmingly common failure
 * is not invention, it is a model paraphrasing a course it genuinely saw with a
 * number it half-remembers. Handed the specific codes it made up and told they
 * do not exist, it fixes them. One retry catches that; a second would mostly
 * burn tokens re-failing the cases that are actually invention.
 */

import type { CatalogAgent } from "./agent";
import { checkGrounding, type GroundingVerdict } from "./grounding";
import type { AgentToolContext } from "./tools";

export interface GroundedAnswer {
  text: string;
  verdict: GroundingVerdict;
  /** True when the first attempt failed the check and a retry was spent. */
  retried: boolean;
  /** Set when even the retry was ungrounded. `text` is then the refusal. */
  refused: boolean;
}

/**
 * The message shown when a turn cannot be grounded.
 *
 * It names the codes rather than apologising vaguely. A student who asked about
 * COMS W4995 and is told "I could not verify COMS W4995" learns something
 * actionable — the course may be renumbered, or retired, or never existed — and
 * that is a better outcome than a fluent paragraph about a course that is not
 * offered.
 */
function refusal(ungrounded: readonly string[]): string {
  const codes = ungrounded.join(", ");
  return (
    `I couldn't answer that without stating something I can't verify — ` +
    `nothing in the catalog data I can reach backs up ${codes}. ` +
    `Those codes may have been renumbered or retired. Try naming the course by title, ` +
    `or ask me what's offered in the subject and I'll work from what's actually there.`
  );
}

const REPAIR_PROMPT = (ungrounded: readonly string[]) =>
  `Your previous answer cited ${ungrounded.join(", ")}, which no tool call in this ` +
  `conversation returned. Do not restate them. Either look them up with a tool now, or ` +
  `rewrite the answer using only courses the tools have actually returned. If neither is ` +
  `possible, say plainly that you could not find them.`;

/**
 * Run one prompt to a grounded answer, or to a refusal.
 *
 * `transcript` is reset before the first attempt and deliberately NOT reset
 * before the retry: tool output from the first attempt is still legitimately
 * grounded — the model saw those courses, it just wrote the wrong numbers down
 * — and clearing it would fail a corrected answer for citing a course it had
 * genuinely looked up a moment earlier.
 */
export async function answerGrounded(
  agent: CatalogAgent,
  context: AgentToolContext,
  prompt: string,
): Promise<GroundedAnswer> {
  context.transcript.length = 0;

  const first = await agent.generate({ prompt });
  let verdict = checkGrounding(first.text, context.transcript);
  if (verdict.grounded) return { text: first.text, verdict, retried: false, refused: false };

  console.warn("agent: ungrounded first attempt:", verdict.ungrounded.join(", "));

  const second = await agent.generate({
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: first.text },
      { role: "user", content: REPAIR_PROMPT(verdict.ungrounded) },
    ],
  });

  verdict = checkGrounding(second.text, context.transcript);
  if (verdict.grounded) return { text: second.text, verdict, retried: true, refused: false };

  console.error("agent: refusing ungrounded answer:", verdict.ungrounded.join(", "));
  return { text: refusal(verdict.ungrounded), verdict, retried: true, refused: true };
}
