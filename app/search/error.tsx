"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RiRefreshLine, RiSignalWifiErrorLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";

/**
 * The `/search` error boundary.
 *
 * Reaching this file means the catalog could not be read on the server — the
 * search engine itself cannot fail this way, since it runs locally and holds
 * no connections. So the copy says what actually broke and offers the one
 * action that can fix it, rather than a generic apology.
 *
 * `reset()` re-runs the segment without a full page load, which keeps the
 * downloaded index and its IndexedDB cache intact.
 */

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server digests are the only handle we get on a production stack trace.
    console.error("[search] failed to render", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background-full px-4 py-10">
      <div className="flex w-full max-w-lg flex-col items-start gap-4 rounded-2lg border border-border-table bg-background-primary-default p-6 shadow-card">
        <RiSignalWifiErrorLine className="size-6 text-foreground-icon-secondary" aria-hidden />

        <div>
          <h1 className="text-title-2-semibold text-text-primary">
            The catalog didn’t load
          </h1>
          <p className="mt-1.5 text-body-regular text-text-secondary">
            Search runs on your machine, so this is not your connection to Columbia — it is
            our own catalog read failing before the screen could start. Nothing you had
            filtered was lost; the link in your address bar still describes it.
          </p>
        </div>

        {error.digest ? (
          <p className="text-caption-2-regular text-text-tertiary">
            Reference <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button leadingIcon={RiRefreshLine} onClick={reset}>
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg px-3 py-2 text-body-medium text-text-secondary transition-colors outline-none hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
