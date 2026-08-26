/**
 * Self-contained prompt a student pastes into Claude, Cursor, or any agent
 * to connect LionPlan's MCP server and know what it can do.
 */

import { SCOPES, SCOPE_DESCRIPTIONS } from "./auth";
import {
  MCP_PATH,
  PROPOSAL_REVIEW_PATH,
  SERVER_NAME,
  SERVER_TITLE,
  SETUP_PATH,
} from "./config";
import { TOOLS } from "./tools";

export interface AgentTask {
  id: string;
  title: string;
  example: string;
  prompt: string;
}

/** Short prompts for the task cards on `/mcp-setup`. */
export function buildAgentTasks(): AgentTask[] {
  return [
    {
      id: "search",
      title: "Search courses",
      example: 'search_courses query="machine learning"',
      prompt:
        'Search the Columbia course catalog for "machine learning" in Fall 2026. Use search_courses and include seat counts with sourceAsOf timestamps.',
    },
    {
      id: "conflicts",
      title: "Check conflicts",
      example: "check_conflicts sectionIds=[…]",
      prompt:
        "Check my proposed schedule for time overlaps and duplicate courses using check_conflicts.",
    },
    {
      id: "schedule",
      title: "Read my schedule",
      example: "get_my_schedule",
      prompt:
        "Read my LionPlan classes with get_my_schedule — it returns my saved list with the " +
        "meeting times resolved, which is the same thing as my schedule.",
    },
    {
      id: "watch",
      title: "Watch a section",
      example: 'watch_section sectionId="COMS4118W-001"',
      prompt:
        'Watch section COMS4118W-001 for seat changes with watch_section. Tell me the current seat count and sourceAsOf timestamp.',
    },
  ];
}

export interface BuildAgentInstructionsInput {
  /** Absolute MCP resource URL, e.g. https://catalog.example.com/api/mcp */
  mcpEndpointUrl: string;
}

/** One copy-paste block: connect steps, tool inventory, and honesty rules. */
export function buildAgentInstructions({
  mcpEndpointUrl,
}: BuildAgentInstructionsInput): string {
  const baseUrl = mcpEndpointUrl.endsWith(MCP_PATH)
    ? mcpEndpointUrl.slice(0, -MCP_PATH.length)
    : mcpEndpointUrl;

  const setupUrl = `${baseUrl}${SETUP_PATH}`;
  const proposalReviewUrl = `${baseUrl}${PROPOSAL_REVIEW_PATH}`;

  const clientConfigJson = JSON.stringify(
    { mcpServers: { [SERVER_NAME]: { type: "http", url: mcpEndpointUrl } } },
    null,
    2,
  );

  const claudeCodeCommand = `claude mcp add --transport http ${SERVER_NAME} ${mcpEndpointUrl}`;

  const publicTools = TOOLS.filter((tool) => tool.scopes.length === 0);
  const scopedTools = TOOLS.filter((tool) => tool.scopes.length > 0);

  const formatTools = (tools: typeof TOOLS) =>
    tools.map((tool) => `- ${tool.name}: ${tool.title}`).join("\n");

  const scopeLines = SCOPES.map((scope) => `- ${scope}: ${SCOPE_DESCRIPTIONS[scope]}`).join(
    "\n",
  );

  return `Connect to ${SERVER_TITLE} via MCP so you can help me search Columbia courses, read seat counts, analyze schedule conflicts, and plan my semester.

## Connect

Add this MCP server to my client:

\`\`\`json
${clientConfigJson}
\`\`\`

Claude Code one-liner:
\`\`\`
${claudeCodeCommand}
\`\`\`

## Tools (no account needed)

${formatTools(publicTools)}

## Tools (after I sign in via OAuth)

${formatTools(scopedTools)}

## OAuth scopes you may be granted

${scopeLines}

## Rules

- LionPlan is read-only toward Columbia — never register, drop, or waitlist anyone.
- Every seat count includes a sourceAsOf timestamp — always tell me when you looked.
- add_section and remove_section create proposals I must accept at ${proposalReviewUrl} — they do not change my saved plan.
- watch_section writes directly (additive and reversible).
- Sign-in uses my @columbia.edu or @barnard.edu Google account in a browser tab — never paste tokens into config files.

Full setup guide: ${setupUrl}`;
}
