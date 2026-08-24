"use client";

import { useEffect, useRef } from "react";

import { useBookmarks } from "@/hooks/use-bookmarks";
import { ensureBookmarksLoaded, onBookmarksRemoved, resetBookmarks } from "@/lib/bookmarks/store";
import { getBrowserClient, isConfigured } from "@/lib/db/client";
import { toast } from "@/lib/toast/store";
import { forgetWatches } from "@/lib/watchlist/store";

/**
 * Keeps the bookmark store tied to the current identity, and reports its
 * rollbacks.
 *
 * The store is module-level, which is what lets every bookmark icon on a page
 * agree — and also what makes it outlive a sign-out. Without this, signing out
 * would leave the previous account's saved classes rendered as saved, and the
 * next person on a shared library machine would be looking at someone else's
 * shortlist. That is a privacy failure, not a stale cache.
 *
 * Errors surface here rather than at each icon for the same reason they do in
 * `WatchlistProvider`: a rolled-back save just un-fills the star, which reads
 * as a misclick instead of as a refusal. Reporting it once, centrally, means
 * twelve icons for one failed write produce one message.
 *
 * It is also where the two stores are introduced to each other. Removing a
 * bookmark cascades its watch away in Postgres, and the watchlist store has no
 * way to hear about that; wiring it up here keeps `lib/bookmarks/store.ts`
 * from importing the realtime seat subscription just to mirror a foreign key.
 *
 * `TOKEN_REFRESHED` is ignored deliberately — it fires on a timer with the
 * same user behind it, and reloading every hour would flicker every icon on
 * screen for no reason.
 *
 * Renders nothing. Mounted once, in the app shell.
 */
export function BookmarkProvider() {
  const { error } = useBookmarks();
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!error || error === reported.current) {
      if (!error) reported.current = null;
      return;
    }
    reported.current = error;
    toast.error({
      title: "Couldn't update your saved classes",
      description: error,
      dedupeKey: "bookmark-error",
    });
  }, [error]);

  // Mirrors `watches`' `on delete cascade` into the watchlist store, so a
  // removed bookmark stops claiming its bell is still on.
  useEffect(() => onBookmarksRemoved(forgetWatches), []);

  useEffect(() => {
    if (!isConfigured()) return;
    const supabase = getBrowserClient();
    if (!supabase) return;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      resetBookmarks();
      // `useBookmarks`' own load effect has already run and will not run
      // again, so the reload after an identity change has to be explicit.
      void ensureBookmarksLoaded();
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
