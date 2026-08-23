/**
 * `/mcp-setup` — how a student connects an agent to this catalog (spec §16).
 *
 * This route is not decoration. Both discovery documents point at it
 * (`service_documentation` in the authorization-server metadata,
 * `resource_documentation` in the protected-resource metadata), so an MCP
 * client that hits an authorization problem sends the student here. A 404 at
 * this path would be a broken promise made in a machine-readable document.
 *
 * ── Why the URL is computed rather than written down ───────────────────────
 *
 * The endpoint a student pastes into their client must be the origin they are
 * actually looking at — a preview deployment, localhost, or production. A
 * hardcoded production URL would be wrong on two of those three and would fail
 * in the least debuggable way possible: OAuth redirect URIs must match
 * byte-for-byte, so the client would complete a sign-in and then be told its
 * token was minted for a different server. `resolveBaseUrl` reads the request's
 * own Host header for exactly this reason.
 *
 * That makes this a dynamic route. It is cheap — no data is read — and being
 * correct on every origin is worth more than being static on one.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import type { RemixiconComponentType } from "@remixicon/react";
import {
  RiCheckLine,
  RiEyeLine,
  RiPlugLine,
  RiShieldKeyholeLine,
  RiTimeLine,
} from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { ALLOWED_EMAIL_DOMAINS, mcpUrls, resolveBaseUrl, SERVER_NAME } from "@/lib/mcp/config";
import { scopeCatalogue } from "@/lib/mcp/oauth-endpoints";
import { TOOLS } from "@/lib/mcp/tools";

export const metadata: Metadata = {
  title: "Connect an agent · Columbia Catalog",
  description:
    "Connect Claude or any MCP client to the Columbia course catalog: search, seats, conflicts, and your own schedule.",
};

export const dynamic = "force-dynamic";

export default async function McpSetupPage() {
  // `headers()` gives us the same Host the MCP client will dial. Building a
  // Request from it keeps `resolveBaseUrl` as the single place that knows how
  // to resolve an origin.
  const requestHeaders = await headers();
  const urls = mcpUrls(resolveBaseUrl(new Request("http://internal", { headers: requestHeaders })));

  const publicTools = TOOLS.filter((tool) => tool.scopes.length === 0);
  const scopedTools = TOOLS.filter((tool) => tool.scopes.length > 0);

  return (
    <AppShell activeNav="home">
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Agents"
          icon={RiPlugLine}
          title="Connect an agent"
          badge={<Chip color="cyan">MCP</Chip>}
          description={
            <>
              This catalog speaks the Model Context Protocol, so Claude — or any MCP client — can
              search it, read seat counts with the time they were observed, check a schedule for
              conflicts, and read your own saved plans. Reading needs no account. Anything that
              touches your schedule does.
            </>
          }
        />

        <Section title="1. Add the server" icon={RiPlugLine}>
          <p className="text-body-regular text-text-secondary">
            One endpoint, no API key. Your client will discover the sign-in flow on its own the
            first time it needs it.
          </p>
          <CodeBlock>{urls.resource}</CodeBlock>

          <p className="text-caption-1-regular text-text-tertiary">
            In Claude Code:{" "}
            <code className="text-caption-1-medium text-text-secondary">
              claude mcp add --transport http {SERVER_NAME} {urls.resource}
            </code>
          </p>

          <p className="text-body-regular text-text-secondary">
            For a client that takes JSON configuration:
          </p>
          <CodeBlock>
            {JSON.stringify(
              { mcpServers: { [SERVER_NAME]: { type: "http", url: urls.resource } } },
              null,
              2,
            )}
          </CodeBlock>
        </Section>

        <Section title="2. Sign in when asked" icon={RiShieldKeyholeLine}>
          <p className="text-body-regular text-text-secondary">
            Search and course detail work immediately with no account. The first time your agent
            reaches for something of yours — your schedule, your watches — your client opens a
            browser tab to sign in. Nothing is ever pasted into a config file, and the access it
            receives can be narrowed to exactly these:
          </p>

          <ul className="flex flex-col gap-2">
            {scopeCatalogue().map(({ scope, description }) => (
              <li
                key={scope}
                className="flex flex-col gap-1 rounded-2lg bg-background-inner-default p-3 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <code className="text-caption-1-medium shrink-0 text-text-primary">{scope}</code>
                <span className="text-caption-1-regular text-text-secondary">{description}</span>
              </li>
            ))}
          </ul>

          <p className="text-caption-1-regular text-text-tertiary">
            Sign-in is restricted to{" "}
            {ALLOWED_EMAIL_DOMAINS.map((domain) => (
              <code key={domain} className="text-caption-1-medium text-text-secondary">
                {domain}
              </code>
            )).reduce<React.ReactNode[]>(
              (out, node, index) => (index === 0 ? [node] : [...out, " and ", node]),
              [],
            )}{" "}
            accounts.
          </p>
        </Section>

        <Section title="3. What it can do" icon={RiCheckLine}>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToolList
              heading="No account needed"
              caption="The public catalog."
              tools={publicTools}
            />
            <ToolList heading="After you sign in" caption="Your own data." tools={scopedTools} />
          </div>
        </Section>

        <Section title="Two things your agent will tell you" icon={RiEyeLine}>
          <Note icon={RiTimeLine} title="Seat counts are a reading, not a feed">
            Every seat number the server returns carries the time it was observed. Columbia does not
            publish a live enrollment API, so a count can be minutes or hours old — and on
            registration day that is the difference between an open section and a closed one. Your
            agent is instructed to say when it looked, and to send you to Vergil to actually
            register.
          </Note>

          <Note icon={RiShieldKeyholeLine} title="An agent proposes, you decide">
            Asking an agent to add a section to your schedule does not add it. It creates a proposal
            with a link back to <code className="text-caption-1-medium">/schedule</code>, where you
            accept or reject it. There is no tool on this server that can change a saved plan —
            that is a property of the interface, not a rule the agent is trusting itself to follow.
          </Note>
        </Section>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: RemixiconComponentType;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-background-secondary-default p-4 sm:p-5">
      <h2 className="text-body-medium flex items-center gap-2 text-text-primary">
        <Icon className="size-4 shrink-0 text-text-tertiary" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Deliberately not a copy-to-clipboard widget. That would make this a client
 * component for a convenience the browser already offers on a selectable
 * `<pre>`, and the page would stop being static markup for the sake of a button.
 */
function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="text-caption-1-regular overflow-x-auto rounded-2lg bg-background-inner-default p-3 text-text-primary">
      <code>{children}</code>
    </pre>
  );
}

function ToolList({
  heading,
  caption,
  tools,
}: {
  heading: string;
  caption: string;
  tools: { name: string; title: string }[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2lg bg-background-inner-default p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-caption-1-medium text-text-primary">{heading}</span>
        <span className="text-caption-1-regular text-text-tertiary">{caption}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {tools.map((tool) => (
          <li key={tool.name} className="flex flex-wrap items-baseline gap-x-2">
            <code className="text-caption-1-medium text-text-secondary">{tool.name}</code>
            <span className="text-caption-1-regular text-text-tertiary">{tool.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Note({
  icon: Icon,
  title,
  children,
}: {
  icon: RemixiconComponentType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-2lg bg-background-inner-default p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-text-tertiary" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-caption-1-medium text-text-primary">{title}</span>
        <p className="text-caption-1-regular text-text-secondary">{children}</p>
      </div>
    </div>
  );
}
