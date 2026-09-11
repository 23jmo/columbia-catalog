/**
 * Server-side schedule writes, for the in-app agent.
 *
 * ── Why this exists next to `plan-sync.ts` ─────────────────────────────────
 *
 * The browser owns the schedule: `planStore` is local-first and `plan-sync.ts`
 * writes it through. The chat runs on the server and has no localStorage, so
 * an "add this to my schedule" from the assistant has to land in the same
 * rows the sync writes to. This module is that path — the ONLY server-side
 * writer of `plan_items` — and it is scoped by an explicit `userId` from the
 * verified session, the same discipline as `plansAdapter`.
 *
 * The browser learns about the change by pulling: `/schedule` refreshes from
 * the server on mount, and the chat's confirmation card triggers the same
 * refresh when it renders. See `refreshPlansFromServer` in `plan-sync.ts`.
 */

import { CURRENT_TERM } from "@/lib/constants";
import type { TermCode } from "@/lib/types";

import { requireServiceRoleClient } from "./client";

export interface ScheduleWriteResult {
  planId: string;
  sectionIds: string[];
  /** False when the section was already there (add) or never was (remove). */
  changed: boolean;
}

async function primaryPlanId(userId: string, termCode: TermCode, create: boolean): Promise<string | null> {
  const db = requireServiceRoleClient();
  const { data, error } = await db
    .from("plans")
    .select("plan_id, is_primary, created_at")
    .eq("user_id", userId)
    .eq("term_code", termCode)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`primaryPlanId failed: ${error.message}`);
  if (data) return data.plan_id;
  if (!create) return null;

  const inserted = await db
    .from("plans")
    .insert({ user_id: userId, term_code: termCode, name: "My schedule", is_primary: true })
    .select("plan_id")
    .single();
  if (inserted.error) throw new Error(`create plan failed: ${inserted.error.message}`);
  return inserted.data.plan_id;
}

async function planSectionIds(planId: string): Promise<string[]> {
  const db = requireServiceRoleClient();
  const { data, error } = await db
    .from("plan_items")
    .select("section_id, position, added_at")
    .eq("plan_id", planId)
    .order("position", { ascending: true })
    .order("added_at", { ascending: true });
  if (error) throw new Error(`planSectionIds failed: ${error.message}`);
  return (data ?? []).map((row) => row.section_id);
}

export async function addSectionToSchedule(
  userId: string,
  sectionId: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<ScheduleWriteResult> {
  const db = requireServiceRoleClient();
  const planId = await primaryPlanId(userId, termCode, true);
  if (!planId) throw new Error("Could not find or create a schedule.");

  const before = await planSectionIds(planId);
  if (before.includes(sectionId)) return { planId, sectionIds: before, changed: false };

  const { error } = await db
    .from("plan_items")
    .insert({ plan_id: planId, section_id: sectionId, position: before.length });
  if (error) throw new Error(`addSectionToSchedule failed: ${error.message}`);

  return { planId, sectionIds: [...before, sectionId], changed: true };
}

export async function removeSectionFromSchedule(
  userId: string,
  sectionId: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<ScheduleWriteResult> {
  const db = requireServiceRoleClient();
  const planId = await primaryPlanId(userId, termCode, false);
  if (!planId) return { planId: "", sectionIds: [], changed: false };

  const before = await planSectionIds(planId);
  if (!before.includes(sectionId)) return { planId, sectionIds: before, changed: false };

  const { error } = await db
    .from("plan_items")
    .delete()
    .eq("plan_id", planId)
    .eq("section_id", sectionId);
  if (error) throw new Error(`removeSectionFromSchedule failed: ${error.message}`);

  return { planId, sectionIds: before.filter((id) => id !== sectionId), changed: true };
}
