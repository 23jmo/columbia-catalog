"use client";

import { useMemo, useState } from "react";
import { RiAddLine, RiFolderLine, RiSearchLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import {
  Dropdown,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { useBookmark } from "@/hooks/use-bookmark";
import { folderGradientStyle } from "@/lib/bookmarks/folder-art";
import { createFolder, fileMany, setFolders } from "@/lib/bookmarks/store";
import { DuplicateFolderError } from "@/lib/db/bookmarks";
import { toast } from "@/lib/toast/store";
import { cx } from "@/utils/cx";

/**
 * Filing a saved class into folders.
 *
 * ── One body, two hosts ────────────────────────────────────────────────────
 *
 * The same list appears in two places that are otherwise nothing alike: the
 * "Add to folder" action on the save confirmation toast, and "Add to folder…"
 * in a row's overflow menu. Only the trigger differs, so only the trigger is
 * written twice. `FolderPickerBody` is the shared part.
 *
 * ── Why checking a box writes immediately ──────────────────────────────────
 *
 * There is no Save/Done button. The store is optimistic, so a click reads as
 * instant, and a confirm button would introduce the one state this interaction
 * cannot afford: a popover you dismiss with unsaved changes in it. Closing is
 * always safe because closing never means anything.
 *
 * ── Many-to-many, so "add", never "move" ───────────────────────────────────
 *
 * A class can sit in several folders at once (spec §5), which is why these are
 * checkboxes and not radio buttons, and why nothing in this file says "move".
 * The counterpart is that unchecking the last box does not un-save anything —
 * it just returns the class to Uncategorized, which is a computed view rather
 * than a real folder.
 */

const FILTER_THRESHOLD = 8;

export interface FolderPickerBodyProps {
  sectionId: string;
  /** Called after a change that makes the host worth closing. Optional. */
  onFiled?: () => void;
}

export function FolderPickerBody({ sectionId, onFiled }: FolderPickerBodyProps) {
  const { folders, allFolders } = useBookmark(sectionId);
  const [query, setQuery] = useState("");
  const [draftName, setDraftName] = useState("");
  const [creating, setCreating] = useState(false);

  const checked = useMemo(
    () => new Set(folders.map((folder) => folder.folderId)),
    [folders],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allFolders;
    return allFolders.filter((folder) => folder.name.toLowerCase().includes(needle));
  }, [allFolders, query]);

  const toggle = (folderId: string, isSelected: boolean) => {
    const next = isSelected
      ? [...checked, folderId]
      : [...checked].filter((id) => id !== folderId);
    // Deliberately does NOT close the host. A class can live in several
    // folders, so the second check has to be reachable without reopening.
    void setFolders(sectionId, next);
  };

  const commitNewFolder = async () => {
    const name = draftName.trim();
    if (!name || creating) return;

    setCreating(true);
    try {
      const folder = await createFolder(name);
      await fileMany([sectionId], folder.folderId);
      setDraftName("");
      setQuery("");
      onFiled?.();
    } catch (cause) {
      // Someone typing a name they already have almost always means "put it
      // in that one", not "I made a typo". Treat the collision as a hit on
      // the existing folder rather than as an error to read and recover from.
      if (cause instanceof DuplicateFolderError) {
        const existing =
          cause.existing ??
          allFolders.find(
            (folder) => folder.name.trim().toLowerCase() === name.toLowerCase(),
          );
        if (existing) {
          await fileMany([sectionId], existing.folderId);
          setDraftName("");
          setQuery("");
          onFiled?.();
          return;
        }
      }
      toast.error({
        title: "Couldn't create that folder",
        description: cause instanceof Error ? cause.message : "Please try again.",
        dedupeKey: "folder-create-error",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {allFolders.length > FILTER_THRESHOLD ? (
        <Input
          aria-label="Filter folders"
          placeholder="Filter folders"
          value={query}
          onChange={setQuery}
          leadingIcon={RiSearchLine}
          className="px-1"
        />
      ) : null}

      {allFolders.length === 0 ? (
        <p className="px-2 py-1 text-body-regular text-text-secondary">
          No folders yet. Name one below to start.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-2 py-1 text-body-regular text-text-secondary">
          No folder matches “{query.trim()}”.
        </p>
      ) : (
        // A list rather than a scroll-free column: 50 folders is the cap, and
        // a picker that grows past the viewport is a picker whose "new folder"
        // field you cannot reach.
        <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain">
          {visible.map((folder) => (
            <li key={folder.folderId}>
              <Checkbox
                size="sm"
                isSelected={checked.has(folder.folderId)}
                onChange={(isSelected) => toggle(folder.folderId, isSelected)}
                className="w-full rounded-lg px-2 py-1.5 hover:bg-background-secondary-hover"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-border-table"
                    style={folderGradientStyle(folder.folderId)}
                  />
                  <span className="truncate">{folder.name}</span>
                </span>
              </Checkbox>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5 border-t border-border-table px-1 pt-2">
        <Input
          aria-label="New folder name"
          placeholder="New folder"
          value={draftName}
          onChange={setDraftName}
          maxLength={60}
          leadingIcon={RiFolderLine}
          isDisabled={creating}
          // Enter commits. This field is the last thing in the panel and the
          // only text input in it, so Enter has nothing else it could mean.
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commitNewFolder();
            }
          }}
          className="min-w-0 flex-1"
        />
        <Button
          size="small"
          variant="secondary"
          disabled={!draftName.trim() || creating}
          onClick={() => void commitNewFolder()}
          iconOnly
          leadingIcon={RiAddLine}
          aria-label="Create folder and file this class in it"
        />
      </div>
    </div>
  );
}

/**
 * The picker as it appears on the save-confirmation toast.
 *
 * `pin` and `close` come from the toast surface. Pinning while the popover is
 * open is the whole reason the toast timer is pausable: a five-second
 * countdown that expires mid-scroll through a folder list would delete the UI
 * out from under a deliberate action.
 */
export function FolderPickerAction({
  sectionId,
  name,
  pin,
  close,
}: {
  sectionId: string;
  name: string;
  pin: (pinned: boolean) => void;
  close: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        pin(open);
      }}
    >
      <DropdownTrigger
        className={cx(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5",
          "border border-border-button-default bg-background-primary-default",
          "text-body-medium text-text-primary shadow-xs",
          "hover:border-border-button-hover hover:bg-background-primary-hover",
        )}
      >
        <RiFolderLine className="size-4" aria-hidden />
        Add to folder
      </DropdownTrigger>

      <DropdownPopover
        aria-label={`Folders for ${name}`}
        placement="bottom start"
        offset={6}
        className="w-72"
      >
        <FolderPickerBody
          sectionId={sectionId}
          onFiled={() => {
            // Filing is the errand. Once it is done the toast has nothing
            // left to say, so both it and the popover get out of the way.
            setIsOpen(false);
            pin(false);
            close();
          }}
        />
      </DropdownPopover>
    </Dropdown>
  );
}
