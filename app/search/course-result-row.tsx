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
 * A single search result -- the section is the row.
 *
 * 3,433 of 4,428 courses (78%) have exactly one section. For those, a course
 * header that expands is a disclosure that hides nothing: you click, and the
 * panel contains one row. So a single-section course renders AS its section --
 * one row, section title leading, clicking it opens the drawer. A course keeps
 * its own header row only when it has more than one section to group, and that
 * header is purely a disclosure: it toggles the table, it never navigates.
 *
 * Both rules turn out to be the same rule. A row that groups a choice opens
 * the choice; a row that IS the choice opens the drawer.
 *
 * Spec section 6 keeps the result unit at the course -- students look for
 * "Operating Systems", not "section 002" -- and it still does, because the
 * multi-section header IS the course. What changed is the shape underneath:
 * sections are a real table with a header row rather than a stack of restated
 * sentences, and the 78% case no longer pays for a grouping it does not need.
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

  // The whole point of this variant: no disclosure when there is no choice.
  if (sectionCount === 1) {
    return (
      <SoleSectionRow
        section={sections[0]}
        code={code}
        courseTitle={title}
        isMatch={matched?.has(sections[0].sectionId) ?? false}
        requirementLabels={requirementLabels}
        position={position}
        total={total}
      />
    );
  }

  return (
    <article
      className={cx(
        "group/row border-b border-border-table transition-colors duration-100 ease",
        isExpanded ? "bg-background-secondary-default/40" : "hover:bg-background-primary-hover",
      )}
      aria-label={`Result ${position} of ${total}: ${code} ${title}`}
    >
      {/* ── Course header ──────────────────────────────────────────────── */}
      {/*
        The header is a DISCLOSURE, not a destination.

        It used to link to /course/[id], which opened the drawer -- so clicking a
        course answered a question nobody asked ("tell me about this course")
        when the actual question is "which of its sections do I want?". A course
        is a container; the section is the thing you enrol in, the thing that has
        a time, a room, an instructor and a seat. So the course row opens the
        container and the section row opens the drawer.
      */}
      <div className="relative flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-body-semibold -tracking-[0.01em] text-text-primary">{title}</h2>

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
          aria-label={`${title} — ${sectionCount} ${sectionCount === 1 ? "section" : "sections"}`}
          className={cx(
            "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1",
            "text-caption-2-medium text-text-secondary transition-colors",
            "hover:bg-background-primary-hover hover:text-text-primary",
            "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            // One control, header-sized hit area: the whole row toggles, while
            // assistive tech still sees exactly one button with one name.
            "after:absolute after:inset-0 after:content-['']",
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
            {/*
              The section's own title LEADS, with the code demoted beside it.

              Inside the link on purpose: for a container course the title is the
              only string that says which class this row is, so it has to be the
              link's accessible name. And it leads rather than trails because
              scanning 64 rows of "001 · Swim / 002 · Diving" means reading past
              an identical prefix 64 times to reach the word that differs. When a
              section has no title of its own -- most do not -- the code is the
              identity and stands alone.
            */}
            {sectionTitle ? (
              <>
                <span>{sectionTitle}</span>
                <span className="ml-1.5 font-normal tabular-nums text-text-tertiary">
                  {section.sectionCode}
                </span>
              </>
            ) : (
              <span className="tabular-nums">{section.sectionCode}</span>
            )}
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

/**
 * A course with exactly one section, rendered as that section.
 *
 * The headline is whichever string actually names the class: the section's own
 * title when it has one, the course title otherwise. Everything demoted to the
 * context line underneath is there to answer "which course is this?" without
 * competing for the scan.
 */
function SoleSectionRow({
  section,
  code,
  courseTitle,
  isMatch,
  requirementLabels,
  position,
  total,
}: {
  section: SectionListItem;
  code: string;
  courseTitle: string;
  isMatch: boolean;
  requirementLabels: string[];
  position: number;
  total: number;
}) {
  const ownTitle = section.title ? prettyTitle(section.title) : null;
  const headline = ownTitle ?? courseTitle;
  const meeting = formatSectionMeetings(section);
  const instructors = section.instructors.length > 0 ? section.instructors.join(", ") : null;
  const credits = formatCredits(section.minUnit, section.maxUnit);
  const href = `/course/${section.courseId}?section=${encodeURIComponent(section.sectionCode)}`;

  return (
    <article
      className={cx(
        "group/row relative border-b border-border-table transition-colors duration-100 ease",
        "hover:bg-background-primary-hover",
        isMatch && "bg-accent-500/[0.07]",
      )}
      aria-label={`Result ${position} of ${total}: ${code} ${headline}`}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-body-semibold -tracking-[0.01em] text-text-primary">
            <Link
              href={href}
              className={cx(
                "rounded outline-none transition-colors duration-100 ease hover:text-accent-600",
                "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                "after:absolute after:inset-0 after:content-['']",
              )}
            >
              {headline}
              <span className="sr-only">
                {ownTitle ? ` — ${courseTitle}` : ""} — section {section.sectionCode}
                {isMatch ? " (matches your search)" : ""}
              </span>
            </Link>
          </h2>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-2-regular text-text-tertiary">
            {/* Only when the headline was the SECTION's name -- otherwise this
                would print the same string twice in a row. */}
            {ownTitle ? <span className="truncate">{courseTitle} ·</span> : null}
            <span className="tabular-nums tracking-[0.04em]">{code}</span>
            <span className="tabular-nums">· {section.sectionCode}</span>
            {credits ? <span>· {credits}</span> : null}
          </div>

          {instructors ? (
            <p className="mt-0.5 truncate text-caption-1-medium text-text-secondary">{instructors}</p>
          ) : null}
          {meeting ? (
            <p className="mt-0.5 truncate text-caption-2-regular tabular-nums text-text-tertiary">
              {meeting}
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

        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <EnrollmentBar
            status={section.status}
            enrollmentCount={section.enrollmentCount}
            enrollmentCap={section.enrollmentCap}
            waitlistCount={section.waitlistCount}
          />
          <RiArrowRightSLine
            aria-hidden
            className="size-4 text-text-tertiary transition-colors group-hover/row:text-text-primary"
          />
        </div>
      </div>
    </article>
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
