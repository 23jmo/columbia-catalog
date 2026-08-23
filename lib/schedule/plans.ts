/**
 * Schedule lane — plan storage.
 *
 * Spec §8: multiple named plans, exactly one primary. "Plan A", "if I don't get
 * Op Systems", "dream schedule". Primary is what Home renders.
 *
 * ── The Supabase seam ──────────────────────────────────────────────────────
 * Everything below the `PlanStore` interface is a localStorage implementation
 * standing in for the `plans` table. To swap it, implement `PlanStore` against
 * Supabase and change `planStore` to point at it. No caller — not the grid, not
 * the tabs, not the MCP lane — imports anything but the interface, `planStore`,
 * and the pure helpers at the bottom of this file.
 *
 * TODO(db): replace `LocalPlanStore` with a Supabase-backed store.
 *
 * ── Auth ───────────────────────────────────────────────────────────────────
 * Spec §15: writes require an account, reads are free. `setAuthGuard` is the
 * hook point. Until the auth lane lands, the default guard allows writes so the
 * planner is usable signed-out; flipping it to a real session check is a
 * one-function change and every mutation already routes through it.
 *
 * TODO(auth): wire `setAuthGuard` to the Supabase session in the app shell.
 */

import type { CustomBlock, Plan, TermCode, Weekday } from "../types";
import { CURRENT_TERM } from "../constants";

/** Storage key. Versioned so a shape change can be detected, not silently misread. */
const STORAGE_KEY = "columbia-catalog.plans.v1";

/**
 * Owner id used for plans made before sign-in. Once auth lands these are the
 * rows that get claimed by the real user id on first login.
 */
export const LOCAL_USER_ID = "local";

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

export interface AuthGuardResult {
  allowed: boolean;
  /** Shown to the student when a write is refused. */
  reason?: string;
}

export type AuthGuard = () => AuthGuardResult;

// TODO(auth): default allows local-only writes. Replace with a session check.
let authGuard: AuthGuard = () => ({ allowed: true });

export function setAuthGuard(guard: AuthGuard): void {
  authGuard = guard;
}

/** Thrown when a write is attempted without the account spec §15 requires. */
export class PlanWriteDeniedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PlanWriteDeniedError";
  }
}

function assertCanWrite(): void {
  const verdict = authGuard();
  if (!verdict.allowed) {
    throw new PlanWriteDeniedError(verdict.reason ?? "Sign in to save changes to a plan.");
  }
}

// ---------------------------------------------------------------------------
// The interface Supabase will implement
// ---------------------------------------------------------------------------

export interface CreatePlanInput {
  name: string;
  termCode?: TermCode;
  sectionIds?: string[];
  customBlocks?: CustomBlock[];
  /** First plan in a term becomes primary regardless. */
  isPrimary?: boolean;
}

export interface PlanStore {
  listPlans(termCode?: TermCode): Plan[];
  getPlan(planId: string): Plan | null;
  getPrimaryPlan(termCode?: TermCode): Plan | null;

  createPlan(input: CreatePlanInput): Plan;
  renamePlan(planId: string, name: string): Plan;
  duplicatePlan(planId: string, name?: string): Plan;
  deletePlan(planId: string): void;
  setPrimaryPlan(planId: string): Plan;

  setSections(planId: string, sectionIds: string[]): Plan;
  addSection(planId: string, sectionId: string): Plan;
  removeSection(planId: string, sectionId: string): Plan;

  upsertBlock(planId: string, block: CustomBlock): Plan;
  removeBlock(planId: string, blockId: string): Plan;

  /**
   * Replaces every plan in one term with the given list, in a single write.
   *
   * This is the sync path, not an editing operation — `lib/db/plan-sync.ts`
   * calls it to adopt the server's canonical list after a pull or a push. It
   * bypasses the auth guard for the same reason: it is applying state that the
   * server has already accepted, not asking to create any.
   *
   * Plans in other terms are untouched, so adopting Fall 2026 cannot silently
   * delete a Spring 2027 draft.
   */
  replaceAll(termCode: TermCode, plans: readonly Plan[]): Plan[];

  /** Fires after any mutation. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

// ---------------------------------------------------------------------------
// Pure helpers — no storage, safe to unit test and to reuse server-side
// ---------------------------------------------------------------------------

export function newPlanId(): string {
  return `plan_${randomToken()}`;
}

export function newBlockId(): string {
  return `block_${randomToken()}`;
}

function randomToken(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
}

export function makeBlock(
  label: string,
  weekday: Weekday,
  startMinute: number,
  endMinute: number,
): CustomBlock {
  return { blockId: newBlockId(), label, weekday, startMinute, endMinute };
}

/**
 * Exactly one primary per term.
 *
 * Two plans marked primary is worse than none — Home would pick arbitrarily and
 * the student would never know which one they were looking at. This is applied
 * on every write, so corrupted storage self-heals on the next edit.
 */
export function enforceSinglePrimary(plans: readonly Plan[]): Plan[] {
  const byTerm = new Map<TermCode, Plan[]>();
  for (const plan of plans) {
    const list = byTerm.get(plan.termCode);
    if (list) list.push(plan);
    else byTerm.set(plan.termCode, [plan]);
  }

  const primaryIds = new Set<string>();
  for (const group of byTerm.values()) {
    const declared = group.filter((plan) => plan.isPrimary);
    const winner = declared[0] ?? group[0];
    if (winner) primaryIds.add(winner.planId);
  }

  return plans.map((plan) => ({ ...plan, isPrimary: primaryIds.has(plan.planId) }));
}

/** "Plan A" → "Plan A (copy)", "Plan A (copy)" → "Plan A (copy 2)". */
export function copyName(name: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  const base = `${name} (copy)`;
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${name} (copy ${n})`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${name} (copy ${randomToken()})`;
}

/** Names a new plan "Plan A", "Plan B", … skipping anything already used. */
export function nextPlanName(existing: readonly string[]): string {
  const taken = new Set(existing);
  for (let i = 0; i < 26; i += 1) {
    const candidate = `Plan ${String.fromCharCode(65 + i)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `Plan ${randomToken()}`;
}

// ---------------------------------------------------------------------------
// localStorage implementation
// ---------------------------------------------------------------------------

function isPlan(value: unknown): value is Plan {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as Partial<Plan>;
  return (
    typeof plan.planId === "string" &&
    typeof plan.name === "string" &&
    typeof plan.termCode === "string" &&
    Array.isArray(plan.sectionIds) &&
    Array.isArray(plan.customBlocks)
  );
}

export class LocalPlanStore implements PlanStore {
  private listeners = new Set<() => void>();
  /** Mirrors storage so reads work during SSR and when storage is unavailable. */
  private cache: Plan[] | null = null;

  private storage(): Storage | null {
    try {
      if (typeof window === "undefined") return null;
      return window.localStorage;
    } catch {
      // Private browsing and some embedded webviews throw on access.
      return null;
    }
  }

  private read(): Plan[] {
    if (this.cache) return this.cache;
    const storage = this.storage();
    if (!storage) {
      this.cache = [];
      return this.cache;
    }
    try {
      const raw = storage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const plans = Array.isArray(parsed) ? parsed.filter(isPlan) : [];
      this.cache = enforceSinglePrimary(plans);
    } catch {
      // Never let a corrupted key take the schedule screen down.
      this.cache = [];
    }
    return this.cache;
  }

  private write(plans: Plan[]): void {
    const normalized = enforceSinglePrimary(plans);
    this.cache = normalized;
    const storage = this.storage();
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // Quota or private mode. The in-memory cache still holds this session.
      }
    }
    for (const listener of this.listeners) listener();
  }

  private require(planId: string): Plan {
    const plan = this.getPlan(planId);
    if (!plan) throw new Error(`No such plan: ${planId}`);
    return plan;
  }

  private replace(next: Plan): Plan {
    this.write(this.read().map((plan) => (plan.planId === next.planId ? next : plan)));
    return this.require(next.planId);
  }

  listPlans(termCode?: TermCode): Plan[] {
    const plans = this.read();
    return termCode ? plans.filter((plan) => plan.termCode === termCode) : [...plans];
  }

  replaceAll(termCode: TermCode, plans: readonly Plan[]): Plan[] {
    const others = this.read().filter((plan) => plan.termCode !== termCode);
    // Term code is forced rather than trusted: a server row is authoritative
    // about its own term, and a mislabelled plan would vanish from the tab it
    // was just adopted into.
    const adopted = plans.map((plan) => ({ ...plan, termCode }));
    this.write([...others, ...adopted]);
    return this.listPlans(termCode);
  }

  getPlan(planId: string): Plan | null {
    return this.read().find((plan) => plan.planId === planId) ?? null;
  }

  getPrimaryPlan(termCode: TermCode = CURRENT_TERM): Plan | null {
    const inTerm = this.listPlans(termCode);
    return inTerm.find((plan) => plan.isPrimary) ?? inTerm[0] ?? null;
  }

  createPlan(input: CreatePlanInput): Plan {
    assertCanWrite();
    const termCode = input.termCode ?? CURRENT_TERM;
    const existing = this.read();
    const firstInTerm = !existing.some((plan) => plan.termCode === termCode);
    const plan: Plan = {
      planId: newPlanId(),
      userId: LOCAL_USER_ID,
      termCode,
      name: input.name.trim() || nextPlanName(existing.map((p) => p.name)),
      isPrimary: input.isPrimary ?? firstInTerm,
      sectionIds: [...(input.sectionIds ?? [])],
      customBlocks: [...(input.customBlocks ?? [])],
    };
    // A newly declared primary demotes the incumbent before the write.
    const next = plan.isPrimary
      ? existing.map((p) => (p.termCode === termCode ? { ...p, isPrimary: false } : p))
      : [...existing];
    this.write([...next, plan]);
    return this.require(plan.planId);
  }

  renamePlan(planId: string, name: string): Plan {
    assertCanWrite();
    const plan = this.require(planId);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A plan needs a name.");
    return this.replace({ ...plan, name: trimmed });
  }

  duplicatePlan(planId: string, name?: string): Plan {
    assertCanWrite();
    const source = this.require(planId);
    const names = this.read().map((plan) => plan.name);
    const copy: Plan = {
      ...source,
      planId: newPlanId(),
      name: name?.trim() || copyName(source.name, names),
      // A duplicate is a hedge, not a replacement. It never steals primary.
      isPrimary: false,
      sectionIds: [...source.sectionIds],
      customBlocks: source.customBlocks.map((block) => ({ ...block, blockId: newBlockId() })),
    };
    this.write([...this.read(), copy]);
    return this.require(copy.planId);
  }

  deletePlan(planId: string): void {
    assertCanWrite();
    const plan = this.require(planId);
    const remaining = this.read().filter((candidate) => candidate.planId !== planId);
    // Deleting the primary promotes the next plan in the same term, so a term is
    // never left with plans but no primary.
    if (plan.isPrimary) {
      const heir = remaining.find((candidate) => candidate.termCode === plan.termCode);
      if (heir) heir.isPrimary = true;
    }
    this.write(remaining);
  }

  setPrimaryPlan(planId: string): Plan {
    assertCanWrite();
    const plan = this.require(planId);
    this.write(
      this.read().map((candidate) =>
        candidate.termCode === plan.termCode
          ? { ...candidate, isPrimary: candidate.planId === planId }
          : candidate,
      ),
    );
    return this.require(planId);
  }

  setSections(planId: string, sectionIds: string[]): Plan {
    assertCanWrite();
    const plan = this.require(planId);
    return this.replace({ ...plan, sectionIds: [...new Set(sectionIds)] });
  }

  addSection(planId: string, sectionId: string): Plan {
    assertCanWrite();
    const plan = this.require(planId);
    if (plan.sectionIds.includes(sectionId)) return plan;
    return this.replace({ ...plan, sectionIds: [...plan.sectionIds, sectionId] });
  }

  removeSection(planId: string, sectionId: string): Plan {
    assertCanWrite();
    const plan = this.require(planId);
    return this.replace({
      ...plan,
      sectionIds: plan.sectionIds.filter((id) => id !== sectionId),
    });
  }

  upsertBlock(planId: string, block: CustomBlock): Plan {
    assertCanWrite();
    const plan = this.require(planId);
    const exists = plan.customBlocks.some((candidate) => candidate.blockId === block.blockId);
    return this.replace({
      ...plan,
      customBlocks: exists
        ? plan.customBlocks.map((candidate) =>
            candidate.blockId === block.blockId ? block : candidate,
          )
        : [...plan.customBlocks, block],
    });
  }

  removeBlock(planId: string, blockId: string): Plan {
    assertCanWrite();
    const plan = this.require(planId);
    return this.replace({
      ...plan,
      customBlocks: plan.customBlocks.filter((block) => block.blockId !== blockId),
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Test seam: forget everything, including the in-memory mirror. */
  reset(): void {
    this.cache = null;
    const storage = this.storage();
    if (storage) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to do — the cache reset above is enough for this session.
      }
    }
    for (const listener of this.listeners) listener();
  }
}

/** The store every caller uses. Swap this line for the Supabase implementation. */
export const planStore: PlanStore & { reset(): void } = new LocalPlanStore();
