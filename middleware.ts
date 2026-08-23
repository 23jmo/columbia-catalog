/**
 * Session refresh.
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

export async function middleware(request: NextRequest) {
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
