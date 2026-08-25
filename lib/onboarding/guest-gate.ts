/**
 * Where a signed-out visitor is allowed to land.
 *
 * Unsigned traffic is sent to `/onboarding`. The gate lives in `proxy.ts`
 * because the decision has to happen before any page paints — bouncing after
 * render would flash the destination and then yank it away.
 *
 * APIs stay open: crawlers, auth, and search-index fetches are not a browsing
 * session, and wrapping them would break ingest and the OAuth callback.
 */

/** Search params that still mean something on `/onboarding`. */
const CARRIED_PARAMS = ["auth_error"] as const;

/**
 * True for paths a guest may hit without being marched through the wizard.
 *
 * `/onboarding` is the destination. `/auth/` is the OAuth round-trip.
 * `/api/` authorizes itself per route; a HTML-only gate must not sit in front
 * of the crawler or the agent.
 */
export function isGuestAllowedPath(pathname: string): boolean {
  return (
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/")
  );
}

/**
 * `/onboarding`, carrying only the query the wizard can actually show.
 *
 * A bounce from `/search?q=...` must not dump that query onto the first
 * question. `auth_error` is the exception: the callback used to send failures
 * to home, and home now redirects here.
 */
export function guestOnboardingLocation(url: URL): URL {
  const dest = new URL(url);
  dest.pathname = "/onboarding";
  dest.search = "";
  dest.hash = "";
  for (const name of CARRIED_PARAMS) {
    const value = url.searchParams.get(name);
    if (value) dest.searchParams.set(name, value);
  }
  return dest;
}
