"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { PlanArtFlame } from "@/components/application/settings/plan-art-flame";
import {
  SettingsCard,
  SettingsRow,
  SettingsSectionLabel,
  SettingsValueField,
} from "@/components/application/settings/settings-rows";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Switch } from "@/components/base/switch/switch";
import {
  isCrawlWorkerEnabled,
  setCrawlWorkerEnabled,
  WORKER_PREFERENCE_EVENT,
} from "@/components/crawler/refresh-worker";
import { TermSwitcher } from "@/components/shell/term-switcher";

function subscribeCrawlWorker(onStoreChange: () => void): () => void {
  const onChange = () => onStoreChange();
  window.addEventListener(WORKER_PREFERENCE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(WORKER_PREFERENCE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getCrawlWorkerSnapshot(): boolean {
  return isCrawlWorkerEnabled();
}

function getCrawlWorkerServerSnapshot(): boolean {
  return true;
}

export function CatalogSettingsGeneral({ onSupport }: { onSupport: () => void }) {
  const crawlEnabled = useSyncExternalStore(
    subscribeCrawlWorker,
    getCrawlWorkerSnapshot,
    getCrawlWorkerServerSnapshot,
  );
  const workerDisabled = process.env.NEXT_PUBLIC_CRAWL_WORKER_DISABLED === "1";

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="relative w-full overflow-hidden rounded-2xl bg-background-secondary-default">
        <div aria-hidden className="absolute -top-[11px] left-[328px] size-[277px]">
          <PlanArtFlame className="size-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(closest-side at center,
                color-mix(in srgb, var(--color-background-secondary-default) 0%, transparent) 13%,
                color-mix(in srgb, var(--color-background-secondary-default) 13%, transparent) 37%,
                color-mix(in srgb, var(--color-background-secondary-default) 85%, transparent) 86%,
                var(--color-background-secondary-default) 100%)`,
            }}
          />
        </div>

        <div className="relative flex flex-col gap-2.5 py-3 pr-2.5 pl-3">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center rounded-md bg-background-tertiary-default px-1.5 py-0.5 text-body-2-medium text-text-secondary">
              Columbia Catalog
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-headline-medium text-text-primary">Free to browse</p>
              <p className="text-body-2-regular text-text-secondary">
                Search, plans, and profiles are open. Sign in only when you want to save.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="small" className="w-fit" onClick={onSupport}>
            Buy me a coffee
          </Button>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2">
        <SettingsSectionLabel>Appearance</SettingsSectionLabel>
        <SettingsCard>
          <SettingsRow label="Theme" description="Light or dark — matches the sidebar toggle">
            <ThemeToggle appearance="sidebar-segmented" />
          </SettingsRow>
        </SettingsCard>
      </div>

      <div className="flex w-full flex-col gap-2">
        <SettingsSectionLabel>Catalog</SettingsSectionLabel>
        <SettingsCard>
          <SettingsRow label="Registering term" description="Which term search and schedules default to">
            <TermSwitcher appearance="sidebar" className="w-[202px]" />
          </SettingsRow>
        </SettingsCard>
      </div>

      <div className="flex w-full flex-col gap-2">
        <SettingsSectionLabel>Seat data</SettingsSectionLabel>
        <SettingsCard>
          <SettingsRow
            label="Background refresh"
            description={
              workerDisabled
                ? "Disabled on this deployment."
                : "When idle, quietly refresh public directory pages so seat counts stay current."
            }
          >
            <Switch
              aria-label="Background seat refresh"
              isSelected={crawlEnabled && !workerDisabled}
              isDisabled={workerDisabled}
              onChange={(value) => setCrawlWorkerEnabled(value)}
            />
          </SettingsRow>
          <SettingsRow label="How it works" description="Read-only GETs to doc.sis — never registers anyone">
            <SettingsValueField className="w-auto max-w-[202px] px-2">
              <Link href="/mcp-setup" className="text-accent-600 hover:underline">
                Agent setup
              </Link>
            </SettingsValueField>
          </SettingsRow>
        </SettingsCard>
      </div>

      <div className="flex w-full flex-col gap-2">
        <SettingsSectionLabel>Links</SettingsSectionLabel>
        <SettingsCard>
          <SettingsRow label="Bring your own agent" description="Connect Claude, Cursor, or any MCP client">
            <ButtonLink variant="secondary" size="small" href="/mcp-setup">
              MCP setup
            </ButtonLink>
          </SettingsRow>
        </SettingsCard>
      </div>
    </div>
  );
}
