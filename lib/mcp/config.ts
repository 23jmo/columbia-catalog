/**
 * MCP server configuration — URLs, identifiers, and the environment seams.
 *
 * Everything the OAuth documents and the setup page need to describe the
 * server lives here so there is exactly one place that knows our public URL.
 */

/** Canonical path of the MCP endpoint itself (the OAuth "resource"). */
export const MCP_PATH = "/api/mcp";

/** Everything OAuth lives under this prefix, served by one catch-all route. */
export const OAUTH_PATH = "/api/mcp/oauth";

/** Where a student reviews pending agent proposals in the app. */
export const PROPOSAL_REVIEW_PATH = "/schedule";

/** Where a student sets up an MCP client. */
export const SETUP_PATH = "/mcp-setup";

export const SERVER_NAME = "lionplan";
export const SERVER_TITLE = "LionPlan";
export const SERVER_VERSION = "1.0.0";

/**
 * Public origin of this deployment.
 *
 * Resolution order: explicit override, Vercel's injected URL, then localhost.
 * `req` wins when supplied because a request's own Host header is the only
 * thing guaranteed to match what the MCP client actually dialled — and OAuth
 * redirect URIs must match byte-for-byte.
 */
export function resolveBaseUrl(req?: Request): string {
  const explicit = process.env.MCP_PUBLIC_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);

  if (req) {
    const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (forwardedHost) {
      const proto =
        req.headers.get("x-forwarded-proto") ??
        (forwardedHost.startsWith("localhost") || forwardedHost.startsWith("127.0.0.1")
          ? "http"
          : "https");
      return `${proto}://${forwardedHost}`;
    }
  }

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${stripTrailingSlash(vercel)}`;

  return "http://localhost:3000";
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export interface McpUrls {
  baseUrl: string;
  /** RFC 8707 resource identifier — the MCP endpoint. */
  resource: string;
  /** OAuth 2.0 issuer identifier. Has a path component, which is legal. */
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
  /** Where the identity provider returns the browser. */
  callbackEndpoint: string;
  authorizationServerMetadataUrl: string;
  openIdConfigurationUrl: string;
  protectedResourceMetadataUrl: string;
  setupUrl: string;
  proposalReviewUrl: string;
}

export function mcpUrls(baseUrl: string): McpUrls {
  const issuer = `${baseUrl}${OAUTH_PATH}`;
  return {
    baseUrl,
    resource: `${baseUrl}${MCP_PATH}`,
    issuer,
    authorizationEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/token`,
    registrationEndpoint: `${issuer}/register`,
    revocationEndpoint: `${issuer}/revoke`,
    callbackEndpoint: `${issuer}/callback`,
    authorizationServerMetadataUrl: `${issuer}/.well-known/oauth-authorization-server`,
    openIdConfigurationUrl: `${issuer}/.well-known/openid-configuration`,
    protectedResourceMetadataUrl: `${issuer}/.well-known/oauth-protected-resource`,
    setupUrl: `${baseUrl}${SETUP_PATH}`,
    proposalReviewUrl: `${baseUrl}${PROPOSAL_REVIEW_PATH}`,
  };
}

/**
 * Google SSO is restricted to these hosted domains (spec §15). The identity
 * provider seam enforces this before any token is minted.
 */
export const ALLOWED_EMAIL_DOMAINS = ["columbia.edu", "barnard.edu"] as const;
