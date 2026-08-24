"use client";

import { useEffect, useRef } from "react";

import { getBrowserClient, isConfigured } from "@/lib/db/client";
import { toast } from "@/lib/toast/store";
import { useWatchlist } from "@/hooks/use-watchlist";
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
 * It also reports the store's rollbacks. A watch toggle is optimistic, so a
 * refused write silently un-flips the button — which reads as a misclick
 * rather than as a failure, and leaves someone believing they are not being
 * emailed when they are, or the reverse. The store records the reason; this is
 * where it becomes something the reader can see.
 *
 * Renders nothing. It is mounted once in the app shell.
 */
export function WatchlistProvider() {
  const { error } = useWatchlist();
  const reported = useRef<string | null>(null);

  useEffect(() => {
    // Only report a change. The error survives in the snapshot until the next
    // successful mutation, and re-toasting it on every unrelated render would
    // make one failure look like many.
    if (!error || error === reported.current) {
      if (!error) reported.current = null;
      return;
    }
    reported.current = error;
    toast.error({
      title: "Couldn't update your watchlist",
      description: error,
      dedupeKey: "watchlist-error",
    });
  }, [error]);

  useEffect(() => {
    if (!isConfigured()) return;
    const supabase = getBrowserClient();
    if (!supabase) return;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      resetWatchlist();
      // `useWatchlist`'s own load effect has run already and will not run
      // again, so the reload after an identity change has to be explicit.
      void ensureWatchlistLoaded();
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
