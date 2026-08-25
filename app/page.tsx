/**
 * Home — a greeting, the feed, and the box.
 *
 * ── The two halves answer different halves of the question ─────────────────
 *
 * This page has been through four shapes: a planner; a feed above the planner;
 * the assistant above the feed; then the assistant alone. The fourth was a
 * correction to the third and overshot. An empty box is the right thing to land
 * on only if the student already has a question — and "what should I take" is
 * precisely the state of not having one yet.
 *
 * So the feed comes back, but as a rail rather than a column, and above the box
 * rather than below it. The feed answers the one question every student has, in
 * cards they can act on without typing anything. The box answers everything the
 * feed cannot anticipate — "which of these leaves Friday free", "what is the
 * fastest way to finish my Core". Neither is the page; the pair is.
 *
 * The moment a student types, the greeting and the rail give way to the thread.
 * That is not a layout trick: a conversation and a set of recommendations are
 * both trying to be the answer on screen, and showing them at once would make
 * the student decide which one to read.
 *
 * Nothing was deleted. `/schedule`, `/progression` and `/saved` are unchanged
 * and reachable from the nav; the watchlist rail lives on `/saved` with the
 * rest of a student's saved work.
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

import { Suspense } from "react";
import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";
import { AuthErrorNotice } from "@/components/shell/auth-error-notice";
import { AssistantHome } from "@/components/assistant";
import { FeedPanel, FeedSkeleton } from "@/components/feed";
import { buildFeed } from "@/lib/recommend/feed";
import { CURRENT_TERM, buildTerm } from "@/lib/constants";
import { isConversationId } from "@/lib/agent/history-format";
import { PROMPT_LIMIT, checkPromptBudget } from "@/lib/agent/usage";
import { getSessionUser } from "@/lib/db/auth";
import { createServiceRoleClient } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "LionPlan",
  description:
    "Ask what to take next term. Answers are read out of the catalog and your own coursework, never recalled.",
};

export default async function HomePage({
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
          greetingName={firstName(account?.name)}
          initialConversationId={initialConversationId}
          /*
           * Passed as an element, not awaited here.
           *
           * `HomeFeed` is an async server component, so the `<Suspense>` around
           * it is a real streaming boundary: the shell, the greeting and the
           * composer paint immediately and the rail arrives when the engine is
           * done. Awaiting `buildFeed` in this function instead would hold the
           * whole document — including the box — behind a prerequisite graph
           * over 8,189 courses.
           */
          feed={
            <Suspense fallback={<FeedSkeleton />}>
              <HomeFeed />
            </Suspense>
          }
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

/**
 * The feed, isolated so it can suspend on its own.
 *
 * It must be its own component rather than an inline `await`: `<Suspense>`
 * boundaries wrap components, and a promise awaited in `HomePage` suspends
 * `HomePage`. Splitting it is what moves the boundary from the whole document
 * to the rail.
 *
 * `buildFeed` reads the student's own record through the cookie-scoped Supabase
 * client, which is why this is rendered inside the request rather than at build
 * time, and why the same call from a script comes back as a guest.
 */
async function HomeFeed() {
  const feed = await buildFeed();
  return <FeedPanel feed={feed} />;
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
