/**
 * Whether a question reaches the network, and what to say when it does not.
 *
 * ── Why this is a module ───────────────────────────────────────────────────
 *
 * The spec's rule is absolute: a signed-out student causes **zero** LLM calls.
 * The box takes what they type, submitting shows the sign-in wall, the model is
 * never invoked. `/api/agent` also refuses them with a 401 — but a 401 is a
 * call that was made and turned away, and the rule is about the call not being
 * made at all.
 *
 * That makes the check the single most load-bearing line in the chat surface,
 * and it was sitting inside a click handler where nothing could reach it: this
 * project runs vitest in a `node` environment on purpose (see
 * `vitest.config.ts`), so a rendered component is not testable here by design.
 * Pulled out to a pure function, the rule becomes an assertion instead of a
 * promise, and the component keeps only the part a browser has to run.
 *
 * `describeFailure` follows for the same reason. It is the map from four HTTP
 * statuses to four different things a student can do about them, and getting it
 * wrong shows a rate-limited student a sign-in wall — a bug no type checker can
 * see and no screenshot would catch, since it needs a spent budget to appear.
 */

/** What stopped the turn, when something did. */
export type Gate =
  | { kind: "signed-out" }
  | { kind: "budget"; message: string; resetsAt: string | null }
  | { kind: "config"; message: string; detail?: string }
  | { kind: "failed"; message: string };

/**
 * What to do with a submission.
 *
 * Three outcomes, not two: `ignore` is separate from `gate` because an empty
 * box and a mid-stream double-submit should leave the screen exactly as it is,
 * while a wall has something to say. Collapsing them would flash a notice at a
 * student who pressed Enter on whitespace.
 */
export type Submission =
  | { action: "send"; text: string }
  | { action: "gate"; gate: Gate; keepInBox: string }
  | { action: "ignore" };

export function planSubmission({
  text,
  isSignedIn,
  isBusy,
}: {
  text: string;
  isSignedIn: boolean;
  isBusy: boolean;
}): Submission {
  const question = text.trim();

  if (!question) return { action: "ignore" };
  /*
   * A second question while the first is still streaming would abandon a turn
   * the student has already been charged for. The budget is spent at the route
   * before the stream starts, so "send anyway" is not a free retry.
   */
  if (isBusy) return { action: "ignore" };

  /*
   * The wall, before the wire. Everything that would reach the network is on
   * the far side of this return.
   *
   * `keepInBox` is not politeness. The question a student typed is the thing
   * they will lose if signing in reloads the page, and asking someone to
   * re-type it after sending them through an OAuth round trip is how a sign-in
   * wall turns into an exit.
   */
  if (!isSignedIn) return { action: "gate", gate: { kind: "signed-out" }, keepInBox: question };

  return { action: "send", text: question };
}

/**
 * A failed response, in the student's terms.
 *
 * Every branch names something different to do: sign in, wait, tell whoever
 * deploys this, or rephrase. A single "something went wrong" would be correct
 * about all four and useful for none.
 */
export function describeFailure(status: number, body: unknown): Gate {
  const payload = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const message = typeof payload?.error === "string" ? payload.error : null;

  if (status === 401) return { kind: "signed-out" };

  if (status === 429) {
    return {
      kind: "budget",
      message: message ?? "You've used all your questions for now.",
      resetsAt: typeof payload?.resetsAt === "string" ? payload.resetsAt : null,
    };
  }

  if (status === 503) {
    return {
      kind: "config",
      message: message ?? "The assistant isn't available on this deployment.",
      /*
       * The route's `configurationProblem` names the missing variable. It is a
       * deployment fact rather than a secret — "set OPENAI_API_KEY" leaks
       * nothing — and it is the difference between an owner fixing this in a
       * minute and filing a bug against the model.
       */
      ...(typeof payload?.configurationProblem === "string"
        ? { detail: payload.configurationProblem }
        : {}),
    };
  }

  return {
    kind: "failed",
    message: message ?? "That question couldn't be answered. Try rewording it.",
  };
}
