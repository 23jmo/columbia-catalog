/**
 * Server-side plan reads.
 *
 * `lib/db/plan-sync.ts` is the browser half — it pulls the canonical list into
 * `planStore` and pushes edits back. This is the other direction: Home and
 * `/schedule` render on the server, and a server component cannot see
 * localStorage, so it has to ask the database directly.
 *
 * Same RPC (`list_user_plans`), different client. The RPC is `security
 * invoker` over an RLS'd table, so it answers for whoever is holding the
 * cookie and cannot be talked into returning someone else's plans — which is
 * why the user id is never a parameter here.
 *
 * A signed-out reader gets `null`, which is the correct answer rather than an
 * error: reads are free in this product, but a plan belongs to an account.
 */

import type { Plan, TermCode } from "@/lib/types";

import { createServerSupabaseClient } from "./client";

function isPlanArray(value: unknown): value is Plan[] {
  return Array.isArray(value) && value.every((plan) => typeof plan === "object" && plan !== null);
}

/**
 * Every saved plan for the signed-in student in one term, newest ordering as
 * the server returns it. Empty is a legitimate answer; `null` means nobody is
 * signed in or Supabase is not configured.
 */
export async function listPlansForViewer(termCode: TermCode): Promise<Plan[] | null> {
  const client = await createServerSupabaseClient();
  if (!client) return null;

  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await client.rpc("list_user_plans", { p_term_code: termCode });
  if (error) return null;
  return isPlanArray(data) ? data : [];
}

/**
 * The plan a schedule surface should render.
 *
 * "Primary" is a property of the plan, not of the ordering, so it is read
 * rather than assumed — but a student who has plans and none marked primary
 * still gets one instead of an empty screen, because "you have no schedule" is
 * a worse lie than "here is the first one".
 */
export async function getPrimaryPlanForViewer(termCode: TermCode): Promise<Plan | null> {
  const plans = await listPlansForViewer(termCode);
  if (!plans || plans.length === 0) return null;
  return plans.find((plan) => plan.isPrimary) ?? plans[0];
}
