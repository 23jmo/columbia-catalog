"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import type {
  CampusMapArtifact,
  InstructorArtifact,
  ScheduleArtifact,
} from "@/lib/agent/present";
import type { OnboardingArtifact } from "@/lib/agent/present-onboarding";
import type { ScheduleSavedArtifact } from "@/lib/agent/transcript";
import { InstructorProfileHero } from "@/components/instructor/profile-hero";
import { InstructorRating } from "@/components/instructor/rating-hero";
import { weekdayListLabel } from "@/components/instructor/format";
import { ButtonLink } from "@/components/base/buttons/button";
import { termLabel } from "@/lib/constants";
import { cx } from "@/utils/cx";
import { RiCalendarCheckLine, RiCalendarCloseLine, RiGraduationCapLine } from "@remixicon/react";
import { refreshPlansFromServer } from "@/lib/db/plan-sync";

/**
 * The calendar, the map, and the "done" card the tools put on the thread.
 *
 * `ScheduleWeek` is the same canvas as the schedule tab; `CampusCard` is the
 * isometric campus pin. Both are loaded through `next/dynamic` so the
 * assistant's first paint does not pay for three.js or the grid until a turn
 * actually asked for them.
 */

const ScheduleWeek = dynamic(
  () => import("@/components/schedule/schedule-week").then((mod) => mod.ScheduleWeek),
  { ssr: false },
);

const CampusCard = dynamic(() => import("@/components/campus/campus-card"), {
  ssr: false,
});

const COMPACT_THRESHOLD_PX = 7.65 * 16 * 2 + 3.75 * 16;

export function ScheduleArtifactView({ artifact }: { artifact: ScheduleArtifact }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setIsNarrow(entry.contentRect.width < COMPACT_THRESHOLD_PX);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const caption = artifact.planName
    ? `${artifact.planName} · ${termLabel(artifact.termCode)}`
    : termLabel(artifact.termCode);

  return (
    <div ref={frameRef} className="flex w-full flex-col gap-2">
      <p className="text-caption-1-medium text-text-secondary">{caption}</p>
      <ScheduleWeek
        blocks={artifact.blocks}
        weekdays={artifact.weekdays}
        commitmentIds={new Set(artifact.commitmentIds)}
        compact={isNarrow}
        dense
        className="w-full"
      />
    </div>
  );
}

/**
 * The receipt for `add_to_schedule` / `remove_from_schedule`.
 *
 * The write already happened on the server by the time this renders, but the
 * schedule tab reads from the local store, so the card pulls the server copy
 * on mount — otherwise a student who taps "Open schedule" a second later sees
 * the week as it was before they asked.
 */
export function ScheduleSavedArtifactView({ artifact }: { artifact: ScheduleSavedArtifact }) {
  useEffect(() => {
    void refreshPlansFromServer(artifact.termCode);
  }, [artifact.termCode]);

  const added = artifact.action === "added";
  const verb = artifact.changed ? (added ? "Added to" : "Removed from") : added ? "Already on" : "Wasn't on";

  return (
    <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-border-table bg-background-primary-default p-3 pl-4">
      <span
        className={cx(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          added ? "bg-status-lime-background text-status-lime-text" : "bg-background-secondary-default text-text-secondary",
        )}
      >
        {added ? <RiCalendarCheckLine className="size-4" aria-hidden /> : <RiCalendarCloseLine className="size-4" aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-caption-1-regular text-text-secondary">{verb} your schedule</span>
        <span className="truncate text-body-medium text-text-primary">
          {artifact.courseId} <span className="text-text-tertiary">§{artifact.sectionCode}</span>
          {artifact.title ? ` · ${artifact.title}` : ""}
        </span>
      </span>
      <ButtonLink href="/schedule" size="small" variant="secondary" className="shrink-0">
        Open
      </ButtonLink>
    </div>
  );
}

export function CampusMapArtifactView({ artifact }: { artifact: CampusMapArtifact }) {
  return (
    <div className={cx("w-full max-w-[28rem]")}>
      <CampusCard
        buildingNames={artifact.buildingNames}
        roomLabel={artifact.roomLabel}
        label={artifact.label}
        meta={artifact.meta}
        routeStops={artifact.routeStops}
        connectStops={artifact.connectStops}
      />
    </div>
  );
}

export function InstructorArtifactView({ artifact }: { artifact: InstructorArtifact }) {
  const days = artifact.teachingDays.length > 0 ? weekdayListLabel(artifact.teachingDays) : null;
  const meta = [artifact.termLabel, days].filter(Boolean).join(" · ");

  return (
    <div className="w-full max-w-[28rem] overflow-hidden rounded-2xl border border-border-table bg-background-primary-default">
      <InstructorProfileHero
        variant="popover"
        name={artifact.name}
        subtitle={artifact.subtitle}
        subjectBadges={artifact.subjects}
      >
        <InstructorRating name={artifact.name} reputation={artifact.reputation} />
      </InstructorProfileHero>

      {artifact.courses.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 border-t border-border-table px-3 py-2.5">
          {artifact.courses.map((course) => (
            <li key={course.courseId}>
              <Link
                href={`/course/${course.courseId}`}
                className="rounded-full border border-border-table px-2.5 py-1 text-caption-1-medium text-text-secondary hover:text-text-primary"
              >
                {course.code}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border-table px-3 py-2">
        <p className="truncate text-caption-1-regular text-text-tertiary">{meta}</p>
        {artifact.slug ? (
          <Link
            href={`/instructor/${artifact.slug}`}
            className="shrink-0 text-caption-1-medium text-text-secondary underline decoration-border-table underline-offset-2 hover:text-text-primary"
          >
            Full profile
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function OnboardingArtifactView({ artifact }: { artifact: OnboardingArtifact }) {
  return (
    <div className="w-full max-w-[28rem] rounded-2xl border border-border-table bg-background-primary-default p-4">
      <p className="text-headline-semibold text-text-primary">Set up your degree</p>
      <p className="mt-1 text-body-regular text-text-secondary">
        I need your school and program before I can tell you which Core or major
        requirements you still have. Takes a minute.
      </p>
      <ButtonLink
        href={artifact.href}
        size="small"
        className="mt-3"
        leadingIcon={RiGraduationCapLine}
      >
        Open onboarding
      </ButtonLink>
    </div>
  );
}
