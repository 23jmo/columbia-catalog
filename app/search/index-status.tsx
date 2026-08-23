"use client";

import { RiDownload2Line, RiFlashlightLine, RiWifiOffLine } from "@remixicon/react";

import type { LoadProgress } from "@/lib/search/client";
import { cx } from "@/utils/cx";

/**
 * Progressive state for the index download — and ONLY for the index download.
 *
 * The distinction this component draws is the whole point: loading the index
 * is a visible, honest cost (a few hundred KB, once, cached in IndexedDB after
 * that), while *typing* has no cost at all and therefore no loading state.
 * This strip sits beside the results, never inside the search box, and it
 * describes an upgrade in flight rather than a blocked interaction — because
 * search is already answering from this page's own records while it runs.
 *
 * Once the engine is live the strip disappears entirely. A permanent "ready"
 * badge would just be noise about plumbing.
 */

export interface IndexStatusProps {
  progress: LoadProgress | null;
  isEngineLive: boolean;
}

const LOADING_STAGES = new Set<LoadProgress["stage"]>([
  "start",
  "cache-miss",
  "downloading-lexical",
  "revalidating",
]);

export function IndexStatus({ progress, isEngineLive }: IndexStatusProps) {
  // Live engine: nothing to say. A failed *revalidation* also lands here, and
  // is correctly silent — the reader has working search either way.
  if (isEngineLive) return null;
  if (!progress) return null;

  if (progress.stage === "error") {
    return (
      <Strip
        icon={RiWifiOffLine}
        tone="muted"
        title="The full search index did not download."
        detail="Search is running against this term's loaded courses, so everything on this page still works. Reload to try the index again."
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
          : "Downloading the full search index…"
      }
      detail="You can search right now — this only makes ranking and typo tolerance better."
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
      // Polite: it must never interrupt someone mid-keystroke.
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
