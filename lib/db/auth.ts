/**
 * Authentication — Google SSO restricted to Columbia and Barnard.
 *
 * Spec §15 states the rule this file implements: **reading is free, writing
 * needs an account.** Nothing here gates a read. There is no session check
 * wrapping the app, no redirect to a login page, and no protected route. The
 * only thing an account unlocks is writing — plans, watches, alerts, MCP.
 *
 * ── The domain restriction is enforced three times, on purpose ─────────────
 *
 *   1. `hd=columbia.edu` on the Google authorize URL — a hint, and Google
 *      treats it as one. It filters the account chooser; it does not bind.
 *   2. This file, in `assertColumbiaEmail`, at callback time.
 *   3. `users_columbia_domain`, a check constraint in migration 0005.
 *
 * Only (3) actually cannot be bypassed, which is why it exists — a dashboard
 * setting can be misconfigured and a client-side check can be skipped, but a
 * check constraint refuses the row. (2) exists so a rejected user sees an
 * explanation instead of a foreign-key error, and (1) so they rarely get that
 * far. Defence in depth here is cheap and the failure mode — a non-Columbia
 * account holding plans — is not something we want to clean up later.
 */

import type { User } from "@supabase/supabase-js";

import { createServerSupabaseClient, getBrowserClient } from "./client";

/** Subdomains included: cumc.columbia.edu, gsb.columbia.edu, and so on. */
const COLUMBIA_EMAIL = /@([a-z0-9-]+\.)*(columbia|barnard)\.edu$/i;

/** The signed-in student, in the shape the shell renders. */
export interface SessionAccount {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export function isColumbiaEmail(email: string | null | undefined): boolean {
  return Boolean(email && COLUMBIA_EMAIL.test(email));
}

/**
 * Maps a Supabase user onto the shell's account shape.
 *
 * Falls back to the local part of the email for a display name rather than
 * rendering "null" or an empty avatar: Google always supplies a name for a
 * Workspace account, but a directory can be configured to withhold it.
 */
export function toSessionAccount(user: User): SessionAccount {
  const meta = user.user_metadata ?? {};
  const email = user.email ?? "";
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    email.split("@")[0] ||
    "Signed in";
  const avatarUrl =
    typeof meta.avatar_url === "string" ? meta.avatar_url : undefined;

  return { userId: user.id, name, email, avatarUrl };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/**
 * The signed-in user on the server, or `null`.
 *
 * Uses `getUser()` rather than `getSession()`. `getSession()` returns whatever
 * is in the cookie without verifying it, which is fine for rendering a name and
 * unacceptable for anything that authorizes a write — `getUser()` validates the
 * JWT against Supabase. Since this is the only server-side accessor, it uses
 * the safe one and everything downstream inherits that.
 */
export async function getSessionUser(): Promise<SessionAccount | null> {
  const client = await createServerSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return toSessionAccount(data.user);
}

/**
 * Throwing variant for route handlers that are about to write. Keeps the 401
 * decision in one place instead of repeating a null check at every call site.
 */
export class NotSignedInError extends Error {
  constructor() {
    super("Sign in with your Columbia account to save this.");
    this.name = "NotSignedInError";
  }
}

export async function requireSessionUser(): Promise<SessionAccount> {
  const account = await getSessionUser();
  if (!account) throw new NotSignedInError();
  return account;
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

/**
 * Starts the Google OAuth flow.
 *
 * `redirectTo` carries the current path so a student who signs in from a course
 * page lands back on that course page, not on the home page. The value is a
 * path from `window.location`, never anything a caller supplies, so it cannot
 * become an open redirect.
 */
export async function signInWithColumbia(): Promise<{ error: string | null }> {
  const client = getBrowserClient();
  if (!client) return { error: "Sign-in is not configured." };

  const next = `${window.location.pathname}${window.location.search}`;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: {
        // Filters Google's account chooser to Columbia accounts. A hint, not a
        // guarantee — see the header comment.
        hd: "columbia.edu",
        // Without this a student who has already granted consent is bounced
        // straight through the chooser, which makes switching accounts on a
        // shared library machine impossible.
        prompt: "select_account",
      },
    },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  const client = getBrowserClient();
  if (!client) return;
  await client.auth.signOut();
}
