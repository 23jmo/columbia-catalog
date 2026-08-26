"use client";

import { useCallback, useRef, useState } from "react";
import { RiArrowRightUpLine, RiStarLine } from "@remixicon/react";
import { Popover } from "react-aria-components";

import { Avatar } from "@/components/base/avatar/avatar";
import { InstructorLink } from "@/components/instructor/instructor-link";
import { InstructorProfileHero } from "@/components/instructor/profile-hero";
import type { ReputationSummary, RmpSnapshot } from "@/lib/types";
import { cx } from "@/utils/cx";

import { initialsOf } from "./format";
import { HOVER_CARD_SURFACE, useHoverCard } from "./hover-card";
import {
  ChartSkeleton,
  ReputationMiniChart,
  RmpMiniChart,
  SourceMixChart,
} from "./instructor-hover-charts";
import {
  dateRangeLabel,
  type DimensionKey,
} from "./reputation";

/**
 * Who teaches this section — with everything we know about them behind a hover.
 *
 * ── Why a hover card and not a panel ───────────────────────────────────────
 *
 * The course page gives each instructor a full-width card: our own aggregate on
 * one side, RateMyProfessor on the other, "also teaches" chips underneath. That
 * is the right shape there, where the question being asked is "who are the
 * people involved with this course". It is the wrong shape in the section
 * panel, where the instructor is one line of an identity block and the reader
 * is deciding about a class, not researching a person.
 *
 * So the resting state stays what it was — a face and a name — and the ratings
 * live behind the same gesture the seat history lives behind. Same machine
 * (`./hover-card`), same surface, same delay, so the panel has one way of
 * saying "there is more here" rather than two.
 *
 * ── The two numbers are never merged ───────────────────────────────────────
 *
 * Spec §12. Our CULPA/Reddit aggregate and RateMyProfessor measure different
 * populations answering different questions, so they are stacked with their own
 * headings and their own sample sizes and nothing on this card averages them.
 * The card is small; that is not a reason to collapse two facts into one.
 *
 * ── COMPLIANCE: RateMyProfessor is read live and never stored ──────────────
 *
 * Same absolute rules as `./rmp-block`: fetched at view time through
 * `/api/rmp/[instructor]`, held in React state for the life of this mount and
 * written nowhere — not to the database, not to disk, not to localStorage, not
 * to a cookie, not to any cache. The fetch timestamp is displayed so a reader
 * can see it is a live read rather than a mirror, and there is always a link
 * out with attribution.
 *
 * ── The name goes to the profile; the star opens the card ──────────────────
 *
 * The chip predates `/instructor/[slug]`. When it was the only instructor
 * surface, making the whole thing one button that opened the ratings was right.
 * Now that every name in the catalog is a link to a full profile, a name that
 * is a button is the one name on the page that does not go where names go —
 * and clicking it is the most likely way a reader asks for the profile.
 *
 * So the two gestures get two elements: the name is an `InstructorLink` like
 * every other name in the app, and the star — which this file already called
 * "the affordance" for the ratings — becomes the thing you press for them.
 * Hovering ANYWHERE on the chip still opens the card, so the discovery path
 * that already worked is untouched; only the click target is narrowed.
 *
 * They are siblings, never nested. An `<a>` containing a `<button>` is invalid
 * HTML, and browsers resolve it by guessing.
 *
 * ── Both reads happen on first open, not on drawer open ────────────────────
 *
 * The drawer opens on every search result click and almost nobody hovers an
 * instructor. Fetching here keeps a Supabase round trip and an upstream RMP
 * call off the critical path of the panel animation, for the same reason
 * `EnrollmentChip` keeps the chart chunk off it.
 */

/** Three is what fits without the card becoming a page. */
const CARD_DIMENSIONS: DimensionKey[] = ["teachingQuality", "workload", "difficulty"];

type Load<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; value: T }
  /**
   * A failed read is its own state rather than an empty result. "No reviews
   * matched" is a claim about the data; if the query threw we do not know that,
   * and saying it anyway would be the confident kind of wrong.
   */
  | { status: "error" };

function rmpSearchUrl(instructorName: string): string {
  return `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(instructorName)}`;
}

export interface InstructorChipProps {
  name: string;
  /** "Section 001" — what this person teaches on the section being read. */
  role?: string | null;
  /**
   * Popover placement. Feed cards sit above the composer, so they pass
   * `"top"` to keep the ratings from covering the box.
   */
  placement?: "bottom start" | "bottom end" | "top" | "top start";
  className?: string;
}

export function InstructorChip({
  name,
  role,
  placement = "bottom start",
  className,
}: InstructorChipProps) {
  /*
   * The whole chip, not the star, so the card stays start-aligned with the
   * avatar the way it was when the chip was one button — and so the card is
   * anchored to the thing the reader is pointing at rather than to a 14px glyph
   * on its right edge.
   */
  const chipRef = useRef<HTMLSpanElement>(null);
  const [rmp, setRmp] = useState<Load<RmpSnapshot | null>>({ status: "idle" });
  const [reputation, setReputation] = useState<Load<ReputationSummary | null>>({
    status: "idle",
  });

  /*
   * Two independent reads, deliberately not awaited together. They come from
   * unrelated systems with unrelated latencies, and holding the faster one back
   * to arrive with the slower one would mean the card sits empty while one of
   * its two halves has been ready for a second.
   */
  const load = useCallback(() => {
    setRmp((current) => {
      if (current.status !== "idle") return current;
      fetch(`/api/rmp/${encodeURIComponent(name)}`, {
        // Belt and braces alongside the route's own no-store headers.
        cache: "no-store",
      })
        .then((response) => (response.ok ? (response.json() as Promise<RmpSnapshot | null>) : null))
        // Held in memory only, for the life of this mount. See the file header.
        .then((value) => setRmp({ status: "ready", value }))
        .catch(() => setRmp({ status: "error" }));
      return { status: "loading" };
    });

    setReputation((current) => {
      if (current.status !== "idle") return current;
      // Dynamic so the Supabase read path is fetched with the hover, not with
      // the drawer.
      void import("@/lib/db/reputation")
        .then(({ getInstructorReputation }) => getInstructorReputation(name))
        .then((value) => setReputation({ status: "ready", value }))
        .catch(() => setReputation({ status: "error" }));
      return { status: "loading" };
    });
  }, [name]);

  const card = useHoverCard({ onOpen: load });

  /*
   * Hover belongs to the whole chip; the press belongs to the star. Splitting
   * the trigger props is what keeps "point at the name, see the ratings" true
   * while "click the name" now means "go to the profile".
   */
  const { onPointerEnter, onPointerLeave, ...pressProps } = card.triggerProps;

  return (
    <>
      <span
        ref={chipRef}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className={cx(
          "group flex min-w-0 items-center gap-2 rounded-lg py-0.5 pr-1 pl-0.5",
          "transition-colors duration-150",
          "hover:bg-background-primary-hover",
          className,
        )}
      >
        <Avatar size="sm" initials={initialsOf(name)} />
        <InstructorLink name={name} className="truncate text-headline-medium text-text-primary" />
        {/*
          The affordance. Without it the name is a static fact and nobody
          discovers the ratings — the same reason the seat chip carries a chart
          glyph rather than relying on people trying a hover.

          A star rather than a chart line because it names what is behind it.
          Outline, never filled: a filled star beside a name reads as a score we
          are giving this person, and we do not give scores.

          It is a real button so that the ratings are reachable by tab and by
          touch, where there is no hover to discover them with. The label says
          what it does rather than repeating the name the link beside it already
          announces.
        */}
        <button
          type="button"
          aria-label={`Show ratings for ${name}.`}
          {...pressProps}
          className={cx(
            "relative shrink-0 cursor-pointer rounded p-0.5 outline-none",
            /*
             * 18×18 fails WCAG 2.5.8, so the hit area grows — but only to ~30px,
             * not the usual 44. The instructor's name sits immediately to the
             * left and is itself a link to the profile, which carries these same
             * ratings; a 44px halo here would reach across and start eating taps
             * meant for the name. Clearing the AA floor without stealing from the
             * neighbour is the better trade for a supplementary affordance.
             * (The name link is `z-[1]`, so it wins any overlap that remains.)
             */
            "before:absolute before:-inset-1.5 before:content-['']",
            "text-foreground-icon-tertiary",
            "transition-colors duration-150",
            "group-hover:text-foreground-icon-secondary hover:text-foreground-icon-primary",
            "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          )}
        >
          <RiStarLine aria-hidden className="size-3.5" />
        </button>
      </span>

      {card.dismissLayer}

      {/*
        `isNonModal` so the rest of the panel stays live behind the card — this
        is something you glance at on the way to a decision, not a dialog that
        takes the page hostage. Start-aligned because the name sits at the left
        edge of its row, which is the mirror of the seat chip's reasoning.
      */}
      <Popover
        triggerRef={chipRef}
        isOpen={card.isOpen}
        onOpenChange={card.setIsOpen}
        isNonModal
        placement={placement}
        offset={8}
        className={cx(HOVER_CARD_SURFACE, "overflow-hidden p-0")}
      >
        <div {...card.surfaceProps} className="flex w-85 flex-col">
          <InstructorProfileHero variant="popover" name={name} subtitle={role} />

          <div className="flex flex-col gap-2 px-3 pb-2.5 pt-2">
            <ReputationHalf state={reputation} />
            <RmpHalf name={name} state={rmp} />
          </div>
        </div>
      </Popover>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CardHeading({ children, meta }: { children: string; meta?: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h4 className="text-caption-1-semibold text-text-primary">{children}</h4>
      {meta ? (
        <p className="text-caption-2-regular tabular-nums text-text-tertiary">{meta}</p>
      ) : null}
    </div>
  );
}

function RmpHalf({ name, state }: { name: string; state: Load<RmpSnapshot | null> }) {
  const live = state.status === "ready" ? state.value : null;
  const href = live?.profileUrl ?? rmpSearchUrl(name);

  return (
    <section className="flex flex-col gap-1.5 border-t border-border-table pt-2">
      <CardHeading
        meta={
          live?.numRatings != null
            ? `${live.numRatings} ratings`
            : state.status === "loading" || state.status === "idle"
              ? "…"
              : null
        }
      >
        RateMyProfessor
      </CardHeading>

      {state.status === "loading" || state.status === "idle" ? (
        <ChartSkeleton bars={3} />
      ) : live ? (
        <>
          <RmpMiniChart snapshot={live} />
          <p className="text-caption-2-regular text-text-tertiary">
            Live read · not stored
          </p>
        </>
      ) : (
        <p className="text-caption-2-regular text-text-secondary">
          {state.status === "error"
            ? "RateMyProfessor did not answer just now."
            : `No profile matched “${name}”.`}
        </p>
      )}

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cx(
          "inline-flex items-center gap-1 self-start rounded-md text-caption-2-medium text-text-secondary",
          "underline decoration-border-table underline-offset-4 outline-none",
          "transition-colors hover:text-text-primary",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        {live ? "View on RateMyProfessor" : "Search RateMyProfessor"}
        <RiArrowRightUpLine aria-hidden className="size-3" />
      </a>
    </section>
  );
}

function ReputationHalf({ state }: { state: Load<ReputationSummary | null> }) {
  const summary = state.status === "ready" ? state.value : null;
  const range = summary ? dateRangeLabel(summary.dateRange) : null;

  return (
    <section className="flex flex-col gap-1.5">
      <CardHeading
        meta={
          summary
            ? `n=${summary.sampleSize}${range ? ` · ${range}` : ""}`
            : state.status === "loading" || state.status === "idle"
              ? "…"
              : null
        }
      >
        Columbia reviews
      </CardHeading>

      {state.status === "loading" || state.status === "idle" ? (
        <ChartSkeleton bars={3} />
      ) : state.status === "error" ? (
        <p className="text-caption-2-regular text-text-secondary">
          Could not load reviews right now.
        </p>
      ) : summary ? (
        <>
          <ReputationMiniChart summary={summary} keys={CARD_DIMENSIONS} />
          <SourceMixChart bySource={summary.bySource} />
        </>
      ) : (
        <p className="text-caption-2-regular text-text-secondary">
          No reviews matched yet.
        </p>
      )}
    </section>
  );
}
