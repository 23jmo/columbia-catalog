"use client";

import { useCallback } from "react";

import { ReputationBlock, UNREVIEWED_CAVEAT } from "@/components/course/reputation";
import { RmpBlock } from "@/components/course/rmp-block";
import { InstructorSection } from "./section-block";
import type { ReputationSummary, RmpSnapshot } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * The two review sources, side by side and never combined.
 *
 * This is spec §12 rendered literally. CULPA and RateMyProfessor measure
 * different populations answering different questions, so they sit in separate
 * blocks with separate provenance and no arithmetic joins them. There is no
 * headline "instructor score" on this page for the same reason.
 *
 * Client-side for exactly one reason: RMP is read LIVE at view time and never
 * stored. Fetching it from the browser when this card mounts is what makes
 * "live and unstored" true rather than aspirational — a server render could be
 * cached by a CDN and quietly become the mirror the compliance rules forbid
 * (see `app/api/rmp/[instructor]/route.ts`).
 *
 * CULPA is the primary source and the corpus IS here: `reputation` carries a
 * real aggregate for most instructors who have taught recently. It was null for
 * a long time, and the copy written for that period outlived it — this card
 * used to tell every reader that "nothing is aggregated here yet" underneath a
 * block that was, by then, aggregating. Empty is still a state worth rendering
 * honestly, but it is now the exception rather than the standing apology.
 */

export interface InstructorReviewsCardProps {
  instructorName: string;
  /**
   * Aggregated across every course this person has taught. Null means we found
   * no reviews for this name — rendered as an honest empty state, not a zero.
   */
  reputation: ReputationSummary | null;
  /** Pre-resolved snapshot, e.g. in a test. Normally left undefined. */
  rmpSnapshot?: RmpSnapshot | null;
  /**
   * Draw the RateMyProfessor half. The instructor page sets this false: its
   * hero already prints the RMP rating, difficulty, would-take-again and
   * sample size, and repeating all four in a second card 400px lower does not
   * make them truer — it just makes the reader check whether the two boxes
   * disagree. The course drawer, which has no such hero, leaves it on.
   */
  showRmp?: boolean;
  className?: string;
}

export function InstructorReviewsCard({
  instructorName,
  reputation,
  rmpSnapshot,
  showRmp = true,
  className,
}: InstructorReviewsCardProps) {
  /**
   * Live lookup. `null` means "no usable RMP data" — no profile, an ambiguous
   * name, a rate limit, RMP being down — and the block renders all of them as
   * a calm no-data state with a link out, never as an error. Nothing on this
   * path writes to storage of any kind.
   */
  const lookupRmp = useCallback(async (name: string): Promise<RmpSnapshot | null> => {
    const response = await fetch(`/api/rmp/${encodeURIComponent(name)}`, {
      // Belt and braces alongside the route's own no-store headers.
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as RmpSnapshot | null;
  }, []);

  return (
    <div className={cx("w-full", className)}>
      <InstructorSection
        id="instructor-reviews"
        title="What students say"
        /*
          No headline in either state. With reviews, the hero already prints the
          score and repeating it here invites the reader to check whether the
          two agree; without them, `ReputationBlock` already says "No reviews
          matched yet" one line below, and a "Not reviewed yet" above it was a
          stutter rather than a summary.
        */
      >
        {/*
          The description used to run three sentences before a reader reached a
          single number — a standing explanation of the methodology, the
          non-averaging rule and the unreviewed caveat, printed whether or not
          any of it applied. Only the part that is load-bearing for what is
          actually on screen survives, and the caveat now appears where it is
          true: under an empty block.
        */}
        <div
          className={cx(
            "grid gap-2",
            showRmp && "lg:grid-cols-2",
          )}
        >
          <div className="flex min-w-0 flex-col gap-2">
            <ReputationBlock
              title="CULPA & Reddit"
              subtitle="Aggregated across every course this instructor has taught."
              summary={reputation}
            />
            {reputation ? null : (
              <p className="text-caption-2-regular text-pretty text-text-tertiary">
                {UNREVIEWED_CAVEAT}
              </p>
            )}
          </div>

          {showRmp ? (
            <RmpBlock
              instructorName={instructorName}
              snapshot={rmpSnapshot}
              lookup={rmpSnapshot === undefined ? lookupRmp : undefined}
            />
          ) : null}
        </div>
        {/*
          Spec §12 rendered where it is checkable: two sources, named, never
          combined. One line under the evidence beats three above it.
        */}
        {showRmp ? (
          <p className="text-caption-2-regular text-pretty text-text-tertiary">
            CULPA and RateMyProfessor poll different students about different things and
            are never averaged together.
          </p>
        ) : null}
      </InstructorSection>
    </div>
  );
}
