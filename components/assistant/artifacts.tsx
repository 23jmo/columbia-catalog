"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import type {
  CampusMapArtifact,
  InstructorArtifact,
  ScheduleArtifact,
} from "@/lib/agent/present";
import { InstructorProfileHero } from "@/components/instructor/profile-hero";
import { InstructorRating } from "@/components/instructor/rating-hero";
import { weekdayListLabel } from "@/components/instructor/format";
import { termLabel } from "@/lib/constants";
import { cx } from "@/utils/cx";

/**
 * The calendar and map the present tools put on the thread.
 *
 * Both components already exist — `CalendarWeekPreview` is the course-drawer
 * week canvas, `CampusCard` is the isometric campus pin. They are loaded
 * here through `next/dynamic` so the assistant's first paint does not pay
 * for three.js or the calendar CSS until a turn actually asked for them.
 */

const CalendarWeekPreview = dynamic(
  () =>
    import("@/components/schedule/calendar-week-preview").then(
      (mod) => mod.CalendarWeekPreview,
    ),
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
      <CalendarWeekPreview
        blocks={artifact.blocks}
        weekdays={artifact.weekdays}
        termCode={artifact.termCode}
        commitmentIds={new Set(artifact.commitmentIds)}
        compact={isNarrow}
        className="w-full"
      />
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
