/**
 * Home — the assistant, and nothing else.
 *
 * ── Why the page is one box ────────────────────────────────────────────────
 *
 * This page has been through three shapes: a planner, then a feed above the
 * planner, then the assistant above the feed. Each rewrite pushed the same
 * problem down one row rather than solving it — a student landing here had to
 * read the page before they could use it.
 *
 * The feed answers one question, "what should I take", very well, and cannot be
 * asked anything else. A student whose actual question is "which of these can I
 * take with a Friday off" or "what's the fastest way to finish my Core" has
 * nowhere to put it. So the surface that can answer arbitrary questions is the
 * whole page, and the empty space around it is deliberate: the box is where the
 * eye lands, and it is the only thing here to learn.
 *
 * Nothing was deleted. `/schedule`, `/progression`, `/saved` and the week grid
 * are all unchanged, reachable from the nav, and the watchlist rail moved to
 * `/saved` where the rest of a student's saved work already lives.
 * `components/feed` is intact and currently unrouted — it is one line to mount
 * wherever it belongs next.
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
import { PROMPT_LIMIT, checkPromptBudget } from "@/lib/agent/usage";
import { getSessionUser } from "@/lib/db/auth";
import { createServiceRoleClient } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "Columbia Catalog",
  description:
    "Ask what to take next term. Answers are read out of the catalog and your own coursework, never recalled.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const account = await getSessionUser();
  const term = buildTerm(CURRENT_TERM);
  const budget = await readPromptBudget(account?.userId ?? null);

  return (
    <AppShell activeNav="home">
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
    console.error("home: the prompt budget could not be read:", cause);
    return fallback;
  }
}
