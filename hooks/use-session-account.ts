"use client";

import { useEffect, useState } from "react";

import { getBrowserClient, isConfigured } from "@/lib/db/client";
import { toSessionAccount, type SessionAccount } from "@/lib/db/auth";

export interface SessionState {
  account: SessionAccount | null;
  /** True until the first auth answer arrives. */
  isLoading: boolean;
}

/**
 * The signed-in student, live.
 *
 * ── Why this is a hook and not a server-rendered prop ──────────────────────
 *
 * The account control lives in `AppShell`, which is rendered from the root
 * layout. Threading a session down to it would make the layout dynamic, and a
 * dynamic root layout opts every page in the app out of static rendering — for
 * a name and an avatar in the corner. The catalog is world-readable and the
 * pages are worth caching, so the session is fetched in the browser instead.
 *
 * The trade is a brief signed-out flash on first paint, which is why
 * `isLoading` exists: the shell renders a neutral state rather than asserting
 * "Not signed in" to someone who is.
 *
 * `onAuthStateChange` keeps this correct across sign-in, sign-out, token
 * refresh, and a second tab signing out — the session lives in a cookie shared
 * by every tab, so a stale one would otherwise keep showing a name that no
 * longer authorizes anything.
 */
export function useSessionAccount(): SessionState {
  // Seeded from `isConfigured()`, which reads only environment variables and is
  // therefore identical on the server and the client — no hydration mismatch.
  // When Supabase is absent there is no session to wait for, so the hook starts
  // settled rather than flipping a loading flag from inside an effect.
  const [state, setState] = useState<SessionState>(() => ({
    account: null,
    isLoading: isConfigured(),
  }));

  useEffect(() => {
    // `getBrowserClient()` touches document.cookie, so it is called here rather
    // than during render — this effect never runs on the server.
    const client = isConfigured() ? getBrowserClient() : null;
    if (!client) return;

    let active = true;

    // getUser() validates against Supabase rather than trusting the cookie.
    client.auth.getUser().then(({ data }) => {
      if (!active) return;
      setState({
        account: data.user ? toSessionAccount(data.user) : null,
        isLoading: false,
      });
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({
        account: session?.user ? toSessionAccount(session.user) : null,
        isLoading: false,
      });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
