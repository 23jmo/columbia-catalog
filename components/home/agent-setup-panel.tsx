"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import {
  RiCalendarScheduleLine,
  RiCodeBoxLine,
  RiEyeLine,
  RiGraduationCapLine,
  RiScales3Line,
  RiSearchLine,
  RiSparklingLine,
  RiTerminalBoxLine,
} from "@remixicon/react";
import { CopyPromptButton } from "@/components/home/copy-prompt-button";
import type { AgentTask } from "@/lib/mcp/agent-instructions";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

type ClientTab = "claude" | "cursor" | "json";

const CLIENT_TABS: { id: ClientTab; label: string; icon: IconComponent }[] = [
  { id: "claude", label: "Claude", icon: RiSparklingLine },
  { id: "cursor", label: "Cursor", icon: RiTerminalBoxLine },
  { id: "json", label: "JSON", icon: RiCodeBoxLine },
];

const TASK_ICONS: Record<string, IconComponent> = {
  search: RiSearchLine,
  conflicts: RiScales3Line,
  schedule: RiCalendarScheduleLine,
  watch: RiEyeLine,
};

export interface AgentSetupPanelProps {
  instructions: string;
  claudeCommand: string;
  jsonConfig: string;
  tasks: AgentTask[];
}

export function AgentSetupPanel({
  instructions,
  claudeCommand,
  jsonConfig,
  tasks,
}: AgentSetupPanelProps) {
  const [tab, setTab] = useState<ClientTab>("claude");

  const snippet =
    tab === "claude" ? claudeCommand : tab === "cursor" ? jsonConfig : jsonConfig;

  return (
    <div className="flex w-full min-w-0 flex-col gap-10">
      <header className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-full border border-border-button-default bg-background-primary-default">
            <RiGraduationCapLine className="size-5 text-foreground-icon-secondary" aria-hidden />
          </span>
          <span className="flex size-10 items-center justify-center rounded-full border border-border-button-default bg-background-primary-default">
            <RiTerminalBoxLine className="size-5 text-foreground-icon-secondary" aria-hidden />
          </span>
        </div>
        <h1 className="text-display-4-semibold -tracking-[0.02em] text-balance text-text-primary">
          Use Columbia Catalog in your agent
        </h1>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-border-button-default p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-body-medium text-text-primary">Connect</h2>
          <CopyPromptButton
            value={instructions}
            label="Copy instructions to agent"
            variant="ghost"
            size="xs"
            className="shrink-0"
          />
        </div>

        <div className="flex rounded-xl border border-border-button-default p-1">
          {CLIENT_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cx(
                "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5",
                "text-caption-1-medium outline-none transition-colors duration-150 ease",
                "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                tab === item.id
                  ? "border border-border-button-default bg-background-primary-default text-text-primary shadow-xs"
                  : "border border-transparent text-text-secondary hover:text-text-primary",
              )}
            >
              <item.icon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>

        <CodeBlock value={snippet} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-display-4-semibold -tracking-[0.02em] text-center text-text-primary">
          What do you want to do?
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {tasks.map((task) => {
            const Icon = TASK_ICONS[task.id] ?? RiSearchLine;
            return (
              <article
                key={task.id}
                className="flex flex-col gap-3 rounded-xl border border-border-button-default p-4"
              >
                <Icon className="size-4 text-foreground-icon-secondary" aria-hidden />
                <h3 className="text-body-medium text-text-primary">{task.title}</h3>
                <CodeBlock value={task.example} compact />
                <CopyPromptButton
                  value={task.prompt}
                  label="Copy prompt for your agent"
                  className="w-full"
                />
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CodeBlock({ value, compact = false }: { value: string; compact?: boolean }) {
  return (
    <pre
      className={cx(
        "overflow-x-auto rounded-lg bg-background-inner-default font-mono text-caption-1-regular text-text-primary",
        compact ? "p-2" : "p-3",
      )}
    >
      <code>{value}</code>
    </pre>
  );
}
