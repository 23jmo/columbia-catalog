/**
 * `/chat` — a greeting and the box.
 *
 * ── What this page is for, now that it is not the home page ────────────────
 *
 * It was `/`, and it carried a feed rail above the box because an empty box is
 * the right thing to land on only if the student already has a question — and
 * "what should I take" is precisely the state of not having one yet.
 *
 * That is still true, which is why the feed did not move here with the box: it
 * became `/`. The two were competing for the same screen. A conversation and a
 * ranked list of recommendations are both trying to be the answer you read,
 * and stacking them made the student pick one before either had said anything.
 *
 * So this page is the long tail, deliberately one nav item over from home. The
 * feed answers the question every student has; the box answers the ones it
 * cannot anticipate — "which of these leaves Friday free", "what is the
 * fastest way to finish my Core", "is Cannon's section the one to take". The
 * reader arrives here having already read the list, which is why home ends
 * with a link to it rather than opening with one.
 *
 * ── This page stays a server component ─────────────────────────────────────
 *
 * `AssistantHome` is the client island, and everything it needs to know that
 * only the server can answer is resolved here and passed in: whether there is a
 * session, and how much of the prompt budget is already spent.
 *
 * The budget is read, never spent. `checkPromptBudget` is a select; the write
 * lives in `recordPrompt`, which only `/api/agent` calls. Rendering the counter
 * from the same source the route enforces from is what stops the number under
 * the box from disagreeing with the refusal the student eventually gets.
 */

import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";
import { AuthErrorNotice } from "@/components/shell/auth-error-notice";
import { AssistantHome } from "@/components/assistant";
import { CURRENT_TERM, buildTerm } from "@/lib/constants";
import { isConversationId } from "@/lib/agent/history-format";
import { PROMPT_LIMIT, checkPromptBudget } from "@/lib/agent/usage";
import { getSessionUser } from "@/lib/db/auth";
import { createServiceRoleClient } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "Chat — LionPlan",
  description:
    "Ask what to take next term. Answers are read out of the catalog and your own coursework, never recalled.",
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const requestedId = typeof params.c === "string" ? params.c : null;
  const initialConversationId =
    requestedId && isConversationId(requestedId) ? requestedId : null;

  const account = await getSessionUser();
  const term = buildTerm(CURRENT_TERM);
  const budget = await readPromptBudget(account?.userId ?? null);

  return (
    <AppShell activeNav="chat">
      {/*
        Narrower than the rest of the app on purpose. Everywhere else on this
        site is dense tabular data that wants the width; a conversation is prose,
        and prose at 1180px is a worse read than prose at 1030px.
      */}
      <PageContent className="max-w-[1030px] gap-0">
        <AuthErrorNotice reason={params.auth_error} />
        <AssistantHome
          isSignedIn={Boolean(account)}
          termLabel={term.label}
          promptsUsed={budget.used}
          promptsLimit={budget.limit}
          greetingName={firstName(account?.name)}
          initialConversationId={initialConversationId}
        />
      </PageContent>
    </AppShell>
  );
}

/**
 * How many questions are already spent in the current window.
 *
 * A signed-out visitor has spent none, and the counter under the box reads
 * `0/20` — accurate, and the honest thing to show beside a box that will ask
 * them to sign in rather than pretending the limit is the reason they cannot
 * ask. A database that is unreachable degrades the same way: a wrong-but-low
 * counter is recoverable, and the route re-checks the real budget before it
 * spends anything, so nothing can be over-spent by trusting this.
 */
async function readPromptBudget(userId: string | null) {
  const fallback = { used: 0, limit: PROMPT_LIMIT };
  if (!userId) return fallback;

  const db = createServiceRoleClient();
  if (!db) return fallback;

  try {
    const budget = await checkPromptBudget(db, userId);
    return { used: budget.used, limit: budget.limit };
  } catch (cause) {
    console.error("chat: the prompt budget could not be read:", cause);
    return fallback;
  }
}

/**
 * A name to greet, or nothing.
 *
 * `toSessionAccount` never returns an empty name — it falls back through
 * `full_name` → `name` → the local part of the email → the literal
 * `"Signed in"`. Only the first two of those are a name a person would answer
 * to, and greeting someone as `2023johnathanmo` or as `Signed in` is worse than
 * not greeting them, so anything that looks like a fallback returns null and
 * the page opens on the feed's own heading instead.
 */
function firstName(name: string | undefined): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (!first || first === "Signed" || first.includes("@")) return null;
  // An email local part that became the name: digits, dots, no capital.
  if (/\d/.test(first) || first.includes(".")) return null;
  return first;
}
