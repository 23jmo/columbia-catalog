"use client";

import { useEffect } from "react";

import { CURRENT_TERM } from "@/lib/constants";
import { startPlanSync } from "@/lib/db/plan-sync";
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
  useEffect(() => startPlanSync(termCode), [termCode]);
  return null;
}
