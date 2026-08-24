"use client";

import { useState } from "react";
import { RiCheckLine, RiExternalLinkLine, RiShareForwardLine } from "@remixicon/react";

import { Button, ButtonLink } from "@/components/base/buttons/button";
import { initialsOf, provenanceLabel } from "@/components/course/format";
import type { InstructorPageData } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";
import { ActivityHeatmap } from "./activity-heatmap";
import { ProfileCover } from "./cover";
import {
  accentForSubject,
  countLabel,
  durationLabel,
  percentLabel,
  shortDateLabel,
} from "./format";

/**
 * The identity card — a direct clone of the BoardUI ai-profile hero.
 *
 * Geometry is the template's, to the pixel: a 165px cover, a 124px top pad that
 * drops the 80px avatar so it straddles the cover edge, action buttons pulled
 * 34px up onto the cover, a headline figure with a status chip, a row of stat
 * tiles, and the activity heatmap.
 *
 * What is NOT the template's is the provenance line under the headline figure.
 * Every seat number in this product renders with the directory's own "as of"
 * (spec §3), and the numbers on this card are sums of seat counts, so the
 * caveat travels with them. It is the one addition to the layout.
 */

/** Template's stat tile. Four across on desktop, two-up on mobile. */
function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start rounded-2lg bg-background-secondary-default p-2.5 sm:flex-1">
      <p className="w-full truncate text-body-medium tabular-nums text-text-primary">{value}</p>
      <p className="w-full truncate text-body-2-medium text-text-secondary">{label}</p>
    </div>
  );
}

export interface InstructorProfileCardProps {
  data: InstructorPageData;
  /** Link out to the registrar's own listing for the subject they teach. */
  directoryUrl: string | null;
  className?: string;
}

export function InstructorProfileCard({
  data,
  directoryUrl,
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

  const accent = accentForSubject(data.subjects[0] ?? data.name);
  const asOf = provenanceLabel(data.seatsAsOf);
  const handle = data.departments[0] ?? data.subjects.join(" · ") ?? "Columbia";

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
              <p className="text-headline-medium truncate text-text-secondary">{handle}</p>
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
            {directoryUrl ? (
              <ButtonLink
                size="small"
                variant="secondary"
                leadingIcon={RiExternalLinkLine}
                href={directoryUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Directory
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-body-medium text-text-secondary">
              Students taught in {data.termLabel}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-title-1-medium whitespace-nowrap tabular-nums text-text-primary">
                {data.studentsTaught != null ? countLabel(data.studentsTaught) : "Not published"}
              </p>
              {data.fillRatio != null ? (
                <span className="inline-flex items-center justify-center rounded-md bg-status-purple-background px-1.5 py-0.5 text-body-medium whitespace-nowrap text-status-purple-text">
                  {percentLabel(data.fillRatio)} of seats
                </span>
              ) : null}
            </div>
            {/*
              Not in the template. Non-negotiable here: these are registrar seat
              counts and the directory's own timestamp travels with them.
            */}
            <p className="text-caption-2-regular text-text-tertiary">
              {asOf
                ? `Seat counts as published by the Directory of Classes on ${asOf}.`
                : "The Directory of Classes did not publish an “as of” time for these seat counts."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-stretch">
            <StatTile
              value={String(data.courseCount)}
              label={data.courseCount === 1 ? "Course" : "Courses"}
            />
            <StatTile
              value={String(data.sectionCount)}
              label={data.sectionCount === 1 ? "Section" : "Sections"}
            />
            <StatTile
              value={
                data.totalCapacity != null ? countLabel(data.totalCapacity) : "—"
              }
              label="Seats offered"
            />
            <StatTile value={durationLabel(data.weeklyMinutes)} label="Class time / week" />
          </div>

          <ActivityHeatmap
            days={data.calendar}
            accent={accent}
            scopeLabel={`${data.termLabel} · ${shortDateLabel(data.bounds.startsOn)} – ${shortDateLabel(data.bounds.endsOn)}`}
          />
        </div>
      </div>
    </section>
  );
}
