/**
 * Every OAuth endpoint, mounted under one catch-all.
 *
 * A catch-all rather than eight route files because the endpoints share a
 * single security posture — the discovery documents are public and cacheable,
 * everything else is `no-store` — and splitting them across directories makes
 * that posture something you have to reconstruct by reading eight files. The
 * routing table below is the whole story.
 *
 * The handlers themselves live in `lib/mcp/oauth-endpoints.ts` so they are
 * plain `Request -> Response` functions that a test can call directly without
 * standing up Next.
 */

import {
  authorizationServerMetadata,
  authorizeEndpoint,
  callbackEndpoint,
  corsPreflight,
  protectedResourceMetadata,
  registerEndpoint,
  revokeEndpoint,
  tokenEndpoint,
} from "@/lib/mcp/oauth-endpoints";

/**
 * Tokens are minted per request from in-process state (the client registry, the
 * in-flight authorization codes). Nothing here may be prerendered or cached by
 * the framework.
 */
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ oauth?: string[] }> };

async function segmentPath(context: RouteContext): Promise<string> {
  const { oauth } = await context.params;
  return (oauth ?? []).join("/");
}

export async function GET(req: Request, context: RouteContext): Promise<Response> {
  const path = await segmentPath(context);
  switch (path) {
    case ".well-known/oauth-authorization-server":
    // An MCP client that speaks OIDC discovery looks here instead. The document
    // is the same one; we are an OAuth server, not an OIDC provider, and saying
    // so twice is cheaper than a client that cannot find us.
    case ".well-known/openid-configuration":
      return authorizationServerMetadata(req);
    case ".well-known/oauth-protected-resource":
      return protectedResourceMetadata(req);
    case "authorize":
      return authorizeEndpoint(req);
    case "callback":
      return callbackEndpoint(req);
    default:
      return notFound(path);
  }
}

export async function POST(req: Request, context: RouteContext): Promise<Response> {
  const path = await segmentPath(context);
  switch (path) {
    case "register":
      return registerEndpoint(req);
    case "token":
      return tokenEndpoint(req);
    case "revoke":
      return revokeEndpoint(req);
    default:
      return notFound(path);
  }
}

/** Discovery is fetched cross-origin by browser-based clients. */
export async function OPTIONS(): Promise<Response> {
  return corsPreflight();
}

function notFound(path: string): Response {
  return new Response(
    JSON.stringify({
      error: "not_found",
      error_description: `No OAuth endpoint at /api/mcp/oauth/${path}.`,
    }),
    { status: 404, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
