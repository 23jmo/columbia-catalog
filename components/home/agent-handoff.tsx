/**
 * The agent column on Home.
 *
 * ── Read spec §16 before changing anything here ─────────────────────────────
 *
 * There is **no in-app AI chat** and this is not a chat box. That role was
 * deliberately replaced: the student points Claude, ChatGPT, or any other MCP
 * client at Columbia Catalog and gets an agent better than one we would build,
 * running inside a tool they already pay for, at zero inference cost and zero
 * abuse surface to us. BoardUI ships `ai-chat` / `composer` / `agent-thinking`
 * components and this lane pointedly does not use them (spec §18).
 *
 * So the column's job is a handoff, in three parts:
 *
 *   1. the copy-paste connection block (spec §16, "Distribution")
 *   2. what the server can actually do, named honestly
 *   3. the state of the connection, including why parts of it are inert
 *
 * ── Why (2) and (3) are disclosures ────────────────────────────────────────
 *
 * They were open by default and the column ran ~1900px tall next to a ~500px
 * schedule, which left most of Home as dead white space and buried the one
 * thing a reader is here to do. Thirteen tool signatures and five OAuth scopes
 * are *reference* — correct, worth stating, and worth stating exactly once, on
 * demand. `<details>` keeps every word in the DOM for search and screen
 * readers while costing the layout nothing, and needs no client JavaScript, so
 * this stays a server component.
 *
 * ── Honesty rules that shaped the content ──────────────────────────────────
 *
 * Every tool named below maps to a port in `lib/mcp/contracts.ts`; every scope
 * comes from `SCOPE_DESCRIPTIONS` in `lib/mcp/auth.ts` rather than being
 * restated here. Nothing is listed that the MCP lane has not defined. In
 * particular `add_section` and `remove_section` are described as *proposals*,
 * because `PlansPort` structurally has no plan-mutation method — spec §16,
 * "Agent authority": the agent proposes, the student decides.
 */

import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckboxCircleLine,
  RiFlashlightLine,
  RiLockLine,
  RiPlugLine,
  RiRobot2Line,
  RiScales3Line,
  RiSearchLine,
  RiShieldKeyholeLine,
} from "@remixicon/react";
import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { Chip } from "@/components/base/badges/chip";
import { Divider } from "@/components/base/divider/divider";
import { CopyField } from "@/components/home/copy-field";
import { SCOPES, SCOPE_DESCRIPTIONS } from "@/lib/mcp/auth";
import { SERVER_NAME, SETUP_PATH } from "@/lib/mcp/config";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/**
 * `signed-out` — nobody is signed in to this browser. Catalog tools still work.
 * `not-connected` — signed in; no agent is known to hold a token.
 * `connected` — an agent is known to hold one.
 *
 * `connected` is not currently reachable, and that is a property of the design
 * rather than an omission: MCP access tokens are signed and stateless, which is
 * what lets the endpoint serve any instance, and the price is that the server
 * keeps no list of who holds one.
 */
export type AgentConnectionState = "signed-out" | "not-connected" | "connected";

export interface AgentHandoffProps {
  /** Absolute URL of the MCP endpoint, resolved server-side. */
  mcpEndpointUrl: string;
  connectionState?: AgentConnectionState;
  /** Name of the client currently holding a token, when one does. */
  connectedClientName?: string | null;
  className?: string;
}

interface ToolGroup {
  icon: IconComponent;
  title: string;
  /** Who may call these. */
  access: string;
  accessTone: "lime" | "yellow";
  tools: { name: string; description: string }[];
  /** Rendered under the group when there is something the reader must know. */
  note?: string;
}

/**
 * The tool inventory, one group per port in `lib/mcp/contracts.ts`. If a tool
 * is not backed by a port, it does not belong on this list.
 */
const TOOL_GROUPS: ToolGroup[] = [
  {
    icon: RiSearchLine,
    title: "Catalog and reputation",
    access: "No account",
    accessTone: "lime",
    tools: [
      { name: "search_courses", description: "The same local index the site searches — never the network." },
      { name: "get_course", description: "One course with its description, prerequisites and credits." },
      { name: "get_sections", description: "Every section in a term, with seats and their “as of” timestamp." },
      { name: "get_ratings", description: "Course and instructor reputation, returned separately — never averaged." },
      { name: "get_seat_history", description: "Enrollment over time for one section." },
    ],
  },
  {
    icon: RiScales3Line,
    title: "Analysis of a proposed schedule",
    access: "No account",
    accessTone: "lime",
    tools: [
      { name: "check_conflicts", description: "Overlaps and duplicate courses across a set of sections." },
      { name: "check_commute", description: "Walking minutes against the gap for every back-to-back pair." },
      { name: "check_requirements", description: "Which requirement flags a set of courses covers, and which it misses." },
    ],
    note: "Pure functions over a schedule the agent is considering. Nothing is saved, and this is precisely the arithmetic an external agent is bad at unaided.",
  },
  {
    icon: RiLockLine,
    title: "Your own plans and watches",
    access: "Account",
    accessTone: "yellow",
    tools: [
      { name: "get_my_schedule", description: "Your saved plans, including custom blocks, as constraints." },
      { name: "list_watches", description: "Sections you are watching, with live seat state." },
      { name: "watch_section", description: "Start watching a section. Additive and reversible, so it writes directly." },
      { name: "add_section", description: "Proposes adding a section. Creates a pending diff — it does not touch the plan." },
      { name: "remove_section", description: "Proposes removing a section. Same: a diff you accept or reject." },
    ],
    note: "The agent proposes, you decide. `add_section` and `remove_section` cannot change a saved plan — pending diffs surface on the schedule screen for an explicit accept.",
  },
];

/** Derived, never typed by hand — the summary line cannot drift from the list. */
const TOOL_COUNT = TOOL_GROUPS.reduce((total, group) => total + group.tools.length, 0);

const CONNECTION_COPY: Record<
  AgentConnectionState,
  { chipLabel: string; chipColor: "lime" | "neutral" | "yellow"; headline: string; body: string }
> = {
  connected: {
    chipLabel: "Connected",
    chipColor: "lime",
    headline: "An agent is connected",
    body: "It holds a scoped, refreshable token. Revoke it any time from settings.",
  },
  "not-connected": {
    chipLabel: "Not connected",
    chipColor: "neutral",
    headline: "No agent connected yet",
    body: "Paste the block below into your MCP client. Catalog and analysis tools work immediately; your plans and watches need you to authorize the client.",
  },
  "signed-out": {
    chipLabel: "Not connected",
    chipColor: "neutral",
    headline: "Connect without an account",
    body: "Catalog, reputation and analysis tools need no sign-in at all. Your client will open a browser tab to sign in the first time it reaches for one of your own plans.",
  },
};

export function AgentHandoff({
  mcpEndpointUrl,
  connectionState = "signed-out",
  connectedClientName = null,
  className,
}: AgentHandoffProps) {
  const status = CONNECTION_COPY[connectionState];

  // Rendered verbatim into the copy field, so it is built here rather than
  // typed inline where an editor could reflow it into something invalid.
  const clientConfigJson = JSON.stringify(
    { mcpServers: { [SERVER_NAME]: { type: "http", url: mcpEndpointUrl } } },
    null,
    2,
  );

  const claudeCodeCommand = `claude mcp add --transport http ${SERVER_NAME} ${mcpEndpointUrl}`;

  return (
    <section
      aria-labelledby="agent-handoff-heading"
      className={cx(
        "flex w-full min-w-0 flex-col gap-5 rounded-[20px] bg-background-secondary-default p-4 sm:p-5",
        className,
      )}
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2lg bg-stat-card-icon-background">
            <RiRobot2Line className="size-5 text-foreground-icon-primary" aria-hidden />
          </span>
          <Chip variant="caption" color={status.chipColor}>
            {status.chipLabel}
          </Chip>
        </div>
        <div className="flex flex-col gap-1">
          <h2 id="agent-handoff-heading" className="text-title-2-medium text-text-primary">
            Bring your own agent
          </h2>
          <p className="text-body-regular text-text-secondary">
            There is no chat box here on purpose. Columbia Catalog runs an MCP server,
            so you point Claude, ChatGPT, or any MCP client at it and plan inside the
            assistant you already use.
          </p>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 1. The connection block (spec §16, "Distribution") — the action     */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-body-medium text-text-primary">Connect your client</h3>
          <p className="text-caption-1-regular text-text-secondary">
            One HTTP endpoint. No API key to paste anywhere — authorization, when you
            want the tools that read your own plans, happens in a browser window.
          </p>
        </div>

        <CopyField
          label="MCP configuration"
          hint="claude_desktop_config.json · .mcp.json · client settings"
          value={clientConfigJson}
        />

        <CopyField
          label="Claude Code"
          hint="one command, same endpoint"
          layout="inline"
          value={claudeCodeCommand}
        />
      </div>

      <Divider />

      {/* ------------------------------------------------------------------ */}
      {/* 2. What it can do — reference, folded away                          */}
      {/* ------------------------------------------------------------------ */}
      <Disclosure
        summary="What it can do"
        hint={`${TOOL_COUNT} tools`}
      >
        {TOOL_GROUPS.map((group) => (
          <div
            key={group.title}
            className="flex flex-col gap-2 rounded-2lg bg-background-inner-default p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <group.icon
                  className="size-4 shrink-0 text-foreground-icon-secondary"
                  aria-hidden
                />
                <span className="text-body-medium truncate text-text-primary">{group.title}</span>
              </span>
              <Chip variant="caption" color={group.accessTone}>
                {group.access}
              </Chip>
            </div>

            <ul className="flex flex-col gap-1.5">
              {group.tools.map((tool) => (
                <li key={tool.name} className="flex min-w-0 flex-col gap-0.5">
                  <code className="font-mono text-caption-1-medium text-text-primary">
                    {tool.name}
                  </code>
                  <span className="text-caption-1-regular text-text-secondary">
                    {tool.description}
                  </span>
                </li>
              ))}
            </ul>

            {group.note && (
              <p className="text-caption-1-regular text-text-tertiary">{group.note}</p>
            )}
          </div>
        ))}
      </Disclosure>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Connection state + why the account half is inert                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-3 rounded-2lg bg-background-inner-default p-3">
        <div className="flex items-start gap-2">
          <RiPlugLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-body-medium text-text-primary">
              {connectionState === "connected" && connectedClientName
                ? `${connectedClientName} is connected`
                : status.headline}
            </p>
            <p className="text-caption-1-regular text-text-secondary">{status.body}</p>
          </div>
        </div>

        <Disclosure summary="What a client can be granted" hint={`${SCOPES.length} scopes`} inner>
          <ul className="flex flex-col gap-1">
            {SCOPES.map((scope) => (
              <li key={scope} className="flex items-start gap-2">
                <RiCheckboxCircleLine
                  className="mt-0.5 size-3.5 shrink-0 text-foreground-icon-tertiary"
                  aria-hidden
                />
                <span className="text-caption-1-regular min-w-0 text-text-secondary">
                  <code className="font-mono text-text-primary">{scope}</code>
                  {" — "}
                  {SCOPE_DESCRIPTIONS[scope]}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption-2-regular text-text-tertiary">
            Read is separate from write, so an agent can search the catalog for you
            without ever being able to touch a plan.
          </p>
        </Disclosure>

        {/* The affordance stays visible and explains itself, rather than
            disappearing while the visitor is signed out (spec §15, AGENTS.md). */}
        {connectionState === "signed-out" && (
          <div className="flex items-start gap-2 border-t border-separator-border pt-3">
            <RiShieldKeyholeLine
              className="mt-0.5 size-4 shrink-0 text-foreground-icon-tertiary"
              aria-hidden
            />
            <p className="text-caption-1-regular text-text-secondary">
              You are not signed in here, which changes nothing about the catalog and
              analysis tools above. Granting{" "}
              <code className="font-mono text-text-primary">schedule:read</code> or{" "}
              <code className="font-mono text-text-primary">schedule:write</code> means
              signing in with your Columbia or Barnard Google account — in a browser tab
              your client opens, never by pasting a token into a config file.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-caption-2-regular flex items-start gap-1.5 text-text-tertiary">
          <RiFlashlightLine className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            We are read-only toward Columbia. No tool here registers, drops, or waitlists
            anyone, and we never ask for a Vergil or SSOL password.
          </span>
        </p>
        {/* The same URL both OAuth discovery documents advertise as this
            server's documentation, so the page a client sends a student to is
            reachable from the product too. */}
        <Link
          href={SETUP_PATH}
          className="text-caption-1-medium inline-flex w-fit items-center gap-1 rounded-2lg text-text-secondary underline decoration-separator-border underline-offset-4 outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Full setup guide
          <RiArrowRightSLine className="size-3.5 shrink-0" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Disclosure
// ---------------------------------------------------------------------------

/**
 * A fold for reference content.
 *
 * Native `<details>` rather than a React disclosure: it needs no state, no
 * effect, and no hydration, so this whole column stays a server component and
 * ships zero JavaScript for the interaction. The chevron rotates off the
 * `open` attribute via `group-open:`, which is CSS reacting to the browser's
 * own state — nothing here re-implements what the element already does.
 *
 * `[&::-webkit-details-marker]:hidden` suppresses Safari's default triangle,
 * which would otherwise sit next to our chevron.
 */
function Disclosure({
  summary,
  hint,
  inner = false,
  children,
}: {
  summary: string;
  hint?: string;
  /** Tighter treatment for a disclosure nested inside an already-tinted box. */
  inner?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary
        className={cx(
          "flex cursor-pointer list-none items-center gap-2 rounded-2lg outline-none",
          "[&::-webkit-details-marker]:hidden",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          inner ? "py-0.5" : "py-1",
        )}
      >
        <RiArrowDownSLine
          className="size-4 shrink-0 text-foreground-icon-secondary transition-transform duration-150 ease group-open:rotate-180"
          aria-hidden
        />
        <span
          className={cx(
            "min-w-0 flex-1 truncate",
            inner ? "text-caption-1-medium text-text-secondary" : "text-body-medium text-text-primary",
          )}
        >
          {summary}
        </span>
        {hint ? (
          <span className="text-caption-2-regular shrink-0 tabular-nums text-text-tertiary">
            {hint}
          </span>
        ) : null}
      </summary>
      <div className={cx("flex flex-col gap-2", inner ? "pt-2" : "pt-3")}>{children}</div>
    </details>
  );
}
