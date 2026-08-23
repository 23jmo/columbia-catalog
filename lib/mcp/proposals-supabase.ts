/**
 * The durable `ProposalStore` — spec §16's "agents propose, they do not act",
 * surviving a cold start.
 *
 * The in-memory store in `proposals.ts` is correct and fully tested, and on
 * Vercel it is also invisible: an agent proposes on one lambda instance, the
 * student opens the review link, that request lands on another instance, and
 * the proposal is not there. The agent reported success. Nothing exists. That
 * is a worse outcome than an error, because nobody is told.
 *
 * ── Which client to hand this ──────────────────────────────────────────────
 *
 * Two callers, two identities:
 *
 *   · The MCP server authenticates the student against its OWN OAuth tokens
 *     (`lib/mcp/auth.ts`) and never holds a Supabase session, so it passes the
 *     service-role client and this module scopes every statement by `userId`
 *     itself. The filter is not optional and not a convenience — it is the
 *     ownership check.
 *
 *   · The app's review UI has a real Supabase cookie session, so it passes a
 *     session client and RLS enforces the same rule underneath.
 *
 * ── Why `resolve` goes through an RPC ──────────────────────────────────────
 *
 * `resolve_plan_proposal` is the only path that may move a proposal out of
 * `pending`, and `plan_proposals` deliberately has no update policy at all.
 * Accepting is the human's act — it is what separates a proposal from a
 * command — so it does not share a code path with anything a tool handler can
 * reach. No tool handler calls `resolve`, and the store makes that structural
 * rather than a convention: the RPC reads `auth.uid()` for itself, so a
 * service-role client (the one the MCP server holds) resolves nothing.
 */

import type { CatalogClient } from "@/lib/db/client";
import type { PlanProposalRow } from "@/lib/db/schema";
import {
  PROPOSAL_TTL_MS,
  proposalReviewUrl,
  type CreateProposalInput,
  type Proposal,
  type ProposalStatus,
  type ProposalStore,
} from "./proposals";

/** The row shape lives in `lib/db/schema.ts`, next to every other table. */
type ProposalRow = PlanProposalRow;

function rowToProposal(row: ProposalRow): Proposal {
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

function newProposalId(): string {
  return `prop_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/** Stale-on-read, matching the in-memory store rather than trusting the column. */
function withLazyExpiry(proposal: Proposal, now: number): Proposal {
  if (proposal.status === "pending" && Date.parse(proposal.expiresAt) <= now) {
    return { ...proposal, status: "expired" };
  }
  return proposal;
}

export function createSupabaseProposalStore(client: CatalogClient): ProposalStore {
  const table = () => client.from("plan_proposals");

  return {
    async create(input: CreateProposalInput): Promise<Proposal> {
      const now = Date.now();
      const proposalId = newProposalId();
      const row: ProposalRow = {
        proposal_id: proposalId,
        user_id: input.userId,
        plan_id: input.planId,
        kind: input.kind,
        section_id: input.sectionId,
        course_id: input.courseId,
        summary: input.summary,
        note: input.note ?? null,
        review_url: proposalReviewUrl(input.baseUrl, proposalId),
        status: "pending",
        origin_client_id: input.originClientId,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + PROPOSAL_TTL_MS).toISOString(),
        resolved_at: null,
      };

      const { error } = await table().insert(row);
      /*
       * A failed insert must throw. `add_section` tells the agent "proposed,
       * here is the link to review it", and returning a Proposal object we
       * never stored would make that sentence a lie the student discovers by
       * clicking a dead link.
       */
      if (error) throw new Error(`could not record proposal: ${error.message}`);
      return rowToProposal(row);
    },

    async listPending(userId: string): Promise<Proposal[]> {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .overrideTypes<ProposalRow[], { merge: false }>();
      if (error) return [];

      const now = Date.now();
      return (data ?? [])
        .map((row) => withLazyExpiry(rowToProposal(row), now))
        .filter((proposal) => proposal.status === "pending");
    },

    async get(userId: string, proposalId: string): Promise<Proposal | null> {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .eq("proposal_id", proposalId)
        .maybeSingle()
        .overrideTypes<ProposalRow | null, { merge: false }>();
      // Ownership is in the filter, so "not yours" and "not there" are one case
      // — the id space stays unprobeable.
      if (error || !data) return null;
      return withLazyExpiry(rowToProposal(data), Date.now());
    },

    async resolve(
      userId: string,
      proposalId: string,
      status: Exclude<ProposalStatus, "pending">,
    ): Promise<Proposal | null> {
      const { data, error } = await client
        .rpc("resolve_plan_proposal", { p_proposal_id: proposalId, p_status: status })
        .overrideTypes<ProposalRow[], { merge: false }>();
      if (error) return null;

      const row = (data ?? [])[0];
      if (!row) return null;
      /*
       * The RPC already scoped by `auth.uid()`. Re-checking against the userId
       * the caller believes it is acting for turns a mismatch between the two
       * into a refusal rather than a silent cross-account write.
       */
      if (row.user_id !== userId) return null;
      return rowToProposal(row);
    },
  };
}
