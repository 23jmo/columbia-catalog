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
 */

import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { ProposalReview } from "@/components/proposals/proposal-review";
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
    <AppShell activeNav="saved" contentClassName="mx-auto w-full max-w-5xl">
      <div className="flex flex-col gap-5">
        {/* The bookmark half of the agent inbox. `/schedule` renders the plan
            half; neither page shows the other's cards, so a proposal is only
            ever answerable in one place. Renders nothing when empty. */}
        <ProposalReview proposals={proposals.filter((proposal) => !isPlanKind(proposal.kind))} />
        <SavedGallery />
      </div>
    </AppShell>
  );
}
