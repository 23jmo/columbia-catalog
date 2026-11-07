/**
 * `/schedule` — the week.
 *
 * One recurring week per term, one schedule per student. The server's only
 * jobs are the term row (real first and last day of instruction, for the
 * `.ics` export) and the agent inbox; everything interactive is
 * `ScheduleScreen`, which reads the local-first plan store and pulls the
 * server's copy on mount so a class the chat added is already there.
 */

import type { Metadata } from "next";

import { ProposalReview } from "@/components/proposals/proposal-review";
import { ScheduleScreen } from "@/components/schedule/schedule-screen";
import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";
import { CURRENT_TERM } from "@/lib/constants";
import { listPendingProposalsForViewer } from "@/lib/db/proposal-reads";
import { getTerm } from "@/lib/db/term-reads";
import { isPlanKind } from "@/lib/mcp/proposals";

export const metadata: Metadata = {
  title: "Schedule · LionPlan",
  description: "Your week. Add classes from your saved list or the catalog, and share a read-only link.",
};

export default async function SchedulePage() {
  const termCode = CURRENT_TERM;
  const [allProposals, term] = await Promise.all([listPendingProposalsForViewer(), getTerm(termCode)]);

  // Only the plan kinds. A proposal to save a class is answered on `/saved`.
  const proposals = allProposals.filter((proposal) => isPlanKind(proposal.kind));

  return (
    <AppShell activeNav="schedule">
      <PageContent className="max-w-[1100px] gap-4 sm:gap-5">
        {proposals.length > 0 ? <ProposalReview proposals={proposals} /> : null}
        <ScheduleScreen termCode={termCode} term={term ?? undefined} />
      </PageContent>
    </AppShell>
  );
}
