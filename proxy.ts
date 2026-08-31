/**
 * Session refresh.
 *
 * ── Why this is `proxy.ts` and not `middleware.ts` ─────────────────────────
 *
 * Next 16 renamed this file convention. `middleware.ts` is not merely
 * deprecated-but-working here: under 16.3.2 it matches the request, runs, and
 * then returns an empty body, so every HTML route served a 200 with zero
 * bytes and the app rendered as a permanently white screen. A bare
 * `return NextResponse.next()` reproduced it, so it is the convention itself,
 * not the Supabase call below. Renaming the file and the exported function to
 * `proxy` restores the response body. Do not rename it back.
 *
 * Supabase access tokens are short-lived. The browser client refreshes its own,
 * but a Server Component cannot write cookies — so without this, a student who
 * left a tab open overnight renders as signed out on the server while the
 * browser still believes they are signed in, and every server-side write fails
 * with a stale token.
 *
 * `getUser()` here does two things at once: it validates the token, and on the
 * way it writes any refreshed cookies onto the response.
 *
 * ── Unsigned HTML goes to onboarding ───────────────────────────────────────
 *
 * A signed-out visitor hitting `/`, `/chat`, `/schedule`, and so on is
 * redirected to `/onboarding` here, before the page paints. The first screen
 * has a Log in control for people who already have an account; everyone else
 * walks the wizard and signs in on the last step. There is no "browse as
 * guest" exit — that path let people skip setup, which is the thing we are
 * trying to make the default.
 *
 * `/search` is the exception, and it is deliberate: the catalog is the one
 * surface that is worth something to a stranger, so a guest browses it freely
 * and is asked for an account by the page rather than by a 307. See
 * `lib/onboarding/guest-gate.ts` for the argument.
 *
 * APIs, the OAuth callback, onboarding, and the public About / Privacy /
 * Terms pages are not redirected. Writes still authorize themselves at the
 * point of writing; this gate is a navigation default, not an authorization
 * boundary.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { AUTH_NEXT_COOKIE, safeSameOriginPath } from "@/lib/db/auth-return";
import { PUBLIC_CACHE_CONTROL } from "@/lib/marketing/site";
import {
  guestOnboardingLocation,
  isGuestAllowedPath,
  isPublicMarketingPath,
} from "@/lib/onboarding/guest-gate";

/**
 * Rescue an OAuth code that Supabase dropped on the wrong path.
 *
 * `signIn()` asks for `/auth/callback`, but Supabase only honours a
 * `redirectTo` that matches the Redirect URLs allow list. When it does not
 * match, Supabase does not fail and does not warn — it silently substitutes
 * the project's Site URL, whose factory default is `http://localhost:3000`.
 * The student lands on the home page with `?code=...` in the address bar, the
 * code is never exchanged, and the app renders them as signed out with nothing
 * to explain why. That failure looks identical to "sign-in is broken".
 *
 * Forwarding the code to the route that knows what to do with it costs one
 * redirect and makes the flow survive an allow list that is missing an entry —
 * which every new Vercel preview URL is, until someone adds it.
 *
 * This is a safety net, NOT a substitute for the allow list. The Site URL must
 * still point at production, or email confirmations and password resets — which
 * have no `redirectTo` at all and always use the Site URL — will keep pointing
 * at whatever it says.
 *
 * Narrow on purpose: only a GET navigation, only when `code` is present, never
 * on `/auth/callback` itself (which would loop) and never under `/api`, whose
 * MCP OAuth flow has its own `code` and its own handler. No other route in this
 * app reads a `code` search param, so nothing legitimate is intercepted.
 */
function rescueStrandedAuthCode(request: NextRequest): NextResponse | null {
  if (request.method !== "GET") return null;

  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/auth/callback" || pathname.startsWith("/api/")) return null;
  if (!searchParams.get("code")) return null;

  const target = new URL("/auth/callback", request.nextUrl);
  // Carry the whole query through: the callback reads `code`, and `error` if
  // the student declined Google's consent screen.
  for (const [name, value] of searchParams) target.searchParams.set(name, value);
  // Supabase discarded the original `redirectTo`, so the `next` it carried is
  // gone. Prefer the backup cookie `signIn()` set, then the path they landed
  // on (when it is not the Site URL home). Leaving `next` unset lets the
  // callback fall through to `postAuthPath`, which keeps unfinished students
  // in onboarding instead of skipping the first feed.
  if (!target.searchParams.has("next")) {
    const fromCookie = safeSameOriginPath(request.cookies.get(AUTH_NEXT_COOKIE)?.value);
    if (fromCookie) {
      target.searchParams.set("next", fromCookie);
    } else if (pathname !== "/") {
      target.searchParams.set("next", pathname);
    }
  }
  return NextResponse.redirect(target);
}

export async function proxy(request: NextRequest) {
  const rescued = rescueStrandedAuthCode(request);
  if (rescued) return rescued;

  // Public marketing pages and crawler files do not need a session.
  // `getUser()` writes cookies and marks the response private, no-store.
  // That is how Googlebot fetching /robots.txt used to receive the
  // school-picker HTML and a header that said do not cache it.
  if (isPublicMarketingPath(request.nextUrl.pathname)) {
    const publicResponse = NextResponse.next({ request });
    publicResponse.headers.set("Cache-Control", PUBLIC_CACHE_CONTROL);
    return publicResponse;
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No Supabase, no session to refresh. The app still works — reads fall back
  // to the seed extract — so this is a pass-through, not a failure.
  if (!url || !key) return response;

  const client = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Rebuilt from the mutated request so the refreshed cookies are visible
        // to the handler that runs after this, not only to the browser.
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await client.auth.getUser();

  // No session, and this is a page a guest should not browse. Send them to
  // the wizard. Copy any cookies `getUser()` just refreshed onto the redirect
  // so a half-valid token is not dropped on the way.
  if (!data.user && !isGuestAllowedPath(request.nextUrl.pathname)) {
    const redirectResponse = NextResponse.redirect(guestOnboardingLocation(request.nextUrl));
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except static assets, generated social cards, the search
     * index, and crawler files.
     *
     * `index/` matters: the lexical artifact is ~700 KB and immutable, and
     * running an auth round trip in front of a CDN-cacheable binary would be a
     * measurable regression on the one request the whole search experience
     * waits for. `robots.txt`, `sitemap.xml`, `llms.txt`, and `google*.html`
     * are excluded so a matcher miss cannot 307 Googlebot or Search Console
     * into the wizard. The guest gate still allow-lists them as a second check.
     */
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|robots\\.txt|sitemap\\.xml|llms\\.txt|llms-full\\.txt|google[^/]*\\.html|index/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
