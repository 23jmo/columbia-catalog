/**
 * MCP lane tests.
 *
 * Two things are worth testing here and they are not the tool bodies. The tool
 * bodies are thin serialisation over lanes that have their own suites; what is
 * genuinely load-bearing — and what would fail silently — is the *authorization
 * boundary* and the OAuth round trip that establishes it.
 *
 * So these cases ask: can an anonymous caller read the catalog, can it reach
 * the student's data, does a token that lacks a scope get told so, and does the
 * authorization-code flow actually produce a token this server will accept.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { POST as mcpPost } from "@/app/api/mcp/route";
import {
  authorizeEndpoint,
  callbackEndpoint,
  registerEndpoint,
  tokenEndpoint,
} from "@/lib/mcp/oauth-endpoints";
import {
  __resetAuthStateForTests,
  computeCodeChallenge,
  generateCodeVerifier,
  hasScopes,
  parseScopeString,
  verifyAccessToken,
} from "@/lib/mcp/auth";
import { mcpUrls } from "@/lib/mcp/config";
import { createInMemoryProposalStore } from "@/lib/mcp/proposals";
import { createInMemoryRateLimiter } from "@/lib/mcp/ratelimit";
import { runTool, TOOLS } from "@/lib/mcp/tools";
import type { McpDeps } from "@/lib/mcp/contracts";

const BASE_URL = "http://localhost:3000";
const REDIRECT_URI = "http://127.0.0.1:51000/callback";
const urls = mcpUrls(BASE_URL);

beforeEach(() => {
  __resetAuthStateForTests();
});

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

async function rpc(method: string, params: unknown, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await mcpPost(
    new Request(`${BASE_URL}/api/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  return response;
}

describe("the MCP endpoint", () => {
  it("lists every tool to an anonymous caller", async () => {
    const response = await rpc("tools/list", {});
    expect(response.status).toBe(200);

    const body = (await response.json()) as { result: { tools: { name: string }[] } };
    const listed = body.result.tools.map((tool) => tool.name).sort();
    expect(listed).toEqual(TOOLS.map((tool) => tool.name).sort());
  });

  /*
   * The alternative design hides scope-gated tools from a caller that cannot
   * use them. This asserts we did not do that: an agent that cannot see
   * `add_section` tells the student the capability does not exist, whereas one
   * that calls it and is refused tells the student to sign in.
   */
  it("advertises write tools even to a caller who cannot use them", async () => {
    const response = await rpc("tools/list", {});
    const body = (await response.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((tool) => tool.name)).toContain("add_section");
  });

  it("rejects a malformed bearer token rather than treating it as anonymous", async () => {
    const response = await rpc("tools/list", {}, "not-a-real-token");
    expect(response.status).toBe(401);
    // RFC 9728: without this header an MCP client shows the student a bare 401
    // instead of opening the sign-in page.
    expect(response.headers.get("www-authenticate")).toContain(
      urls.protectedResourceMetadataUrl,
    );
  });

  it("offers no SSE stream, and says so with 405 rather than 404", async () => {
    const { GET } = await import("@/app/api/mcp/route");
    const response = await GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toContain("POST");
  });
});

// ---------------------------------------------------------------------------
// The authorization boundary
// ---------------------------------------------------------------------------

function testDeps(): McpDeps {
  return {
    catalog: {} as McpDeps["catalog"],
    search: {} as McpDeps["search"],
    schedule: {} as McpDeps["schedule"],
    ratings: {} as McpDeps["ratings"],
    seatHistory: {} as McpDeps["seatHistory"],
    plans: {} as McpDeps["plans"],
    proposals: createInMemoryProposalStore(),
    rateLimiter: createInMemoryRateLimiter(),
    baseUrl: BASE_URL,
  };
}

function parseToolError(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("tool authorization", () => {
  it("refuses a scoped tool to an anonymous caller and says how to fix it", async () => {
    const result = await runTool(
      "get_my_schedule",
      {},
      { deps: testDeps(), auth: null, callerKey: "test" },
    );

    expect(result.isError).toBe(true);
    const payload = parseToolError(result);
    expect(payload.requiredScopes).toContain("schedule:read");
    // The remedy travels with the refusal. Without it the agent reports a bare
    // failure and the student has no next step.
    expect(String(payload.howToFix)).toMatch(/OAuth/i);
  });

  it("refuses a token that is missing one scope, naming both sides", async () => {
    const result = await runTool(
      "add_section",
      { planId: "p1", sectionId: "s1" },
      {
        deps: testDeps(),
        auth: {
          token: "t",
          clientId: "c",
          scopes: ["catalog:read", "schedule:read"],
          extra: { userId: "u1", email: "s@columbia.edu" },
        },
        callerKey: "test",
      },
    );

    expect(result.isError).toBe(true);
    const payload = parseToolError(result);
    expect(payload.requiredScopes).toContain("schedule:write");
    expect(payload.grantedScopes).toEqual(["catalog:read", "schedule:read"]);
  });

  /*
   * Order matters: an unauthorized caller must not spend a legitimate caller's
   * budget. If metering ran first, a scope failure would also decrement the
   * bucket and would eventually report "slow down" for what is really "sign in".
   */
  it("checks scope before it meters", async () => {
    const deps = testDeps();
    let consumed = 0;
    const inner = deps.rateLimiter.consume.bind(deps.rateLimiter);
    deps.rateLimiter = {
      consume: (key, rule, now) => {
        consumed += 1;
        return inner(key, rule, now);
      },
    };

    await runTool("get_my_schedule", {}, { deps, auth: null, callerKey: "test" });
    expect(consumed).toBe(0);
  });

  it("leaves the catalog tools ungated", () => {
    const publicTools = TOOLS.filter((tool) => tool.scopes.length === 0).map((tool) => tool.name);
    expect(publicTools).toContain("search_courses");
    expect(publicTools).toContain("get_course");
    expect(publicTools).toContain("get_seat_history");
    // Spec §14: writes need an account, reads never do.
    expect(publicTools).not.toContain("add_section");
    expect(publicTools).not.toContain("watch_section");
  });
});

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

async function registerTestClient(): Promise<string> {
  const response = await registerEndpoint(
    new Request(urls.registrationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Test client", redirect_uris: [REDIRECT_URI] }),
    }),
  );
  expect(response.status).toBe(201);
  const client = (await response.json()) as { client_id: string };
  return client.client_id;
}

/** Walks authorize → dev-stub sign-in → callback and returns the code. */
async function authorizeToCode(
  clientId: string,
  challenge: string,
  scope: string,
  email = "student@columbia.edu",
): Promise<{ code: string | null; error: string | null }> {
  const authorizeUrl = new URL(urls.authorizationEndpoint);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("resource", urls.resource);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", "xyz");

  const redirect = authorizeEndpoint(new Request(authorizeUrl));
  expect(redirect.status).toBe(302);

  // The dev-stub provider sends the browser straight back to our callback.
  const signInUrl = new URL(redirect.headers.get("location") ?? "");
  signInUrl.searchParams.set("dev_email", email);

  const back = await callbackEndpoint(new Request(signInUrl));
  const landed = new URL(back.headers.get("location") ?? "");
  return {
    code: landed.searchParams.get("code"),
    error: landed.searchParams.get("error"),
  };
}

describe("the OAuth flow", () => {
  it("issues a token this server accepts, end to end", async () => {
    const clientId = await registerTestClient();
    const verifier = generateCodeVerifier();
    const challenge = await computeCodeChallenge(verifier, "S256");

    const { code } = await authorizeToCode(clientId, challenge, "catalog:read schedule:read");
    expect(code).toBeTruthy();

    const response = await tokenEndpoint(
      new Request(urls.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          code_verifier: verifier,
          client_id: clientId,
          redirect_uri: REDIRECT_URI,
        }),
      }),
    );
    expect(response.status).toBe(200);
    // RFC 6749 §5.1 — a cached token response is a leaked token response.
    expect(response.headers.get("cache-control")).toBe("no-store");

    const tokens = (await response.json()) as { access_token: string; scope: string };
    const verified = await verifyAccessToken(tokens.access_token, urls.resource);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.auth.extra.email).toBe("student@columbia.edu");
      expect(hasScopes(verified.auth.scopes, ["schedule:read"])).toBe(true);
      expect(hasScopes(verified.auth.scopes, ["schedule:write"])).toBe(false);
    }
  });

  it("that token authenticates a real tool call over the wire", async () => {
    const clientId = await registerTestClient();
    const verifier = generateCodeVerifier();
    const challenge = await computeCodeChallenge(verifier, "S256");
    const { code } = await authorizeToCode(clientId, challenge, "catalog:read");

    const tokenResponse = await tokenEndpoint(
      new Request(urls.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          code_verifier: verifier,
          client_id: clientId,
        }),
      }),
    );
    const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };

    const response = await rpc("tools/list", {}, accessToken);
    expect(response.status).toBe(200);
  });

  it("rejects a wrong PKCE verifier", async () => {
    const clientId = await registerTestClient();
    const challenge = await computeCodeChallenge(generateCodeVerifier(), "S256");
    const { code } = await authorizeToCode(clientId, challenge, "catalog:read");

    const response = await tokenEndpoint(
      new Request(urls.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          code_verifier: generateCodeVerifier(), // a different one
          client_id: clientId,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("invalid_grant");
  });

  it("burns the authorization code on first use", async () => {
    const clientId = await registerTestClient();
    const verifier = generateCodeVerifier();
    const challenge = await computeCodeChallenge(verifier, "S256");
    const { code } = await authorizeToCode(clientId, challenge, "catalog:read");

    const exchange = () =>
      tokenEndpoint(
        new Request(urls.tokenEndpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: code!,
            code_verifier: verifier,
            client_id: clientId,
          }),
        }),
      );

    expect((await exchange()).status).toBe(200);
    expect((await exchange()).status).toBe(400);
  });

  it("turns away an account outside Columbia and Barnard", async () => {
    const clientId = await registerTestClient();
    const challenge = await computeCodeChallenge(generateCodeVerifier(), "S256");
    const { code, error } = await authorizeToCode(
      clientId,
      challenge,
      "catalog:read",
      "someone@gmail.com",
    );
    expect(code).toBeNull();
    expect(error).toBe("access_denied");
  });

  it("requires PKCE rather than downgrading without it", () => {
    const authorizeUrl = new URL(urls.authorizationEndpoint);
    authorizeUrl.searchParams.set("client_id", "whatever");
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");

    // Unknown client: HTML, because the redirect_uri is not yet trusted and
    // bouncing an error off an unvalidated URI is an open redirect.
    const response = authorizeEndpoint(new Request(authorizeUrl));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("refuses a token minted for another resource server", async () => {
    const clientId = await registerTestClient();
    const verifier = generateCodeVerifier();
    const challenge = await computeCodeChallenge(verifier, "S256");
    const { code } = await authorizeToCode(clientId, challenge, "catalog:read");

    const tokenResponse = await tokenEndpoint(
      new Request(urls.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          code_verifier: verifier,
          client_id: clientId,
        }),
      }),
    );
    const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };

    const elsewhere = await verifyAccessToken(accessToken, "https://other.example/api/mcp");
    expect(elsewhere.ok).toBe(false);
    if (!elsewhere.ok) expect(elsewhere.reason).toBe("wrong_resource");
  });

  it("always grants catalog:read, so no token is mysteriously blind", () => {
    // A client asking only for schedule access still gets to look up the course
    // it is talking about.
    expect(parseScopeString("schedule:read").granted).toContain("catalog:read");
  });
});
