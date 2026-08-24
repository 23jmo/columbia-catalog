"use client";

import Link from "next/link";
import { RiArrowRightSLine } from "@remixicon/react";

import { BookmarkControls } from "@/components/bookmarks/bookmark-controls";
import { FolderChip, FolderChipOverflow } from "@/components/bookmarks/folder-chip";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { ProvenanceStamp, SeatPill } from "@/components/course/seat-state";
import { useBookmark } from "@/hooks/use-bookmark";
import { formatSectionMeetings } from "@/components/catalog/meetings";
import type { Section } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * One saved section.
 *
 * ── Two modes, one row ────────────────────────────────────────────────────
 *
 * Ordinary mode: the row is a link to the section, with its star and overflow
 * on the right. Select mode: the link goes away and the whole row becomes a
 * checkbox. A row that is both navigable and selectable is a row where every
 * click is a coin flip, so the modes are exclusive.
 *
 * ── Seats carry their age, here as everywhere ─────────────────────────────
 *
 * A saved list is exactly where a stale number does the most damage — it is
 * the screen somebody opens at 7am on registration day. So the pill never
 * renders without its stamp, and a stale reading is muted rather than hidden:
 * "4 seats · as of 3d ago" is a usable sentence, and "4 seats" on its own is
 * a lie with good posture.
 */

export interface SavedSectionRowProps {
  section: Section;
  courseLabel: string;
  /** Non-null puts the row in Select mode. */
  selection?: {
    isSelected: boolean;
    onChange: (isSelected: boolean) => void;
  };
}

export function SavedSectionRow({ section, courseLabel, selection }: SavedSectionRowProps) {
  const { folders } = useBookmark(section.sectionId);
  const meeting = formatSectionMeetings(section);
  const href = `/course/${section.courseId}?section=${encodeURIComponent(section.sectionCode)}`;

  const body = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-body-medium tabular-nums text-text-primary">
            §{section.sectionCode}
          </span>
          {section.title ? (
            <span className="truncate text-caption-1-regular text-text-secondary">
              {section.title}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption-2-regular text-text-tertiary">
          {section.instructors.length > 0 ? (
            <span className="truncate">{section.instructors.join(", ")}</span>
          ) : (
            <span>Instructor TBA</span>
          )}
          {meeting ? <span className="tabular-nums">· {meeting}</span> : null}
          <span className="tabular-nums">· Call {section.callNumber}</span>
        </div>

        {folders.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {folders.slice(0, 3).map((folder) => (
              <FolderChip
                key={folder.folderId}
                folderId={folder.folderId}
                name={folder.name}
                href={`/saved/${folder.folderId}`}
              />
            ))}
            <FolderChipOverflow count={folders.length - 3} />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <SeatPill section={section} />
        <ProvenanceStamp sourceAsOf={section.sourceAsOf} />
      </div>
    </>
  );

  if (selection) {
    return (
      <li>
        <Checkbox
          isSelected={selection.isSelected}
          onChange={selection.onChange}
          aria-label={`Select ${courseLabel} section ${section.sectionCode}`}
          className={cx(
            "w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5",
            "hover:bg-background-primary-hover",
            selection.isSelected && "border-border-table bg-background-secondary-default/60",
          )}
        >
          <span className="flex min-w-0 flex-1 items-start gap-3">{body}</span>
        </Checkbox>
      </li>
    );
  }

  return (
    <li
      className={cx(
        "group/saved relative flex items-start gap-3 rounded-xl px-3 py-2.5",
        "transition-colors duration-100 ease hover:bg-background-primary-hover",
      )}
    >
      {/*
        The stretched link covers the row, so the controls need to sit above it
        — otherwise every click on the star would navigate away instead.
      */}
      <Link
        href={href}
        className="rounded outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        <span className="sr-only">
          {courseLabel} section {section.sectionCode}
        </span>
      </Link>

      {body}

      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        <BookmarkControls
          sectionId={section.sectionId}
          sectionCode={section.sectionCode}
          courseLabel={courseLabel}
          size="xs"
        />
        <RiArrowRightSLine
          aria-hidden
          className="size-4 text-text-tertiary transition-colors group-hover/saved:text-text-primary"
        />
      </div>
    </li>
  );
}
