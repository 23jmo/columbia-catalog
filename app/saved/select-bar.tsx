"use client";

import { useState } from "react";
import { RiCalendarLine, RiCloseLine, RiDeleteBinLine, RiFolderLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import {
  Dropdown,
  DropdownDivider,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { folderGradientStyle } from "@/lib/bookmarks/folder-art";
import { fileMany, removeMany, unfileMany, undoRemoval } from "@/lib/bookmarks/store";
import { toast } from "@/lib/toast/store";
import type { FolderRecord } from "@/lib/db/bookmarks";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * The bar that appears once anything is selected.
 *
 * ── File, not move ────────────────────────────────────────────────────────
 *
 * "Add to folder" is additive: filing four sections into "Spring backups" does
 * not take them out of "Systems track". Folders are many-to-many (spec §5), so
 * a bulk action that silently unfiled things would be destroying work the
 * student cannot see from here. Removing from a folder is a separate,
 * explicitly named action, and only offered on a folder's own page — that is
 * the one place "remove from this folder" has an unambiguous referent.
 *
 * ── Removal is undoable; nothing else needs to be ─────────────────────────
 *
 * Filing is trivially reversible by unchecking a box, so it just happens.
 * Removing twelve bookmarks is not, so it comes back with an Undo that
 * restores their folder memberships too.
 */

export interface SelectBarProps {
  selected: readonly string[];
  folders: readonly FolderRecord[];
  /** Non-null on a real folder's page, enabling "Remove from this folder". */
  currentFolder?: { folderId: string; name: string } | null;
  /**
   * Which term's plan "Add to schedule" targets.
   *
   * Required rather than defaulted, because the page above already has a term
   * filter and quietly adding Spring sections to the Fall plan is the kind of
   * wrong that is invisible until someone reads their week.
   */
  termCode: TermCode;
  onDone: () => void;
  className?: string;
}

export function SelectBar({
  selected,
  folders,
  currentFolder,
  termCode,
  onDone,
  className,
}: SelectBarProps) {
  const [isFiling, setIsFiling] = useState(false);
  const count = selected.length;

  if (count === 0) return null;

  const noun = count === 1 ? "class" : "classes";

  const remove = async () => {
    const result = await removeMany(selected);
    if (!result.ok) return; // BookmarkProvider already raised the error.

    onDone();
    toast.info({
      title: `Removed ${count} ${noun}`,
      dedupeKey: "bookmark-bulk-remove",
      action: {
        label: "Undo",
        onPress: () => {
          void (async () => {
            // One at a time on purpose: a partial failure should leave the
            // successes in place rather than roll the whole batch back.
            for (const entry of result.restore) {
              await undoRemoval(entry.sectionId, entry.folderIds);
            }
          })();
        },
      },
    });
  };

  const file = async (folderId: string, folderName: string) => {
    setIsFiling(true);
    const ok = await fileMany(selected, folderId);
    setIsFiling(false);
    if (ok) {
      onDone();
      toast.success({
        title: `Filed ${count} ${noun} in ${folderName}`,
        dedupeKey: "bookmark-bulk-file",
      });
    }
  };

  const unfile = async () => {
    if (!currentFolder) return;
    setIsFiling(true);
    const ok = await unfileMany(selected, currentFolder.folderId);
    setIsFiling(false);
    if (ok) {
      onDone();
      toast.info({
        title: `Removed ${count} ${noun} from ${currentFolder.name}`,
        // The distinction that matters: the bookmarks still exist.
        description: "They're still saved — find them under Uncategorized.",
        dedupeKey: "bookmark-bulk-unfile",
      });
    }
  };

  /*
   * ── "Add to schedule" was here, and it is gone ─────────────────────────
   *
   * It copied the selected sections onto the term's primary plan, creating one
   * if there wasn't one. The copy was the problem: it meant a class could be
   * saved and not scheduled, so there were two answers to "what am I taking"
   * and the app kept picking the one the student had not filled in. A student
   * who saved six classes and never pressed this button had an empty schedule.
   *
   * The saved list IS the schedule now — `get_my_schedule` reads it, and
   * `saved-gallery.tsx` renders it — so this button's only remaining job was
   * to move six rows from a list into a copy of itself.
   */

  return (
    <div
      role="region"
      aria-label="Selection actions"
      className={cx(
        "sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2",
        "rounded-2xl border border-border-button-default bg-background-primary-default p-2 pl-4",
        "shadow-dropdown",
        className,
      )}
    >
      <span aria-live="polite" className="text-body-medium whitespace-nowrap text-text-primary">
        {count} selected
      </span>

      <Dropdown>
        <DropdownTrigger
          className={cx(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5",
            "border border-border-button-default bg-background-primary-default",
            "text-body-medium text-text-primary",
            "hover:bg-background-primary-hover",
            isFiling && "opacity-60",
          )}
        >
          <RiFolderLine className="size-4" aria-hidden />
          Add to folder
        </DropdownTrigger>
        <DropdownPopover aria-label="Choose a folder" placement="top" offset={8}>
          {folders.length === 0 ? (
            <p className="px-2 py-1.5 text-body-regular text-text-secondary">
              No folders yet. Save a class and use its ⋯ menu to make one.
            </p>
          ) : (
            <DropdownGroup>
              {folders.map((folder) => (
                <DropdownItem
                  key={folder.folderId}
                  onSelect={() => void file(folder.folderId, folder.name)}
                >
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-border-table"
                    style={folderGradientStyle(folder.folderId)}
                  />
                  <span className="truncate">{folder.name}</span>
                </DropdownItem>
              ))}
            </DropdownGroup>
          )}

          {currentFolder ? (
            <>
              <DropdownDivider />
              <DropdownItem onSelect={() => void unfile()}>
                <RiCloseLine className="size-4 shrink-0" aria-hidden />
                <span className="truncate">Remove from {currentFolder.name}</span>
              </DropdownItem>
            </>
          ) : null}
        </DropdownPopover>
      </Dropdown>

      <Button
        size="small"
        variant="secondary"
        leadingIcon={RiDeleteBinLine}
        onClick={() => void remove()}
      >
        Remove
      </Button>

      <Button size="small" variant="ghost" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
