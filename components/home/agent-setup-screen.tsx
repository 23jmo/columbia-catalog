import { buildAgentInstructions, buildAgentTasks } from "@/lib/mcp/agent-instructions";
import { SERVER_NAME } from "@/lib/mcp/config";
import { AgentSetupPanel } from "@/components/home/agent-setup-panel";

export interface AgentSetupScreenProps {
  mcpEndpointUrl: string;
}

/** Server wrapper — resolves copy strings, renders the client panel. */
export function AgentSetupScreen({ mcpEndpointUrl }: AgentSetupScreenProps) {
  const instructions = buildAgentInstructions({ mcpEndpointUrl });
  const jsonConfig = JSON.stringify(
    { mcpServers: { [SERVER_NAME]: { type: "http", url: mcpEndpointUrl } } },
    null,
    2,
  );
  const claudeCommand = `claude mcp add --transport http ${SERVER_NAME} ${mcpEndpointUrl}`;

  return (
    <AgentSetupPanel
      instructions={instructions}
      claudeCommand={claudeCommand}
      jsonConfig={jsonConfig}
      tasks={buildAgentTasks()}
    />
  );
}
