"use client";

import { useEffect } from "react";

import { useSessionAccount } from "@/hooks/use-session-account";
import { CURRENT_TERM } from "@/lib/constants";
import { isConfigured } from "@/lib/db/client";
import { startPlanSync } from "@/lib/db/plan-sync";
import { setSectionAuthGuard } from "@/lib/schedule/plans";
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
   * Spec §15: reads are free; adding classes needs an account. Local plan
   * structure (create, rename, commitments) stays editable while signed out —
   * those edits live under `LOCAL_USER_ID` until sign-in claims them.
   *
   * Two deliberate choices:
   *
   *   · While `isLoading`, section writes are ALLOWED. The session arrives a
   *     beat after first paint, and refusing during that window would reject the
   *     click of someone who is signed in.
   *
   *   · With Supabase unconfigured, section writes are allowed and stay local.
   */
  useEffect(() => {
    setSectionAuthGuard(() =>
      !isConfigured() || isLoading || account !== null
        ? { allowed: true }
        : { allowed: false, reason: "Sign in with your Columbia or Barnard email to add classes." },
    );
    return () => setSectionAuthGuard(() => ({ allowed: true }));
  }, [account, isLoading]);

  return null;
}
