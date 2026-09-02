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

function ChartSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-2lg bg-background-secondary-default",
        compact ? "h-8 w-48" : "h-52 w-[320px]",
      )}
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

/** Filled width behind the label — same tones as `SeatMeter`, integrated into the chip. */
const TONE_FILL: Record<SeatReading["tone"], string> = {
  open: "bg-status-lime-background",
  tight: "bg-status-yellow-background",
  full: "bg-status-rose-background",
  waitlist: "bg-status-purple-background",
  unknown: "bg-background-tertiary-default",
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
  /** When the parent lays out stamp on its own grid row (drawer meeting row). */
  hideProvenance?: boolean;
  /**
   * Stretch to the parent's width. The feed rail pins meters to one line
   * across cards; a shrink-to-content chip would sit at a different x on
   * every card and "which has room" would stop being a glance.
   */
  fill?: boolean;
  /**
   * Smaller hover chart. The feed rail is 22rem wide; the full 320px
   * instrument covers the card it is meant to explain.
   */
  compact?: boolean;
  /**
   * Popover placement. Feed cards sit above the composer, so they pass
   * `"top"` to keep the chart from covering the box.
   */
  placement?: "bottom end" | "bottom start" | "top" | "top end";
  className?: string;
}

export function EnrollmentChip({
  section,
  termLabel,
  hideProvenance = false,
  fill = false,
  compact = false,
  placement = "bottom end",
  className,
}: EnrollmentChipProps) {
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
  // Occupancy, not remainder. Filling by seats left made an 8-seat section
  // paint an 8% sliver, which read as a broken two-tone bar. The headline
  // already says how many are left; the fill is "how full is this".
  const fillPercent =
    reading.enrolled != null && reading.capacity != null && reading.capacity > 0
      ? Math.min(100, Math.round((reading.enrolled / reading.capacity) * 100))
      : null;

  return (
    <div className={cx("flex w-full flex-col items-stretch gap-1 sm:gap-1", className)}>
      <button
        ref={chipRef}
        type="button"
        aria-label={`${reading.headline}. Show this section's seat history.`}
        {...card.triggerProps}
        className={cx(
          "group relative overflow-hidden rounded-lg border border-border-table bg-background-secondary-default",
          "transition-colors duration-150 outline-none",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          /* Match `WeekStrip` (size-7) on sm+ so the chip sits on the same line. */
          fill ? "h-7 w-full" : "sm:h-7 sm:max-w-full",
        )}
      >
        {fillPercent != null ? (
          <span
            aria-hidden
            className={cx(
              "absolute inset-y-0 left-0 w-full origin-left",
              "transition-transform duration-300 ease-out motion-reduce:transition-none",
              TONE_FILL[reading.tone],
            )}
            style={{ transform: `scaleX(${fillPercent / 100})` }}
          />
        ) : null}

        <span
          aria-hidden
          className={cx(
            "pointer-events-none absolute inset-0 bg-background-tertiary-default opacity-0",
            "transition-opacity duration-150 ease-out",
            "group-hover:opacity-40 group-focus-visible:opacity-40",
          )}
        />

        <span
          className={cx(
            "relative flex h-full w-full cursor-pointer items-center justify-between gap-3 px-3 py-1.5",
            fill
              ? "px-2.5 py-0"
              : "sm:inline-flex sm:w-auto sm:max-w-full sm:flex-nowrap sm:items-center sm:justify-start sm:gap-x-1.5 sm:px-2.5 sm:py-0",
          )}
        >
        {reading.remaining != null ? (
          <span className="flex min-w-0 items-center gap-1.5 sm:gap-1">
            <span
              className={cx(
                "tabular-nums",
                fill ? "text-caption-1-semibold" : "text-headline-semibold sm:text-caption-1-semibold",
                TONE_TEXT[reading.tone],
              )}
            >
              {reading.remaining}
            </span>
            <span className="text-caption-1-regular text-text-secondary sm:whitespace-nowrap">
              {/*
                Singular at one. The tight tone starts at 90% full, so "1 seats
                left" is not an edge case this chip rarely reaches — it is the
                exact reading it exists to draw attention to, and the one a
                student is most likely to read closely.
              */}
              {reading.remaining === 1 ? "seat left" : "seats left"}
            </span>
          </span>
        ) : (
          <span
            className={cx(
              "min-w-0",
              fill ? "text-caption-1-semibold" : "text-headline-medium sm:text-caption-1-semibold",
              TONE_TEXT[reading.tone],
            )}
          >
            {reading.headline}
          </span>
        )}

        {/*
          Trailing cluster. One flex row on mobile; `sm:contents` at `sm+` so
          ratio and icon rejoin the chip's wrap flow as separate inline spans.
        */}
        <span className={cx("flex shrink-0 items-center gap-2", !fill && "sm:contents")}>
          {hasRatio ? (
            <span className="text-caption-1-regular tabular-nums text-text-tertiary">
              {fill ? (
                <span>
                  {reading.enrolled} / {reading.capacity}
                </span>
              ) : (
                <>
                  <span className="sm:hidden">
                    {reading.enrolled}/{reading.capacity}
                  </span>
                  <span className="hidden sm:inline">
                    · {reading.enrolled} / {reading.capacity} enrolled
                  </span>
                </>
              )}
            </span>
          ) : null}

          {waiting > 0 ? (
            <span className="text-caption-1-regular tabular-nums text-status-purple-text">
              <span className="sm:hidden">{waiting} wait</span>
              <span className="hidden sm:inline">· {waiting} waiting</span>
            </span>
          ) : null}

          <RiLineChartLine
            aria-hidden
            className={cx(
              "size-3.5 shrink-0 self-center text-foreground-icon-tertiary",
              "transition-colors duration-150",
              "group-hover:text-foreground-icon-secondary",
            )}
          />
        </span>
        </span>
      </button>

      {hideProvenance ? null : (
        <ProvenanceStamp sourceAsOf={section.sourceAsOf} className="truncate px-0.5" />
      )}

      {card.dismissLayer}

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
        placement={placement}
        offset={8}
        className={cx(HOVER_CARD_SURFACE, compact && "p-2.5")}
      >
        <div {...card.surfaceProps}>
          {history.status === "ready" ? (
            <EnrollmentAreaChart
              points={history.points}
              capacity={reading.capacity}
              tone={reading.tone}
              compact={compact}
              className={compact ? undefined : "w-[320px]"}
              label={termLabel ? `Enrolled · ${termLabel}` : "Enrolled"}
            />
          ) : history.status === "error" ? (
            <p
              className={cx(
                "text-center text-caption-1-regular text-text-secondary",
                compact ? "py-1.5" : "w-[320px] py-6",
              )}
            >
              Could not load seat history right now.
            </p>
          ) : (
            <ChartSkeleton compact={compact} />
          )}
        </div>
      </Popover>
    </div>
  );
}
