"use client";

import { useEffect, useState } from "react";

import { isConfigured } from "@/lib/db/env";
import type { SessionAccount } from "@/lib/db/auth";

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
 *
 * ── Why the Supabase client is imported inside the effect ──────────────────
 *
 * `@supabase/ssr` plus `@supabase/supabase-js` is 252 KB unminified — auth,
 * realtime, postgrest and storage, of which this hook uses auth. Importing it
 * at the top of the module put all of it in the entry chunk of every route that
 * renders an account control, which means it had to be downloaded and parsed
 * before React could hydrate.
 *
 * That is a bad trade everywhere and a very bad one on `/onboarding`, which
 * shows nothing until it hydrates: the first question waited on a realtime
 * client the wizard never opens. Loading it from the effect moves those bytes
 * after hydration, where the only thing they delay is a control that was going
 * to render its neutral state first regardless.
 *
 * `isConfigured()` stays a static import, from `lib/db/env` rather than
 * `lib/db/client` — the seed below has to be identical on the server and the
 * client to avoid a hydration mismatch, so it cannot wait for a promise. That
 * module reads environment variables and imports nothing.
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
    if (!isConfigured()) return;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const [{ getBrowserClient }, { toSessionAccount }] = await Promise.all([
        import("@/lib/db/client"),
        import("@/lib/db/auth"),
      ]);
      if (!active) return;

      // `getBrowserClient()` touches document.cookie, so it is called here
      // rather than during render — this effect never runs on the server.
      const client = getBrowserClient();
      if (!client) return;

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
      unsubscribe = () => subscription.subscription.unsubscribe();
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return state;
}
