"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  ensureBookmarksLoaded,
  getBookmarkServerSnapshot,
  getBookmarkSnapshot,
  subscribeBookmarks,
  type BookmarkSnapshot,
} from "@/lib/bookmarks/store";

/**
 * Reads the shared bookmark store.
 *
 * `useSyncExternalStore` rather than an effect-plus-state pair, for the same
 * reason as `usePlans` and `useWatchlist`: it has the right tearing semantics
 * when a toggle lands between render and commit, which is precisely what
 * happens when someone saves three sections in a row during registration.
 *
 * The load is idempotent, so every bookmark icon on a page can call this
 * without coordinating — twenty icons produce one query.
 */
export function useBookmarks(): BookmarkSnapshot {
  const snapshot = useSyncExternalStore(
    subscribeBookmarks,
    getBookmarkSnapshot,
    getBookmarkServerSnapshot,
  );

  useEffect(() => {
    void ensureBookmarksLoaded();
  }, []);

  return snapshot;
}
