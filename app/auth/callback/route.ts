/**
 * GET /auth/callback — the OAuth landing.
 *
 * Supabase sends the browser here with a one-time `code`. Exchanging it sets
 * the session cookies; from that point the middleware keeps them fresh.
 *
 * ── Why this rejects ineligible accounts here rather than later ────────────
 *
 * `handle_new_auth_user()` (migration 0005) provisions the `users` row from a
 * trigger on `auth.users`, and `users_columbia_domain` refuses anything that
 * is not a columbia.edu or barnard.edu address. That check is the real
 * boundary and it holds. But it fires inside Supabase Auth, so a student who
 * signed in with a personal Gmail would land back on the site apparently
 * signed in, with every write failing on a foreign key to a row that was never
 * created. Signing them out here and saying why is the difference between a
 * rule and a haunting.
 *
 * Eligible means Columbia OR Barnard, subdomains included. Barnard students
 * take Columbia courses and register through the same directory; the Google
 * `hd` hint deliberately names no domain so both reach this check.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  AUTH_NEXT_COOKIE,
  clearAuthNextCookie,
  resolveAuthNext,
} from "@/lib/db/auth-return";
import { createServerSupabaseClient } from "@/lib/db/client";
import { isColumbiaEmail } from "@/lib/db/auth";
import { postAuthPath } from "@/lib/onboarding/guest-gate";
import { ONBOARDING_COOKIE, ONBOARDING_COOKIE_VALUE } from "@/lib/onboarding/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorRedirect(origin: string, reason: string): NextResponse {
  // Home bounces unsigned visitors to onboarding, so the message has to live
  // there — otherwise the query is stripped on the way and the failure looks
  // like a cancelled chooser.
  return NextResponse.redirect(
    `${origin}/onboarding?auth_error=${encodeURIComponent(reason)}`,
  );
}

/**
 * Build the post-auth redirect and drop the short-lived `next` backup cookie.
 *
 * Query `next` wins when present; the cookie covers the Site URL substitution
 * case where Supabase dropped it. `postAuthPath` then refuses to send an
 * unfinished student (no completion cookie) to home.
 */
async function finishRedirect(origin: string, queryNext: string | null): Promise<NextResponse> {
  const store = await cookies();
  const next = resolveAuthNext(queryNext, store.get(AUTH_NEXT_COOKIE)?.value, "/");
  const onboarded = store.get(ONBOARDING_COOKIE)?.value === ONBOARDING_COOKIE_VALUE;
  const response = NextResponse.redirect(`${origin}${postAuthPath(next, onboarded)}`);
  clearAuthNextCookie((name, value, options) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const queryNext = url.searchParams.get("next");

  // Google reports a declined consent screen this way. It is not an error
  // worth a stack trace — the student simply changed their mind.
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return finishRedirect(origin, queryNext);
  }

  const code = url.searchParams.get("code");
  if (!code) return errorRedirect(origin, "missing_code");

  const client = await createServerSupabaseClient();
  if (!client) return errorRedirect(origin, "not_configured");

  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return errorRedirect(origin, "exchange_failed");
  }

  if (!isColumbiaEmail(data.user.email)) {
    await client.auth.signOut();
    return errorRedirect(origin, "ineligible_domain");
  }

  return finishRedirect(origin, queryNext);
}
