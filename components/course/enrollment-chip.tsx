"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { RiLineChartLine } from "@remixicon/react";
import { Popover } from "react-aria-components";

import type { EnrollmentPoint } from "@/components/charts/enrollment-area-chart";
import type { Section } from "@/lib/types";
import { cx } from "@/utils/cx";

import { readSeats, type SeatReading } from "./format";
import { HOVER_CARD_SURFACE, useHoverCard } from "./hover-card";
import { ProvenanceStamp } from "./seat-state";

/**
 * How full this section is — a chip, with the whole seat history behind it.
 *
 * ── Why this replaced a card ───────────────────────────────────────────────
 *
 * The seat block used to be a bordered, shadowed panel carrying a headline
 * number, a full-width meter, a waitlist line and a timestamp. On a section
 * with no published meeting pattern that card was 174px tall and said almost
 * nothing — and it was one of four bounded surfaces stacked down a drawer that
 * is only 88dvh tall. A card is a promise that something substantial is inside
 * it, and spending one on "0 seats left" devalues every other card on the page.
 *
 * So the resting state is a chip: the number, the ratio, and the directory's
 * stamp. The substance did not go away — it moved behind a hover, where the
 * reader who actually wants the trend gets the real chart and everyone else
 * gets two lines instead of a panel.
 *
 * ── The meter is gone on purpose ───────────────────────────────────────────
 *
 * "86 / 80 enrolled" and a bar 100% filled are the same fact twice, and the bar
 * was the taller of the two. The graph behind the chip says far more than the
 * bar ever did: a bar shows where enrollment stands, the line shows how fast it
 * got there and whether it is still moving.
 *
 * ── Provenance travels with the number ─────────────────────────────────────
 *
 * Spec §3, principle 2: a seat number never renders without the directory's own
 * "as of" stamp. It is stamped here, inside the component that owns the number,
 * so no caller can compose a seat count without one. The chart carries its own
 * x-axis of observation times, so it does not repeat the stamp.
 *
 * ── A popover, not a tooltip ───────────────────────────────────────────────
 *
 * The open/close machine lives in `./hover-card` — this was the component that
 * invented it, and the instructor card now shares it verbatim so the two cannot
 * drift. The reasoning is written up there.
 *
 * ── The history loads on first open, not on drawer open ────────────────────
 *
 * `enrollment_snapshots` is a world-readable table and `getSeatHistory` picks
 * the browser client when it runs in the browser, so this component can fetch
 * its own data. That is deliberately better than threading the rows down from
 * the two server pages that render `SectionDetail`: the drawer opens on every
 * search result click and almost nobody opens the chart, so a server-side read
 * would put a Supabase round trip on the critical path of the panel animation
 * to serve a minority of opens. Fetching here moves both the query and the
 * ~100kb recharts chunk behind the gesture that asks for them.
 *
 * The read is idempotent, cached after the first open, and never blocks paint.
 * It also cannot regress the "search must never touch the network" rule: this
 * fires on a hover inside an already-open section panel, not on typing.
 */

/**
 * Recharts is ~100kb and the drawer opens on every result click. Loading it
 * only when the card is first opened keeps it off the path of the 95% of drawer
 * opens where nobody goes near the chip.
 */
const EnrollmentAreaChart = dynamic(
  () => import("@/components/charts/enrollment-area-chart"),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return (
    <div
      className="h-52 w-[320px] animate-pulse rounded-2lg bg-background-secondary-default"
      aria-label="Loading seat history"
    />
  );
}

const TONE_TEXT: Record<SeatReading["tone"], string> = {
  open: "text-status-lime-text",
  tight: "text-status-yellow-text",
  full: "text-status-rose-text",
  waitlist: "text-status-purple-text",
  unknown: "text-text-secondary",
};

type HistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; points: EnrollmentPoint[] }
  /**
   * A failed read is its own state rather than an empty chart. "No seat history
   * yet" is a claim about the data; if the query threw we do not know that, and
   * saying it anyway would be the confident kind of wrong.
   */
  | { status: "error" };

export interface EnrollmentChipProps {
  section: Pick<
    Section,
    | "sectionId"
    | "sectionCode"
    | "enrollmentCount"
    | "enrollmentCap"
    | "waitlistCount"
    | "waitlistCap"
    | "status"
    | "sourceAsOf"
  >;
  /** "Fall 2026" — printed above the number inside the card. */
  termLabel?: string;
  className?: string;
}

export function EnrollmentChip({ section, termLabel, className }: EnrollmentChipProps) {
  const reading = readSeats(section);
  const hasRatio = reading.enrolled != null && reading.capacity != null;
  const waiting = reading.waitlistCount ?? 0;

  const chipRef = useRef<HTMLButtonElement>(null);
  const [history, setHistory] = useState<HistoryState>({ status: "idle" });

  const loadHistory = useCallback(() => {
    setHistory((current) => {
      if (current.status !== "idle") return current;

      // Dynamic so the Supabase read path is fetched with the chart chunk
      // rather than with the drawer.
      void import("@/lib/db/seat-history")
        .then(({ getSeatHistory }) => getSeatHistory(section.sectionId))
        .then((snapshots) =>
          setHistory({
            status: "ready",
            points: snapshots.map((snapshot) => ({
              t: new Date(snapshot.observedAt).getTime(),
              enrolled: snapshot.enrollmentCount,
            })),
          }),
        )
        .catch(() => setHistory({ status: "error" }));

      return { status: "loading" };
    });
  }, [section.sectionId]);

  const card = useHoverCard({ onOpen: loadHistory });

  return (
    <div className={cx("flex flex-col items-start gap-1.5", className)}>
      <button
        ref={chipRef}
        type="button"
        aria-label={`${reading.headline}. Show this section's seat history.`}
        {...card.triggerProps}
        className={cx(
          "group inline-flex cursor-pointer items-baseline gap-2 rounded-lg px-3 py-2",
          "border border-border-table bg-background-secondary-default",
          "transition-colors duration-150 ease outline-none motion-reduce:transition-none",
          "hover:bg-background-tertiary-default",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        {reading.remaining != null ? (
          <>
            <span className={cx("text-headline-semibold tabular-nums", TONE_TEXT[reading.tone])}>
              {reading.remaining}
            </span>
            <span className="text-caption-1-regular text-text-secondary">seats left</span>
          </>
        ) : (
          <span className={cx("text-headline-medium", TONE_TEXT[reading.tone])}>
            {reading.headline}
          </span>
        )}

        {hasRatio ? (
          <span className="text-caption-1-regular tabular-nums text-text-tertiary">
            · {reading.enrolled} / {reading.capacity} enrolled
          </span>
        ) : null}

        {waiting > 0 ? (
          <span className="text-caption-1-regular tabular-nums text-status-purple-text">
            · {waiting} waiting
          </span>
        ) : null}

        {/*
          The affordance. Without it the chip is a static fact and nobody
          discovers the chart — the same reason the call number carries a copy
          glyph rather than relying on people trying a click.
        */}
        <RiLineChartLine
          aria-hidden
          className={cx(
            "size-3.5 shrink-0 self-center text-foreground-icon-tertiary",
            "transition-colors duration-150 ease motion-reduce:transition-none",
            "group-hover:text-foreground-icon-secondary",
          )}
        />
      </button>

      <ProvenanceStamp sourceAsOf={section.sourceAsOf} />

      {/*
        `isNonModal` so the rest of the panel stays live behind the card — this
        is something you glance at on the way to a decision, not a dialog that
        takes the page hostage. Standalone (no `DialogTrigger`) and with no
        `Dialog` inside, so opening it never moves focus off the chip.
      */}
      <Popover
        triggerRef={chipRef}
        isOpen={card.isOpen}
        onOpenChange={card.setIsOpen}
        isNonModal
        // End-aligned because the chip now sits at the right edge of its row;
        // a start-aligned card would immediately hit the viewport and get
        // shifted back by collision handling anyway.
        placement="bottom end"
        offset={8}
        className={HOVER_CARD_SURFACE}
      >
        <div {...card.surfaceProps}>
          {history.status === "ready" ? (
            <div className="w-[320px]">
              <EnrollmentAreaChart
                points={history.points}
                capacity={reading.capacity}
                tone={reading.tone}
                label={termLabel ? `Enrolled · ${termLabel}` : "Enrolled"}
              />
            </div>
          ) : history.status === "error" ? (
            <p className="w-[320px] py-6 text-center text-caption-1-regular text-text-secondary">
              Could not load seat history right now.
            </p>
          ) : (
            <ChartSkeleton />
          )}
        </div>
      </Popover>
    </div>
  );
}
