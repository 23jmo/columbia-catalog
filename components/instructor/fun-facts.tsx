"use client";

import { provenanceLabel } from "@/components/course/format";
import type { InstructorPageData } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";
import { ActivityHeatmap } from "./activity-heatmap";
import { accentForSubject, countLabel, durationLabel, percentLabel, shortDateLabel } from "./format";

/**
 * Everything that is interesting but is not why anyone opened this page.
 *
 * These numbers used to be the hero: "1,240 students taught" was the headline
 * figure, in display type, above the fold. It is a real number and it is not
 * the question being asked. A student on a professor's page wants to know
 * whether to take the class, then which classes there are; how many seats the
 * registrar filled is trivia about the seat table, however impressive it looks
 * in 40px type.
 *
 * So the hero is now the rating (`./rating-hero`), the sections are second
 * (`./courses-taught`), and this card collects what is left, at the bottom,
 * labelled as what it is. Nothing was deleted — demoting a fact is not the same
 * as hiding it, and someone genuinely does want to know the teaching load.
 *
 * The provenance line travels WITH the seat numbers rather than staying behind
 * on the hero, because it is a caveat about these specific figures (spec §3).
 * A timestamp orphaned from the numbers it qualifies is decoration.
 */

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start rounded-2lg bg-background-primary-default p-2.5">
      <p className="w-full truncate text-body-medium tabular-nums text-text-primary">{value}</p>
      <p className="w-full truncate text-body-2-medium text-text-secondary">{label}</p>
    </div>
  );
}

export interface InstructorFunFactsProps {
  data: InstructorPageData;
  className?: string;
}

export function InstructorFunFacts({ data, className }: InstructorFunFactsProps) {
  const asOf = provenanceLabel(data.seatsAsOf);
  const accent = accentForSubject(data.subjects[0] ?? data.name);

  return (
    <section
      className={cx(
        "flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
      aria-labelledby="instructor-fun-facts-heading"
    >
      <div className="flex w-full flex-col gap-0.5 px-1.5 pt-1">
        <p id="instructor-fun-facts-heading" className="text-body-medium text-text-secondary">
          By the numbers
        </p>
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-title-2-medium whitespace-nowrap tabular-nums text-text-primary">
            {data.studentsTaught != null
              ? `${countLabel(data.studentsTaught)} students`
              : "Enrolment not published"}
          </p>
          {data.fillRatio != null ? (
            <span className="inline-flex items-center justify-center rounded-md bg-status-purple-background px-1.5 py-0.5 text-body-medium whitespace-nowrap text-status-purple-text">
              {percentLabel(data.fillRatio)} of seats
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          value={String(data.courseCount)}
          label={data.courseCount === 1 ? "Course" : "Courses"}
        />
        <StatTile
          value={String(data.sectionCount)}
          label={data.sectionCount === 1 ? "Section" : "Sections"}
        />
        <StatTile
          value={data.totalCapacity != null ? countLabel(data.totalCapacity) : "—"}
          label="Seats offered"
        />
        <StatTile value={durationLabel(data.weeklyMinutes)} label="Class time / week" />
      </div>

      <p className="px-1.5 text-caption-2-regular text-pretty text-text-tertiary">
        {asOf
          ? `Seat counts as published by the Directory of Classes on ${asOf}.`
          : "The Directory of Classes did not publish an “as of” time for these seat counts."}
      </p>

      <div className="rounded-2lg bg-background-primary-default p-2.5">
        <ActivityHeatmap
          days={data.calendar}
          accent={accent}
          scopeLabel={`${data.termLabel} · ${shortDateLabel(data.bounds.startsOn)} – ${shortDateLabel(data.bounds.endsOn)}`}
        />
      </div>
    </section>
  );
}
