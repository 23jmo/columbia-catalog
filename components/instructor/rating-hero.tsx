"use client";

import { useEffect, useState } from "react";
import { RiArrowRightUpLine } from "@remixicon/react";

import { LinkButton } from "@/components/base/buttons/link-button";
import { formatDimension } from "@/components/course/reputation";
import type { ReputationSummary, RmpSnapshot } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * The one number a student came here for.
 *
 * ── Why this is the headline and "students taught" is not ──────────────────
 *
 * The hero used to lead with enrolment: "1,240 students taught". That is a fact
 * about the registrar's seat table, not about the person. Nobody opens a
 * professor's page to find out how many chairs were filled; they open it to
 * find out whether to take the class. So the headline figure is the rating, and
 * everything derived from seat counts is demoted to the fun-facts card at the
 * bottom of the page.
 *
 * ── The two sources are shown, never averaged (spec §12) ───────────────────
 *
 * CULPA and RateMyProfessor poll different populations about different
 * questions. Spec §12 permits a composite only if it is "expandable and
 * reproducible", and an average of two numbers whose denominators we do not
 * control is neither. So when we have both, both are printed, each with its own
 * sample size and its own attribution, and no arithmetic joins them. CULPA
 * leads when present because it is the primary source: Columbia-specific,
 * written by Columbia students, about these courses.
 *
 * ── Why so many professors show no number ──────────────────────────────────
 *
 * Because they genuinely have none, and saying so is the only honest option.
 * RMP lists ~1,195 professors for Columbia, ~102 for Barnard and ~411 for
 * Teachers College; Columbia fields several thousand instructors a term. On a
 * 40-name sample of Fall 2026 COMS instructors, 20% had a rated RMP profile,
 * with a MEDIAN of two ratings each. CULPA would cover far more, and is being
 * pursued as a partnership rather than a scrape (see
 * `lib/reviews/sources/culpa.ts`), so it contributes nothing yet.
 *
 * An invented number, a zero, or a rating borrowed from a similarly-named
 * stranger would all be worse than the empty state below — the last of those
 * was a real defect in the RMP name matcher, and it put one professor's 4.8
 * under a different professor's name. The empty state links out instead, so the
 * page is still the fastest way to go looking.
 *
 * ── COMPLIANCE ────────────────────────────────────────────────────────────
 *
 * RMP is read live in the browser at view time and written nowhere. See
 * `app/api/rmp/[instructor]/route.ts` for the full rationale; nothing on this
 * path may cache, persist, or server-render that snapshot.
 */

function culpaSearchUrl(name: string): string {
  return `https://culpa.info/search?entity=all&query=${encodeURIComponent(name)}`;
}

function rmpSearchUrl(name: string): string {
  return `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name)}`;
}

/** One source's headline number, with its own provenance. Never combined. */
function ScoreBlock({
  value,
  outOf = 5,
  source,
  sampleLabel,
  href,
  isLead,
}: {
  value: string;
  outOf?: number | null;
  source: string;
  sampleLabel: string;
  href: string;
  isLead: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex items-baseline gap-1">
        <p
          className={cx(
            "whitespace-nowrap font-medium tabular-nums text-text-primary",
            /*
             * Display type, set explicitly rather than with a title token.
             * The largest token on the scale renders smaller than the stat
             * tiles further down the page, which left the page's most
             * important number looking like a caption for the ones that do not
             * matter. A hero has to actually be the biggest thing on screen.
             */
            isLead ? "text-[52px] leading-[1.05] -tracking-[0.02em]" : "text-[30px] leading-tight",
          )}
        >
          {value}
        </p>
        {outOf != null ? (
          <span
            className={cx(
              "text-text-tertiary",
              isLead ? "text-headline-medium" : "text-body-medium",
            )}
          >
            / {outOf}
          </span>
        ) : null}
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cx(
          "inline-flex w-fit items-center gap-1 rounded text-caption-1-medium text-text-secondary",
          "underline decoration-border-table underline-offset-4 outline-none",
          "transition-colors hover:text-text-primary",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        {source}
        <RiArrowRightUpLine aria-hidden className="size-3" />
      </a>
      <p className="text-caption-2-regular tabular-nums text-text-tertiary">{sampleLabel}</p>
    </div>
  );
}

/** A subscore. Only rendered when the source actually published one. */
function SubScore({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2lg bg-background-secondary-default px-2.5 py-2">
      <p className="truncate text-body-medium tabular-nums text-text-primary">{value}</p>
      <p className="truncate text-caption-2-regular text-text-secondary">{label}</p>
    </div>
  );
}

export interface InstructorRatingProps {
  name: string;
  /** CULPA/Reddit aggregate. Null until a partnership feed lands. */
  reputation: ReputationSummary | null;
  /** Pre-resolved snapshot, for tests. Normally left undefined so it fetches. */
  rmpSnapshot?: RmpSnapshot | null;
  className?: string;
}

export function InstructorRating({
  name,
  reputation,
  rmpSnapshot,
  className,
}: InstructorRatingProps) {
  const [rmp, setRmp] = useState<RmpSnapshot | null | undefined>(rmpSnapshot);
  const isResolved = rmpSnapshot !== undefined || rmp !== undefined;

  useEffect(() => {
    if (rmpSnapshot !== undefined) return;
    let cancelled = false;
    /*
     * Live, per view, never stored. A failure of any kind resolves to `null`
     * and renders the same calm empty state as "no profile" — a professor's
     * page must not show an error because a third party had a bad minute.
     */
    fetch(`/api/rmp/${encodeURIComponent(name)}`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<RmpSnapshot | null>) : null))
      .then((value) => {
        if (!cancelled) setRmp(value);
      })
      .catch(() => {
        if (!cancelled) setRmp(null);
      });
    return () => {
      cancelled = true;
    };
  }, [name, rmpSnapshot]);

  /*
   * The raw number, not `formatDimension` — that helper returns a whole phrase
   * ("4.4 / 5 · Excellent"), which is right for a subscore row and wrong for a
   * display figure. `ScoreBlock` renders the "/ 5" itself.
   */
  const culpaRaw = reputation?.dimensions.teachingQuality;
  const culpaScore = typeof culpaRaw === "number" ? culpaRaw.toFixed(1) : null;
  const rmpRating = rmp?.rating ?? null;
  const hasAnyScore = culpaScore != null || rmpRating != null;

  const subScores: { label: string; value: string }[] = [];
  if (reputation) {
    const workload = formatDimension("workload", reputation.dimensions);
    const difficulty = formatDimension("difficulty", reputation.dimensions);
    const fairness = formatDimension("gradingFairness", reputation.dimensions);
    if (workload) subScores.push({ label: "Workload · CULPA", value: workload });
    if (difficulty) subScores.push({ label: "Difficulty · CULPA", value: difficulty });
    if (fairness) subScores.push({ label: "Grading fairness · CULPA", value: fairness });
  }
  if (rmp?.difficulty != null) {
    subScores.push({ label: "Difficulty · RMP", value: `${rmp.difficulty.toFixed(1)} / 5` });
  }
  if (rmp?.wouldTakeAgainPercent != null) {
    subScores.push({
      label: "Would take again · RMP",
      value: `${Math.round(rmp.wouldTakeAgainPercent)}%`,
    });
  }

  return (
    <div className={cx("flex w-full flex-col gap-2.5", className)}>
      <p className="text-body-medium text-text-secondary">Rating</p>

      {hasAnyScore ? (
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          {culpaScore != null && reputation ? (
            <ScoreBlock
              isLead
              value={culpaScore}
              source="CULPA & Reddit"
              sampleLabel={`n=${reputation.sampleSize}`}
              href={culpaSearchUrl(name)}
            />
          ) : null}
          {rmpRating != null && rmp ? (
            <ScoreBlock
              // Lead only when CULPA has nothing — RMP is the cross-reference.
              isLead={culpaScore == null}
              value={rmpRating.toFixed(1)}
              source="RateMyProfessor"
              sampleLabel={`n=${rmp.numRatings ?? 0}${
                (rmp.numRatings ?? 0) < 5 ? " — too few to lean on" : ""
              }`}
              href={rmp.profileUrl}
            />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-title-2-medium text-text-primary">
            {isResolved ? "Not rated yet" : "Checking…"}
          </p>
          {isResolved ? (
            <p className="max-w-prose text-caption-1-regular text-pretty text-text-secondary">
              No CULPA aggregate, and RateMyProfessor has no rated profile matching this
              name. Most Columbia instructors have neither — we would rather say so than
              show a number we cannot stand behind.
            </p>
          ) : null}
        </div>
      )}

      {subScores.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {subScores.slice(0, 4).map((score) => (
            <SubScore key={score.label} label={score.label} value={score.value} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LinkButton
          size="xs"
          href={culpaSearchUrl(name)}
          target="_blank"
          rel="noopener noreferrer"
          trailingIcon={RiArrowRightUpLine}
        >
          {reputation ? "Read on CULPA" : "Search CULPA"}
        </LinkButton>
        <LinkButton
          size="xs"
          href={rmp?.profileUrl ?? rmpSearchUrl(name)}
          target="_blank"
          rel="noopener noreferrer"
          trailingIcon={RiArrowRightUpLine}
        >
          {rmp ? "View on RateMyProfessor" : "Search RateMyProfessor"}
        </LinkButton>
      </div>

      {rmp ? (
        /*
          Not decoration: this is the compliance claim made visible. A reader can
          see the number was read just now rather than mirrored into our
          database, which is exactly the posture the RMP route documents.
        */
        <p className="text-caption-2-regular text-text-tertiary">
          RateMyProfessor read live at{" "}
          {new Date(rmp.fetchedAt).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
          . Not stored, and never averaged with anything else on this page.
        </p>
      ) : null}
    </div>
  );
}
