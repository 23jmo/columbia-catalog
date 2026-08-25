/**
 * `/saved` — the folder gallery.
 *
 * Almost a thin server shell around a client component, and it has to be: the
 * only thing that knows what a reader has saved is the bookmark store, which
 * lives in the browser behind their own Supabase session.
 *
 * The one thing the server does render is the agent inbox — pending proposals
 * are rows the viewer's own session can read, and putting them here means an
 * agent's suggestion is waiting on the page about the list it wants to change.
 *
 * The watchlist rail sits at the bottom for the same reason: a watched section
 * is a class you want and cannot have yet, which belongs with the shortlist
 * rather than with the timetable.
 */

import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";
import { ProposalReview } from "@/components/proposals/proposal-review";
import { WatchlistRail } from "@/components/watch/watchlist-rail";
import { isEmailConfigured } from "@/lib/alerts/resend";
import { CURRENT_TERM } from "@/lib/constants";
import { listPendingProposalsForViewer } from "@/lib/db/proposal-reads";
import { isPlanKind } from "@/lib/mcp/proposals";

import { SavedGallery } from "./saved-gallery";

export const metadata: Metadata = {
  title: "Saved classes",
  description: "Your shortlist — saved sections, grouped into folders.",
};

export default async function SavedPage() {
  const proposals = await listPendingProposalsForViewer();

  return (
    <AppShell activeNav="saved">
      <PageContent className="max-w-5xl gap-5">
        {/* The bookmark half of the agent inbox. `/schedule` renders the plan
            half; neither page shows the other's cards, so a proposal is only
            ever answerable in one place. Renders nothing when empty. */}
        <ProposalReview proposals={proposals.filter((proposal) => !isPlanKind(proposal.kind))} />
        <SavedGallery />

        {/*
          Seat alerts, which used to sit on the home page.

          They moved here rather than being deleted with the rest of the home
          page's lower half: a watch is a section you want and cannot have yet,
          which is the same shelf as a section you saved and have not committed
          to. It is emphatically not the timetable — `/schedule` is about the
          hours you have already claimed, and a list of classes you are queuing
          for would be answering a different question on that page.
        */}
        <WatchlistRail termCode={CURRENT_TERM} emailAlertsEnabled={isEmailConfigured()} />
      </PageContent>
    </AppShell>
  );
}
