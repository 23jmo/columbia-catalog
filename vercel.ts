/**
 * Project configuration, in TypeScript as spec §20 asks for.
 *
 * ── Why the type is declared here instead of imported ──────────────────────
 *
 * The documented form is `import type { VercelConfig } from '@vercel/config/v1'`
 * plus the `routes` helpers. That package is not installed and AGENTS.md rule 2
 * forbids installing it. A type-only import would erase at runtime but would
 * still fail `tsc --noEmit`, so the shape this project actually uses is declared
 * locally. Narrower than the real type by design: it describes what is here, so
 * adding a field means widening it deliberately rather than by accident.
 *
 * ── Why this file exists at all, given vercel.json worked ──────────────────
 *
 * It was recorded as blocked (.plans/BLOCKERS.md item 17) on two claims, both
 * of which turned out to be false when tested rather than reasoned about:
 *
 *   1. "The pinned CLI (50.35.0) predates vercel.ts support." It does mention
 *      vercel.ts — but only inside a codegen string for `routes export
 *      --format ts`. Static reading suggested config still resolved from
 *      vercel.json alone, which was the right observation about the CLI and the
 *      wrong conclusion about the platform.
 *   2. "@vercel/config must be installed." Only for the types.
 *
 * What settled it was a preview deployment carrying this file and NO
 * vercel.json: all five rewrites below resolved 200 with correct OAuth
 * metadata bodies, while an unconfigured `.well-known` path returned 404 —
 * so the 200s came from these rewrites and not from a catch-all. Crons were
 * then confirmed on production, since crons do not run on previews.
 */

interface VercelConfig {
  crons?: { path: string; schedule: string }[];
  rewrites?: { source: string; destination: string }[];
  functions?: Record<string, { maxDuration?: number }>;
}

export const config: VercelConfig = {
  crons: [
    { path: "/api/crawl/cron", schedule: "0 7 * * *" },
    { path: "/api/alerts/sweep", schedule: "0 8 * * *" },
  ],
  rewrites: [
    {
      source: "/.well-known/oauth-protected-resource/api/mcp",
      destination: "/api/mcp/oauth/.well-known/oauth-protected-resource",
    },
    {
      source: "/.well-known/oauth-protected-resource",
      destination: "/api/mcp/oauth/.well-known/oauth-protected-resource",
    },
    {
      source: "/.well-known/oauth-authorization-server/api/mcp/oauth",
      destination: "/api/mcp/oauth/.well-known/oauth-authorization-server",
    },
    {
      source: "/.well-known/oauth-authorization-server",
      destination: "/api/mcp/oauth/.well-known/oauth-authorization-server",
    },
    {
      source: "/.well-known/openid-configuration",
      destination: "/api/mcp/oauth/.well-known/openid-configuration",
    },
  ],
  functions: {
    "app/api/crawl/cron/route.ts": { maxDuration: 60 },
    "app/api/crawl/submit/route.ts": { maxDuration: 30 },
    "app/api/alerts/sweep/route.ts": { maxDuration: 60 },
    "app/api/mcp/route.ts": { maxDuration: 60 },
  },
};
