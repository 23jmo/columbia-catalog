/**
 * Home — the assistant, then the planner.
 *
 * ── Why the assistant is the page and not a link on it ─────────────────────
 *
 * The last rewrite moved the feed above the week grid, on the argument that a
 * home page opening with a planner assumes you have already decided. The same
 * argument goes one step further. The feed answers one question — "what should
 * I take" — very well, and cannot be asked anything else. A student whose
 * actual question is "which of these can I take with a Friday off" or "what's
 * the fastest way to finish my Core" has nowhere to put it, and a link to a
 * separate chat page is a wall: the surface that can answer arbitrary questions
 * has to be the surface people land on, or it is a feature nobody finds.
 *
 * So the box is the first thing on the page, and **the feed is directly under
 * it**, as the empty state — home still opens with real recommendations for a
 * student who does not want to type. Nothing was deleted: the week grid and the
 * watchlist rail are unchanged and sit below, exactly where they were.
 *
 * ── This page stays a server component ─────────────────────────────────────
 *
 * `AssistantHome` is the client island, and everything it needs to know that
 * only the server can answer is resolved here and passed in: whether there is
 * a session, how much of the prompt budget is already spent, and the feed —
 * which is passed as a rendered `ReactNode`, still inside its own `<Suspense>`
 * boundary, so a server subtree does not get dragged into the browser by being
 * handed to a client component.
 *
 * The budget is read, never spent. `checkPromptBudget` is a select; the write
 * lives in `recordPrompt`, which only `/api/agent` calls. Rendering the counter
 * from the same source the route enforces from is what stops the number under
 * the box from disagreeing with the refusal the student eventually gets.
 */

import { Suspense } from "react";
import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";
import { AuthErrorNotice } from "@/components/shell/auth-error-notice";
import { AgentAnnouncement } from "@/components/home/agent-announcement";
import { AssistantHome } from "@/components/assistant";
import { FeedPanel, FeedSkeleton } from "@/components/feed";
import { CURRENT_TERM, buildTerm } from "@/lib/constants";
import { PROMPT_LIMIT, checkPromptBudget } from "@/lib/agent/usage";
import { buildFeed } from "@/lib/recommend/feed";
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
      <PageContent className="max-w-[1180px] gap-5">
        <AuthErrorNotice reason={params.auth_error} />

        <AssistantHome
          isSignedIn={Boolean(account)}
          termLabel={term.label}
          promptsUsed={budget.used}
          promptsLimit={budget.limit}
          feed={
            <Suspense fallback={<FeedSkeleton />}>
              <Feed />
            </Suspense>
          }
        />

        <AgentAnnouncement />
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

/**
 * The feed, isolated so its await sits inside the Suspense boundary.
 *
 * A failure renders nothing rather than taking the page down. Every source
 * `buildFeed` reads already degrades on its own — a missing profile becomes a
 * guest, a missing prerequisite graph becomes "unknown, with a caveat", a
 * missing vector artifact becomes requirement-only ranking — so reaching this
 * catch means something genuinely unexpected happened, and the right answer is
 * still a working planner below rather than an error page.
 */
async function Feed() {
  /*
   * Only the await is guarded. A try/catch around the JSX as well would read as
   * an error boundary and is not one — React renders the element later, so a
   * failure inside `FeedPanel` escapes this catch and takes the page down while
   * looking handled. The narrow version is the honest one: `buildFeed` is what
   * can fail here, and a render failure is a bug that should be loud.
   */
  let feed: Awaited<ReturnType<typeof buildFeed>>;
  try {
    feed = await buildFeed();
  } catch (cause) {
    console.error("home: the feed could not be built:", cause);
    return null;
  }

  return <FeedPanel feed={feed} />;
}
