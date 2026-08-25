"use client";

import { useState } from "react";
import {
  RiArrowLeftLine,
  RiDeleteBinLine,
  RiFolderLine,
  RiMoreLine,
  RiNotification3Fill,
  RiNotification3Line,
  RiNotificationOffLine,
} from "@remixicon/react";

import {
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { useBookmark } from "@/hooks/use-bookmark";
import { useWatchlist } from "@/hooks/use-watchlist";
import { toggleBookmark } from "@/lib/bookmarks/store";
import { toggleWatch } from "@/lib/watchlist/store";
import { cx } from "@/utils/cx";

import { announceRemoval } from "./bookmark-toasts";
import { FolderChip, FolderChipOverflow } from "./folder-chip";
import { FolderPickerBody } from "./folder-popover";

/**
 * Everything you can do to a class *after* you've saved it.
 *
 * ── Why this only exists once the class is saved ───────────────────────────
 *
 * It renders nothing for an unsaved section, which is the whole shape of the
 * feature: bookmark first, then decide what the bookmark should do. That is
 * the subscribe-then-bell progression people already know from YouTube, and
 * the reason the interview landed on it — a bell on an unsaved row asks
 * somebody to opt into email about a class they have not expressed any
 * interest in, and then has nowhere to hang the resulting relationship.
 *
 * Under the surface it is enforced by the schema rather than by this file:
 * `watches` carries a composite foreign key into `bookmarks` with
 * `on delete cascade`, so a watch without a bookmark is not a state the
 * database will hold, whatever any client does.
 *
 * ── One popover, two views ────────────────────────────────────────────────
 *
 * "Add to folder…" swaps the panel's contents rather than opening a second
 * popover beside the first. Nested popovers on a dense results row end up
 * off-screen on narrow viewports, and a submenu that opens leftward on some
 * rows and rightward on others is worse than a back button.
 */

export interface BookmarkMenuProps {
  sectionId: string;
  sectionCode: string;
  courseLabel?: string;
  className?: string;
}

export function BookmarkMenu({
  sectionId,
  sectionCode,
  courseLabel,
  className,
}: BookmarkMenuProps) {
  const { saved, folders } = useBookmark(sectionId);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"root" | "folders">("root");

  // Only ask for the public watcher count while the menu is open. It is the
  // number that informs the decision being made right now, and fetching one
  // per row for a whole results page would be a lot of traffic for a figure
  // nobody is looking at yet.
  const { watched, counts, pending: watchPending } = useWatchlist(
    isOpen ? [sectionId] : undefined,
  );

  if (!saved) return null;

  const isWatched = watched.has(sectionId);
  const watcherCount = counts.get(sectionId) ?? 0;
  const name = courseLabel ? `${courseLabel} §${sectionCode}` : `Section ${sectionCode}`;

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        // Reset on close rather than in an effect: closing is the event, and
        // reopening should never land mid-errand in the folder view.
        if (!open) setView("root");
      }}
    >
      <DropdownTrigger
        aria-label={`More options for section ${sectionCode}`}
        className={cx(
          // Matches `BookmarkButton` beside it — see the comment there for why
          // this keys off pointer type rather than viewport width.
          "inline-flex size-8 touch-manipulation items-center justify-center rounded-full pointer-coarse:size-11",
          "text-foreground-icon-secondary transition-colors duration-150",
          "hover:bg-background-secondary-hover",
          className,
        )}
      >
        <RiMoreLine className="size-[18px]" aria-hidden />
      </DropdownTrigger>

      <DropdownPopover
        aria-label={`Options for ${name}`}
        placement="bottom end"
        offset={6}
        className="w-72"
      >
        {view === "folders" ? (
          <>
            <button
              type="button"
              onClick={() => setView("root")}
              className="mb-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-body-medium text-text-secondary hover:bg-background-secondary-hover"
            >
              <RiArrowLeftLine className="size-4" aria-hidden />
              Folders
            </button>
            <FolderPickerBody sectionId={sectionId} />
          </>
        ) : (
          <>
            <DropdownItem
              selected={isWatched}
              onSelect={() => void toggleWatch(sectionId)}
              className={cx("items-start", watchPending.has(sectionId) && "opacity-60")}
            >
              {isWatched ? (
                <RiNotificationOffLine className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <RiNotification3Line className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span className="flex min-w-0 flex-col gap-0.5 text-left">
                <span>{isWatched ? "Turn off seat alerts" : "Alert me when a seat opens"}</span>
                {/* The fairness line, stated before the click rather than
                    after it. Spec §14 refuses to stagger notifications, and
                    the honest cost of that refusal is telling somebody how
                    many people are holding the same alert. */}
                <span className="text-caption-1-regular text-text-tertiary">
                  {watcherCount > 0
                    ? `${watcherCount} watching · everyone is notified at the same time`
                    : "Everyone is notified at the same time — nobody gets a head start"}
                </span>
              </span>
            </DropdownItem>

            <DropdownDivider />

            <DropdownItem onSelect={() => setView("folders")} className="items-start">
              <RiFolderLine className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-col gap-1 text-left">
                <span>Add to folder…</span>
                {folders.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-1">
                    {folders.slice(0, 2).map((folder) => (
                      <FolderChip
                        key={folder.folderId}
                        folderId={folder.folderId}
                        name={folder.name}
                      />
                    ))}
                    <FolderChipOverflow count={folders.length - 2} />
                  </span>
                ) : (
                  <span className="text-caption-1-regular text-text-tertiary">
                    Uncategorized
                  </span>
                )}
              </span>
            </DropdownItem>

            <DropdownItem
              onSelect={() => {
                setIsOpen(false);
                setView("root");
                // `isWatched` is the value from this render — read before the
                // removal, because the cascade clears it a moment later and
                // the notice needs to say what was actually turned off.
                void toggleBookmark(sectionId).then((result) => {
                  if (result.kind === "removed") {
                    announceRemoval(sectionId, name, result.folderIds, isWatched);
                  }
                });
              }}
              className="text-text-error-primary"
            >
              <RiDeleteBinLine className="size-4 shrink-0" aria-hidden />
              Remove bookmark
            </DropdownItem>

            {isWatched ? (
              <p className="flex items-start gap-1.5 px-2 pt-1 text-caption-1-regular text-text-tertiary">
                <RiNotification3Fill
                  className="mt-0.5 size-3 shrink-0 text-foreground-icon-tertiary"
                  aria-hidden
                />
                Removing the bookmark also turns off its seat alerts.
              </p>
            ) : null}
          </>
        )}
      </DropdownPopover>
    </Dropdown>
  );
}
