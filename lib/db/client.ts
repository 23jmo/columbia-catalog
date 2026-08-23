/**
 * Supabase clients for Columbia Catalog.
 *
 * Two rules govern this file:
 *
 *  1. **It must never throw at import time.** Supabase is not provisioned yet
 *     and the app has to build, render and test without it. Every accessor
 *     returns `null` when the environment is absent; nothing crashes, nothing
 *     warns on a cold path. Callers branch on `isConfigured()` and fall back to
 *     the seed extract in `lib/data/catalog.ts`.
 *
 *  2. **The service-role key never reaches the browser.** It is read from a
 *     non-`NEXT_PUBLIC_` variable, so bundling it into client code is not a
 *     discipline question — the value simply is not there.
 *
 * Environment variables:
 *
 *   NEXT_PUBLIC_SUPABASE_URL              required
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  required (or the legacy ANON_KEY)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY         legacy alias, still accepted
 *   SUPABASE_SERVICE_ROLE_KEY             server only; ingest and alerts
 */

import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./schema";

export type CatalogClient = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
// Read through a helper rather than destructured at module scope: Next inlines
// `process.env.NEXT_PUBLIC_*` at build time, and an undefined lookup must be a
// quiet `undefined` rather than a TypeError in an edge runtime.

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");

export const SUPABASE_PUBLISHABLE_KEY =
  env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/**
 * `true` when the browser/server clients can be constructed. Callers use this
 * to choose between the database and the seed:
 *
 *   if (!isConfigured()) return seedFallback();
 */
export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/** `true` when privileged, server-only operations (ingest, alerts) are possible. */
export function isServiceConfigured(): boolean {
  return Boolean(SUPABASE_URL && env("SUPABASE_SERVICE_ROLE_KEY"));
}

/**
 * Human-readable reason configuration is incomplete, for a health endpoint or a
 * dev banner. `null` when everything needed is present.
 */
export function configurationProblem(): string | null {
  if (!SUPABASE_URL) return "NEXT_PUBLIC_SUPABASE_URL is not set";
  if (!SUPABASE_PUBLISHABLE_KEY) {
    return "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is not set";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Browser client
// ---------------------------------------------------------------------------

let browserClient: CatalogClient | null = null;

/**
 * The singleton browser client. Cached because `createBrowserClient` installs
 * auth listeners and a second instance would double every token refresh.
 *
 * Returns `null` when Supabase is not configured.
 */
export function getBrowserClient(): CatalogClient | null {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  browserClient ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return browserClient;
}

// ---------------------------------------------------------------------------
// Server client
// ---------------------------------------------------------------------------

/** The subset of Next's cookie store this file needs. Keeps the import dynamic. */
interface CookieAdapter {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: Record<string, unknown>): void;
}

/**
 * Request-scoped server client, cookie-bound so RLS sees the signed-in user.
 *
 * `next/headers` is imported dynamically so this module stays importable from
 * client components — a static import would pull a server-only module into the
 * browser bundle and break the build for every consumer of `isConfigured()`.
 *
 * Returns `null` when Supabase is not configured.
 */
export async function createServerSupabaseClient(): Promise<CatalogClient | null> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;

  const { cookies } = await import("next/headers");
  const cookieStore = (await cookies()) as unknown as CookieAdapter;

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Components cannot mutate cookies. Middleware and Route
        // Handlers can, and they are where session refresh belongs; here the
        // write is a no-op rather than an error.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as Record<string, unknown>);
          }
        } catch {
          /* read-only cookie store — expected inside a Server Component */
        }
      },
    },
  });
}

/**
 * Cookie-free server client. For anonymous catalog reads from a Server
 * Component that has no session to carry — reads are free and the catalog is
 * world-readable, so skipping the cookie round trip is both correct and faster.
 */
export function createAnonServerClient(): CatalogClient | null {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client. Bypasses RLS entirely — ingest writes, the alert sweep,
 * and nothing else. Never call this from anything that renders.
 *
 * Returns `null` when the service key is absent.
 */
export function createServiceRoleClient(): CatalogClient | null {
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !serviceKey) return null;
  return createClient<Database>(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Throwing variant, for code paths that are only ever reached once Supabase is
 * provisioned (an ingest route, a cron handler). Keeps the failure loud and
 * local instead of surfacing as a null dereference three frames later.
 */
export function requireServiceRoleClient(): CatalogClient {
  const client = createServiceRoleClient();
  if (!client) {
    throw new Error(
      "Supabase service role is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return client;
}
