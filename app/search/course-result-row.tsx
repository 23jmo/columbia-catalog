"use client";

import { useState } from "react";
import Link from "next/link";
import { RiArrowRightSLine, RiUserLine } from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import {
  courseInstructors,
  formatCourseCode,
  formatCredits,
  formatSectionMeetings,
} from "@/components/catalog/meetings";
import { SeatBadge, aggregateSeatFigures } from "@/components/catalog/seat-badge";
import { SectionRow } from "@/components/catalog/section-row";
import { prettyTitle } from "@/components/course/format";
import { REQUIREMENT_FILTERS } from "@/lib/constants";
import type { CourseWithSections, Section } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * One result: a COURSE, expanding to its sections in place.
 *
 * Spec §6 is explicit that the result unit is the course — students look for
 * "Operating Systems", not "section 002" — so the row leads with the course
 * and treats sections as the detail you open when you are choosing between
 * them. The collapsed row still answers the question that decides whether to
 * expand at all: is there room, and who teaches it.
 *
 * Clicking the title navigates to `/course/[courseId]`, which the drawer
 * interception turns into an overlay without losing these results.
 */

const REQUIREMENT_LABEL_BY_KEY = new Map(REQUIREMENT_FILTERS.map((r) => [r.key, r.label]));

export interface CourseResultRowProps {
  course: CourseWithSections;
  matchedSectionIds: string[] | null;
  defaultExpanded: boolean;
  /** 1-based position, announced to screen readers. */
  position: number;
  total: number;
}

export function CourseResultRow({
  course,
  matchedSectionIds,
  defaultExpanded,
  position,
  total,
}: CourseResultRowProps) {
  // A deliberate choice by the reader outranks the filter-driven default, and
  // survives further typing — nothing is more irritating than a row that keeps
  // re-collapsing under you.
  const [override, setOverride] = useState<boolean | null>(null);
  const isExpanded = override ?? defaultExpanded;

  const code = formatCourseCode(course.subjectCode, course.number);
  const title = prettyTitle(course.title);
  const credits = formatCredits(course.pointsMin, course.pointsMax);
  const instructors = courseInstructors(course.sections);
  const seats = aggregateSeatFigures(course.sections);
  const sections = orderSections(course.sections, matchedSectionIds);
  const matched = matchedSectionIds ? new Set(matchedSectionIds) : null;

  const requirementLabels = Object.entries(course.requirementFlags)
    .filter(([, on]) => on === true)
    .map(([key]) => REQUIREMENT_LABEL_BY_KEY.get(key) ?? key)
    .slice(0, 3);

  const meetingSummary = firstMeetingSummary(sections);
  const panelId = `sections-${course.courseId}`;

  return (
    <article
      className={cx(
        "rounded-[18px] border border-border-table bg-background-primary-default shadow-card",
        "transition-[border-color,box-shadow] duration-150 ease",
        "hover:border-border-button-hover hover:shadow-md",
      )}
      aria-label={`Result ${position} of ${total}: ${code} ${title}`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-caption-1-semibold tracking-[0.04em] tabular-nums text-accent-600">
              {code}
            </span>
            {credits ? (
              <span className="text-caption-1-regular text-text-tertiary">{credits}</span>
            ) : null}
          </div>

          <h2 className="mt-1 text-title-3-semibold -tracking-[0.01em] text-text-primary">
            <Link
              href={`/course/${course.courseId}`}
              className="rounded-lg outline-none transition-colors duration-150 ease hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              {title}
            </Link>
          </h2>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption-1-regular text-text-secondary">
            <span className="inline-flex min-w-0 items-center gap-1">
              <RiUserLine aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">
                {instructors.length > 0 ? instructors.slice(0, 2).join(", ") : "Instructor TBA"}
                {instructors.length > 2 ? ` +${instructors.length - 2}` : ""}
              </span>
            </span>
            {meetingSummary ? <span className="tabular-nums">{meetingSummary}</span> : null}
          </div>

          {requirementLabels.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {requirementLabels.map((label) => (
                <Chip key={label} variant="caption" color="soft">
                  {label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {/* Aggregate seat state, provenance attached — the oldest "as of"
              across the sections, because the weakest link is the honest one. */}
          <SeatBadge figures={seats} layout="stacked" />
          <button
            type="button"
            onClick={() => setOverride(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls={panelId}
            className={cx(
              "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1",
              "text-caption-1-medium text-text-secondary transition-colors",
              "hover:bg-background-primary-hover hover:text-text-primary",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            {isExpanded ? "Hide" : "Show"} {seats.sectionCount}{" "}
            {seats.sectionCount === 1 ? "section" : "sections"}
            {matched ? ` · ${matched.size} match${matched.size === 1 ? "" : "es"}` : ""}
            <RiArrowRightSLine
              aria-hidden
              className={cx("size-4 transition-transform duration-150 ease", isExpanded && "rotate-90")}
            />
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div id={panelId} className="flex flex-col gap-1.5 border-t border-border-table p-3 sm:px-5 sm:py-4">
          {sections.map((section) => (
            <SectionRow
              key={section.sectionId}
              section={section}
              isMatch={matched?.has(section.sectionId) ?? false}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

/** Sections that satisfied the active filters come first; then section code. */
function orderSections(sections: Section[], matchedSectionIds: string[] | null): Section[] {
  const matched = matchedSectionIds ? new Set(matchedSectionIds) : null;
  return [...sections].sort((a, b) => {
    if (matched) {
      const aMatch = matched.has(a.sectionId) ? 0 : 1;
      const bMatch = matched.has(b.sectionId) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    return a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true });
  });
}

/**
 * The meeting pattern of the first section that has one. Many directory rows
 * carry no time at all, and saying nothing is better than implying every
 * section meets when one does.
 */
function firstMeetingSummary(sections: Section[]): string | null {
  for (const section of sections) {
    const summary = formatSectionMeetings(section);
    if (summary) return sections.length > 1 ? `${summary} +` : summary;
  }
  return null;
}
