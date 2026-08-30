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
 *
 * `/about`, `/faq`, `/privacy`, and `/terms` are the public, no-login pages.
 * `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and `/llms-full.txt` are
 * crawler files. If any of those 307 to /onboarding, Googlebot stores the
 * school picker as robots.txt and the site cannot rank. Home (`/`) stays
 * gated: a returning student who types the origin still lands on Log in.
 *
 * ── `/course/` and `/instructor/` are open, and the rest is not ────────────
 *
 * These two are the app's shareable unit. `app/course/[courseId]/page.tsx`
 * says so in its own words — this URL "gets pasted into group chats during
 * registration week" — and it builds OpenGraph tags for exactly that. Sending
 * the person who clicks it into a five-screen wizard about their degree
 * wastes the link and, worse, teaches the person who posted it not to post
 * another one. Somebody answering "is Cannon's 3134 brutal" with a link needs
 * that link to answer the question, not to ask for an account.
 *
 * Nothing personal rides on either page. The bookmark store already treats a
 * missing session as `signed_out` rather than an error, on the stated grounds
 * that "not signed in is the ordinary case", and the save button already
 * offers `showSignInToast()` instead of failing. Conflict checks come from
 * `loadPrimaryPlanSnapshot`, which returns null with no plan and therefore
 * claims no clashes. So a guest gets the catalog, the seats and the reviews —
 * every fact that is true about the course regardless of who is reading.
 *
 * The feed stays behind the wall on purpose, and so do `/saved`, `/profile`
 * and `/schedule`. Those are answers about a specific student, they are what
 * the wizard is FOR, and giving them away would leave nothing to sign in for.
 * Search stays gated too — it is the catalog, and the nav no longer offers it.
 *
 * The trade is deliberate: reach over conversion rate. It is the right trade
 * for cold links arriving from Reddit at 1am during registration week, and it
 * would be the wrong one if traffic arrived pre-sold from an advisor.
 *
 * `/.well-known/` is here because the gate cannot see the rewrite. `vercel.ts`
 * maps those paths onto `/api/mcp/oauth/...`, but rewrites resolve after this
 * runs, so the path we match is still `/.well-known/...` and the `/api/` clause
 * above never fires. Without this an unauthenticated MCP client asking where to
 * authenticate is answered with a 307 to the wizard — and an OAuth discovery
 * document is by definition fetched by something that has no session yet, so
 * gating it makes the endpoint useless to the only caller it has.
 */
const CRAWLER_FILES = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
]);

function exactOrChild(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * Public HTML and crawler files. `proxy.ts` skips the session refresh
 * here so the response can stay `Cache-Control: public` instead of
 * picking up `private, no-store` from `getUser()`.
 */
export function isPublicMarketingPath(pathname: string): boolean {
  return (
    CRAWLER_FILES.has(pathname) ||
    exactOrChild(pathname, "/about") ||
    exactOrChild(pathname, "/faq") ||
    exactOrChild(pathname, "/privacy") ||
    exactOrChild(pathname, "/terms")
  );
}

export function isGuestAllowedPath(pathname: string): boolean {
  return (
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    isPublicMarketingPath(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/course/") ||
    pathname.startsWith("/instructor/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/.well-known/")
  );
}

/**
 * Where OAuth should land after a successful sign-in.
 *
 * A missing or home `next` is what happens when Supabase substitutes the
 * Site URL and drops our redirect. If they have not finished the wizard,
 * sending them to `/` skips the rest of onboarding — including the first
 * feed they just signed in to see. Keep them in the flow until the
 * completion cookie is set.
 *
 * That cookie must not outlive the account. Deleting the account (or
 * choosing "Redo onboarding") clears it; otherwise a re-sign-in after
 * delete looks "already done" and this function sends them home.
 */
export function postAuthPath(next: string, onboarded: boolean): string {
  if (next !== "/") return next;
  return onboarded ? "/" : "/onboarding";
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
