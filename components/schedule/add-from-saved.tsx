"use client";

import { useMemo } from "react";
import { RiAlertLine, RiBookmarkLine, RiCheckLine } from "@remixicon/react";

import {
  Dropdown,
  DropdownDivider,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useSavedCatalog } from "@/hooks/use-saved-catalog";
import { folderGradientStyle } from "@/lib/bookmarks/folder-art";
import { groupSavedByFolder, savedSectionIds } from "@/lib/bookmarks/grouping";
import { groupByWeekday, overlaps, toTimedItems } from "@/lib/schedule";
import type { CustomBlock, Section, TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * "Add from saved" — the shortlist, one click from the week canvas.
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 *
 * Saving and scheduling are the same task ten minutes apart. Without this, the
 * loop is: build a plan, notice a gap, navigate to `/saved`, remember which
 * class it was, navigate to the course page, add it, navigate back to the
 * schedule to see whether it fit. This collapses that to a menu.
 *
 * ── Conflicts are marked, never blocked ───────────────────────────────────
 *
 * A row that overlaps something already in the plan gets a ⚠ and says what it
 * clashes with, and stays fully clickable. Deciding that a student may not
 * consider two overlapping classes is not a call this product makes — plenty
 * of real plans hold a conflict on purpose while a swap is pending, and a
 * disabled row with no explanation is indistinguishable from a broken one.
 *
 * ── Grouped by folder, and a section can appear twice ─────────────────────
 *
 * Folders are many-to-many, so a class filed in two of them shows under both.
 * Deduping would make this menu disagree with the folder pages, and the reader
 * would have to remember which folder "won".
 */

export interface AddFromSavedProps {
  termCode: TermCode;
  /** The plan's already-resolved sections, for conflict marking. */
  planSections: readonly Section[];
  planBlocks: readonly CustomBlock[];
  /** Section ids already in the plan. */
  planSectionIds: readonly string[];
  onAdd: (sectionId: string) => void;
  className?: string;
}

export function AddFromSaved({
  termCode,
  planSections,
  planBlocks,
  planSectionIds,
  onAdd,
  className,
}: AddFromSavedProps) {
  const snapshot = useBookmarks();

  const savedIds = useMemo(
    () => savedSectionIds(snapshot, { termCode }),
    [snapshot, termCode],
  );
  const { sections } = useSavedCatalog(savedIds);

  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.sectionId, section])),
    [sections],
  );

  const groups = useMemo(
    () => groupSavedByFolder(snapshot, snapshot.folders, termCode),
    [snapshot, termCode],
  );

  const inPlan = useMemo(() => new Set(planSectionIds), [planSectionIds]);

  /*
   * What the plan already occupies, by weekday.
   *
   * Built once for the whole menu rather than per row: with 40 saved sections
   * and a full plan, the per-row version is 40 rebuilds of the same map every
   * time the popover repaints.
   */
  const busyByDay = useMemo(
    () => groupByWeekday(toTimedItems(planSections, planBlocks)),
    [planSections, planBlocks],
  );

  const clashLabel = (sectionId: string): string | null => {
    const section = sectionById.get(sectionId);
    if (!section) return null;
    // A section already in the plan trivially "conflicts" with itself. Skipping
    // it here keeps the ✓ row from also wearing a ⚠.
    if (inPlan.has(sectionId)) return null;

    for (const item of toTimedItems([section], [])) {
      for (const busy of busyByDay.get(item.weekday) ?? []) {
        if (busy.id === sectionId) continue;
        if (overlaps(item, busy)) return busy.label;
      }
    }
    return null;
  };

  // Nothing saved for this term means nothing to offer — and a menu whose only
  // content is an apology is worse than no button.
  if (savedIds.length === 0) return null;

  const unfiled = savedIds.filter(
    (sectionId) => (snapshot.folderIdsBySection.get(sectionId) ?? []).length === 0,
  );

  return (
    <Dropdown>
      <DropdownTrigger
        className={cx(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5",
          "border border-border-button-default bg-background-primary-default",
          "text-body-medium text-text-primary shadow-xs",
          "hover:border-border-button-hover hover:bg-background-primary-hover",
          className,
        )}
      >
        <RiBookmarkLine className="size-4" aria-hidden />
        Add from saved
      </DropdownTrigger>

      <DropdownPopover
        aria-label="Your saved classes"
        placement="bottom start"
        offset={6}
        className="max-h-[min(70dvh,560px)] w-80 overflow-y-auto overscroll-contain"
      >
        {groups.map((group, index) => (
          <div key={group.folderId}>
            {index > 0 ? <DropdownDivider /> : null}
            <DropdownGroup label={group.name}>
              {group.sectionIds.map((sectionId) => (
                <SavedRow
                  key={`${group.folderId}:${sectionId}`}
                  section={sectionById.get(sectionId)}
                  sectionId={sectionId}
                  isInPlan={inPlan.has(sectionId)}
                  clashesWith={clashLabel(sectionId)}
                  onAdd={onAdd}
                />
              ))}
            </DropdownGroup>
          </div>
        ))}

        {unfiled.length > 0 ? (
          <div>
            {groups.length > 0 ? <DropdownDivider /> : null}
            {/* Last, because it is the pile you have not thought about yet. */}
            <DropdownGroup label="Uncategorized">
              {unfiled.map((sectionId) => (
                <SavedRow
                  key={`uncategorized:${sectionId}`}
                  section={sectionById.get(sectionId)}
                  sectionId={sectionId}
                  isInPlan={inPlan.has(sectionId)}
                  clashesWith={clashLabel(sectionId)}
                  onAdd={onAdd}
                />
              ))}
            </DropdownGroup>
          </div>
        ) : null}
      </DropdownPopover>
    </Dropdown>
  );
}

function SavedRow({
  section,
  sectionId,
  isInPlan,
  clashesWith,
  onAdd,
}: {
  section: Section | undefined;
  sectionId: string;
  isInPlan: boolean;
  clashesWith: string | null;
  onAdd: (sectionId: string) => void;
}) {
  // The catalog lookup is still in flight, or the section left the catalog.
  // Either way the id alone is not something to put in front of a reader.
  if (!section) return null;

  const label = `${section.courseId} §${section.sectionCode}`;

  return (
    <DropdownItem
      selected={isInPlan}
      onSelect={() => onAdd(sectionId)}
      className="items-start"
    >
      {isInPlan ? (
        <RiCheckLine className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : clashesWith ? (
        <RiAlertLine className="mt-0.5 size-4 shrink-0 text-text-error-primary" aria-hidden />
      ) : (
        <span
          aria-hidden
          className="mt-0.5 size-4 shrink-0 rounded-full ring-1 ring-inset ring-border-table"
          style={folderGradientStyle(section.courseId)}
        />
      )}

      <span className="flex min-w-0 flex-col gap-0.5 text-left">
        <span className="truncate tabular-nums">{label}</span>
        {isInPlan ? (
          <span className="text-caption-1-regular text-text-tertiary">Already on this plan</span>
        ) : clashesWith ? (
          // Named, not just flagged. "Conflicts" tells you there is a problem;
          // "Overlaps COMS 4118 · 001" tells you which trade-off you are making.
          <span className="truncate text-caption-1-regular text-text-error-primary">
            Overlaps {clashesWith}
          </span>
        ) : section.instructors.length > 0 ? (
          <span className="truncate text-caption-1-regular text-text-tertiary">
            {section.instructors.join(", ")}
          </span>
        ) : null}
      </span>
    </DropdownItem>
  );
}
