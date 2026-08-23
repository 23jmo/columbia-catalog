/**
 * Rate limiting for the public MCP surface.
 *
 * The unauthenticated tools are a genuinely open API with our name on it, so
 * they are metered per caller. Authenticated tools are metered per user, which
 * is both fairer and cheaper to enforce.
 *
 * ── PERSISTENCE SEAM ───────────────────────────────────────────────────────
 * The default limiter is an in-process fixed window. On a single node that is
 * exactly right; across serverless instances it under-counts. Swap
 * `createInMemoryRateLimiter()` for a Redis/Upstash or Postgres-backed
 * implementation of the same interface when we run on more than one instance.
 * ───────────────────────────────────────────────────────────────────────────
 */

export interface RateLimitRule {
  /** Max calls allowed inside the window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Epoch ms at which the current window resets. */
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, rule: RateLimitRule, now?: number): RateLimitDecision;
}

/** Per-tool ceilings. Anonymous callers are metered harder than signed-in ones. */
export const ANONYMOUS_TOOL_RULE: RateLimitRule = { limit: 60, windowMs: 60_000 };
export const AUTHENTICATED_TOOL_RULE: RateLimitRule = { limit: 240, windowMs: 60_000 };

/** Coarse per-IP ceiling applied to every tokenless HTTP request to /api/mcp. */
export const ANONYMOUS_TRANSPORT_RULE: RateLimitRule = { limit: 120, windowMs: 60_000 };

/** Proposals are cheap for an agent to spam and expensive for a human to read. */
export const PROPOSAL_RULE: RateLimitRule = { limit: 20, windowMs: 60_000 };

export function createInMemoryRateLimiter(): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(key, rule, now = Date.now()) {
      // Opportunistic sweep so a long-lived process does not accumulate keys.
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      }

      let window = windows.get(key);
      if (!window || window.resetAt <= now) {
        window = { count: 0, resetAt: now + rule.windowMs };
        windows.set(key, window);
      }

      window.count += 1;
      const allowed = window.count <= rule.limit;
      return {
        allowed,
        remaining: Math.max(0, rule.limit - window.count),
        limit: rule.limit,
        resetAt: window.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      };
    },
  };
}

/**
 * Best-effort caller identity for anonymous metering. Behind Vercel the
 * left-most `x-forwarded-for` entry is the real client; everything else is a
 * fallback so a misconfigured proxy degrades to one shared bucket rather than
 * to no limit at all.
 */
export function callerKeyFromHeaders(headers: Headers | Record<string, unknown>): string {
  const get = (name: string): string | null => {
    if (headers instanceof Headers) return headers.get(name);
    const raw = (headers as Record<string, unknown>)[name];
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
    return null;
  };

  const forwarded = get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return get("x-real-ip") ?? get("cf-connecting-ip") ?? "unknown";
}
