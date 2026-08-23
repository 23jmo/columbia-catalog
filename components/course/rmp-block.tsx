"use client";

import { useEffect, useState } from "react";
import { RiArrowRightUpLine, RiErrorWarningLine } from "@remixicon/react";
import { LinkButton } from "@/components/base/buttons/link-button";
import type { RmpSnapshot } from "@/lib/types";
import { cx } from "@/utils/cx";
import type { RmpLookup } from "./contracts";

/**
 * RateMyProfessor block.
 *
 * COMPLIANCE (spec §12) — this is the one source with real litigation history
 * around scraping, so the rules are absolute:
 *
 *   • fetched LIVE at view time, never ingested;
 *   • never written to our database, to disk, to localStorage, to a cookie,
 *     or to any cache — this component holds it in React state for the life of
 *     the mount and nothing else;
 *   • always clearly attributed to RateMyProfessor, with a link out;
 *   • the fetch timestamp is displayed so a reader can see it is a live read
 *     rather than a mirror.
 *
 * The absence of data is a normal outcome, not an error state: no profile, an
 * ambiguous name, a rate limit, or RMP simply being down all land here, and all
 * of them should read as calm rather than broken.
 */

export interface RmpBlockProps {
  instructorName: string;
  /** Pre-resolved snapshot, e.g. from a route handler. */
  snapshot?: RmpSnapshot | null;
  /** Live resolver. When absent, the block renders the link-out-only state. */
  lookup?: RmpLookup;
  className?: string;
}

function rmpSearchUrl(instructorName: string): string {
  return `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(instructorName)}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-title-3-semibold tabular-nums text-text-primary">{value}</p>
      <p className="text-caption-2-regular text-text-secondary">{label}</p>
    </div>
  );
}

export function RmpBlock({ instructorName, snapshot, lookup, className }: RmpBlockProps) {
  /**
   * The resolved read, tagged with the instructor it belongs to.
   *
   * Tagging is what lets "loading" be DERIVED rather than stored. Storing it
   * meant writing state synchronously inside the effect — which React flags as
   * a cascading render — and it also went stale: when `instructorName` changed,
   * the previous instructor's numbers stayed on screen, attributed to the new
   * one, until the next fetch resolved. A result whose tag no longer matches is
   * simply not this instructor's, so it is never displayed.
   */
  const [resolved, setResolved] = useState<{
    instructorName: string;
    snapshot: RmpSnapshot | null;
    failed: boolean;
  } | null>(snapshot ? { instructorName, snapshot, failed: false } : null);

  useEffect(() => {
    if (snapshot || !lookup) return;
    let cancelled = false;
    lookup(instructorName)
      .then((result) => {
        if (cancelled) return;
        // Held in memory only. Never persisted — see the file header.
        setResolved({ instructorName, snapshot: result, failed: false });
      })
      .catch(() => {
        if (!cancelled) setResolved({ instructorName, snapshot: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [instructorName, lookup, snapshot]);

  const forThisInstructor = resolved?.instructorName === instructorName ? resolved : null;
  const live: RmpSnapshot | null = snapshot ?? forThisInstructor?.snapshot ?? null;
  const state: "idle" | "loading" | "done" | "failed" = snapshot
    ? "done"
    : !lookup
      ? "idle"
      : !forThisInstructor
        ? "loading"
        : forThisInstructor.failed
          ? "failed"
          : "done";

  const href = live?.profileUrl ?? rmpSearchUrl(instructorName);

  return (
    <div className={cx("rounded-lg border border-border-table p-3", className)}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-body-semibold text-text-primary">RateMyProfessor</h4>
        <LinkButton
          size="xs"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          trailingIcon={RiArrowRightUpLine}
        >
          {live ? "View on RateMyProfessor" : "Search RateMyProfessor"}
        </LinkButton>
      </div>

      {state === "loading" ? (
        <p className="text-body-regular text-text-secondary">Reading RateMyProfessor live…</p>
      ) : live ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Rating" value={live.rating != null ? `${live.rating.toFixed(1)}/5` : "—"} />
            <Metric
              label="Difficulty"
              value={live.difficulty != null ? `${live.difficulty.toFixed(1)}/5` : "—"}
            />
            <Metric
              label="Would take again"
              value={live.wouldTakeAgainPercent != null ? `${Math.round(live.wouldTakeAgainPercent)}%` : "—"}
            />
            <Metric label="Ratings" value={live.numRatings != null ? String(live.numRatings) : "—"} />
          </div>
          <p className="mt-3 text-caption-2-regular text-text-tertiary">
            Read live from RateMyProfessor at{" "}
            {new Date(live.fetchedAt).toLocaleString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              month: "short",
              day: "numeric",
            })}
            . Not stored — reload to read it again. RateMyProfessor scores are not combined
            with anything on this page.
          </p>
        </>
      ) : (
        <div className="flex items-start gap-2.5">
          {state === "failed" ? (
            <RiErrorWarningLine
              className="mt-0.5 size-4 shrink-0 text-foreground-icon-tertiary"
              aria-hidden
            />
          ) : null}
          <p className="text-body-regular text-text-secondary">
            {state === "failed"
              ? "RateMyProfessor did not answer just now."
              : state === "idle"
                ? "We read RateMyProfessor live rather than storing it, so there is nothing cached to show."
                : `No RateMyProfessor profile matched “${instructorName}”.`}{" "}
            The link above searches RateMyProfessor directly.
          </p>
        </div>
      )}
    </div>
  );
}
