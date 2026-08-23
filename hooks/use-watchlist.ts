"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  ensureWatchlistLoaded,
  getWatchlistServerSnapshot,
  getWatchlistSnapshot,
  subscribeWatchlist,
  trackWatcherCounts,
  type WatchlistSnapshot,
} from "@/lib/watchlist/store";

/**
 * Reads the shared watchlist store.
 *
 * `useSyncExternalStore` rather than an effect-plus-state pair, for the same
 * reason as `usePlans`: it has the right tearing semantics when a toggle lands
 * between render and commit — which is precisely what happens when someone
 * hammers a watch button during registration.
 *
 * Pass the section ids on screen and their public watcher counts are fetched
 * once, deduped across every component that asks. Counts are the fairness
 * signal spec §14 insists on showing upfront, so they are loaded eagerly with
 * the list rather than behind a hover or a click.
 */
export function useWatchlist(sectionIds?: readonly string[]): WatchlistSnapshot {
  const snapshot = useSyncExternalStore(
    subscribeWatchlist,
    getWatchlistSnapshot,
    getWatchlistServerSnapshot,
  );

  useEffect(() => {
    void ensureWatchlistLoaded();
  }, []);

  // A stable string key: a new array identity on every render would refetch
  // counts on every keystroke elsewhere on the page.
  const key = sectionIds?.join(",") ?? "";
  useEffect(() => {
    if (!key) return;
    void trackWatcherCounts(key.split(","));
  }, [key]);

  return snapshot;
}
