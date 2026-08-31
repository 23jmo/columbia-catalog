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
 *   1. `hd=*` on the Google authorize URL — narrows the chooser to Workspace
 *      accounts, which is as close as one parameter gets when two domains are
 *      eligible. It does not bind to Columbia or Barnard; see "Why `hd` is `*`"
 *      below for why naming a domain here locked Barnard out entirely.
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

import { guestSignInNext } from "@/lib/onboarding/guest-gate";
import { rememberAuthNext } from "./auth-return";
import { createServerSupabaseClient, createServiceRoleClient, getBrowserClient } from "./client";

/**
 * Columbia and Barnard, subdomains included — cumc.columbia.edu,
 * gsb.columbia.edu, and so on. This and the `users_columbia_domain` constraint
 * in migration 0005 are the two places eligibility is actually decided; they
 * must stay in step.
 */
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
    super("Sign in with your Columbia or Barnard account to save this.");
    this.name = "NotSignedInError";
  }
}

export async function requireSessionUser(): Promise<SessionAccount> {
  const account = await getSessionUser();
  if (!account) throw new NotSignedInError();
  return account;
}

/**
 * Permanently deletes the signed-in auth user. Cascades through `users` and
 * every owned table. Requires the service role — callers must verify the
 * session first and sign the browser out afterward.
 */
export async function deleteSignedInAccount(userId: string): Promise<{ error: string | null }> {
  const service = createServiceRoleClient();
  if (!service) {
    return { error: "Account deletion is not configured on this deployment." };
  }

  const { error } = await service.auth.admin.deleteUser(userId);
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

/**
 * Starts the Google OAuth flow.
 *
 * `redirectTo` defaults to the current path so a student who signs in from a
 * course page lands back there. Callers may pass `next` when the current path
 * is the wrong landing — onboarding always passes `/onboarding` so the first
 * feed is not skipped. The value must be a same-origin path (a single leading
 * slash); anything else falls back to the current location so this cannot
 * become an open redirect.
 *
 * With no explicit `next`, `guestSignInNext()` gets a say before the current
 * path does. Today it names exactly one route: the catalog, which is open to
 * guests and is the one place where "put them back where they were" is the
 * wrong answer. See that function for the argument; the rule lives there
 * because the catalog's four sign-in doors are shared components that do not
 * know which route they are rendering on.
 *
 * A short-lived `cc_auth_next` cookie mirrors `next`. When Supabase's allow
 * list rejects `redirectTo` it substitutes the Site URL and drops the query;
 * the cookie is what lets the callback still return them to the wizard.
 *
 * ── Why `hd` is `*` and not a domain ──────────────────────────────────────
 *
 * Barnard students take Columbia courses, register through the same directory,
 * and are exactly who this app is for. `hd: "columbia.edu"` locked every one
 * of them out — and not softly: `hd` is enforced at Google's end, so a
 * barnard.edu account was refused before it ever reached us, with a Google
 * error page and no way to tell what had gone wrong.
 *
 * `hd` takes one domain, not a list, so two eligible domains means not naming
 * one. `*` is the closest honest thing: any Google Workspace account, no
 * personal Gmail. It narrows the chooser without deciding who is eligible.
 *
 * Eligibility is decided in two places that both have to agree, and neither is
 * this one: `isColumbiaEmail` in the callback, and the `users_columbia_domain`
 * constraint in the database. `hd` was never a security boundary and treating
 * it as one is how it ended up excluding half the users instead.
 */
export async function signIn(options?: { next?: string }): Promise<{ error: string | null }> {
  const client = getBrowserClient();
  if (!client) return { error: "Sign-in is not configured." };

  const current = `${window.location.pathname}${window.location.search}`;
  const fallback = guestSignInNext(window.location.pathname) ?? current;
  const requested = options?.next;
  const next =
    requested && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : fallback;
  // Backup for when Supabase strands the code on the Site URL without `next`.
  rememberAuthNext(next);
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: {
        // Any Workspace account, no personal Gmail. See the header comment.
        hd: "*",
        // Without this a student who has already granted consent is bounced
        // straight through the chooser, which makes switching accounts on a
        // shared library machine impossible.
        prompt: "select_account",
      },
    },
  });
  return { error: error ? describeSignInError(error.message) : null };
}

/**
 * Supabase's OAuth errors are written for whoever wired the project up, not
 * for the student who pressed the button. The one that actually reaches
 * production today is "Unsupported provider: provider is not enabled", which
 * means the Google provider has not been switched on (.plans/BLOCKERS.md item
 * 6) — a deployment fact the reader can do nothing about and should not have
 * to decode.
 *
 * Anything unrecognised is passed through rather than flattened into a generic
 * apology: an unfamiliar message is at least a lead, and hiding it would make
 * the next unanticipated failure invisible.
 */
function describeSignInError(message: string): string {
  if (/provider is not enabled|unsupported provider/i.test(message)) {
    return "Sign-in is not available on this deployment yet.";
  }
  return message;
}

export async function signOut(): Promise<void> {
  const client = getBrowserClient();
  if (!client) return;
  await client.auth.signOut();
}
