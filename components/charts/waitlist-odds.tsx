/**
 * Waitlist odds (spec §13).
 *
 * The model is a Monte Carlo simulation: every enrolled student carries a drop
 * hazard fitted from churn we have actually measured for that course, that
 * department, and that point in the term; the simulation runs forward to the
 * add/drop deadline and counts the fraction of trials in which drops exceed the
 * student's waitlist position.
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE:
 *
 *   1. **Ordinal bands, never percentages.** "Being confidently wrong about
 *      registration is memorable, and the model's real precision does not
 *      justify a decimal point." So no number from the simulation is printed —
 *      not the probability, not a confidence interval, not a rounded "about
 *      60%". The band is the whole answer.
 *   2. **The evidence is shown next to the estimate, always.** Position,
 *      historical clearance depth, how many terms of drop data the hazard was
 *      fitted on, and when the simulation ran. A band with no evidence beside
 *      it is a guess presented as a fact.
 *
 * The simulator itself lives in another lane and does not exist yet, so the
 * inputs are declared here as a narrow local interface (contracts.ts style)
 * rather than imported from a module that is not written.
 */

import type { ReactNode } from "react";
import { RiErrorWarningLine, RiScales3Line } from "@remixicon/react";

import { cx } from "@/utils/cx";
import { termLabel } from "@/lib/constants";
import type { TermCode } from "@/lib/types";

// ---------------------------------------------------------------------------
// Local input contract — satisfied by the simulator when it lands
// ---------------------------------------------------------------------------

/** The only four answers the model is allowed to give. */
export type WaitlistOddsBand = "very_likely" | "likely" | "coin_flip" | "unlikely";

/** How far down the waitlist a past term actually cleared. */
export interface ClearanceObservation {
  termCode: TermCode;
  clearedToPosition: number;
}

export interface WaitlistOddsEstimate {
  band: WaitlistOddsBand;
  /** The student's position on the waitlist right now. Null when unpublished. */
  position: number | null;
  /** Most recent first. Empty when we have never watched this course clear. */
  clearanceHistory: ClearanceObservation[];
  /** Monte Carlo trials behind the band. Null when the runner did not report it. */
  trials: number | null;
  /**
   * Terms of observed drop-rate data the hazard was fitted on. Below one full
   * term the estimate is extrapolation and this component says so out loud.
   */
  observedTermCount: number;
  /** When the simulation ran, ISO 8601. */
  computedAt: string | null;
  /** The add/drop deadline the simulation ran forward to, ISO 8601. */
  simulatedThrough: string | null;
}

export interface WaitlistOddsProps {
  /** Null while the model has nothing to say — a first-class outcome, not an error. */
  estimate: WaitlistOddsEstimate | null;
  /** Why there is no estimate. Shown verbatim when `estimate` is null. */
  unavailableReason?: string | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Band presentation
// ---------------------------------------------------------------------------

/** Weakest → strongest. The strip renders in this order, left to right. */
export const WAITLIST_BAND_ORDER: WaitlistOddsBand[] = [
  "unlikely",
  "coin_flip",
  "likely",
  "very_likely",
];

interface BandStyle {
  label: string;
  /** Chip colours. Every band also carries its word, so colour is never alone. */
  chip: string;
  /** Fill used for this band's segment of the ordinal strip. */
  fill: string;
}

const BAND_STYLE: Record<WaitlistOddsBand, BandStyle> = {
  unlikely: {
    label: "Unlikely",
    chip: "bg-status-rose-background text-status-rose-text",
    fill: "bg-chart-3",
  },
  coin_flip: {
    label: "Coin flip",
    chip: "bg-status-yellow-background text-status-yellow-text",
    fill: "bg-chart-8",
  },
  likely: {
    label: "Likely",
    chip: "bg-status-cyan-background text-status-cyan-text",
    fill: "bg-chart-1",
  },
  very_likely: {
    label: "Very likely",
    chip: "bg-status-lime-background text-status-lime-text",
    fill: "bg-chart-2",
  },
};

export function waitlistBandLabel(band: WaitlistOddsBand): string {
  return BAND_STYLE[band].label;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * Four segments, weakest on the left, with the estimated one filled. It is a
 * rank, not a scale — nothing about the segment widths encodes probability,
 * because encoding it would smuggle a number back in.
 */
function BandStrip({ band }: { band: WaitlistOddsBand }) {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {WAITLIST_BAND_ORDER.map((candidate) => (
        <span
          key={candidate}
          className={cx(
            "h-1.5 flex-1 rounded-full",
            candidate === band ? BAND_STYLE[candidate].fill : "bg-chart-track",
          )}
        />
      ))}
    </div>
  );
}

function EvidenceRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-caption-1-regular text-text-secondary">{term}</dt>
      <dd className="text-right text-caption-1-medium text-text-primary">{children}</dd>
    </div>
  );
}

function clearanceSentence(history: ClearanceObservation[]): string {
  const depths = history.map((one) => one.clearedToPosition);
  const terms = [...new Set(history.map((one) => termLabel(one.termCode).split(" ")[0]))];
  const season = terms.length === 1 ? ` ${terms[0].toLowerCase()}` : "";
  const list =
    depths.length === 1
      ? `position ${depths[0]}`
      : `positions ${depths.slice(0, -1).join(", ")} and ${depths[depths.length - 1]}`;
  return `The last ${depths.length}${season} ${depths.length === 1 ? "term" : "terms"} this cleared to ${list}.`;
}

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WaitlistOdds({ estimate, unavailableReason, className }: WaitlistOddsProps) {
  if (!estimate) {
    return (
      <div
        className={cx(
          "flex items-start gap-2 rounded-2lg border border-dashed border-border-table bg-background-secondary-default p-4",
          className,
        )}
      >
        <RiScales3Line className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <div>
          <p className="text-body-regular text-text-primary">No waitlist estimate</p>
          <p className="mt-0.5 text-caption-1-regular text-text-secondary">
            {unavailableReason ??
              "Estimating clearance needs a full term of observed drop rates for this course. We have not watched one yet."}
          </p>
        </div>
      </div>
    );
  }

  const style = BAND_STYLE[estimate.band];
  const isExtrapolating = estimate.observedTermCount < 1;
  const computedOn = formatDay(estimate.computedAt);
  const deadline = formatDay(estimate.simulatedThrough);

  return (
    <div
      className={cx(
        "flex flex-col gap-3 rounded-2lg border border-border-table bg-background-primary-default p-4 shadow-card",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cx("rounded-md px-2 py-0.5 text-caption-1-medium", style.chip)}>
            {style.label}
          </span>
          <span className="text-caption-1-regular text-text-secondary">to get in off the waitlist</span>
        </div>
        <span className="text-caption-2-regular text-text-tertiary">Estimate, not a guarantee</span>
      </div>

      <BandStrip band={estimate.band} />

      {isExtrapolating ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-background-tertiary-error p-2 text-caption-1-regular text-status-rose-text">
          <RiErrorWarningLine className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Fitted on less than one full term of drop data. Treat this as a shape, not an answer —
            it will change materially as the term is observed.
          </span>
        </p>
      ) : null}

      <dl className="flex flex-col gap-1.5 border-t border-border-table pt-3">
        <EvidenceRow term="Your position">
          {estimate.position != null ? (
            <span className="tabular-nums">#{estimate.position}</span>
          ) : (
            <span className="text-text-secondary">Not published</span>
          )}
        </EvidenceRow>
        <EvidenceRow term="Drop data behind it">
          <span className="tabular-nums">
            {estimate.observedTermCount === 1
              ? "1 observed term"
              : `${estimate.observedTermCount} observed terms`}
          </span>
        </EvidenceRow>
        {estimate.trials != null ? (
          <EvidenceRow term="Simulated trials">
            <span className="tabular-nums">{estimate.trials.toLocaleString()}</span>
          </EvidenceRow>
        ) : null}
        {deadline ? <EvidenceRow term="Simulated through">{deadline}</EvidenceRow> : null}
      </dl>

      {estimate.clearanceHistory.length > 0 ? (
        <p className="text-caption-1-regular text-text-secondary">
          {clearanceSentence(estimate.clearanceHistory)}
        </p>
      ) : (
        <p className="text-caption-1-regular text-text-tertiary">
          We have no record of how deep this course&rsquo;s waitlist has cleared before.
        </p>
      )}

      <p className="text-caption-2-regular text-text-tertiary">
        Monte Carlo simulation over drop rates we measured for this course and department.
        Reported as a band rather than a percentage because the model is not precise enough to
        justify a decimal point.
        {computedOn ? ` Last run ${computedOn}.` : ""}
      </p>
    </div>
  );
}

export default WaitlistOdds;
