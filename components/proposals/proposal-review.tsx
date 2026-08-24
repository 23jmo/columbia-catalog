"use client";

import { useState } from "react";
import { RiRobot2Line, RiCheckLine, RiCloseLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { getBrowserClient } from "@/lib/db/client";
import type { Proposal, ProposalKind } from "@/lib/mcp/proposals";
import { planStore, PlanWriteDeniedError } from "@/lib/schedule";
import { getBookmarkSnapshot, toggleBookmark } from "@/lib/bookmarks/store";

/**
 * The human click that spec §16 makes the only source of authority.
 *
 * An agent with `plans:write` can say "COMS 4118 002 has seats and does not
 * clash — shall I add it?" and nothing more. This card is where that becomes a
 * change, or does not.
 *
 * ── Why accepting happens in the browser ──────────────────────────────────
 *
 * `planStore` is the single writer for plans, and `lib/db/plan-sync.ts` carries
 * every edit through to Supabase. Applying an accepted diff on the server would
 * mean a second write path into the same rows, and a student whose localStorage
 * would not catch up until their next sign-in — they would accept a proposal
 * and watch nothing happen.
 *
 * So the click does two things in order: resolve the proposal through the RPC
 * (the only thing that can move it out of `pending`, and it checks the session
 * itself), and then apply the diff through the ordinary store. If the resolve
 * fails, no plan is touched. If it succeeds and the plan write is refused, the
 * proposal is spent — which is the right way round: a proposal is consumed by
 * being answered, not by succeeding.
 */

/**
 * What the card calls each kind.
 *
 * Spelled out rather than derived from the kind string, because "Save" and
 * "Add" are genuinely different promises and a reader deciding whether to
 * accept should not have to work out which list is about to change.
 */
const KIND_LABEL: Record<ProposalKind, string> = {
  add_section: "Add to schedule",
  remove_section: "Remove from schedule",
  add_bookmark: "Save class",
  remove_bookmark: "Remove saved class",
};

export function ProposalReview({ proposals }: { proposals: Proposal[] }) {
  const [pending, setPending] = useState(proposals);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pending.length === 0) return null;

  async function decide(proposal: Proposal, accept: boolean) {
    setError(null);
    setBusyId(proposal.proposalId);

    const supabase = getBrowserClient();
    if (!supabase) {
      setError("Sign-in is not available right now, so this cannot be answered.");
      setBusyId(null);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("resolve_plan_proposal", {
      p_proposal_id: proposal.proposalId,
      p_status: accept ? "accepted" : "rejected",
    });

    if (rpcError || !data || data.length === 0) {
      // Most likely already answered elsewhere, or expired while it sat here.
      setError("That proposal is no longer pending. It may have expired or been answered already.");
      setPending((current) => current.filter((p) => p.proposalId !== proposal.proposalId));
      setBusyId(null);
      return;
    }

    if (accept) {
      try {
        /*
         * The proposal describes a diff; applying it is this click's job.
         *
         * Plan kinds and bookmark kinds go to different stores, and the
         * `planId` non-null assertions below are safe because migration 0023
         * added a CHECK constraint pairing kind with plan_id — a plan kind
         * without a plan is not a row the database will hold.
         */
        if (proposal.kind === "add_section") {
          planStore.addSection(proposal.planId!, proposal.sectionId);
        } else if (proposal.kind === "remove_section") {
          planStore.removeSection(proposal.planId!, proposal.sectionId);
        } else {
          /*
           * `toggleBookmark` flips; the proposal names an end state. So read
           * first and only write if the two disagree — otherwise accepting
           * "save COMS 4118 001" for a class the student already saved (quite
           * likely, since they were looking at it) would silently unsave it.
           */
          const want = proposal.kind === "add_bookmark";
          const saved = getBookmarkSnapshot().saved.has(proposal.sectionId);
          if (saved !== want) await toggleBookmark(proposal.sectionId);
        }
      } catch (cause) {
        setError(
          cause instanceof PlanWriteDeniedError
            ? cause.message
            : "Accepted, but the change could not be applied. Try it by hand.",
        );
      }
    }

    setPending((current) => current.filter((p) => p.proposalId !== proposal.proposalId));
    setBusyId(null);
  }

  return (
    <section
      aria-label="Proposals from your agents"
      className="flex flex-col gap-3 rounded-[20px] border border-border-button-default bg-background-secondary-default p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <RiRobot2Line className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <h2 className="text-body-semibold text-text-primary">
          {pending.length === 1 ? "An agent suggested a change" : `${pending.length} agent suggestions`}
        </h2>
      </div>

      <p className="text-caption-1-regular text-text-secondary">
        Nothing below has been applied. An agent can propose a change to your schedule or
        your saved classes; only you can make it.
      </p>

      <ul className="flex flex-col gap-2">
        {pending.map((proposal) => (
          <li
            key={proposal.proposalId}
            className="flex flex-wrap items-start justify-between gap-3 rounded-2lg bg-background-inner-default p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-body-medium text-text-primary">{proposal.summary}</p>
              {proposal.note ? (
                <p className="mt-0.5 text-caption-1-regular text-text-secondary">{proposal.note}</p>
              ) : null}
              <p className="mt-1 text-caption-2-regular text-text-tertiary">
                {KIND_LABEL[proposal.kind] ?? proposal.kind} · proposed by{" "}
                {proposal.originClientId}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="small"
                variant="secondary"
                leadingIcon={RiCloseLine}
                onClick={() => void decide(proposal, false)}
                disabled={busyId === proposal.proposalId}
              >
                Reject
              </Button>
              <Button
                size="small"
                leadingIcon={RiCheckLine}
                onClick={() => void decide(proposal, true)}
                disabled={busyId === proposal.proposalId}
              >
                Accept
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="status" className="text-caption-1-regular text-text-error-primary">
          {error}
        </p>
      ) : null}
    </section>
  );
}
