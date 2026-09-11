/**
 * Where Google SSO should send the browser after the code exchange.
 *
 * `signIn()` puts this path on the OAuth `redirectTo` as `?next=…`. That is
 * enough when Supabase honours the redirect. When the Redirect URLs allow list
 * does not match, Supabase silently substitutes the Site URL (often `/`) and
 * the query is gone — which is how a student who signed in on the last
 * onboarding screen landed on home and never saw the unlocked first feed.
 *
 * The short-lived cookie is the backup: it survives that substitution, the
 * stranded-code rescue in `proxy.ts` can reattach it, and the callback clears
 * it so a later sign-in cannot inherit a stale destination.
 */

/** Cookie name. `cc_` matches the other client-readable catalog cookies. */
export const AUTH_NEXT_COOKIE = "cc_auth_next";

/** Ten minutes covers a slow Google chooser; nothing legitimate needs longer. */
export const AUTH_NEXT_COOKIE_MAX_AGE_SEC = 60 * 10;

/**
 * Same-origin path only. Rejects protocol-relative URLs (`//evil`) and anything
 * that is not a path, so this cannot become an open redirect.
 *
 * Values may arrive URL-encoded from the cookie (`%2Fonboarding`).
 */
export function safeSameOriginPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    /* keep the raw string */
  }
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

/**
 * Prefer the query (happy path), then the cookie (stranded / Site URL), then
 * home. Callers pass the cookie value already read off the request.
 *
 * A query of bare `/` is treated as missing: that is the Site URL stand-in
 * when Supabase drops our redirect, not a deliberate "send me home" from
 * the onboarding buttons (those pass `/onboarding`). Preferring the cookie
 * in that case is what keeps a delete-and-re-sign student on the first feed.
 */
export function resolveAuthNext(
  queryNext: string | null,
  cookieNext: string | null | undefined,
  fallback = "/",
): string {
  const fromQuery = safeSameOriginPath(queryNext);
  if (fromQuery && fromQuery !== "/") return fromQuery;
  return safeSameOriginPath(cookieNext) ?? fromQuery ?? fallback;
}

/** Write the backup cookie in the browser before the Google redirect. */
export function rememberAuthNext(next: string): void {
  if (typeof document === "undefined") return;
  const path = safeSameOriginPath(next);
  if (!path) return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  try {
    document.cookie =
      `${AUTH_NEXT_COOKIE}=${encodeURIComponent(path)}; Path=/; Max-Age=${AUTH_NEXT_COOKIE_MAX_AGE_SEC}; SameSite=Lax` +
      secure;
  } catch {
    /* Private mode: query `next` is still on redirectTo; we just lose the backup. */
  }
}

/** Expire the backup cookie on a NextResponse (or any Set-Cookie sink). */
export function clearAuthNextCookie(
  setCookie: (name: string, value: string, options: { path: string; maxAge: number }) => void,
): void {
  setCookie(AUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0 });
}
