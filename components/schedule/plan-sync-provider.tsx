"use client";

import { useEffect } from "react";

import { useSessionAccount } from "@/hooks/use-session-account";
import { CURRENT_TERM } from "@/lib/constants";
import { isConfigured } from "@/lib/db/client";
import { startPlanSync } from "@/lib/db/plan-sync";
import { setAuthGuard } from "@/lib/schedule/plans";
import type { TermCode } from "@/lib/types";

/**
 * Mounts plan write-through sync for the session.
 *
 * Renders nothing. It exists because the sync has to start once per browser
 * session and stop cleanly, and a component's lifecycle is the only thing in a
 * React app that reliably models that — a module-level side effect would run
 * during SSR, where there is no session and no localStorage.
 *
 * `startPlanSync` is idempotent, so strict mode's double-mount cannot produce
 * two subscriptions and therefore two pushes per edit.
 */
export function PlanSyncProvider({ termCode = CURRENT_TERM }: { termCode?: TermCode }) {
  const { account, isLoading } = useSessionAccount();

  useEffect(() => startPlanSync(termCode), [termCode]);

  /*
   * Spec §15: reads are free, writes need an account. `planStore` refuses a
   * write when this guard says no, and the guard is installed here because
   * this is the one component that is already mounted for the whole session
   * and already knows who is signed in.
   *
   * Two deliberate choices:
   *
   *   · While `isLoading`, writes are ALLOWED. The session arrives a beat
   *     after first paint, and refusing during that window would reject the
   *     click of someone who is signed in — the failure that looks like a bug
   *     rather than a rule.
   *
   *   · With Supabase unconfigured, writes are allowed and stay local. A
   *     deployment with no auth backend should still be a usable planner, not
   *     a read-only catalog with buttons that can never work.
   */
  useEffect(() => {
    setAuthGuard(() =>
      !isConfigured() || isLoading || account !== null
        ? { allowed: true }
        : { allowed: false, reason: "Sign in with your Columbia email to save a schedule." },
    );
    return () => setAuthGuard(() => ({ allowed: true }));
  }, [account, isLoading]);

  return null;
}
