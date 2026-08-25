import Link from "next/link";
import { RiArrowRightUpLine, RiErrorWarningLine } from "@remixicon/react";

import { ButtonLink } from "@/components/base/buttons/button";
import { BookmarkControls } from "@/components/bookmarks/bookmark-controls";
import { EnrollmentBar } from "@/components/catalog/enrollment-bar";
import { formatSectionMeetings } from "@/components/catalog/meetings";
import { ProvenanceStamp } from "@/components/course/seat-state";
import { termLabel } from "@/lib/constants";
import type { FeedSectionView } from "@/lib/recommend/feed";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * One section, rendered as the thing a student decides about.
 *
 * ── It is a search result, because it is the same object ───────────────────
 *
 * The layout here is `app/search/course-result-row.tsx`'s sole-section row,
 * deliberately: text in a left column at four descending weights — identity,
 * instructor, meeting pattern — and a fixed-width right column carrying the
 * enrollment meter. A student who has used search has already learned where to
 * look for each of those, and a recommendation is not a different kind of thing
 * from a search hit; it is a search hit someone chose for them.
 *
 * `EnrollmentBar` in particular is not decoration. "22 of 140 seats left" and
 * "22 of 30 seats left" are the same sentence and completely different news,
 * and the bar answers which one you are looking at before you read a digit.
 *
 * ── The Open-in-Vergil link is the legitimacy proof ────────────────────────
 *
 * `vergilSectionUrl` has existed since the first week and shipped inside emails
 * and ICS files, but no course card has ever carried it. That absence is the
 * difference between an app that reads like a planner and one that reads like a
 * scraper: a student who can click straight through to the registrar's own page
 * for this exact call number can verify everything above it in one step, and a
 * student who cannot has to take our word.
 *
 * It is also the one Columbia URL we ever send anyone to, and it opens in a new
 * tab where their UNI login and their own click do the actual work. We never
 * register, drop, or waitlist anyone. It sits directly under the meter because
 * those two are the decision: how full is it, and take me there.
 *
 * ── Three time states, never two ───────────────────────────────────────────
 *
 * 44.8% of sections have no published meeting pattern. Printing a historical
 * pattern without saying so would be the single most damaging thing this
 * surface could do — a student would build a week around last year's schedule —
 * so an estimate always names the term it came from, and "time not published"
 * is stated outright rather than rendered as an empty row.
 */

export function SectionLine({
  section,
  courseId,
  courseCode,
  className,
}: {
  section: FeedSectionView;
  /** Needed for the section link — the same href the search results use. */
  courseId: string;
  /** `"COMS 4111"`. Printed inside the Vergil link's accessible name. */
  courseCode: string;
  className?: string;
}) {
  const instructors = section.instructors.filter(
    (name) => name.trim().length > 0 && !/^(tba|tbd)$/i.test(name.trim()),
  );
  const meeting = section.timeKind === "tba" ? null : formatSectionMeetings(section);

  /*
   * The same href `app/search/course-result-row.tsx` builds for a result row:
   * the course page, opened on this section. There is no separate "section
   * page" in this app and there should not be one — the section is read in the
   * context of the course it belongs to.
   */
  const sectionHref = `/course/${courseId}?section=${encodeURIComponent(section.sectionCode)}`;

  return (
    <div
      className={cx(
        "flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {/* Identity. The section code, call number and term are what a student
            copies into Vergil or reads back to an advisor. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-2-regular text-text-tertiary">
          <Link
            href={sectionHref}
            className="rounded-sm tabular-nums text-text-secondary outline-none hover:text-text-primary hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            Section {section.sectionCode}
          </Link>
          <span className="tabular-nums tracking-[0.04em]">· #{section.callNumber}</span>
          <span>· {termLabel(section.termCode as TermCode)}</span>
          {section.conflictsWithPlan ? (
            <span className="inline-flex items-center gap-1 text-status-rose-text">
              <RiErrorWarningLine className="size-3.5 shrink-0" aria-hidden />
              Clashes with your plan
            </span>
          ) : null}
        </p>

        {/* The section's own topic, when it genuinely has one (container courses). */}
        {section.title ? (
          <p className="mt-0.5 text-caption-1-medium text-text-primary">{section.title}</p>
        ) : null}

        <p className="mt-0.5 text-caption-1-medium text-text-secondary">
          {instructors.length > 0 ? (
            instructors.join(", ")
          ) : (
            <span className="text-text-tertiary">Instructor not yet announced</span>
          )}
        </p>

        <p className="mt-0.5 text-caption-2-regular tabular-nums text-text-tertiary">
          {meeting ?? "Time not published by the registrar"}
        </p>

        {section.timeKind === "estimated" ? (
          /*
           * Never optional. `lib/db/typical-meetings.ts` is a hint drawn from
           * an earlier term, and it is only ever consulted when the registrar
           * has published nothing — so the label is what keeps it a hint.
           */
          <p className="mt-0.5 text-caption-2-regular text-status-yellow-text">
            Estimated from{" "}
            {section.estimatedFromTerm
              ? termLabel(section.estimatedFromTerm as TermCode)
              : "an earlier term"}
            . Not confirmed for this term.
          </p>
        ) : null}

        {/* Spec §3: a seat number never renders without the directory's own
            "as of" stamp. The meter is in the next column, so this is the
            stamp's post — directly under the row it belongs to. */}
        <ProvenanceStamp sourceAsOf={section.sourceAsOf} className="mt-1" />
      </div>

      {/*
        A column, not a footer — the same argument `course-result-row.tsx`
        makes: a column-wise question ("which of these has room?") wants a
        column, so a card and its sibling sections line their meters up on one
        x rather than putting them at a different y per row.

        `10.5rem` is the search table's Enrollment column width, kept so the
        two surfaces agree.
      */}
      <div className="flex flex-col gap-2 sm:w-[12rem] sm:shrink-0">
        <EnrollmentBar
          status={section.status}
          enrollmentCount={section.enrollmentCount}
          enrollmentCap={section.enrollmentCap}
          waitlistCount={section.waitlistCount}
          className="min-w-0"
        />

        {/*
          Save and register, the app's two existing section actions, in the
          order a student uses them. `BookmarkControls` is the identical
          control the search results and the course page carry — same store,
          same folder menu — so a section saved from the assistant lands in
          `/saved` beside one saved from a search, and nothing here had to
          learn about bookmarks.
        */}
        <div className="flex items-center gap-1.5">
          <BookmarkControls
            sectionId={section.sectionId}
            sectionCode={section.sectionCode}
            courseLabel={courseCode}
            size="xs"
          />

          <ButtonLink
            size="xs"
            variant="secondary"
            href={section.vergilUrl}
            target="_blank"
            rel="noopener noreferrer"
            trailingIcon={RiArrowRightUpLine}
            aria-label={`Open ${courseCode} section ${section.sectionCode}, call number ${section.callNumber}, in Vergil`}
            className="min-w-0 flex-1"
          >
            Open in Vergil
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
