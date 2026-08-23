"use client";

import { useState } from "react";
import Link from "next/link";
import { RiArrowDownSLine, RiArrowRightSLine } from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { EnrollmentBar } from "@/components/catalog/enrollment-bar";
import {
  courseInstructors,
  formatCourseCode,
  formatCredits,
  formatSectionMeetings,
} from "@/components/catalog/meetings";
import { prettyTitle } from "@/components/course/format";
import { REQUIREMENT_FILTERS } from "@/lib/constants";
import type { CourseListItem, SectionListItem } from "@/lib/catalog-list-types";
import { cx } from "@/utils/cx";

/**
 * One result: a COURSE that opens into a TABLE of its sections.
 *
 * Spec section 6 keeps the result unit at the course -- students look for
 * "Operating Systems", not "section 002". What changed is the shape underneath:
 * the sections are now a real table with a header row rather than a stack of
 * restated sentences.
 *
 * ── When the section IS the class ──────────────────────────────────────────
 *
 * "Course" and "class" come apart on container courses. COMS6998 is one course
 * called "Topics in Computer Science" with 24 sections that are 24 different
 * classes -- "LLM Based Generative AI", "Computation and the Brain". Those
 * names live on the section, so when a section has its own title the table
 * prints it next to the section code, and a query that named it arrives with
 * that section already in `matchedSectionIds`: the row opens with the right
 * one highlighted instead of making the reader open 24 and read.
 *
 * ── Why a table and not cards ──────────────────────────────────────────────
 *
 * Choosing between sections is a column-wise comparison, not a row-wise read.
 * "Which of these has room?" and "which is cheapest in credits?" are answered by
 * scanning one column down, which a table makes free and a stack of cards makes
 * impossible -- in a card each value sits at a different x, so the eye has to
 * re-find it on every row. The card chrome was also spending ~40px of vertical
 * space per result on border, shadow and padding that carried no information.
 *
 * ── Columns are earned, not assumed ────────────────────────────────────────
 *
 * The directory's own listing shows Class Type, Method of Instruction and
 * Grading Mode. Our ingest populates none of them -- 0 of 8,014 Fall 2026
 * sections -- and meeting times exist for 1.1%. Rendering those columns would
 * produce eight thousand em-dashes and make the page look broken rather than
 * incomplete. So the table renders only the columns we actually have -- section,
 * call number, credits, instructor, enrollment -- and the rest slot into
 * `SectionTableRow` unchanged once the crawler starts filling them.
 */

const REQUIREMENT_LABEL_BY_KEY = new Map(REQUIREMENT_FILTERS.map((r) => [r.key, r.label]));

export interface CourseResultRowProps {
  course: CourseListItem;
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
  // survives further typing -- nothing is more irritating than a row that keeps
  // re-collapsing under you.
  const [override, setOverride] = useState<boolean | null>(null);
  const isExpanded = override ?? defaultExpanded;

  const code = formatCourseCode(course.subjectCode, course.number);
  const title = prettyTitle(course.title);
  const credits = formatCredits(course.pointsMin, course.pointsMax);
  const instructors = courseInstructors(course.sections);
  const sections = orderSections(course.sections, matchedSectionIds);
  const matched = matchedSectionIds ? new Set(matchedSectionIds) : null;

  const requirementLabels = Object.entries(course.requirementFlags)
    .filter(([, on]) => on === true)
    .map(([key]) => REQUIREMENT_LABEL_BY_KEY.get(key) ?? key)
    .slice(0, 3);

  const panelId = `sections-${course.courseId}`;
  const sectionCount = sections.length;

  return (
    <article
      className={cx(
        "group/row border-b border-border-table transition-colors duration-100 ease",
        isExpanded ? "bg-background-secondary/40" : "hover:bg-background-primary-hover",
      )}
      aria-label={`Result ${position} of ${total}: ${code} ${title}`}
    >
      {/* ── Course header ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-body-semibold -tracking-[0.01em] text-text-primary">
            <Link
              href={`/course/${course.courseId}`}
              className="rounded outline-none transition-colors duration-100 ease hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              {title}
            </Link>
          </h2>

          {/*
            Code sits UNDER the title, muted. The directory does it this way and
            it is the right call: the title is what a student is scanning for,
            and leading every row with a monospace code turns the list into a
            column of near-identical strings that all start with four letters.
          */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-2-regular text-text-tertiary">
            <span className="tabular-nums tracking-[0.04em]">{code}</span>
            {credits ? <span>· {credits}</span> : null}
          </div>

          {instructors.length > 0 ? (
            <p className="mt-0.5 truncate text-caption-1-medium text-text-secondary">
              {instructors.slice(0, 2).join(", ")}
              {instructors.length > 2 ? ` +${instructors.length - 2}` : ""}
            </p>
          ) : null}

          {requirementLabels.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {requirementLabels.map((label) => (
                <Chip key={label} variant="caption" color="soft">
                  {label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setOverride(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className={cx(
            "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1",
            "text-caption-2-medium text-text-secondary transition-colors",
            "hover:bg-background-primary-hover hover:text-text-primary",
            "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          )}
        >
          <span className="tabular-nums">
            {sectionCount} {sectionCount === 1 ? "section" : "sections"}
            {matched ? ` · ${matched.size} match${matched.size === 1 ? "" : "es"}` : ""}
          </span>
          <RiArrowDownSLine
            aria-hidden
            className={cx("size-3.5 transition-transform duration-150 ease", isExpanded && "rotate-180")}
          />
        </button>
      </div>

      {/* ── Section table ──────────────────────────────────────────────── */}
      {isExpanded ? (
        <div id={panelId} className="overflow-x-auto border-t border-border-table px-3 pb-2.5">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="text-caption-2-medium tracking-[0.06em] text-text-tertiary uppercase">
                <th scope="col" className="py-1.5 pr-3 font-medium">Section</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Call</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Cr</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Instructor &amp; meeting</th>
                <th scope="col" className="w-[10.5rem] py-1.5 font-medium">Enrollment</th>
                <th scope="col" className="w-6 py-1.5">
                  <span className="sr-only">Open section</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <SectionTableRow
                  key={section.sectionId}
                  section={section}
                  isMatch={matched?.has(section.sectionId) ?? false}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

function SectionTableRow({ section, isMatch }: { section: SectionListItem; isMatch: boolean }) {
  const meeting = formatSectionMeetings(section);
  const sectionTitle = section.title ? prettyTitle(section.title) : null;
  const instructors = section.instructors.length > 0 ? section.instructors.join(", ") : null;
  const credits = formatCredits(section.minUnit, section.maxUnit);

  /*
   * The section is the unit you act on, so the whole row is the click target.
   *
   * One stretched link rather than a link per cell: `after:absolute
   * after:inset-0` grows the anchor's hit area over the entire row, so the
   * pointer gets a row-sized target while assistive tech still sees exactly one
   * link with one accessible name. Wrapping the <tr> in an <a> is not an option
   * -- it is invalid table markup and browsers reparent it out of the table.
   *
   * `?section=` rides along so the drawer can lead with the section that was
   * clicked instead of the course's first one.
   */
  const href = `/course/${section.courseId}?section=${encodeURIComponent(section.sectionCode)}`;

  return (
    <tr
      className={cx(
        "group/section relative border-t border-border-table/60 align-middle",
        "transition-colors duration-100 ease hover:bg-background-primary-hover",
        // The match highlight is a left rule plus a tint, never a tint alone --
        // a background wash is exactly the cue that vanishes in greyscale. It
        // now also fires when the QUERY named this section by title, not only
        // when a filter selected it.
        isMatch && "bg-accent-500/[0.07]",
      )}
    >
      <td className="py-1.5 pr-3">
        <span className="inline-flex items-center gap-1.5">
          {isMatch ? (
            <span aria-hidden className="h-3 w-0.5 rounded-full bg-accent-500" />
          ) : (
            <span aria-hidden className="h-3 w-0.5" />
          )}
          <Link
            href={href}
            className={cx(
              "text-caption-1-medium text-text-primary",
              "rounded outline-none transition-colors duration-100 ease hover:text-accent-600",
              "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              "after:absolute after:inset-0 after:content-['']",
            )}
          >
            <span className="tabular-nums">{section.sectionCode}</span>
            {/*
              The section's own title, when it has one, sits INSIDE the link.
              That is the point: for a container course like COMS6998 "Topics in
              Computer Science", the section title is the only thing that says
              which of the 24 unrelated classes this row is, so it belongs in the
              link's accessible name rather than in a quiet cell elsewhere.
              Most sections have no title and this renders nothing.
            */}
            {sectionTitle ? (
              <span className="font-normal text-text-secondary"> · {sectionTitle}</span>
            ) : null}
            <span className="sr-only">
              {instructors ? ` — ${instructors}` : ""}
              {isMatch ? " (matches your search)" : ""}
            </span>
          </Link>
        </span>
      </td>

      <td className="py-1.5 pr-3 text-caption-2-regular tabular-nums text-text-tertiary">
        {section.callNumber ?? "—"}
      </td>

      <td className="py-1.5 pr-3 text-right text-caption-2-regular tabular-nums text-text-secondary">
        {credits ?? "—"}
      </td>

      <td className="min-w-0 py-1.5 pr-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-caption-1-medium text-text-primary">
            {instructors ?? "Instructor TBA"}
          </span>
          {/*
            Only 1.1% of Fall 2026 sections carry a meeting pattern, so this
            line is usually absent. Absent is correct: printing "TBA" on 7,929
            rows would be noise, and printing a placeholder time would be a lie.
          */}
          {meeting ? (
            <span className="truncate text-caption-2-regular tabular-nums text-text-tertiary">
              {meeting}
            </span>
          ) : null}
        </div>
      </td>

      <td className="py-1.5">
        <EnrollmentBar
          status={section.status}
          enrollmentCount={section.enrollmentCount}
          enrollmentCap={section.enrollmentCap}
          waitlistCount={section.waitlistCount}
        />
      </td>

      {/* Affordance only -- the stretched link above already covers this cell. */}
      <td className="py-1.5 pl-1 text-right">
        <RiArrowRightSLine
          aria-hidden
          className="inline size-4 text-text-tertiary transition-colors group-hover/section:text-text-primary"
        />
      </td>
    </tr>
  );
}

/** Sections that satisfied the active filters come first; then section code. */
function orderSections(
  sections: SectionListItem[],
  matchedSectionIds: string[] | null,
): SectionListItem[] {
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
