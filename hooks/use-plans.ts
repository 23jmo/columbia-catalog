"use client";

import { useSyncExternalStore } from "react";

import { planStore } from "@/lib/schedule/plans";
import type { Plan, TermCode } from "@/lib/types";

/**
 * The plan list for a term, re-rendering on every mutation.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the plan store
 * is a genuine external store with a subscribe function, and React's own
 * primitive is the only thing that gets tearing right when a mutation lands
 * between render and commit — which is exactly what happens when a drag drops
 * a section and the grid re-reads the store in the same tick.
 *
 * The snapshot has to be referentially stable or React loops forever, so the
 * store's array is cached and only replaced when a mutation fires.
 */
let cachedTerm: TermCode | null = null;
let cachedSnapshot: Plan[] = [];
let cachedVersion = -1;
let version = 0;

planStore.subscribe(() => {
  version += 1;
});

function snapshotFor(termCode: TermCode): Plan[] {
  if (cachedTerm !== termCode || cachedVersion !== version) {
    cachedTerm = termCode;
    cachedVersion = version;
    cachedSnapshot = planStore.listPlans(termCode);
  }
  return cachedSnapshot;
}

/** Server render has no localStorage, so it sees an empty, stable list. */
const SERVER_SNAPSHOT: Plan[] = [];

export function usePlans(termCode: TermCode): Plan[] {
  return useSyncExternalStore(
    (onChange) => planStore.subscribe(onChange),
    () => snapshotFor(termCode),
    () => SERVER_SNAPSHOT,
  );
}
