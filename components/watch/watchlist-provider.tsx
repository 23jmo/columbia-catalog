"use client";

import { useEffect } from "react";

import { getBrowserClient, isConfigured } from "@/lib/db/client";
import { ensureWatchlistLoaded, resetWatchlist } from "@/lib/watchlist/store";

/**
 * Keeps the watchlist store tied to the current identity.
 *
 * The store is module-level, which is what lets every watch button agree — but
 * it also means it outlives a sign-out. Without this, signing out would leave
 * the previous account's watched sections rendered as watched, and the next
 * person to use the browser would see someone else's watchlist. That is a
 * privacy failure, not a stale cache.
 *
 * `TOKEN_REFRESHED` is ignored deliberately: it fires on a timer with the same
 * user behind it, and reloading the watchlist every hour for no reason would
 * flicker every button on screen.
 *
 * Renders nothing. It is mounted once in the app shell.
 */
export function WatchlistProvider() {
  useEffect(() => {
    void ensureWatchlistLoaded();

    if (!isConfigured()) return;
    const supabase = getBrowserClient();
    if (!supabase) return;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      resetWatchlist();
      void ensureWatchlistLoaded();
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
