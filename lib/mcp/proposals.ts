/**
 * Pending diffs — the mechanism behind "agents propose, they do not act".
 *
 * Spec §16, Agent authority: `add_section` and `remove_section` create a
 * pending diff that surfaces in the app for accept/reject rather than mutating
 * a saved plan. Nothing changes without a human click.
 *
 * A proposal is therefore a *record of intent*. Creating one touches no plan
 * row. The only code that may turn a proposal into a plan change is the app's
 * own accept handler, running in a session the student is sitting in front of.
 *
 * ── PERSISTENCE SEAM ───────────────────────────────────────────────────────
 * The default store below is in-memory and per-process. It is correct, it is
 * fully exercised by tests, and it is NOT durable — a serverless cold start
 * drops it. The database lane replaces `createInMemoryProposalStore()` with a
 * Supabase-backed store over a `plan_proposals` table:
 *
 *   plan_proposals(proposal_id pk, user_id, plan_id, kind, section_id,
 *                  course_id, summary, status, origin_client_id,
 *                  created_at, expires_at, resolved_at)
 *   RLS: user_id = auth.uid()
 *
 * Nothing outside this file needs to change: everything depends on the
 * `ProposalStore` interface, and `lib/mcp/adapters.ts` picks the impl.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { PROPOSAL_REVIEW_PATH } from "./config";

export type ProposalKind = "add_section" | "remove_section";

export type ProposalStatus = "pending" | "accepted" | "rejected" | "expired";

export interface Proposal {
  proposalId: string;
  /** Owner. Every read is scoped by this — a proposal is never cross-visible. */
  userId: string;
  planId: string;
  kind: ProposalKind;
  sectionId: string;
  courseId: string | null;
  /** One human sentence, rendered verbatim in the app's review card. */
  summary: string;
  /** Optional rationale the agent supplied, shown as the agent's reasoning. */
  note: string | null;
  /** Deep link the agent hands back so the student can go accept or reject. */
  reviewUrl: string;
  status: ProposalStatus;
  createdAt: string;
  expiresAt: string;
  /** Which OAuth client proposed this, so the review card can name the agent. */
  originClientId: string;
}

export interface CreateProposalInput {
  userId: string;
  planId: string;
  kind: ProposalKind;
  sectionId: string;
  courseId: string | null;
  summary: string;
  note?: string | null;
  originClientId: string;
  baseUrl: string;
}

export interface ProposalStore {
  create(input: CreateProposalInput): Promise<Proposal>;
  /** Pending proposals for one user, newest first. Never another user's. */
  listPending(userId: string): Promise<Proposal[]>;
  get(userId: string, proposalId: string): Promise<Proposal | null>;
  /**
   * Called by the APP, from a human click — never by a tool handler. Returns
   * the resolved proposal so the caller can apply the diff itself.
   */
  resolve(
    userId: string,
    proposalId: string,
    status: Exclude<ProposalStatus, "pending">,
  ): Promise<Proposal | null>;
}

/** A proposal a student never looks at goes stale rather than lingering. */
export const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function proposalReviewUrl(baseUrl: string, proposalId: string): string {
  return `${baseUrl}${PROPOSAL_REVIEW_PATH}?proposal=${encodeURIComponent(proposalId)}`;
}

function newProposalId(): string {
  // crypto.randomUUID is available in Node 18+ and every Next runtime we target.
  return `prop_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/**
 * In-memory ProposalStore. See the persistence seam note at the top of the file.
 */
export function createInMemoryProposalStore(): ProposalStore {
  const byId = new Map<string, Proposal>();

  function expireIfStale(p: Proposal, now: number): Proposal {
    if (p.status === "pending" && Date.parse(p.expiresAt) <= now) {
      const expired: Proposal = { ...p, status: "expired" };
      byId.set(p.proposalId, expired);
      return expired;
    }
    return p;
  }

  return {
    async create(input) {
      const now = Date.now();
      const proposalId = newProposalId();
      const proposal: Proposal = {
        proposalId,
        userId: input.userId,
        planId: input.planId,
        kind: input.kind,
        sectionId: input.sectionId,
        courseId: input.courseId,
        summary: input.summary,
        note: input.note ?? null,
        reviewUrl: proposalReviewUrl(input.baseUrl, proposalId),
        status: "pending",
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + PROPOSAL_TTL_MS).toISOString(),
        originClientId: input.originClientId,
      };
      byId.set(proposalId, proposal);
      return { ...proposal };
    },

    async listPending(userId) {
      const now = Date.now();
      return [...byId.values()]
        .filter((p) => p.userId === userId)
        .map((p) => expireIfStale(p, now))
        .filter((p) => p.status === "pending")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((p) => ({ ...p }));
    },

    async get(userId, proposalId) {
      const found = byId.get(proposalId);
      // Ownership check before existence is leaked.
      if (!found || found.userId !== userId) return null;
      return { ...expireIfStale(found, Date.now()) };
    },

    async resolve(userId, proposalId, status) {
      const found = byId.get(proposalId);
      if (!found || found.userId !== userId) return null;
      if (found.status !== "pending") return { ...found };
      const resolved: Proposal = { ...found, status };
      byId.set(proposalId, resolved);
      return { ...resolved };
    },
  };
}
