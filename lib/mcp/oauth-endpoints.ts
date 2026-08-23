/**
 * The OAuth 2.1 HTTP surface for the MCP server.
 *
 * `auth.ts` owns the primitives — PKCE, token signing, the client registry, the
 * identity-provider seam. This file is the wire protocol on top of them: eight
 * endpoints, each a pure `Request -> Response`, mounted by
 * `app/api/mcp/oauth/[...oauth]/route.ts`.
 *
 * ── Why the whole dance instead of a pasted token ──────────────────────────
 *
 * Spec §16 rules out personal access tokens. The reason is not ceremony: a PAT
 * ends up in a plaintext MCP client config, is copied between machines, and has
 * no scope and no expiry. What is implemented here gives a student a browser
 * sign-in they recognise, a token bound to a specific resource with specific
 * scopes, and a refresh token that rotates on every use — so a leaked one is
 * detectable and short-lived rather than permanent.
 *
 * ── Three deviations from the boilerplate, each deliberate ─────────────────
 *
 * 1. PKCE is mandatory, not optional. Every client here is public (there is no
 *    client secret to keep — see `token_endpoint_auth_method: "none"`), so the
 *    code verifier is the only thing standing between an intercepted
 *    authorization code and a token. An /authorize without `code_challenge` is
 *    rejected rather than downgraded.
 *
 * 2. `resource` (RFC 8707) is required and is baked into the token. A token
 *    minted for this server cannot be replayed against a different MCP server
 *    that happens to trust the same issuer.
 *
 * 3. Errors before we trust `redirect_uri` are rendered as HTML, not
 *    redirected. Redirecting an error to an unvalidated URI is how open
 *    redirects happen; once the URI is confirmed to be registered, the RFC's
 *    redirect-the-error behaviour is safe and is what we do.
 */

import {
  assertProductionSecret,
  formatScopeString,
  getClient,
  getIdentityProvider,
  isAllowedEmail,
  isAllowedRedirectUri,
  isValidRedirectUri,
  issueAuthorizationCode,
  issueTokens,
  parseScopeString,
  redeemRefreshToken,
  registerClient,
  revokeToken,
  SCOPE_DESCRIPTIONS,
  SCOPES,
  startAuthorizationFlow,
  takeAuthorizationCode,
  takeAuthorizationFlow,
  verifyPkce,
  type CodeChallengeMethod,
} from "./auth";
import { mcpUrls, resolveBaseUrl, SERVER_TITLE } from "./config";

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Discovery documents are fetched by an MCP client before it has any token, so
 * they are CORS-open by necessity. They contain only public URLs.
 */
const DISCOVERY_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
} as const;

function discoveryJson(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), { headers: DISCOVERY_HEADERS });
}

/** Token and registration responses must never be cached — RFC 6749 §5.1. */
function tokenJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function oauthError(error: string, description: string, status = 400): Response {
  return tokenJson({ error, error_description: description }, status);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The only error surface a human ever sees. It reaches a student in a browser
 * tab their agent opened, so it says what went wrong in words rather than
 * showing them an OAuth error code they have no way to act on.
 */
function humanError(title: string, detail: string, status = 400): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(SERVER_TITLE)} — sign-in problem</title>` +
      `<div style="font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.5rem;color:#18181b">` +
      `<h1 style="font-size:1.25rem;margin:0 0 .75rem">${escapeHtml(title)}</h1>` +
      `<p style="margin:0 0 1rem;color:#52525b">${escapeHtml(detail)}</p>` +
      `<p style="margin:0;color:#71717a;font-size:.875rem">You can close this tab and try connecting again from your MCP client.</p>` +
      `</div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

async function readForm(req: Request): Promise<URLSearchParams> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") params.set(key, value);
    }
    return params;
  }
  return new URLSearchParams(await req.text());
}

// ---------------------------------------------------------------------------
// Discovery — RFC 8414 and RFC 9728
// ---------------------------------------------------------------------------

export function authorizationServerMetadata(req: Request): Response {
  const urls = mcpUrls(resolveBaseUrl(req));
  return discoveryJson({
    issuer: urls.issuer,
    authorization_endpoint: urls.authorizationEndpoint,
    token_endpoint: urls.tokenEndpoint,
    registration_endpoint: urls.registrationEndpoint,
    revocation_endpoint: urls.revocationEndpoint,
    scopes_supported: SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    // S256 only. `plain` is still in the RFC and is not defensible for a public
    // client on a network we do not control.
    code_challenge_methods_supported: ["S256"],
    revocation_endpoint_auth_methods_supported: ["none"],
    service_documentation: urls.setupUrl,
  });
}

export function protectedResourceMetadata(req: Request): Response {
  const urls = mcpUrls(resolveBaseUrl(req));
  return discoveryJson({
    resource: urls.resource,
    authorization_servers: [urls.issuer],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: urls.setupUrl,
    resource_name: SERVER_TITLE,
  });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: DISCOVERY_HEADERS });
}

// ---------------------------------------------------------------------------
// Dynamic client registration — RFC 7591
// ---------------------------------------------------------------------------

export async function registerEndpoint(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    redirect_uris?: unknown;
    client_name?: unknown;
    scope?: unknown;
  } | null;

  if (!body) return oauthError("invalid_client_metadata", "Body must be JSON.");

  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string")
    : [];
  if (uris.length === 0) {
    return oauthError("invalid_redirect_uri", "At least one redirect_uri is required.");
  }
  const rejected = uris.filter((uri) => !isValidRedirectUri(uri));
  if (rejected.length > 0) {
    return oauthError(
      "invalid_redirect_uri",
      `Not a usable redirect URI: ${rejected.join(", ")}. Use https, a loopback address, or a private-use scheme.`,
    );
  }

  const client = registerClient({
    client_name: body.client_name,
    redirect_uris: uris,
    scope: typeof body.scope === "string" ? body.scope : null,
  });
  return tokenJson(client, 201);
}

// ---------------------------------------------------------------------------
// Authorize
// ---------------------------------------------------------------------------

export function authorizeEndpoint(req: Request): Response {
  const url = new URL(req.url);
  const params = url.searchParams;
  const baseUrl = resolveBaseUrl(req);
  const urls = mcpUrls(baseUrl);

  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");

  // Everything down to the redirect_uri check renders HTML: we do not yet know
  // that the URI belongs to this client, so redirecting to it would make this
  // endpoint an open redirect.
  if (!clientId) return humanError("Missing client", "The request did not identify an MCP client.");

  const client = getClient(clientId);
  if (!client) {
    return humanError(
      "Unknown client",
      "This server restarted and forgot the client registration. Disconnect and reconnect the server in your MCP client — it will register again automatically.",
    );
  }
  if (!redirectUri) {
    return humanError("Missing redirect", "The MCP client did not say where to send you back.");
  }
  if (!isAllowedRedirectUri(client, redirectUri)) {
    return humanError(
      "Redirect not registered",
      "That return address was not registered by this client, so this server will not send you to it.",
    );
  }

  // From here the redirect_uri is trusted, so errors go back to the client as
  // the RFC prescribes.
  const state = params.get("state");
  const fail = (error: string, description: string) =>
    redirectWithError(redirectUri, state, error, description);

  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "Only the authorization code flow is supported.");
  }

  const codeChallenge = params.get("code_challenge");
  if (!codeChallenge) {
    return fail("invalid_request", "PKCE is required: send a code_challenge.");
  }
  const method = (params.get("code_challenge_method") ?? "plain") as CodeChallengeMethod;
  if (method !== "S256") {
    return fail("invalid_request", "code_challenge_method must be S256.");
  }

  // RFC 8707. Defaulting to our own resource rather than rejecting keeps older
  // clients working; a *wrong* resource is still refused.
  const resource = params.get("resource") ?? urls.resource;
  if (resource !== urls.resource) {
    return fail("invalid_target", `This server only issues tokens for ${urls.resource}.`);
  }

  const { granted, unknown } = parseScopeString(params.get("scope"));
  if (unknown.length > 0) {
    return fail("invalid_scope", `Unknown scope(s): ${unknown.join(", ")}.`);
  }

  const pending = startAuthorizationFlow({
    clientId,
    redirectUri,
    scopes: granted,
    state,
    codeChallenge,
    codeChallengeMethod: method,
    resource,
  });

  return Response.redirect(
    getIdentityProvider().buildSignInUrl(pending.flowId, urls.callbackEndpoint),
    302,
  );
}

function redirectWithError(
  redirectUri: string,
  state: string | null,
  error: string,
  description: string,
): Response {
  const target = new URL(redirectUri);
  target.searchParams.set("error", error);
  target.searchParams.set("error_description", description);
  if (state) target.searchParams.set("state", state);
  return Response.redirect(target.toString(), 302);
}

// ---------------------------------------------------------------------------
// Callback — where the identity provider returns the browser
// ---------------------------------------------------------------------------

export async function callbackEndpoint(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;

  // Providers disagree about which parameter carries our correlation id, so
  // both spellings are accepted rather than making the seam's implementer
  // conform to one.
  const flowId = params.get("flow") ?? params.get("state");
  if (!flowId) {
    return humanError("Sign-in lost its thread", "The identity provider returned without a flow id.");
  }

  const pending = takeAuthorizationFlow(flowId);
  if (!pending) {
    return humanError(
      "Sign-in expired",
      "This sign-in took too long or was already completed. Start the connection again from your MCP client.",
    );
  }

  const identity = await getIdentityProvider().resolveIdentity(params);
  if (!identity) {
    return redirectWithError(
      pending.redirectUri,
      pending.state,
      "access_denied",
      "Sign-in did not complete.",
    );
  }
  if (!isAllowedEmail(identity.email)) {
    // Redirected rather than rendered: the agent needs to know the attempt
    // failed, and the student sees their client's own error.
    return redirectWithError(
      pending.redirectUri,
      pending.state,
      "access_denied",
      "This server is only open to columbia.edu and barnard.edu accounts.",
    );
  }

  const code = issueAuthorizationCode(pending, identity);
  const target = new URL(pending.redirectUri);
  target.searchParams.set("code", code.code);
  if (pending.state) target.searchParams.set("state", pending.state);
  return Response.redirect(target.toString(), 302);
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export async function tokenEndpoint(req: Request): Promise<Response> {
  // A missing signing secret in production must fail here, loudly, rather than
  // mint tokens against an ephemeral key that dies with the instance.
  try {
    assertProductionSecret();
  } catch {
    return oauthError("server_error", "This server is not configured to issue tokens.", 500);
  }

  const form = await readForm(req);
  const grantType = form.get("grant_type");

  if (grantType === "refresh_token") {
    const refresh = form.get("refresh_token");
    const clientId = form.get("client_id");
    if (!refresh || !clientId) {
      return oauthError("invalid_request", "refresh_token and client_id are required.");
    }
    const result = await redeemRefreshToken(refresh, clientId, form.get("scope"));
    if (!result.ok) {
      return oauthError(
        result.reason,
        result.reason === "invalid_scope"
          ? "A refresh may narrow scope but never widen it."
          : "Refresh token is expired, already used, or not yours.",
      );
    }
    return tokenJson(result.tokens);
  }

  if (grantType !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  }

  const code = form.get("code");
  const verifier = form.get("code_verifier");
  const clientId = form.get("client_id");
  if (!code || !verifier || !clientId) {
    return oauthError("invalid_request", "code, code_verifier and client_id are required.");
  }

  // Single-use: consumed here whether or not the checks below pass, so a
  // failed PKCE attempt cannot be retried with a different verifier.
  const authorization = takeAuthorizationCode(code);
  if (!authorization) {
    return oauthError("invalid_grant", "Authorization code is unknown, expired, or already used.");
  }
  if (authorization.clientId !== clientId) {
    return oauthError("invalid_grant", "This code was issued to a different client.");
  }
  const redirectUri = form.get("redirect_uri");
  if (redirectUri && redirectUri !== authorization.redirectUri) {
    return oauthError("invalid_grant", "redirect_uri does not match the authorization request.");
  }

  const pkceOk = await verifyPkce(
    verifier,
    authorization.codeChallenge,
    authorization.codeChallengeMethod,
  );
  if (!pkceOk) return oauthError("invalid_grant", "PKCE verification failed.");

  const tokens = await issueTokens({
    userId: authorization.userId,
    email: authorization.email,
    clientId: authorization.clientId,
    scopes: authorization.scopes,
    resource: authorization.resource,
  });
  return tokenJson(tokens);
}

// ---------------------------------------------------------------------------
// Revocation — RFC 7009
// ---------------------------------------------------------------------------

export async function revokeEndpoint(req: Request): Promise<Response> {
  const form = await readForm(req);
  const token = form.get("token");
  if (token) await revokeToken(token);
  // RFC 7009 §2.2: an unknown or malformed token is still a 200. Reporting
  // "that token does not exist" would turn this into an oracle.
  return tokenJson({}, 200);
}

// ---------------------------------------------------------------------------
// Scope catalogue, for the setup page
// ---------------------------------------------------------------------------

export function scopeCatalogue(): { scope: string; description: string }[] {
  return SCOPES.map((scope) => ({ scope, description: SCOPE_DESCRIPTIONS[scope] }));
}

export const ALL_SCOPES_STRING = formatScopeString(SCOPES);
