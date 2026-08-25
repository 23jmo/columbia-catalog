"use client";

import { RiEyeLine, RiEyeOffLine, RiNotification3Fill } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { useWatchlist } from "@/hooks/use-watchlist";
import { haptic } from "@/lib/haptics";
import { toggleWatch } from "@/lib/watchlist/store";
import { cx } from "@/utils/cx";

/**
 * Watch a section for open seats.
 *
 * ── The watcher count is not decoration ────────────────────────────────────
 *
 * It sits next to the button, before the click, on purpose. Spec §14 refuses
 * to stagger notifications — deciding who gets a head start into a class is
 * not a role this product takes — and the honest consequence of that refusal
 * is telling people what they are up against. "34 watching" is the difference
 * between a student planning a backup and a student who thinks an alert is a
 * reservation.
 *
 * Counts are public; individual watches are not. That line is enforced in the
 * database, not here (see lib/db/watches.ts).
 *
 * ── Signed out ────────────────────────────────────────────────────────────
 *
 * The button renders anyway and says what it needs, rather than disappearing.
 * A missing affordance reads as a missing feature; a disabled one with a
 * reason reads as a door you know how to open. Reads are free in this product
 * and writes need an account (spec §3) — this is where a reader meets that
 * line, so it should be legible.
 */

export interface WatchButtonProps {
  sectionId: string;
  /** For the accessible label — "Watch section 001 for open seats". */
  sectionCode: string;
  /** Compact form for dense section lists. */
  iconOnly?: boolean;
  className?: string;
}

export function WatchButton({
  sectionId,
  sectionCode,
  iconOnly = false,
  className,
}: WatchButtonProps) {
  const { status, watched, counts, pending } = useWatchlist();

  const isWatched = watched.has(sectionId);
  const isPending = pending.has(sectionId);
  const isSignedOut = status === "signed_out";
  const count = counts.get(sectionId) ?? 0;

  const label = isSignedOut
    ? "Sign in to watch this section for open seats"
    : isWatched
      ? `Stop watching section ${sectionCode}`
      : `Watch section ${sectionCode} for open seats`;

  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <Button
        size="xs"
        variant={isWatched ? "primary" : "secondary"}
        iconOnly={iconOnly}
        leadingIcon={isWatched ? RiEyeOffLine : RiEyeLine}
        onClick={() => {
          // Start watching is the affirmative act; stop is a quiet undo.
          haptic(isWatched ? "selection" : "impact");
          void toggleWatch(sectionId);
        }}
        disabled={isPending || isSignedOut}
        aria-pressed={isWatched}
        aria-label={label}
        title={label}
      >
        {iconOnly ? undefined : isWatched ? "Watching" : "Watch"}
      </Button>
      <WatcherCount count={count} />
    </span>
  );
}

/**
 * Zero renders as nothing rather than "0 watching". A section nobody is
 * watching yet is the normal state of most of the catalog, and stamping every
 * one of them with a zero turns a fairness signal into visual noise.
 */
function WatcherCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-caption-1-medium text-text-tertiary"
      // "notified", not "emailed": the fairness claim (spec §14 — nobody gets
      // a head start) holds for the realtime push too, and is true on a
      // deployment where mail is not switched on. The watchlist rail states
      // which channels are actually live.
      title={`${count} ${count === 1 ? "person is" : "people are"} watching this section. Everyone is notified at the same time — nobody gets a head start.`}
    >
      <RiNotification3Fill className="size-3 text-foreground-icon-tertiary" aria-hidden />
      {count}
    </span>
  );
}
