"use client";

import { useState } from "react";
import { RiCheckLine, RiExternalLinkLine, RiShareForwardLine } from "@remixicon/react";

import { Button, ButtonLink } from "@/components/base/buttons/button";
import { initialsOf } from "@/components/course/format";
import type { ReputationSummary, RmpSnapshot } from "@/lib/types";
import type { InstructorPageData } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";
import { ProfileCover } from "./cover";
import { InstructorRating } from "./rating-hero";

/**
 * The identity card — the BoardUI ai-profile hero, with its headline figure
 * replaced.
 *
 * Geometry is still the template's: a 165px cover, a 124px top pad that drops
 * the 80px avatar so it straddles the cover edge, and action buttons pulled
 * 34px up onto the cover.
 *
 * What changed is what the hero SAYS. The template's headline figure was
 * "students taught", a sum over the registrar's seat table, and the stat tiles
 * and heatmap under it were more of the same. None of that is why anyone opens
 * a professor's page. The headline is now the rating (`./rating-hero`) and the
 * seat-derived figures moved to `./fun-facts` at the bottom of the page, where
 * they read as the trivia they are.
 *
 * The top-right link out goes to CULPA rather than to the registrar's subject
 * listing, for the same reason: a reader leaving this page is going to look up
 * what students said, not to re-read the directory page they arrived from. The
 * registrar link still exists on the course pages this one links to.
 */

export interface InstructorProfileCardProps {
  data: InstructorPageData;
  /**
   * CULPA/Reddit aggregate, passed through to the rating hero. Null until a
   * partnership feed lands — see `lib/reviews/sources/culpa.ts`.
   */
  reputation?: ReputationSummary | null;
  /** Pre-resolved RMP snapshot, for tests. Normally left undefined. */
  rmpSnapshot?: RmpSnapshot | null;
  className?: string;
}

/** CULPA is the primary source (spec §12), so it is the one on the hero. */
function culpaSearchUrl(name: string): string {
  return `https://culpa.info/search?entity=all&query=${encodeURIComponent(name)}`;
}

export function InstructorProfileCard({
  data,
  reputation = null,
  rmpSnapshot,
  className,
}: InstructorProfileCardProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated and refuses in some embeddings. The
      // address bar already holds the URL, so this is a silent non-event.
    }
  }

  /*
   * The department name, or nothing.
   *
   * This used to fall back to the subject codes, which reads as "COMS" sitting
   * immediately left of a badge that also reads "COMS" — the same four letters
   * twice, dressed differently. The badge already carries the subject, so when
   * the bulletin has not given us a real department name the honest layout is
   * one line shorter, not one line padded.
   */
  const handle = data.departments[0] ?? null;

  return (
    <section
      className={cx(
        "relative w-full overflow-hidden rounded-3xl border border-border-ai-profile-card",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-[165px] overflow-hidden rounded-t-[23px] bg-background-tertiary-default">
        <ProfileCover seed={data.name} />
      </div>

      <div className="relative flex w-full flex-col gap-[15px] px-4 pt-[124px] pb-4">
        <span className="flex size-20 items-center justify-center rounded-full bg-background-tertiary-default ring-4 ring-background-primary-default">
          <span className="text-[30px] leading-[42.5px] font-medium text-text-secondary">
            {initialsOf(data.name)}
          </span>
        </span>

        <div className="relative flex w-full items-start gap-[15px]">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-title-2-medium truncate text-text-primary">{data.name}</h1>
            <div className="flex min-w-0 items-center gap-1.5">
              {handle ? (
                <p className="text-headline-medium truncate text-text-secondary">{handle}</p>
              ) : null}
              {data.subjects.map((subject) => (
                <span
                  key={subject}
                  className="inline-flex shrink-0 items-center justify-center rounded-sm px-1 py-px text-caption-1-semibold tracking-normal whitespace-nowrap bg-badge-neutral-background text-text-secondary"
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>

          <div className="absolute -top-[34px] right-1 flex items-center justify-end gap-2.5">
            <Button
              size="small"
              variant="secondary"
              leadingIcon={copied ? RiCheckLine : RiShareForwardLine}
              onClick={share}
            >
              {copied ? "Copied" : "Share"}
            </Button>
            <ButtonLink
              size="small"
              variant="secondary"
              leadingIcon={RiExternalLinkLine}
              href={culpaSearchUrl(data.name)}
              target="_blank"
              rel="noopener noreferrer"
            >
              CULPA
            </ButtonLink>
          </div>
        </div>

        <InstructorRating
          name={data.name}
          reputation={reputation}
          rmpSnapshot={rmpSnapshot}
        />
      </div>
    </section>
  );
}
