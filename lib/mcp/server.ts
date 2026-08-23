/**
 * The MCP server itself — where the tool registry meets the protocol.
 *
 * ── One server per request, on purpose ─────────────────────────────────────
 *
 * `buildMcpServer` is called for every HTTP request rather than once at module
 * load. That looks wasteful and is not: the transport runs in *stateless* mode
 * (no `sessionIdGenerator`), which is the only mode that is correct on Vercel,
 * where consecutive requests from one MCP client routinely land on different
 * function instances. A session-bound server would work perfectly in dev and
 * fail intermittently in production, which is the worst possible failure shape.
 *
 * Building per request also means the caller's identity is closure state rather
 * than something threaded through the protocol. The SDK never learns what a
 * Columbia scope is; `runTool` does the scope check with a `ToolContext` that
 * was fixed before the first byte of JSON-RPC was parsed. An agent cannot talk
 * its way into a different `auth` mid-session because there is no session.
 *
 * ── Deps are module-level, and that distinction matters ────────────────────
 *
 * The *server* is per request; the *dependencies* are not. The rate limiter and
 * the proposal store must outlive a request or they would meter nothing and
 * remember nothing. They are in-memory today (see the persistence seams in
 * `ratelimit.ts` and `proposals.ts`), which on serverless means per-instance —
 * an under-count, never an over-count, and never a lost security decision.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getCourseReputation, getInstructorReputation } from "../db/reputation";

import {
  catalogAdapter,
  plansAdapter,
  scheduleAdapter,
  searchAdapter,
  seatHistoryAdapter,
} from "./adapters";
import type { McpAuthInfo } from "./auth";
import { SERVER_NAME, SERVER_TITLE, SERVER_VERSION } from "./config";
import type { McpDeps, RatingsPort } from "./contracts";
import { createInMemoryProposalStore } from "./proposals";
import { createInMemoryRateLimiter } from "./ratelimit";
import { runTool, TOOLS, type ToolContext } from "./tools";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Course quality and instructor quality come from two functions with no shared
 * path, which is how spec §12's "never averaged" is enforced structurally
 * rather than by convention. See `lib/db/reputation.ts`.
 */
const ratingsAdapter: RatingsPort = { getCourseReputation, getInstructorReputation };

const proposals = createInMemoryProposalStore();
const rateLimiter = createInMemoryRateLimiter();

/**
 * `baseUrl` is per request — it comes from the Host header the client actually
 * dialled — while everything else is shared, so the bundle is assembled here
 * rather than being a module constant.
 */
export function mcpDeps(baseUrl: string): McpDeps {
  return {
    catalog: catalogAdapter,
    search: searchAdapter,
    schedule: scheduleAdapter,
    ratings: ratingsAdapter,
    seatHistory: seatHistoryAdapter,
    plans: plansAdapter,
    proposals,
    rateLimiter,
    baseUrl,
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/**
 * Every tool is advertised to every caller, including an anonymous one.
 *
 * The alternative — hiding `add_section` from a token that lacks
 * `schedule:write` — sounds tidier and is worse. An agent that cannot see a
 * tool concludes the capability does not exist and tells the student so; an
 * agent that calls it and gets back "this needs a signed-in Columbia account,
 * here is how to fix it" tells the student to sign in. The failure carries the
 * remedy, so it is the more useful of the two.
 *
 * Nothing leaks by advertising: the names and descriptions are public product
 * surface, and `runTool` checks scope before the handler runs.
 */
export function buildMcpServer(context: ToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, title: SERVER_TITLE, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "Columbia's course catalog: search, section detail with seat counts and " +
        "their observation time, conflict and commute checks, and the student's " +
        "own saved schedules and watches.\n\n" +
        "Two things to carry into every answer. Seat numbers are a reading taken " +
        "at `seats.sourceAsOf`, not a live feed — say when they were observed and " +
        "send the student to Vergil to register. And a section with " +
        "`meetingsKnown: false` has no published days or times, which is not the " +
        "same as meeting at no time: do not infer a schedule for it, and say the " +
        "times are unpublished.\n\n" +
        "Schedule edits are proposals. `add_section` and `remove_section` return " +
        "a review link for the student to accept; they never change a saved plan.",
    },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          title: tool.title,
          // Only `watch_section` actually writes, and even it is additive and
          // reversible. The proposal tools are read-only against Columbia and
          // against the student's plan — they write a proposal, not a schedule.
          readOnlyHint: tool.name !== "watch_section",
          destructiveHint: false,
          idempotentHint: true,
          // Every tool reads our own database and never the wider internet.
          openWorldHint: false,
        },
      },
      // The SDK has already validated `args` against `inputSchema`; `runTool`
      // owns scope, metering, and error containment. Nothing is decided here.
      //
      // The result is re-emitted as a fresh literal rather than returned
      // straight through: `CallToolResult` carries an open index signature for
      // protocol extensions, and our narrower `ToolResult` interface does not
      // structurally satisfy it. Rebuilding the object is the honest fix —
      // casting would let a future field on `ToolResult` reach the wire
      // unnoticed.
      async (args) => {
        const result = await runTool(tool.name, (args ?? {}) as Record<string, unknown>, context);
        return { content: result.content, ...(result.isError ? { isError: true } : {}) };
      },
    );
  }

  return server;
}

/** Convenience for the route handler and for tests. */
export function toolContext(
  baseUrl: string,
  auth: McpAuthInfo | null,
  callerKey: string,
): ToolContext {
  return { deps: mcpDeps(baseUrl), auth, callerKey };
}
