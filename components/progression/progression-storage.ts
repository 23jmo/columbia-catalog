/**
 * The progression plan's browser-side store.
 *
 * `localStorage` is an external store shared with every other tab, so it is
 * read through `useSyncExternalStore` rather than copied into React state by an
 * effect. That is not a lint workaround — it is what the API is for, and it
 * buys three things an effect does not: no cascading render on mount, a server
 * snapshot that makes SSR and first paint agree by construction, and a plan
 * that stays in step when the student has the page open twice.
 *
 * The snapshot is the raw string, deliberately. `useSyncExternalStore` compares
 * snapshots by identity, and returning a freshly-parsed object each call would
 * loop forever. Parsing happens once above, memoized on the string.
 */

import type { FourYearPlan } from "@/lib/progression/plan";

export const STORAGE_KEY = "columbia-catalog:progression:v1";

export interface StoredProgression {
  completed: string[];
  plan: FourYearPlan;
}

const listeners = new Set<() => void>();

/**
 * Mirrors what we last wrote. Reading `localStorage` on every `getSnapshot`
 * would be correct but is called on every render; this keeps it to actual
 * changes, and the `storage` event refreshes it when another tab writes.
 */
let snapshot: string | null = null;
let initialized = false;

function readFromStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode, or storage disabled entirely. An unsaved plan still works.
    return null;
  }
}

export function subscribeToProgression(onChange: () => void): () => void {
  listeners.add(onChange);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    snapshot = readFromStorage();
    listeners.forEach((listener) => listener());
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getProgressionSnapshot(): string | null {
  if (!initialized) {
    snapshot = readFromStorage();
    initialized = true;
  }
  return snapshot;
}

/** The server has no storage, so it always renders the empty plan. */
export function getProgressionServerSnapshot(): string | null {
  return null;
}

export function writeProgression(value: StoredProgression): void {
  const serialized = JSON.stringify(value);
  snapshot = serialized;
  initialized = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Quota or private mode: keep the in-memory snapshot so the session still
    // behaves, and accept that it will not survive a reload.
  }
  listeners.forEach((listener) => listener());
}

/** Never throws: a corrupt or foreign value reads as "nothing saved". */
export function parseProgression(raw: string | null): StoredProgression | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProgression>;
    if (!Array.isArray(parsed.completed) || !parsed.plan?.terms?.length) return null;
    return { completed: parsed.completed, plan: parsed.plan };
  } catch {
    return null;
  }
}
