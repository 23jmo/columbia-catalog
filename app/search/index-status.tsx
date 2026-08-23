"use client";

import { RiDownload2Line, RiFlashlightLine, RiWifiOffLine } from "@remixicon/react";

import type { LoadProgress } from "@/lib/search/client";
import { cx } from "@/utils/cx";

/**
 * Progressive state for the index download.
 *
 * Search data lives in the index artifact, not the RSC payload — so this strip
 * is the honest first-load cost. IndexedDB cache makes repeat visits instant.
 */

export interface IndexStatusProps {
  progress: LoadProgress | null;
  isEngineLive: boolean;
}

const LOADING_STAGES = new Set<LoadProgress["stage"]>([
  "start",
  "cache-hit",
  "cache-miss",
  "downloading-lexical",
  "revalidating",
]);

export function IndexStatus({ progress, isEngineLive }: IndexStatusProps) {
  if (isEngineLive) return null;
  if (!progress) return null;

  if (progress.stage === "error") {
    return (
      <Strip
        icon={RiWifiOffLine}
        tone="muted"
        title="The search index did not download."
        detail="Reload to try again. If this keeps failing, the catalog index may still be building."
      />
    );
  }

  if (!LOADING_STAGES.has(progress.stage)) return null;

  const percent = progress.fraction === null ? null : Math.round(progress.fraction * 100);

  return (
    <Strip
      icon={progress.stage === "revalidating" ? RiFlashlightLine : RiDownload2Line}
      tone="accent"
      title={
        progress.stage === "revalidating"
          ? "Checking for a newer catalog index…"
          : progress.stage === "cache-hit"
            ? "Loading cached catalog index…"
            : "Downloading the catalog index…"
      }
      detail="One-time download — cached on your machine after this. Search opens when it finishes."
      percent={percent}
    />
  );
}

function Strip({
  icon: Icon,
  tone,
  title,
  detail,
  percent,
}: {
  icon: typeof RiDownload2Line;
  tone: "accent" | "muted";
  title: string;
  detail: string;
  percent?: number | null;
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-2.5 rounded-2lg border px-3 py-2.5",
        tone === "accent"
          ? "border-border-table bg-background-secondary-default"
          : "border-dashed border-border-button-default bg-background-primary-default",
      )}
      aria-live="polite"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body-2-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-caption-1-regular text-text-secondary">{detail}</p>
        {percent !== null && percent !== undefined ? (
          <div className="mt-2 h-1 w-full max-w-64 overflow-hidden rounded-full bg-chart-track">
            <div
              className="h-full rounded-full bg-chart-1 transition-[width] duration-200 ease"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
