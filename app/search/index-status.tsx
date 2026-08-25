"use client";

import { RiWifiOffLine } from "@remixicon/react";

import type { LoadProgress } from "@/lib/search/client";

/**
 * Error state when the search index fails to load.
 *
 * Loading is shown as result-row skeletons in `SearchScreen` instead of a
 * download strip — the skeleton matches what arrives and avoids a layout jump.
 */

export interface IndexStatusProps {
  progress: LoadProgress | null;
}

export function IndexStatus({ progress }: IndexStatusProps) {
  if (progress?.stage !== "error") return null;

  return (
    <div
      className="flex items-start gap-2.5 rounded-2lg border border-dashed border-border-button-default bg-background-primary-default px-3 py-2.5"
      aria-live="polite"
    >
      <RiWifiOffLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body-2-medium text-text-primary">The search index did not download.</p>
        <p className="mt-0.5 text-caption-1-regular text-text-secondary">
          Reload to try again. If this keeps failing, the catalog index may still be building.
        </p>
      </div>
    </div>
  );
}
