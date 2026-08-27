"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RiCheckboxMultipleLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useSavedCatalog } from "@/hooks/use-saved-catalog";
import { folderGradientStyle } from "@/lib/bookmarks/folder-art";
import {
  ALL_FOLDER,
  UNCATEGORIZED_FOLDER,
  folderCounts,
  groupSavedByCourse,
  savedSectionIds,
  savedTermCodes,
} from "@/lib/bookmarks/grouping";
import { CURRENT_TERM } from "@/lib/constants";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

import { SavedList } from "./saved-list";
import { SavedSkeleton } from "./saved-skeleton";
import { SavedEmpty, SavedSignedOut } from "./saved-states";
import { SelectBar } from "./select-bar";
import { TermFilter } from "./term-filter";

/**
 * `/saved` — the classes, with the folders demoted to a strip.
 *
 * ── This page used to open on folders, and that was the wrong door ────────
 *
 * The landing screen was a gallery of folder covers, on the reasoning that a
 * folder is something the student made deliberately and a cover is faster to
 * recognise than a name. Both halves of that are true and neither is the
 * point: almost nobody has folders. A student who has saved six classes and
 * made no folders arrived at a screen containing exactly one tile — "All
 * saved" — and had to click it to see the six classes they came for. The
 * gallery was an organising scheme standing in front of the thing it
 * organises.
 *
 * So the classes lead now, in the same card the recommendations use, and the
 * folders are a strip above them. Somebody who files things still has one
 * click to any folder; somebody who does not never sees an empty filing
 * cabinet. `/saved/[folderId]` is unchanged and still renders one folder in
 * full.
 *
 * ── Same card as `/`, deliberately ────────────────────────────────────────
 *
 * See `saved-card.tsx`. A course you saw on the feed and saved is the same
 * object here, and it should not have to be re-learned when it moves.
 *
 * ── Counts are term-scoped ────────────────────────────────────────────────
 *
 * The number on a folder chip answers "what's in here for the term I'm
 * registering for", which is the question this screen exists to answer. The
 * count in the delete dialog deliberately is not — see `DeleteFolderDialog`.
 */

export function SavedGallery() {
  const snapshot = useBookmarks();
  const [termFilter, setTermFilter] = useState<TermCode | null>(CURRENT_TERM);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);

  const terms = useMemo(() => savedTermCodes(snapshot), [snapshot]);
  // A term filter pointing at a term with nothing in it strands the reader on
  // an empty page with no obvious way back, so it falls back to everything.
  const term = termFilter && terms.includes(termFilter) ? termFilter : null;
  const counts = useMemo(() => folderCounts(snapshot, term ?? undefined), [snapshot, term]);

  const sectionIds = useMemo(
    () => savedSectionIds(snapshot, { termCode: term ?? undefined, folder: ALL_FOLDER }),
    [snapshot, term],
  );
  const { sections, courses, isResolving } = useSavedCatalog(sectionIds);
  const groups = useMemo(
    () =>
      groupSavedByCourse(sectionIds, sections, [...courses.values()], snapshot.savedAtBySection),
    [sectionIds, sections, courses, snapshot.savedAtBySection],
  );

  if (snapshot.status === "signed_out") return <SavedSignedOut />;

  /*
   * Two waits, and neither of them is "empty".
   *
   * `useBookmarks` starts at `status: "idle"` with an empty set, so until the
   * store answers, `snapshot.saved.size === 0` is indistinguishable from
   * having saved nothing — and this page used to resolve that ambiguity the
   * wrong way, showing "Nothing saved yet" and a Find classes button to people
   * whose shortlist was still in flight. Then `useSavedCatalog` goes and
   * fetches the records behind the ids, which is a second wait the empty check
   * also cannot see.
   *
   * So the empty state is gated on the store having actually reported, and
   * both waits render the skeleton instead.
   */
  const isLoadingBookmarks = snapshot.status !== "ready";
  const isLoadingCatalog = isResolving && groups.length === 0;
  const isLoading = isLoadingBookmarks || isLoadingCatalog;

  const hasNothing = snapshot.saved.size === 0 && snapshot.folders.length === 0;

  const toggleSelected = (sectionId: string, isSelected: boolean) => {
    const next = new Set(selected);
    if (isSelected) next.add(sectionId);
    else next.delete(sectionId);
    setSelected(next);
  };

  const leaveSelectMode = () => {
    setSelected(new Set());
    setIsSelecting(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-2-semibold text-text-primary sm:text-title-1-semibold">
            Saved classes
          </h1>
          <p className="text-caption-1-regular text-text-tertiary sm:text-body-regular">
            A shortlist, not a schedule. Star anything you might take.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {sectionIds.length > 0 ? (
            <Button
              size="small"
              variant={isSelecting ? "primary" : "ghost"}
              leadingIcon={RiCheckboxMultipleLine}
              onClick={() => (isSelecting ? leaveSelectMode() : setIsSelecting(true))}
            >
              {isSelecting ? "Cancel" : "Select"}
            </Button>
          ) : null}
          <TermFilter terms={terms} value={term} onChange={setTermFilter} />
        </div>
      </header>

      {/*
        Folders, only when there are folders.

        A strip rather than a gallery, and absent entirely for the majority who
        have never made one — see the header comment. "All saved" is not in it:
        this page IS all saved, so a chip leading back to itself would be a
        dead click at the front of the row.
      */}
      {snapshot.folders.length > 0 || counts.uncategorized > 0 ? (
        <ul className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1">
          {snapshot.folders.map((folder) => (
            <FolderPill
              key={folder.folderId}
              href={`/saved/${folder.folderId}`}
              artId={folder.folderId}
              name={folder.name}
              count={counts.byFolderId.get(folder.folderId) ?? 0}
            />
          ))}
          {/* Uncategorized is a leftovers pile; an empty one is not a place
              anybody needs a door to. */}
          {counts.uncategorized > 0 ? (
            <FolderPill
              href={`/saved/${UNCATEGORIZED_FOLDER}`}
              artId={UNCATEGORIZED_FOLDER}
              name="Uncategorized"
              count={counts.uncategorized}
            />
          ) : null}
        </ul>
      ) : null}

      {isLoading ? (
        /*
         * Once the ids are in, the count is known — so the placeholder is
         * exactly as tall as the list replacing it and nothing below moves
         * when the catalog lands. Capped at six: past that the skeleton is
         * just a long grey page, and the reader is scrolling it rather than
         * waiting through it.
         */
        <SavedSkeleton cards={isLoadingBookmarks ? undefined : Math.min(sectionIds.length, 6)} />
      ) : hasNothing || sectionIds.length === 0 ? (
        <SavedEmpty scope={ALL_FOLDER} />
      ) : (
        /*
         * Grouped by course, because saving is per-section but deciding is
         * per-course: the question a shortlist answers is "which of these
         * three sections of 4118 do I take", and a flat list sorted by code
         * puts those three cards nowhere near each other.
         *
         * The list, its one-column layout and its entrance animation all live
         * in `SavedList`, which `/saved/[folderId]` renders too — see the
         * header comment there for why that is one component and not two.
         */
        <SavedList
          groups={groups}
          selection={
            isSelecting ? { selectedIds: selected, onToggle: toggleSelected } : undefined
          }
        />
      )}

      {isSelecting ? (
        <SelectBar
          selected={[...selected]}
          folders={snapshot.folders}
          currentFolder={null}
          onDone={leaveSelectMode}
        />
      ) : null}
    </div>
  );
}

/**
 * One folder, as a pill.
 *
 * The gradient square is the folder cover shrunk to 20px — the whole value of
 * a cover is that you recognise it before you read the name, and that survives
 * the shrink better than a 16/10 tile survives being one of twelve.
 */
function FolderPill({
  href,
  artId,
  name,
  count,
}: {
  href: string;
  artId: string;
  name: string;
  count: number;
}) {
  return (
    <li className="shrink-0">
      <Link
        href={href}
        className={cx(
          "flex items-center gap-2 rounded-full border border-border-table px-2.5 py-1.5",
          "bg-background-primary-default text-body-2-medium text-text-secondary",
          "transition-colors duration-150",
          "hover:bg-background-primary-hover hover:text-text-primary",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        <span
          aria-hidden
          className="size-5 shrink-0 rounded-md ring-1 ring-inset ring-border-table"
          style={folderGradientStyle(artId)}
        />
        <span className="max-w-40 truncate">{name}</span>
        <span className="tabular-nums text-text-tertiary">{count}</span>
      </Link>
    </li>
  );
}
