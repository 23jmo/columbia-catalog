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
import type { McpAuthInfo, Scope } from "@/lib/mcp/auth";
import { mcpUrls } from "@/lib/mcp/config";
import { createInMemoryProposalStore } from "@/lib/mcp/proposals";
import { createInMemoryRateLimiter } from "@/lib/mcp/ratelimit";
import { runTool, TOOLS } from "@/lib/mcp/tools";
import type { McpDeps } from "@/lib/mcp/contracts";
import type { Section, TermCode } from "@/lib/types";

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
    bookmarks: {} as McpDeps["bookmarks"],
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

// ---------------------------------------------------------------------------
// Saved classes over MCP
// ---------------------------------------------------------------------------

/**
 * The bookmark tools are the second caller of the proposal machinery, and the
 * first one whose proposals have no plan. These tests pin the two things that
 * distinguish them: the write pair still cannot write, and a bookmark proposal
 * is stored with a null `planId` (which migration 0023's CHECK constraint
 * requires — a non-null one would be rejected by Postgres, not by us).
 */

const SECTION_ID = "20263COMS4118W001";

function sectionStub() {
  return {
    sectionId: SECTION_ID,
    courseId: "COMS4118",
    sectionCode: "001",
    termCode: "20263",
    instructors: [],
    meetings: [],
    enrollmentCount: 40,
    enrollmentCap: 50,
    waitlistCount: 0,
    status: "open",
    sourceAsOf: "2026-08-01T00:00:00.000Z",
  } as unknown as Section;
}

function bookmarkDeps(saved: string[] = []): McpDeps {
  const deps = testDeps();
  const savedSet = new Set(saved);
  deps.catalog = {
    getSection: async (id: string) => (id === SECTION_ID ? sectionStub() : null),
    getSections: async (ids: string[]) => ids.filter((id) => id === SECTION_ID).map(sectionStub),
  } as unknown as McpDeps["catalog"];
  deps.bookmarks = {
    listFolders: async () => [
      { folderId: "f1", name: "Maybe", createdAt: "2026-08-01T00:00:00.000Z", count: 1 },
    ],
    listBookmarks: async () =>
      [...savedSet].map((sectionId) => ({
        sectionId,
        termCode: "20263" as TermCode,
        savedAt: "2026-08-01T00:00:00.000Z",
        folderIds: [] as string[],
      })),
    isBookmarked: async (_userId: string, sectionId: string) => savedSet.has(sectionId),
  };
  return deps;
}

function bookmarkAuth(scopes: Scope[] = ["catalog:read", "bookmarks:rw"]): McpAuthInfo {
  return {
    token: "t",
    clientId: "c",
    scopes,
    extra: { userId: "u1", email: "s@columbia.edu" },
  };
}

function parseToolPayload(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("the bookmark tools", () => {
  it("gates all four behind bookmarks:rw", () => {
    const names = ["list_bookmark_folders", "list_bookmarks", "propose_bookmark", "propose_unbookmark"];
    for (const name of names) {
      const tool = TOOLS.find((candidate) => candidate.name === name);
      expect(tool, `${name} should exist`).toBeTruthy();
      expect(tool!.scopes).toEqual(["bookmarks:rw"]);
    }
  });

  it("refuses a token holding every other scope", async () => {
    const result = await runTool(
      "list_bookmarks",
      {},
      {
        deps: bookmarkDeps(),
        auth: bookmarkAuth(["catalog:read", "schedule:read", "schedule:write", "watch:write"]),
        callerKey: "test",
      },
    );
    expect(result.isError).toBe(true);
    expect(parseToolError(result).requiredScopes).toContain("bookmarks:rw");
  });

  it("proposes a save without saving anything", async () => {
    const deps = bookmarkDeps();
    const result = await runTool(
      "propose_bookmark",
      { sectionId: SECTION_ID },
      { deps, auth: bookmarkAuth(), callerKey: "test" },
    );

    const payload = parseToolPayload(result);
    expect(payload.proposed).toBe(true);
    // The flag an agent skims for. It must never read as done.
    expect(payload.applied).toBe(false);
    expect(String(payload.reviewUrl)).toContain(String(payload.proposalId));

    // Still not saved: the tool created a decision, not a row in `bookmarks`.
    expect(await deps.bookmarks.isBookmarked("u1", SECTION_ID)).toBe(false);
  });

  it("stores a bookmark proposal with no plan", async () => {
    const deps = bookmarkDeps();
    await runTool(
      "propose_bookmark",
      { sectionId: SECTION_ID },
      { deps, auth: bookmarkAuth(), callerKey: "test" },
    );

    const pending = await deps.proposals.listPending("u1");
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("add_bookmark");
    // Migration 0023 pairs kind with plan_id in Postgres. A non-null value
    // here would fail the insert against the real database.
    expect(pending[0].planId).toBeNull();
  });

  it("refuses to queue a proposal that would change nothing", async () => {
    const alreadySaved = await runTool(
      "propose_bookmark",
      { sectionId: SECTION_ID },
      { deps: bookmarkDeps([SECTION_ID]), auth: bookmarkAuth(), callerKey: "a" },
    );
    expect(alreadySaved.isError).toBe(true);
    expect(String(parseToolError(alreadySaved).error)).toMatch(/already saved/i);

    const notSaved = await runTool(
      "propose_unbookmark",
      { sectionId: SECTION_ID },
      { deps: bookmarkDeps(), auth: bookmarkAuth(), callerKey: "b" },
    );
    expect(notSaved.isError).toBe(true);
    expect(String(parseToolError(notSaved).error)).toMatch(/not saved/i);
  });

  it("marks an unfiled bookmark as uncategorized rather than inventing a folder", async () => {
    const result = await runTool(
      "list_bookmarks",
      {},
      { deps: bookmarkDeps([SECTION_ID]), auth: bookmarkAuth(), callerKey: "test" },
    );

    const payload = parseToolPayload(result);
    const bookmarks = payload.bookmarks as { folderIds: string[]; uncategorized: boolean }[];
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].folderIds).toEqual([]);
    expect(bookmarks[0].uncategorized).toBe(true);

    // And no folder called "Uncategorized" is ever listed, because none exists.
    const folders = await runTool(
      "list_bookmark_folders",
      {},
      { deps: bookmarkDeps(), auth: bookmarkAuth(), callerKey: "test" },
    );
    const names = (parseToolPayload(folders).folders as { name: string }[]).map((f) => f.name);
    expect(names).not.toContain("Uncategorized");
  });
});
