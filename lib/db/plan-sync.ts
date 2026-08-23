/**
 * Plan persistence — local-first, written through to Supabase.
 *
 * ── Why not just point `planStore` at Supabase ─────────────────────────────
 *
 * `PlanStore` is synchronous: `listPlans(): Plan[]`. That shape is load-bearing.
 * The schedule grid re-renders on every drag frame and the plan tabs read the
 * store during render; making those await a network call would turn a direct-
 * manipulation UI into a laggy one, and on campus wifi a dropped request would
 * strand a half-applied edit on screen.
 *
 * So localStorage stays the read path and Supabase is written through behind
 * it. The student's edit lands instantly; persistence catches up.
 *
 * ── The reconcile ──────────────────────────────────────────────────────────
 *
 * On sign-in the two sides can both hold plans, and the merge rule is:
 *
 *   remote has plans  → remote wins, local cache is replaced
 *   remote is empty   → local plans are claimed (pushed up), ids adopted
 *
 * Remote-wins is the safe direction. A student who plans on a laptop and then
 * opens their phone expects the laptop's work; the phone's empty local store
 * must never be pushed over it. The claim path is what makes signing in after
 * a session of anonymous planning non-destructive, which is the whole reason
 * `LOCAL_USER_ID` exists.
 *
 * Between devices, last write wins. Two phones editing the same term at once
 * will not merge — noted in .plans/BLOCKERS.md rather than papered over with a
 * conflict resolver nobody asked for.
 */

import { CURRENT_TERM } from "@/lib/constants";
import type { Plan, TermCode } from "@/lib/types";
import { planStore } from "@/lib/schedule/plans";

import { getBrowserClient, isConfigured } from "./client";
import type { Json } from "./schema";

/**
 * How long to wait after the last edit before pushing. Long enough that
 * dragging a section across the grid is one write and not thirty; short enough
 * that closing the tab a second later still saves.
 */
const PUSH_DEBOUNCE_MS = 700;

function isPlanArray(value: unknown): value is Plan[] {
  return Array.isArray(value) && value.every((p) => typeof p === "object" && p !== null);
}

/** Replaces the local cache with the canonical server list for a term. */
function adoptRemote(termCode: TermCode, plans: Plan[]): void {
  planStore.replaceAll(termCode, plans);
}

async function pull(termCode: TermCode): Promise<Plan[] | null> {
  const client = getBrowserClient();
  if (!client) return null;
  const { data, error } = await client.rpc("list_user_plans", { p_term_code: termCode });
  if (error) return null;
  return isPlanArray(data) ? data : [];
}

async function push(termCode: TermCode, plans: Plan[]): Promise<Plan[] | null> {
  const client = getBrowserClient();
  if (!client) return null;
  const { data, error } = await client.rpc("replace_user_plans", {
    p_term_code: termCode,
    // `Plan` is a plain data interface, but TypeScript interfaces have no
    // implicit index signature, so they do not structurally satisfy `Json`.
    // The value genuinely is JSON; the cast says so.
    p_plans: plans as unknown as Json,
  });
  if (error) return null;
  return isPlanArray(data) ? data : [];
}

// ---------------------------------------------------------------------------

let stopSync: (() => void) | null = null;

/**
 * Starts write-through sync for the signed-in user and returns a stop function.
 *
 * Idempotent: calling it twice does not double-subscribe, so React strict mode
 * remounting the provider cannot produce two pushes per edit.
 */
export function startPlanSync(termCode: TermCode = CURRENT_TERM): () => void {
  if (!isConfigured()) return () => undefined;
  if (stopSync) return stopSync;

  const client = getBrowserClient();
  if (!client) return () => undefined;

  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let signedIn = false;
  /** Suppresses the push that our own `adoptRemote` would otherwise trigger. */
  let applyingRemote = false;

  const schedulePush = () => {
    if (!signedIn || applyingRemote) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const local = planStore.listPlans(termCode);
      void push(termCode, local).then((canonical) => {
        // Adopting the response is what migrates offline `plan_*` ids to the
        // server's uuids, so the next push updates rather than re-inserts.
        if (!active || !canonical) return;
        applyingRemote = true;
        try {
          adoptRemote(termCode, canonical);
        } finally {
          applyingRemote = false;
        }
      });
    }, PUSH_DEBOUNCE_MS);
  };

  const reconcile = async () => {
    const remote = await pull(termCode);
    if (!active || !remote) return;

    applyingRemote = true;
    try {
      if (remote.length > 0) {
        adoptRemote(termCode, remote);
        return;
      }
      const local = planStore.listPlans(termCode);
      if (local.length === 0) return;
      const claimed = await push(termCode, local);
      if (active && claimed) adoptRemote(termCode, claimed);
    } finally {
      applyingRemote = false;
    }
  };

  const unsubscribeStore = planStore.subscribe(schedulePush);

  const { data: authSub } = client.auth.onAuthStateChange((event, session) => {
    const nowSignedIn = Boolean(session?.user);
    // TOKEN_REFRESHED fires on a timer and carries no state change; reconciling
    // on it would re-pull the whole term every hour for no reason.
    if (nowSignedIn && !signedIn && event !== "TOKEN_REFRESHED") {
      signedIn = true;
      void reconcile();
    } else if (!nowSignedIn) {
      signedIn = false;
      // Local plans are deliberately left in place on sign-out: they are the
      // student's work, and clearing them would look like data loss.
    }
  });

  stopSync = () => {
    active = false;
    if (timer) clearTimeout(timer);
    unsubscribeStore();
    authSub.subscription.unsubscribe();
    stopSync = null;
  };
  return stopSync;
}
