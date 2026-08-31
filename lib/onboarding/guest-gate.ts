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
 * `/about`, `/faq`, `/privacy`, `/terms`, and `/programs` are the public,
 * no-login pages.
 * `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and `/llms-full.txt` are
 * crawler files. If any of those 307 to /onboarding, Googlebot stores the
 * school picker as robots.txt and the site cannot rank. `/google*.html` is
 * the Search Console URL-prefix check: Google fetches that path and
 * expects the verification string, not the school picker. Home (`/`) stays
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
 * ── `/search` is open, and it is the front door ────────────────────────────
 *
 * The catalog is the one surface a stranger can be handed without knowing
 * anything about them. It was gated on the grounds that "the nav no longer
 * offers it" — but the nav does offer it now, and gating it meant the only
 * thing a curious visitor could do with this product was answer five questions
 * about their degree before seeing a single course. That is a lot of trust to
 * ask for from a page they have not been shown yet.
 *
 * So a guest gets the whole catalog: every course, every filter, every seat
 * count, and the course pages the rows link into. What they do NOT get is
 * anything that answers a question about *them* — and the rail says so
 * out loud rather than 307-ing them mid-click. `components/shell/catalog-
 * sidebar.tsx` reads this very function to decide which tabs are locked, so
 * opening another route here unlocks its tab in the same commit.
 *
 * Personal relevance degrades rather than breaks: `catalogRelevanceAction`
 * reads the student first and returns `{ personalized: false }` when there is
 * no record, so a guest gets course order and no re-rank announcement.
 *
 * The feed stays behind the wall on purpose, and so do `/saved`, `/profile`
 * and `/schedule`. Those are answers about a specific student, they are what
 * the wizard is FOR, and giving them away would leave nothing to sign in for.
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
 * Search Console URL-prefix files live at `/google<token>.html`.
 * Google fetches the path and expects the verification line, so a 307
 * to the wizard fails the check.
 */
function isGoogleSiteVerificationPath(pathname: string): boolean {
  return /^\/google[^/]*\.html$/.test(pathname);
}

/**
 * Public HTML and crawler files. `proxy.ts` skips the session refresh
 * here so the response can stay `Cache-Control: public` instead of
 * picking up `private, no-store` from `getUser()`.
 */
export function isPublicMarketingPath(pathname: string): boolean {
  return (
    CRAWLER_FILES.has(pathname) ||
    isGoogleSiteVerificationPath(pathname) ||
    exactOrChild(pathname, "/about") ||
    exactOrChild(pathname, "/faq") ||
    exactOrChild(pathname, "/privacy") ||
    exactOrChild(pathname, "/terms") ||
    exactOrChild(pathname, "/programs")
  );
}

export function isGuestAllowedPath(pathname: string): boolean {
  return (
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    isPublicMarketingPath(pathname) ||
    pathname.startsWith("/auth/") ||
    // Exact, not a prefix: `/search` is one route, and a future `/search-admin`
    // must not fall through the gate because it starts with the same word.
    pathname === "/search" ||
    pathname.startsWith("/course/") ||
    pathname.startsWith("/instructor/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/.well-known/")
  );
}

/**
 * Where a guest who presses "sign in" on `pathname` should be sent, or `null`
 * to keep `signIn()`'s default of returning them where they were.
 *
 * The catalog is the one guest-open route that is not about a specific thing.
 * A student who signs in from `/course/COMS1004W` came for that course and has
 * to get it back — dropping them into a wizard would lose the link that
 * brought them. A student who signs in from `/search` came for nothing in
 * particular, has answered nothing about their degree, and would otherwise
 * arrive back at the same undifferentiated list with nothing visibly changed.
 * Onboarding is the only landing that spends the yes.
 *
 * This is consulted by `signIn()` rather than passed by each caller because
 * the catalog has four sign-in doors — the banner, the rail's padlocked tabs,
 * the account popover, and the bookmark toast — and three of them are shared
 * components that have no idea which route they are on. Stating the rule once,
 * here, is what keeps the fourth door from quietly disagreeing. An explicit
 * `next` always wins, so the wizard's own `/onboarding` is untouched.
 */
export function guestSignInNext(pathname: string): string | null {
  return pathname === "/search" ? "/onboarding" : null;
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
