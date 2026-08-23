/**
 * The MCP endpoint.
 *
 * ── Anonymous callers are allowed, and that is the product ─────────────────
 *
 * The usual MCP server answers every tokenless request with a 401. This one
 * does not, because spec §14 says all reads are free and only writes need an
 * account. An agent with no token can search the catalog, read a section's
 * seats with their observation time, and check a conflict; it gets a 401 only
 * when it reaches for something that is actually the student's.
 *
 * That decision moves the authorization boundary from the transport into
 * `runTool`, which checks scope per tool. The transport's job here is narrower:
 * establish *who is calling* (or that nobody is), meter anonymous callers, and
 * hand a fixed `ToolContext` to a server that lives exactly as long as the
 * request.
 *
 * ── Stateless, JSON-only ───────────────────────────────────────────────────
 *
 * No `sessionIdGenerator` and no SSE stream. On Vercel, consecutive requests
 * from one MCP client land on different function instances, so a session-bound
 * transport would work in dev and fail intermittently in production. GET is
 * answered with 405, which is the documented way to say "this server offers no
 * server-initiated stream" — clients handle it and fall back to plain POST.
 *
 * None of our tools push notifications, so nothing is lost.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { buildWwwAuthenticate, verifyAccessToken, type McpAuthInfo } from "@/lib/mcp/auth";
import { mcpUrls, resolveBaseUrl } from "@/lib/mcp/config";
import { ANONYMOUS_TRANSPORT_RULE, callerKeyFromHeaders } from "@/lib/mcp/ratelimit";
import { buildMcpServer, mcpDeps } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
/** Catalog reads are fast; the ceiling is for a cold start plus an index load. */
export const maxDuration = 60;

// ---------------------------------------------------------------------------

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

const UNAUTHORIZED_DETAIL: Record<string, string> = {
  invalid_token: "The access token could not be verified.",
  expired_token: "The access token has expired. Refresh it and retry.",
  wrong_token_kind: "That is a refresh token. Exchange it at the token endpoint first.",
  wrong_resource: "That token was issued for a different MCP server.",
};

function unauthorized(baseUrl: string, reason: keyof typeof UNAUTHORIZED_DETAIL): Response {
  const description = UNAUTHORIZED_DETAIL[reason];
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: description },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        // RFC 9728 §5.1 — this header is how a client discovers where to sign
        // in. Without it an MCP client shows the student a bare 401.
        "WWW-Authenticate": buildWwwAuthenticate(baseUrl, {
          error: reason === "expired_token" ? "invalid_token" : reason,
          description,
        }),
      },
    },
  );
}

// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  const baseUrl = resolveBaseUrl(req);
  const resource = mcpUrls(baseUrl).resource;

  // 1. Identify the caller. A *missing* token is anonymous; a *bad* token is an
  //    error. Treating a bad token as anonymous would silently downgrade an
  //    agent that thinks it is signed in, and it would discover that only when
  //    a write tool refused it for the wrong reason.
  let auth: McpAuthInfo | null = null;
  const token = bearerToken(req);
  if (token) {
    const verified = await verifyAccessToken(token, resource);
    if (!verified.ok) return unauthorized(baseUrl, verified.reason);
    auth = verified.auth;
  }

  // 2. Meter. Signed-in callers are metered per tool inside `runTool`, against
  //    their user id. Anonymous ones are metered here as well, per IP, because
  //    without a token there is nothing else to attribute a flood to.
  const callerKey = auth ? `user:${auth.extra.userId}` : `ip:${callerKeyFromHeaders(req.headers)}`;
  const deps = mcpDeps(baseUrl);
  if (!auth) {
    const decision = deps.rateLimiter.consume(`${callerKey}:transport`, ANONYMOUS_TRANSPORT_RULE);
    if (!decision.allowed) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32029, message: "Too many requests. Sign in for a higher limit." },
          id: null,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(decision.retryAfterSeconds),
            "Cache-Control": "no-store",
          },
        },
      );
    }
  }

  // 3. Serve. Both the server and the transport are per request; `enableJsonResponse`
  //    means `handleRequest` resolves with a fully materialised body, so closing
  //    them straight afterwards cannot truncate a response in flight.
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = buildMcpServer({ deps, auth, callerKey });

  try {
    await server.connect(transport);
    return await transport.handleRequest(req, {
      // Handed to the SDK as well as held in the closure: an SDK-level
      // middleware or a future elicitation path should see the same identity
      // the tools do, not a second opinion.
      authInfo: auth
        ? {
            token: auth.token,
            clientId: auth.clientId,
            scopes: auth.scopes,
            expiresAt: auth.expiresAt,
            resource: auth.resource,
            extra: auth.extra,
          }
        : undefined,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error("mcp transport failed:", message);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error." },
        id: null,
      }),
      { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/**
 * 405 rather than 404: the endpoint exists, it just offers no server-initiated
 * SSE stream. `Allow` tells the client what to do instead.
 */
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "This server is stateless and offers no SSE stream. POST JSON-RPC instead.",
      },
      id: null,
    }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", "Cache-Control": "no-store" },
    },
  );
}

/** Stateless: there is no session to delete. */
export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id",
      "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Session-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}
