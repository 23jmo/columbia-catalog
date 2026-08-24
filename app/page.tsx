/**
 * Home — the feed, then the planner.
 *
 * ── What changed, and why the order is the whole point ─────────────────────
 *
 * This page used to open with the week grid: a good planner, and a planner is
 * what you use AFTER you have decided. The product's thesis is that Vergil
 * cannot get you from "I'm a sophomore CS major interested in AI" to "here are
 * six classes you should take", and a home page whose first screen assumes you
 * already know what you are taking restates that same gap.
 *
 * So `/` opens with the feed. **Nothing was deleted** — the schedule week grid
 * and the watchlist rail are unchanged and sit directly below it, because they
 * are the surfaces a student lives in during registration week and the feed is
 * the surface that gets them there.
 *
 * ── The feed streams; the planner does not wait for it ─────────────────────
 *
 * `buildFeed` is by far the most expensive read on the page — a cold process
 * pages the whole active catalog and builds a prerequisite graph over 8,189
 * courses. Awaiting it inline would hold the week grid and the watchlist behind
 * it, so it renders inside a `<Suspense>` boundary and streams in under a
 * skeleton of its own shape. Everything below paints immediately.
 *
 * This remains a **server component**, and so is every part of the feed. The
 * only JavaScript the feed adds is the shared sign-in button on the cold-start
 * banner; the "and N other sections" disclosure is a native `<details>`.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import { RiGraduationCapLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";
import { AuthErrorNotice } from "@/components/shell/auth-error-notice";
import { PageHeader } from "@/components/shell/page-header";
import { WeekGrid } from "@/components/schedule";
import { AgentAnnouncement } from "@/components/home/agent-announcement";
import { ScheduleColumn } from "@/components/home/schedule-column";
import { FeedPanel, FeedSkeleton } from "@/components/feed";
import { WatchlistRail } from "@/components/watch/watchlist-rail";
import { isEmailConfigured } from "@/lib/alerts/resend";
import { loadPlanSnapshot } from "@/components/home/load-plan-snapshot";
import { CURRENT_TERM, buildTerm } from "@/lib/constants";
import { buildFeed } from "@/lib/recommend/feed";
import { getSessionUser } from "@/lib/db/auth";

export const metadata: Metadata = {
  title: "Home · Columbia Catalog",
  description:
    "Courses worth taking next term, chosen from what you have already taken and what your degree still needs.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const account = await getSessionUser();
  const useSamplePlan = params.demo === "1";
  const termCode = CURRENT_TERM;

  const snapshot = await loadPlanSnapshot({ termCode, useSamplePlan });
  const term = buildTerm(termCode);
  const emailAlertsEnabled = isEmailConfigured();

  return (
    <AppShell activeNav="home">
      <PageContent className="max-w-[900px] gap-5">
        <AuthErrorNotice reason={params.auth_error} />

        <PageHeader
          eyebrow="Registration"
          icon={RiGraduationCapLine}
          title={term.label}
          description={
            <>
              Seat counts carry the directory&rsquo;s own timestamp, and nothing here ever
              registers you for anything.
            </>
          }
          badge={
            <Chip variant="subtle" color={term.isRegisterable ? "lime" : "neutral"}>
              {term.isRegisterable ? "Registration open" : "Registration closed"}
            </Chip>
          }
        />

        <Suspense fallback={<FeedSkeleton />}>
          <Feed />
        </Suspense>

        <AgentAnnouncement />

        <ScheduleColumn
          termCode={termCode}
          plan={snapshot.plan}
          analysis={snapshot.analysis}
          blocks={snapshot.blocks}
          sectionCount={snapshot.sections.length}
          isSample={snapshot.isSample}
          unscheduledCount={snapshot.unscheduledCount}
          historicalCount={snapshot.historicalCount}
          sampleHref="/?demo=1"
          isSignedIn={Boolean(account)}
          weekGrid={WeekGrid}
        />

        <WatchlistRail termCode={termCode} emailAlertsEnabled={emailAlertsEnabled} />
      </PageContent>
    </AppShell>
  );
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
  try {
    const feed = await buildFeed();
    return <FeedPanel feed={feed} />;
  } catch (cause) {
    console.error("home: the feed could not be built:", cause);
    return null;
  }
}
