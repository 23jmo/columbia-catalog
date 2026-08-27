"use client";

import Link from "next/link";
import { RiArrowRightUpLine } from "@remixicon/react";

import { BookmarkControls } from "@/components/bookmarks/bookmark-controls";
import { FolderChip, FolderChipOverflow } from "@/components/bookmarks/folder-chip";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { EnrollmentChip } from "@/components/course/enrollment-chip";
import { meetingLines } from "@/components/course/format";
import { InstructorChip } from "@/components/course/instructor-chip";
import { WeekStrip } from "@/components/course/meeting-schedule";
import { InstructorLinks, isLinkableInstructor } from "@/components/instructor/instructor-link";
import { ProvenanceStamp, SeatPill } from "@/components/course/seat-state";
import { useBookmark } from "@/hooks/use-bookmark";
import { termLabel, vergilSectionUrl } from "@/lib/constants";
import { displayCourseTitle } from "@/lib/onboarding/course-title";
import type { Course, Section } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * One saved class, in the recommendation card's shell.
 *
 * ── Why this is a card and not the row it replaced ────────────────────────
 *
 * The saved list used to be dense two-line rows: section number, a grey run of
 * "instructor · TuTh 1:10pm · Call 12345", and a seat pill on the right. That
 * is a good shape for a list you are ADMINISTERING — reordering, filing,
 * deleting in bulk — and the wrong shape for the list this actually is, which
 * is the shortlist you read the night before registration to decide what to
 * take. Those two jobs want opposite densities, and the row was serving the
 * one nobody does.
 *
 * So it borrows the feed card's grammar outright: same shell, same 20px title,
 * same week strip drawn before the time is named, same instructor chip with
 * its ratings on hover, same seat meter pinned to the bottom. The point is not
 * that both look nice — it is that a course you saw on `/` and then saved is
 * the same object on both screens, and it should not have to be re-learned
 * when it moves.
 *
 * ── What is different, and why ────────────────────────────────────────────
 *
 * The reason rows are gone and folder chips take their place. A recommendation
 * has to argue for itself — that is the whole content of "why this is on your
 * list". A saved class does not: the reader put it there. What they want to
 * know instead is which of their folders it is in, which is the one fact this
 * screen knows that no other screen does.
 *
 * The bookmark control stays, and on this page it is a REMOVE button wearing a
 * filled star. That is deliberate rather than a leftover: the same control in
 * the same corner means the gesture that put a class here is the gesture that
 * takes it away, and `BookmarkControls` already routes the removal through the
 * undo toast.
 */

export interface SavedCardProps {
  section: Section;
  course: Course;
  /** Non-null puts the card in Select mode: the whole card becomes a checkbox. */
  selection?: {
    isSelected: boolean;
    onChange: (isSelected: boolean) => void;
  };
  className?: string;
}

export function SavedCard({ section, course, selection, className }: SavedCardProps) {
  const { folders } = useBookmark(section.sectionId);

  const code = `${course.subjectCode} ${course.number}`;
  /*
   * The section's own title when it has one, and the course's otherwise.
   *
   * PHED1001UN is "PHYSICAL EDUCATION ACTIVITIES" across all 64 of its
   * sections, which are "PHED: Swim (Beginner)", "PHED: Diving" and 62 more.
   * On a shortlist the container name is useless — it is the same on every
   * row — so the specific one wins wherever the registrar published one.
   */
  const title = displayCourseTitle(section.title?.trim() || course.title);
  const href = `/course/${section.courseId}?section=${encodeURIComponent(section.sectionCode)}`;

  const body = (
    <>
      <header className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-caption-1-medium tabular-nums text-text-secondary sm:text-body-2-medium">
            {code} · Sec {section.sectionCode} · {termLabel(section.termCode)}
          </p>

          <h3 className="min-w-0 text-title-3-semibold -tracking-[0.01em] text-text-primary sm:text-title-2-semibold">
            {selection ? (
              // No link in Select mode. A card that both navigates and selects
              // is a card where every click is a coin flip.
              <span className="block line-clamp-2">{title}</span>
            ) : (
              <Link
                href={href}
                className={cx(
                  "block line-clamp-2 rounded-sm outline-none",
                  "transition-colors duration-100",
                  "hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                )}
              >
                {title}
              </Link>
            )}
          </h3>
        </div>

        {selection ? null : (
          <div className="relative z-10 flex shrink-0 items-center gap-0.5">
            <BookmarkControls
              sectionId={section.sectionId}
              sectionCode={section.sectionCode}
              courseLabel={code}
              size="xs"
            />
            <a
              href={vergilSectionUrl(section.termCode, section.callNumber)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Vergil"
              aria-label={`Open ${code} section ${section.sectionCode}, call number ${section.callNumber}, in Vergil`}
              className={cx(
                "flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8",
                "text-foreground-icon-tertiary transition-colors duration-150",
                "hover:bg-background-primary-hover hover:text-text-primary",
                "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              )}
            >
              <RiArrowRightUpLine aria-hidden className="size-4 sm:size-[1.125rem]" />
            </a>
          </div>
        )}
      </header>

      <MeetingRow section={section} />
      <Teacher section={section} isStatic={Boolean(selection)} />

      {folders.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {folders.slice(0, 4).map((folder) => (
            <FolderChip
              key={folder.folderId}
              folderId={folder.folderId}
              name={folder.name}
              // Not a link inside a checkbox — nested interactives in Select
              // mode swallow the click that was meant to tick the card.
              href={selection ? undefined : `/saved/${folder.folderId}`}
            />
          ))}
          <FolderChipOverflow count={folders.length - 4} />
        </div>
      ) : null}

      {/*
        Nothing interactive inside Select mode.

        `Checkbox` renders a <label> around a hidden input, so a <button> in
        here is invalid HTML AND toggles the checkbox on every click — hovering
        the seat meter to read its chart would tick the row instead. The static
        pill says the same number with the same stamp, which is the part that
        cannot be dropped either way.
      */}
      {selection ? (
        <span className="mt-auto flex items-center gap-2">
          <SeatPill section={section} />
          <ProvenanceStamp sourceAsOf={section.sourceAsOf} />
        </span>
      ) : (
        <EnrollmentChip
          section={section}
          termLabel={termLabel(section.termCode)}
          hideProvenance
          fill
          compact
          placement="top"
          className="mt-auto"
        />
      )}
    </>
  );

  const shell = cx(
    "flex min-w-0 w-full flex-col gap-3 rounded-2xl border border-border-table",
    "bg-background-primary-default p-4 sm:gap-3.5 sm:p-5",
    "transition-colors duration-150 ease-out motion-reduce:transition-none",
    className,
  );

  if (selection) {
    return (
      <Checkbox
        isSelected={selection.isSelected}
        onChange={selection.onChange}
        aria-label={`Select ${code} section ${section.sectionCode}`}
        className={cx(
          shell,
          "items-stretch text-left",
          // The same pair the dense row used, so a card and a row read as the
          // same selection state on a page that can still show both.
          selection.isSelected
            ? "border-border-button-active bg-background-secondary-default/60"
            : "hover:border-border-button-hover",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-3.5">{body}</span>
      </Checkbox>
    );
  }

  return <article className={cx(shell, "hover:border-border-button-hover")}>{body}</article>;
}

/* ==========================================================================
 * Lines
 * ========================================================================== */

/**
 * When it meets — drawn, then named, exactly as on the feed card.
 *
 * A saved list has no "estimated" case to disclose: these records come
 * straight from the catalog rather than from the recommender's fallback, so a
 * missing pattern is simply missing and says so.
 */
function MeetingRow({ section }: { section: Section }) {
  const primary = meetingLines(section.meetings)[0];
  if (!primary) {
    return (
      <p className="text-body-medium text-text-secondary sm:text-headline-medium">
        Meeting time not published
      </p>
    );
  }

  const extra = meetingLines(section.meetings).length - 1;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <WeekStrip days={primary.days} />
      <p className="min-w-0 truncate text-headline-medium tabular-nums text-text-primary sm:text-title-3-medium">
        {primary.timeLabel}
        {extra > 0 ? ` · +${extra}` : ""}
      </p>
      {primary.placeLabel ? (
        <p className="min-w-0 truncate text-caption-1-medium text-text-tertiary sm:text-body-2-medium">
          {primary.placeLabel}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Who teaches it — the same chip the feed card and the drawer use, except in
 * Select mode, where it is plain text for the reason given above the seat pill.
 */
function Teacher({ section, isStatic }: { section: Section; isStatic: boolean }) {
  const names = section.instructors.filter((name) => name.trim().length > 0);
  const primary = names[0];

  if (!primary) {
    return (
      <p className="text-body-medium text-text-secondary sm:text-headline-medium">
        Instructor not yet announced
      </p>
    );
  }

  const rest = names.slice(1);

  if (isStatic) {
    return (
      <p className="truncate text-body-medium text-text-secondary sm:text-headline-medium">
        {primary}
        {rest.length > 0 ? ` · +${rest.length}` : ""}
      </p>
    );
  }

  if (!isLinkableInstructor(primary)) {
    return (
      <p className="truncate text-body-medium text-text-secondary sm:text-headline-medium">
        <InstructorLinks names={names} max={2} fallback="Instructor not yet announced" />
      </p>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <InstructorChip
        name={primary}
        role={`Section ${section.sectionCode}`}
        placement="top"
        className="-ml-0.5 min-w-0"
      />
      {rest.length > 0 ? (
        <span className="min-w-0 truncate text-caption-1-medium text-text-secondary sm:text-body-2-medium">
          {rest.length === 1 ? rest[0] : `+${rest.length}`}
        </span>
      ) : null}
    </div>
  );
}
