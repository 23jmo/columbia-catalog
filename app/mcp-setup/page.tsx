/**
 * `/mcp-setup` — connect an agent to this catalog (spec §16).
 *
 * Discovery documents point here (`service_documentation`,
 * `resource_documentation`). A 404 would break a machine-readable promise.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";

import { AppShell } from "@/components/shell/app-shell";
import { AgentSetupScreen } from "@/components/home/agent-setup-screen";
import { MCP_PATH, resolveBaseUrl } from "@/lib/mcp/config";

export const metadata: Metadata = {
  title: "Bring your own agent · Columbia Catalog",
  description: "Connect Claude, Cursor, or any MCP client to Columbia Catalog.",
};

export const dynamic = "force-dynamic";

export default async function McpSetupPage() {
  const requestHeaders = await headers();
  const baseUrl = resolveBaseUrl(new Request("http://internal", { headers: requestHeaders }));
  const mcpEndpointUrl = `${baseUrl}${MCP_PATH}`;

  return (
    <AppShell activeNav="home">
      <div className="mx-auto flex w-full max-w-[640px] min-w-0 flex-col py-2">
        <AgentSetupScreen mcpEndpointUrl={mcpEndpointUrl} />
      </div>
    </AppShell>
  );
}
