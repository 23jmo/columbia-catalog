"use client";

import { useCallback } from "react";
import { RiArrowRightUpLine } from "@remixicon/react";

import { LinkButton } from "@/components/base/buttons/link-button";
import { ReputationBlock, UNREVIEWED_CAVEAT } from "@/components/course/reputation";
import { RmpBlock } from "@/components/course/rmp-block";
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
 * CULPA is the primary source and the corpus is not here yet: it is being
 * pursued as a partnership rather than a scrape (see
 * `lib/reviews/sources/culpa.ts`), so `reputation` is `null` today and this
 * card says so plainly and links out. The wiring is real — the moment a feed
 * lands, `summarizeInstructor` fills this prop and nothing else changes.
 */

/**
 * Built locally rather than imported from `lib/reviews/sources/culpa.ts`: that
 * module pulls in `node-html-parser` for the adapter, and this is a client
 * component. One URL is not worth a parser in the browser bundle.
 */
function culpaSearchUrl(instructorName: string): string {
  return `https://culpa.info/search?entity=all&query=${encodeURIComponent(instructorName)}`;
}

export interface InstructorReviewsCardProps {
  instructorName: string;
  /**
   * Aggregated across every course this person has taught. Null until the
   * CULPA/Reddit corpus lands — rendered as an honest empty state, not a zero.
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
    <section
      className={cx(
        "flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
      aria-labelledby="instructor-reviews-heading"
    >
      <div className="flex w-full flex-col gap-1 px-1.5 pt-1">
        <p id="instructor-reviews-heading" className="text-body-medium text-text-secondary">
          What students say
        </p>
        <p className="text-title-2-medium text-text-primary">Reviews</p>
        <p className="text-caption-1-regular text-pretty text-text-secondary">
          Dimensions, not a verdict.{" "}
          {showRmp
            ? "These two sources are never averaged together — they poll different students about different things."
            : "Everything below comes from Columbia students; the RateMyProfessor figures are in the header and are never averaged with these."}{" "}
          {UNREVIEWED_CAVEAT}
        </p>
      </div>

      <div
        className={cx(
          "grid gap-2 rounded-2lg bg-background-primary-default p-3",
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
            <p className="px-1 text-caption-2-regular text-pretty text-text-tertiary">
              CULPA is Columbia&rsquo;s student-run review site and our primary source. We
              are pursuing a data-sharing partnership rather than scraping it, so nothing
              is aggregated here yet.
            </p>
          )}
          <div className="px-1">
            <LinkButton
              size="xs"
              href={culpaSearchUrl(instructorName)}
              target="_blank"
              rel="noopener noreferrer"
              trailingIcon={RiArrowRightUpLine}
            >
              Search CULPA
            </LinkButton>
          </div>
        </div>

        {showRmp ? (
          <RmpBlock
            instructorName={instructorName}
            snapshot={rmpSnapshot}
            lookup={rmpSnapshot === undefined ? lookupRmp : undefined}
          />
        ) : null}
      </div>
    </section>
  );
}
