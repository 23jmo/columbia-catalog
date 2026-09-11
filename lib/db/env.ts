/**
 * The two public Supabase variables, and the question every caller actually
 * asks of them.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 *
 * These constants and `isConfigured()` used to live in `lib/db/client.ts`, and
 * for most of the app that was the right place. It is the wrong place for one
 * caller: `hooks/use-session-account.ts` needs to know whether there is a
 * session to wait for *during render*, and importing that answer from
 * `client.ts` drags `@supabase/ssr` and `@supabase/supabase-js` — 252 KB
 * unminified, auth plus realtime plus postgrest plus storage — into the entry
 * chunk of every route that renders an account control.
 *
 * On `/onboarding` that is the whole cost with none of the benefit. The route
 * has no shell and no signed-in surfaces until its last screen; it holds its
 * first paint behind hydration by design, so every byte on the hydration path
 * is a byte in front of the first question. Splitting the environment away from
 * the client lets the hook answer synchronously and load the client itself in
 * an effect, where it is off the critical path.
 *
 * `client.ts` re-exports everything below, so no existing import had to move.
 *
 * ── The one rule ────────────────────────────────────────────────────────────
 *
 * The two public variables MUST stay written as static member accesses.
 *
 * Next replaces `process.env.NEXT_PUBLIC_X` with the literal value at build
 * time, and it can only do that when the property is syntactically static.
 * Reading them through a helper defeats the substitution completely: the server
 * still resolves them from the real environment, the browser bundle gets
 * nothing at all, and `isConfigured()` then answers `true` on the server and
 * `false` in the browser.
 *
 * That divergence is invisible to the test suite and to any server-rendered
 * page, and it surfaces as two things at once — a hydration mismatch on every
 * component whose label depends on the session, and a browser client that is
 * permanently `null`, so sign-in, watches and alerts never work no matter how
 * the environment is configured. It cost a debugging session once; the shape of
 * these two lines is the fix, so do not "tidy" them back into a helper.
 *
 * Inlining also removes the `process` reference entirely from client code,
 * which is strictly safer than a runtime lookup in a runtime that has no
 * `process` at all.
 */

/** A blank variable means "not set", not "set to empty string". */
export function present(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

export const SUPABASE_URL = present(process.env.NEXT_PUBLIC_SUPABASE_URL);

export const SUPABASE_PUBLISHABLE_KEY =
  present(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
  present(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * `true` when the browser/server clients can be constructed. Callers use this
 * to choose between the database and the seed:
 *
 *   if (!isConfigured()) return seedFallback();
 */
export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}
