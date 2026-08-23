/**
 * Pending agent proposals for whoever is reading — the server half of spec
 * §16's review step.
 *
 * `list_plan_proposals` reads `auth.uid()` for itself and expires stale rows on
 * the way past, so this passes no user id and filters nothing. The session is
 * the query.
 *
 * Server-rendered rather than fetched in the browser, because the review card
 * is the reason the student followed the link an agent gave them. Arriving at
 * /schedule and seeing nothing for a beat — before a client fetch resolves and
 * the card appears — reads as "the proposal is gone".
 */

import { createServerSupabaseClient } from "@/lib/db/client";
import type { PlanProposalRow } from "@/lib/db/schema";
import type { Proposal, ProposalStatus } from "@/lib/mcp/proposals";

function rowToProposal(row: PlanProposalRow): Proposal {
  return {
    proposalId: row.proposal_id,
    userId: row.user_id,
    planId: row.plan_id,
    kind: row.kind as Proposal["kind"],
    sectionId: row.section_id,
    courseId: row.course_id,
    summary: row.summary,
    note: row.note,
    reviewUrl: row.review_url,
    status: row.status as ProposalStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    originClientId: row.origin_client_id,
  };
}

/** Never throws. A proposal list that fails to load must not take /schedule down. */
export async function listPendingProposalsForViewer(): Promise<Proposal[]> {
  const client = await createServerSupabaseClient();
  if (!client) return [];

  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await client.rpc("list_plan_proposals");
  if (error || !data) return [];
  return data.map(rowToProposal);
}
