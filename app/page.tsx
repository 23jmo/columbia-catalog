/**
 * Home — "the tab a student leaves open during registration week" (spec §5).
 *
 * A two-column workspace:
 *
 *   left    the primary plan: the week, credits, conflicts, commute warnings
 *   right   the agent handoff — the MCP server the student connects to their
 *           own Claude or ChatGPT. Explicitly NOT a chat panel (spec §16).
 *
 * Below `lg` the columns stack, schedule first, because the week is what
 * someone opens their phone at 2am to check.
 *
 * This is a **server component**. The only JavaScript the page ships is the app
 * shell's four interactive leaves plus the agent column's copy button, so the
 * whole surface is meaningful markup on first paint — spec §19's budget is not
 * something to negotiate with later.
 *
 * The watchlist rail (spec §5) sits under the agent handoff rather than in a
 * third column. It is the one part of this screen that cannot be server
 * rendered — its whole purpose is to be current, and a server-rendered seat
 * count is a photograph of the moment the request was served. It subscribes to
 * Postgres realtime and repaints itself; everything around it stays static
 * markup.
 */

import type { Metadata } from "next";
import { RiGraduationCapLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { AppShell } from "@/components/shell/app-shell";
import { AuthErrorNotice } from "@/components/shell/auth-error-notice";
import { PageHeader } from "@/components/shell/page-header";
import { WeekGrid } from "@/components/schedule";
import { AgentHandoff } from "@/components/home/agent-handoff";
import { ScheduleColumn } from "@/components/home/schedule-column";
import { WatchlistRail } from "@/components/watch/watchlist-rail";
import { isEmailConfigured } from "@/lib/alerts/resend";
import { loadPlanSnapshot } from "@/components/home/load-plan-snapshot";
import { CURRENT_TERM, buildTerm } from "@/lib/constants";
import { getSessionUser } from "@/lib/db/auth";
import { MCP_PATH, resolveBaseUrl } from "@/lib/mcp/config";

export const metadata: Metadata = {
  title: "Home · Columbia Catalog",
  description:
    "Your Columbia schedule for the term, with conflicts and commute warnings — plus the MCP server that connects the catalog to your own AI assistant.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  /**
   * Reads are free and the account wall goes up at the first write (spec §15),
   * so this page renders for a signed-out visitor without complaint. The
   * session is read anyway because two pieces of copy below are *about* the
   * account — whether a plan can be saved, and whether an agent can be granted
   * the scopes that read one — and both would be lying if they guessed.
   *
   * `?demo=1` opts into the built-in sample so the populated screen can still
   * be reviewed; the sample announces itself in the UI rather than passing as
   * the student's own plan.
   */
  const account = await getSessionUser();
  const useSamplePlan = params.demo === "1";
  const termCode = CURRENT_TERM;

  const snapshot = await loadPlanSnapshot({ termCode, useSamplePlan });
  const term = buildTerm(termCode);

  // Resolved on the server: the client never has to guess our own origin, and
  // the copy-paste block is correct on localhost and in production alike.
  const mcpEndpointUrl = `${resolveBaseUrl()}${MCP_PATH}`;

  /*
   * Whether a seat opening actually reaches an inbox. Read here rather than in
   * the rail because it depends on a server secret, and stated in the UI
   * because "we email every watcher the moment a seat opens" is a promise —
   * one this deployment cannot keep until Resend is provisioned
   * (.plans/BLOCKERS.md #2).
   */
  const emailAlertsEnabled = isEmailConfigured();

  return (
    <AppShell activeNav="home">
      <div className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-7">
        {/* Renders nothing unless /auth/callback bounced someone back here. */}
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

        {/*
          Two columns at `lg`, one below it. The agent column is a fixed 380px
          rail rather than a fraction: its content is a config block and a tool
          list, both of which read badly when stretched, while the week wants
          every pixel it can get.
        */}
        <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,380px)]">
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
            // The schedule lane's canvas, injected through the slot it was
            // designed for. `WeekGrid` has no hooks and no browser APIs, so
            // holding it does not make this page a client component.
            weekGrid={WeekGrid}
          />

          <div className="flex min-w-0 flex-col gap-5">
            <WatchlistRail termCode={termCode} emailAlertsEnabled={emailAlertsEnabled} />
            {/*
              "connected" is deliberately not derivable here. MCP access tokens
              are stateless and signed rather than stored, which is what lets
              the endpoint work across serverless instances — the cost is that
              the server genuinely cannot say whether a client is holding a live
              one. Claiming it could would be the sort of confident-and-wrong
              status this whole app is trying not to ship.
            */}
            <AgentHandoff
              mcpEndpointUrl={mcpEndpointUrl}
              connectionState={account ? "not-connected" : "signed-out"}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
