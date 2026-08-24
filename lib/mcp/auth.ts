/**
 * OAuth 2.0 for the Columbia Catalog MCP server.
 *
 * Spec §16 chose the proper OAuth flow rather than pasted personal access
 * tokens: the client opens a browser, the student signs in with Google, the
 * agent receives a scoped refreshable token. Nothing long-lived is ever copied
 * into a plaintext config file.
 *
 * What lives here:
 *   - the scope vocabulary and scope checking
 *   - PKCE (RFC 7636) challenge generation and verification
 *   - access/refresh token minting and verification (HMAC-signed, stateless)
 *   - the identity-provider seam plus a dev stub, so the whole dance is
 *     verifiable end to end before Supabase/Google is provisioned
 *   - short-lived stores for authorization codes, in-flight sign-ins, and
 *     dynamically registered clients
 *
 * The HTTP endpoints that drive all of this live in `lib/mcp/oauth-endpoints.ts`
 * and are mounted by `app/api/mcp/oauth/[...oauth]/route.ts`.
 */

import { ALLOWED_EMAIL_DOMAINS, mcpUrls } from "./config";

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

/**
 * Read is separated from write so a student can grant catalog access without
 * granting plan mutation (spec §16).
 *
 *   catalog:read    the public catalog, ratings, seat history, analysis
 *   schedule:read   the student's own plans, watches, pending proposals
 *   schedule:write  propose a change to a plan (still never applies it)
 *   watch:write     start watching a section for seat changes
 *   bookmarks:rw    read the student's saved classes and folders, and propose
 *                   saving or unsaving one
 *
 * `bookmarks:rw` is one scope rather than a read/write pair because its write
 * half cannot change anything on its own — it creates a pending proposal the
 * student still has to accept. Splitting it would ask a student to reason
 * about a distinction the system does not actually make.
 */
export const SCOPES = [
  "catalog:read",
  "schedule:read",
  "schedule:write",
  "watch:write",
  "bookmarks:rw",
] as const;

export type Scope = (typeof SCOPES)[number];

const SCOPE_SET = new Set<string>(SCOPES);

export const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  "catalog:read": "Search the catalog, read course detail, ratings and seat history",
  "schedule:read": "Read your saved schedules, watches and pending proposals",
  "schedule:write": "Propose changes to your schedule for you to accept or reject",
  "watch:write": "Watch a section and alert you when seats change",
  "bookmarks:rw": "Read your saved classes and folders, and suggest ones to save",
};

/**
 * Always granted. Every token can at minimum read the public catalog, so an
 * agent authorized only for schedule access is never mysteriously unable to
 * look up the course it is talking about.
 */
export const BASELINE_SCOPES: Scope[] = ["catalog:read"];

/** Granted when a client requests no scope at all. Read-only by construction. */
export const DEFAULT_SCOPES: Scope[] = ["catalog:read", "schedule:read"];

export function isScope(value: string): value is Scope {
  return SCOPE_SET.has(value);
}

export function parseScopeString(raw: string | null | undefined): {
  granted: Scope[];
  unknown: string[];
} {
  if (!raw || !raw.trim()) return { granted: [...DEFAULT_SCOPES], unknown: [] };
  const requested = raw.split(/\s+/).filter(Boolean);
  const granted = new Set<Scope>(BASELINE_SCOPES);
  const unknown: string[] = [];
  for (const item of requested) {
    if (isScope(item)) granted.add(item);
    else unknown.push(item);
  }
  return { granted: [...granted], unknown };
}

export function formatScopeString(scopes: readonly Scope[]): string {
  return scopes.join(" ");
}

export function hasScopes(granted: readonly string[], required: readonly Scope[]): boolean {
  const set = new Set(granted);
  return required.every((scope) => set.has(scope));
}

export function missingScopes(granted: readonly string[], required: readonly Scope[]): Scope[] {
  const set = new Set(granted);
  return required.filter((scope) => !set.has(scope));
}

// ---------------------------------------------------------------------------
// base64url + crypto primitives (WebCrypto, so this runs on node and edge)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(input));
  return new Uint8Array(digest);
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** Length-independent comparison. Both sides are our own base64url strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// PKCE — RFC 7636
// ---------------------------------------------------------------------------

export type CodeChallengeMethod = "S256" | "plain";

/** RFC 7636 §4.1: 43–128 chars from the unreserved set. */
const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isValidCodeVerifier(verifier: string): boolean {
  return VERIFIER_PATTERN.test(verifier);
}

export async function computeCodeChallenge(
  verifier: string,
  method: CodeChallengeMethod,
): Promise<string> {
  if (method === "plain") return verifier;
  return base64UrlEncode(await sha256(verifier));
}

/**
 * Verifies a PKCE code_verifier against the challenge captured at authorize
 * time. Returns false — never throws — for every failure mode, so a caller
 * cannot accidentally distinguish "malformed" from "wrong" in a response.
 */
export async function verifyPkce(
  verifier: string,
  challenge: string,
  method: CodeChallengeMethod,
): Promise<boolean> {
  if (!isValidCodeVerifier(verifier)) return false;
  if (!challenge) return false;
  try {
    const computed = await computeCodeChallenge(verifier, method);
    return timingSafeEqual(computed, challenge);
  } catch {
    return false;
  }
}

/** Convenience for tests and for the dev stub client. */
export function generateCodeVerifier(): string {
  return randomToken(32) + randomToken(16).slice(0, 11); // 43+ chars, unreserved
}

// ---------------------------------------------------------------------------
// Token signing
// ---------------------------------------------------------------------------

/**
 * ── SECRET SEAM ──────────────────────────────────────────────────────────
 * `MCP_TOKEN_SECRET` must be set in every deployed environment. The dev
 * fallback below keeps `next dev` and the test suite working without any
 * provisioning; it is process-local and regenerated on restart, so a token
 * minted before a restart simply stops verifying. `assertProductionSecret()`
 * is called from the token endpoint so a missing secret in production is a
 * loud failure rather than a silent one.
 * ─────────────────────────────────────────────────────────────────────────
 */
let devSecret: string | null = null;

function tokenSecret(): string {
  const configured = process.env.MCP_TOKEN_SECRET;
  if (configured && configured.length >= 16) return configured;
  if (!devSecret) devSecret = randomToken(32);
  return devSecret;
}

export function assertProductionSecret(): void {
  if (process.env.NODE_ENV === "production" && !process.env.MCP_TOKEN_SECRET) {
    throw new Error("MCP_TOKEN_SECRET is required in production");
  }
}

let hmacKeyCache: { secret: string; key: CryptoKey } | null = null;

async function hmacKey(): Promise<CryptoKey> {
  const secret = tokenSecret();
  if (hmacKeyCache && hmacKeyCache.secret === secret) return hmacKeyCache.key;
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  hmacKeyCache = { secret, key };
  return key;
}

async function sign(payload: string): Promise<string> {
  const signature = await globalThis.crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

export type TokenKind = "access" | "refresh";

interface TokenClaims {
  /** Token kind. An access token is never accepted as a refresh token. */
  k: TokenKind;
  /** Subject — our internal user id. */
  sub: string;
  /** OAuth client id. */
  cid: string;
  /** Granted scopes. */
  scp: Scope[];
  /** RFC 8707 resource identifier this token is valid for. */
  aud: string;
  /** Issued-at and expiry, seconds since epoch. */
  iat: number;
  exp: number;
  /** Unique id, used for refresh-token rotation and revocation. */
  jti: string;
  /** Email, carried so tools can attribute without a second lookup. */
  email: string;
}

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

async function encodeToken(claims: TokenClaims): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signature = await sign(body);
  return `v1.${body}.${signature}`;
}

async function decodeToken(token: string): Promise<TokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, body, signature] = parts;
  let expected: string;
  try {
    expected = await sign(body);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, signature)) return null;
  try {
    const claims = JSON.parse(decoder.decode(base64UrlDecode(body))) as TokenClaims;
    if (!claims || typeof claims !== "object") return null;
    if (claims.k !== "access" && claims.k !== "refresh") return null;
    if (!Array.isArray(claims.scp)) return null;
    return claims;
  } catch {
    return null;
  }
}

export interface IssuedTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface TokenSubject {
  userId: string;
  email: string;
  clientId: string;
  scopes: Scope[];
  /** The MCP endpoint URL this token is bound to. */
  resource: string;
}

export async function issueTokens(subject: TokenSubject, now = Date.now()): Promise<IssuedTokens> {
  const issuedAt = Math.floor(now / 1000);
  const base = {
    sub: subject.userId,
    cid: subject.clientId,
    scp: subject.scopes,
    aud: subject.resource,
    iat: issuedAt,
    email: subject.email,
  };

  const accessJti = randomToken(12);
  const refreshJti = randomToken(12);

  const access = await encodeToken({
    ...base,
    k: "access",
    exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
    jti: accessJti,
  });
  const refresh = await encodeToken({
    ...base,
    k: "refresh",
    exp: issuedAt + REFRESH_TOKEN_TTL_SECONDS,
    jti: refreshJti,
  });

  activeRefreshJtis.add(refreshJti);

  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh,
    scope: formatScopeString(subject.scopes),
  };
}

/**
 * Live refresh-token ids. Rotation removes the old id, so a replayed refresh
 * token is rejected.
 *
 * ── PERSISTENCE SEAM ── move to a `mcp_refresh_tokens` table alongside the
 * proposals table; the interface is a set membership test and a delete.
 */
const activeRefreshJtis = new Set<string>();

/** The shape MCP tool handlers receive — mirrors the SDK's `AuthInfo`. */
export interface McpAuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
  resource?: URL;
  extra: { userId: string; email: string };
}

export type AccessTokenFailure =
  | "invalid_token"
  | "expired_token"
  | "wrong_token_kind"
  | "wrong_resource";

export async function verifyAccessToken(
  token: string,
  expectedResource: string,
  now = Date.now(),
): Promise<{ ok: true; auth: McpAuthInfo } | { ok: false; reason: AccessTokenFailure }> {
  const claims = await decodeToken(token);
  if (!claims) return { ok: false, reason: "invalid_token" };
  if (claims.k !== "access") return { ok: false, reason: "wrong_token_kind" };
  if (claims.exp * 1000 <= now) return { ok: false, reason: "expired_token" };
  // RFC 8707: a token minted for a different resource server is not ours.
  if (claims.aud !== expectedResource) return { ok: false, reason: "wrong_resource" };

  return {
    ok: true,
    auth: {
      token,
      clientId: claims.cid,
      scopes: claims.scp,
      expiresAt: claims.exp,
      resource: new URL(claims.aud),
      extra: { userId: claims.sub, email: claims.email },
    },
  };
}

export async function redeemRefreshToken(
  token: string,
  clientId: string,
  requestedScope: string | null,
  now = Date.now(),
): Promise<
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; reason: "invalid_grant" | "invalid_client" | "invalid_scope" }
> {
  const claims = await decodeToken(token);
  if (!claims || claims.k !== "refresh") return { ok: false, reason: "invalid_grant" };
  if (claims.exp * 1000 <= now) return { ok: false, reason: "invalid_grant" };
  if (!activeRefreshJtis.has(claims.jti)) return { ok: false, reason: "invalid_grant" };
  if (claims.cid !== clientId) return { ok: false, reason: "invalid_client" };

  // A refresh may narrow scope but never widen it.
  let scopes = claims.scp;
  if (requestedScope) {
    const { granted } = parseScopeString(requestedScope);
    if (!granted.every((scope) => claims.scp.includes(scope))) {
      return { ok: false, reason: "invalid_scope" };
    }
    scopes = granted;
  }

  activeRefreshJtis.delete(claims.jti); // rotation: the old token dies here
  const tokens = await issueTokens(
    {
      userId: claims.sub,
      email: claims.email,
      clientId: claims.cid,
      scopes,
      resource: claims.aud,
    },
    now,
  );
  return { ok: true, tokens };
}

export async function revokeToken(token: string): Promise<void> {
  const claims = await decodeToken(token);
  if (claims?.k === "refresh") activeRefreshJtis.delete(claims.jti);
  // Access tokens are short-lived and stateless; nothing to revoke.
}

// ---------------------------------------------------------------------------
// Client registry — RFC 7591 dynamic client registration
// ---------------------------------------------------------------------------

export interface RegisteredClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: "none";
  scope: string;
  client_id_issued_at: number;
}

/**
 * ── PERSISTENCE SEAM ── an `mcp_oauth_clients` table. In-process today, which
 * means a cold start forces a client to re-register. Every MCP client handles
 * that transparently because registration is part of its normal auth flow.
 */
const clients = new Map<string, RegisteredClient>();

export function registerClient(input: {
  client_name?: unknown;
  redirect_uris: string[];
  scope?: string | null;
}): RegisteredClient {
  const client: RegisteredClient = {
    client_id: `cc_${randomToken(16)}`,
    client_name:
      typeof input.client_name === "string" && input.client_name.trim()
        ? input.client_name.trim().slice(0, 120)
        : "MCP client",
    redirect_uris: input.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    // Public clients only. There is no client secret to leak, which is the
    // whole reason PKCE is mandatory below.
    token_endpoint_auth_method: "none",
    scope: input.scope ?? formatScopeString(SCOPES),
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
  clients.set(client.client_id, client);
  return client;
}

export function getClient(clientId: string): RegisteredClient | null {
  return clients.get(clientId) ?? null;
}

/**
 * Redirect URIs must be an exact registered match, with one carve-out for
 * loopback ports: RFC 8252 §7.3 lets a native client pick an ephemeral port,
 * so `http://127.0.0.1:PORT/callback` matches on everything but the port.
 */
export function isAllowedRedirectUri(client: RegisteredClient, candidate: string): boolean {
  if (client.redirect_uris.includes(candidate)) return true;
  let candidateUrl: URL;
  try {
    candidateUrl = new URL(candidate);
  } catch {
    return false;
  }
  const isLoopback =
    candidateUrl.hostname === "127.0.0.1" ||
    candidateUrl.hostname === "::1" ||
    candidateUrl.hostname === "localhost";
  if (!isLoopback) return false;

  return client.redirect_uris.some((registered) => {
    try {
      const url = new URL(registered);
      return (
        url.protocol === candidateUrl.protocol &&
        url.hostname === candidateUrl.hostname &&
        url.pathname === candidateUrl.pathname
      );
    } catch {
      return false;
    }
  });
}

export function isValidRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    // Native clients: loopback HTTP and private-use schemes are both legal.
    if (url.protocol === "http:") {
      return ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
    }
    return url.protocol.endsWith(":") && url.protocol.includes(".");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// In-flight authorization state
// ---------------------------------------------------------------------------

/** What the client asked for, held while the student is off signing in. */
export interface PendingAuthorization {
  flowId: string;
  clientId: string;
  redirectUri: string;
  scopes: Scope[];
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: CodeChallengeMethod;
  resource: string;
  expiresAt: number;
}

/** An issued authorization code, redeemable exactly once. */
export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scopes: Scope[];
  codeChallenge: string;
  codeChallengeMethod: CodeChallengeMethod;
  resource: string;
  userId: string;
  email: string;
  expiresAt: number;
}

const pendingAuthorizations = new Map<string, PendingAuthorization>();
const authorizationCodes = new Map<string, AuthorizationCode>();

export const AUTHORIZATION_FLOW_TTL_MS = 10 * 60 * 1000;
export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000;

export function startAuthorizationFlow(
  input: Omit<PendingAuthorization, "flowId" | "expiresAt">,
  now = Date.now(),
): PendingAuthorization {
  const pending: PendingAuthorization = {
    ...input,
    flowId: randomToken(18),
    expiresAt: now + AUTHORIZATION_FLOW_TTL_MS,
  };
  pendingAuthorizations.set(pending.flowId, pending);
  return pending;
}

export function takeAuthorizationFlow(
  flowId: string,
  now = Date.now(),
): PendingAuthorization | null {
  const pending = pendingAuthorizations.get(flowId);
  if (!pending) return null;
  pendingAuthorizations.delete(flowId);
  if (pending.expiresAt <= now) return null;
  return pending;
}

export function issueAuthorizationCode(
  pending: PendingAuthorization,
  identity: McpIdentity,
  now = Date.now(),
): AuthorizationCode {
  const code: AuthorizationCode = {
    code: randomToken(24),
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    scopes: pending.scopes,
    codeChallenge: pending.codeChallenge,
    codeChallengeMethod: pending.codeChallengeMethod,
    resource: pending.resource,
    userId: identity.userId,
    email: identity.email,
    expiresAt: now + AUTHORIZATION_CODE_TTL_MS,
  };
  authorizationCodes.set(code.code, code);
  return code;
}

/** Single-use: the code is consumed on lookup whether or not PKCE then passes. */
export function takeAuthorizationCode(code: string, now = Date.now()): AuthorizationCode | null {
  const found = authorizationCodes.get(code);
  if (!found) return null;
  authorizationCodes.delete(code);
  if (found.expiresAt <= now) return null;
  return found;
}

// ---------------------------------------------------------------------------
// Identity provider seam
// ---------------------------------------------------------------------------

export interface McpIdentity {
  userId: string;
  email: string;
  name: string | null;
}

/**
 * ── IDENTITY PROVIDER SEAM ─────────────────────────────────────────────────
 * The real implementation is Supabase Google SSO restricted to columbia.edu
 * and barnard.edu (spec §15). It is not provisioned yet, so the dev stub below
 * completes the same round trip locally and the flow is verifiable end to end.
 *
 * To plug Google in, implement this interface against Supabase:
 *
 *   buildSignInUrl(flowId, returnTo)
 *     → supabase.auth.signInWithOAuth({ provider: "google",
 *         options: { redirectTo: returnTo, queryParams: { hd: "columbia.edu",
 *                    state: flowId } } }).data.url
 *
 *   resolveIdentity(params)
 *     → exchange `params.get("code")` with supabase.auth.exchangeCodeForSession,
 *       then map the session user to { userId, email, name }.
 *
 * Then set `MCP_IDENTITY_PROVIDER=supabase` and register it here. Everything
 * above this line — codes, PKCE, tokens, scopes — is unchanged by the swap.
 * ───────────────────────────────────────────────────────────────────────────
 */
export interface IdentityProvider {
  readonly id: string;
  /** Where to send the browser so the student can sign in. */
  buildSignInUrl(flowId: string, returnTo: string): string;
  /** Turn whatever the provider sent back into a verified identity. */
  resolveIdentity(params: URLSearchParams): Promise<McpIdentity | null>;
}

export function isAllowedEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return ALLOWED_EMAIL_DOMAINS.some((allowed) => domain === allowed);
}

/**
 * Dev stub. Sends the browser straight back to our own callback with a
 * synthetic identity so the full authorization-code + PKCE dance can be walked
 * without Google. Refuses to activate when NODE_ENV is production.
 */
export function createDevStubIdentityProvider(): IdentityProvider {
  return {
    id: "dev-stub",
    buildSignInUrl(flowId, returnTo) {
      const url = new URL(returnTo);
      url.searchParams.set("flow", flowId);
      url.searchParams.set("dev_stub", "1");
      return url.toString();
    },
    async resolveIdentity(params) {
      const email = params.get("dev_email") ?? "dev-student@columbia.edu";
      if (!isAllowedEmail(email)) return null;
      return {
        // Stable per email so repeat sign-ins land on the same account.
        userId: `dev_${base64UrlEncode(await sha256(email)).slice(0, 16)}`,
        email,
        name: "Dev Student",
      };
    },
  };
}

let identityProvider: IdentityProvider | null = null;

export function getIdentityProvider(): IdentityProvider {
  if (identityProvider) return identityProvider;
  if (process.env.NODE_ENV === "production" && !process.env.MCP_ALLOW_DEV_IDENTITY) {
    throw new Error(
      "No identity provider configured. Register a Supabase-backed IdentityProvider " +
        "via setIdentityProvider() before serving OAuth in production.",
    );
  }
  identityProvider = createDevStubIdentityProvider();
  return identityProvider;
}

export function setIdentityProvider(provider: IdentityProvider | null): void {
  identityProvider = provider;
}

// ---------------------------------------------------------------------------
// WWW-Authenticate — how a client discovers it needs to sign in
// ---------------------------------------------------------------------------

/**
 * RFC 9728 §5.1. The `resource_metadata` hint is what lets a client find our
 * protected-resource document even though it does not sit at the origin root.
 */
export function buildWwwAuthenticate(
  baseUrl: string,
  options: { error?: string; description?: string; scope?: readonly Scope[] } = {},
): string {
  const urls = mcpUrls(baseUrl);
  const parts = [`Bearer resource_metadata="${urls.protectedResourceMetadataUrl}"`];
  if (options.error) parts.push(`error="${options.error}"`);
  if (options.description) parts.push(`error_description="${escapeQuoted(options.description)}"`);
  if (options.scope?.length) parts.push(`scope="${formatScopeString(options.scope)}"`);
  return parts.join(", ");
}

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Test seam: drop every in-process store so cases cannot leak into each other. */
export function __resetAuthStateForTests(): void {
  clients.clear();
  pendingAuthorizations.clear();
  authorizationCodes.clear();
  activeRefreshJtis.clear();
  identityProvider = null;
  hmacKeyCache = null;
}
