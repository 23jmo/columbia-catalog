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

import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/db/client";
import { isColumbiaEmail } from "@/lib/db/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Only same-origin paths are honoured. `next` reaches us through a query
 * string, so treating it as a URL would be an open redirect; anything that is
 * not a single leading slash falls back to the home page.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function errorRedirect(origin: string, reason: string): NextResponse {
  // Home bounces unsigned visitors to onboarding, so the message has to live
  // there — otherwise the query is stripped on the way and the failure looks
  // like a cancelled chooser.
  return NextResponse.redirect(
    `${origin}/onboarding?auth_error=${encodeURIComponent(reason)}`,
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = safeNext(url.searchParams.get("next"));

  // Google reports a declined consent screen this way. It is not an error
  // worth a stack trace — the student simply changed their mind.
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(`${origin}${next}`);
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

  return NextResponse.redirect(`${origin}${next}`);
}
