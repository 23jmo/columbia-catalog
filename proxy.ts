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
 * ── This does NOT protect any route ────────────────────────────────────────
 *
 * Spec §15: reading is free. There is no redirect here, no allow-list, no
 * "signed in?" gate. Every page renders for everyone; the only thing that
 * needs an account is a write, and those authorize themselves at the point of
 * writing. A middleware that redirects would be the wrong shape for this
 * product no matter how conventional it looks.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  // gone. Send them back to where they landed rather than defaulting to home.
  if (!target.searchParams.has("next") && pathname !== "/") {
    target.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(target);
}

export async function proxy(request: NextRequest) {
  const rescued = rescueStrandedAuthCode(request);
  if (rescued) return rescued;

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

  await client.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except static assets and the search index.
     *
     * `index/` matters: the lexical artifact is ~700 KB and immutable, and
     * running an auth round trip in front of a CDN-cacheable binary would be a
     * measurable regression on the one request the whole search experience
     * waits for.
     */
    "/((?!_next/static|_next/image|favicon.ico|index/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
