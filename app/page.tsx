/**
 * Home — "the tab a student leaves open during registration week" (spec §5).
 *
 * A single-column workspace: the primary plan (week, credits, conflicts,
 * commute warnings) plus the watchlist rail. The agent handoff moved to
 * `/mcp-setup`; Home surfaces it through a compact BoardUI announcement
 * instead of a permanent sidebar column.
 *
 * Below `lg` nothing special happens — there is only one column.
 *
 * This is a **server component**. The only JavaScript the page ships is the app
 * shell's interactive leaves plus the announcement card's dismiss/action
 * buttons, so the whole surface is meaningful markup on first paint.
 *
 * The watchlist rail cannot be server-rendered — its whole purpose is to be
 * current, and a server-rendered seat count is a photograph of the moment the
 * request was served. It subscribes to Postgres realtime and repaints itself.
 */

import type { Metadata } from "next";
import { RiGraduationCapLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { AppShell } from "@/components/shell/app-shell";
import { AuthErrorNotice } from "@/components/shell/auth-error-notice";
import { PageHeader } from "@/components/shell/page-header";
import { WeekGrid } from "@/components/schedule";
import { AgentAnnouncement } from "@/components/home/agent-announcement";
import { ScheduleColumn } from "@/components/home/schedule-column";
import { WatchlistRail } from "@/components/watch/watchlist-rail";
import { isEmailConfigured } from "@/lib/alerts/resend";
import { loadPlanSnapshot } from "@/components/home/load-plan-snapshot";
import { CURRENT_TERM, buildTerm } from "@/lib/constants";
import { getSessionUser } from "@/lib/db/auth";

export const metadata: Metadata = {
  title: "Home · Columbia Catalog",
  description:
    "Your Columbia schedule for the term, with conflicts and commute warnings.",
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
      <div className="mx-auto flex w-full max-w-[900px] min-w-0 flex-col gap-5">
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
      </div>
    </AppShell>
  );
}
