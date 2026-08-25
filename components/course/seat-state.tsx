import { RiInformationLine } from "@remixicon/react";
import { cx } from "@/utils/cx";
import type { Section } from "@/lib/types";
import { provenanceLabel, readSeats, type SeatReading } from "./format";

/**
 * HARD RULE (spec §3, principle 2): a seat number never renders without the
 * directory's own "as of" stamp beside it. The timestamp is a trust feature,
 * not a degradation notice, so it is styled as part of the reading — not as
 * fine print apologising for staleness.
 *
 * Seat state is also never conveyed by colour alone (spec §18): every tone
 * carries a word.
 */

const TONE_BAR: Record<SeatReading["tone"], string> = {
  open: "bg-chart-2",
  tight: "bg-chart-8",
  full: "bg-chart-3",
  waitlist: "bg-chart-5",
  unknown: "bg-chart-neutral",
};

const TONE_TEXT: Record<SeatReading["tone"], string> = {
  open: "text-status-lime-text",
  tight: "text-status-yellow-text",
  full: "text-status-rose-text",
  waitlist: "text-status-purple-text",
  unknown: "text-text-secondary",
};

const TONE_PILL: Record<SeatReading["tone"], string> = {
  open: "bg-status-lime-background text-status-lime-text",
  tight: "bg-status-yellow-background text-status-yellow-text",
  full: "bg-status-rose-background text-status-rose-text",
  waitlist: "bg-status-purple-background text-status-purple-text",
  unknown: "bg-background-tertiary-default text-text-secondary",
};

export type SeatSection = Pick<
  Section,
  "enrollmentCount" | "enrollmentCap" | "waitlistCount" | "waitlistCap" | "status" | "sourceAsOf"
>;

export function SeatMeter({ reading, className }: { reading: SeatReading; className?: string }) {
  const percent = reading.fillRatio == null ? null : Math.round(reading.fillRatio * 100);
  return (
    <div
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-chart-track", className)}
      role="img"
      aria-label={
        percent == null
          ? "Enrollment unknown"
          : `${percent}% of seats taken — ${reading.headline}`
      }
    >
      <div
        className={cx(
          "h-full w-full origin-left rounded-full",
          "transition-transform duration-300 ease-out motion-reduce:transition-none",
          TONE_BAR[reading.tone],
        )}
        style={{ transform: `scaleX(${(percent ?? 0) / 100})` }}
      />
    </div>
  );
}

export function ProvenanceStamp({
  sourceAsOf,
  className,
  withIcon = true,
}: {
  sourceAsOf: string | null;
  className?: string;
  withIcon?: boolean;
}) {
  const label = provenanceLabel(sourceAsOf);
  return (
    <p className={cx("flex items-center gap-1 text-caption-2-regular text-text-tertiary", className)}>
      {withIcon ? <RiInformationLine className="size-3 shrink-0" aria-hidden /> : null}
      {label ? (
        <>
          <span className="sr-only">Seat data provenance: </span>
          Directory as of {label}
        </>
      ) : (
        "The directory published no “as of” timestamp for this reading"
      )}
    </p>
  );
}

/** Compact one-line seat state — used in the sections list and compare table. */
export function SeatPill({ section, className }: { section: SeatSection; className?: string }) {
  const reading = readSeats(section);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-caption-1-medium",
        TONE_PILL[reading.tone],
        className,
      )}
    >
      {reading.headline}
    </span>
  );
}

/** The above-the-fold seat block: number, meter, waitlist, provenance. */
export function SeatState({ section, className }: { section: SeatSection; className?: string }) {
  const reading = readSeats(section);
  const waitlistLine =
    reading.waitlistCount != null
      ? `${reading.waitlistCount} on the waitlist${reading.waitlistCap != null ? ` of ${reading.waitlistCap}` : ""}`
      : section.status === "waitlist"
        ? "Waitlist open — count not published"
        : "No waitlist reported";

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={cx("text-title-3-semibold tabular-nums", TONE_TEXT[reading.tone])}>
          {reading.remaining != null ? reading.remaining : "—"}
        </span>
        <span className="text-body-regular text-text-secondary">
          {reading.remaining != null ? "seats left" : "seats left unknown"}
        </span>
        <span className="ml-auto text-caption-1-regular tabular-nums text-text-secondary">
          {reading.enrolled != null && reading.capacity != null
            ? `${reading.enrolled} / ${reading.capacity} enrolled`
            : reading.headline}
        </span>
      </div>
      <SeatMeter reading={reading} />
      <p className="text-caption-1-regular text-text-secondary">{waitlistLine}</p>
      <ProvenanceStamp sourceAsOf={section.sourceAsOf} />
    </div>
  );
}
