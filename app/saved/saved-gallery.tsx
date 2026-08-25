"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useBookmarks } from "@/hooks/use-bookmarks";
import { SYNTHETIC_FOLDER_IDS } from "@/lib/bookmarks/folder-art";
import {
  ALL_FOLDER,
  UNCATEGORIZED_FOLDER,
  folderCounts,
  savedTermCodes,
} from "@/lib/bookmarks/grouping";
import { CURRENT_TERM } from "@/lib/constants";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

import { FolderCover } from "./folder-cover";
import { SavedEmpty, SavedSignedOut } from "./saved-states";
import { TermFilter } from "./term-filter";

/**
 * `/saved` — the gallery of folders.
 *
 * ── Gallery first, list second ────────────────────────────────────────────
 *
 * The landing screen is folders, not classes. Folders are the thing a student
 * made deliberately, and the covers make them recognisable at a glance in a
 * way a list of names never is — you find "the one with the green cover"
 * faster than you read six names. "All saved" leads it, so somebody with no
 * folders at all is one click from their list rather than staring at an
 * organising scheme they never asked for.
 *
 * ── Counts are term-scoped; the delete warning is not ─────────────────────
 *
 * The number on a card answers "what's in here for the term I'm registering
 * for", which is the question this screen exists to answer. The count in the
 * delete dialog deliberately is not term-scoped — see `DeleteFolderDialog`.
 *
 * ── Empty folders still show ──────────────────────────────────────────────
 *
 * Unlike the schedule dropdown, which omits them. A folder you made and have
 * not filled is still a thing you made, and the place you go to fill it is
 * this page. Hiding it would make creating a folder look like it failed.
 */

export function SavedGallery() {
  const snapshot = useBookmarks();
  const [termFilter, setTermFilter] = useState<TermCode | null>(CURRENT_TERM);

  const terms = useMemo(() => savedTermCodes(snapshot), [snapshot]);
  const term = termFilter && terms.includes(termFilter) ? termFilter : null;
  const counts = useMemo(() => folderCounts(snapshot, term ?? undefined), [snapshot, term]);

  if (snapshot.status === "signed_out") return <SavedSignedOut />;

  const hasNothing = snapshot.saved.size === 0 && snapshot.folders.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-2-semibold text-text-primary">Saved classes</h1>
          <p className="text-caption-1-regular text-text-tertiary">
            A shortlist, not a schedule. Star anything you might take.
          </p>
        </div>
        <TermFilter terms={terms} value={term} onChange={setTermFilter} />
      </header>

      {hasNothing ? (
        <SavedEmpty scope={ALL_FOLDER} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <FolderCard
            href={`/saved/${ALL_FOLDER}`}
            artId={SYNTHETIC_FOLDER_IDS.all}
            name="All saved"
            count={counts.all}
          />
          {/* Only when there is something in it. Uncategorized is a leftovers
              pile, and an empty one is not a place anybody needs a door to. */}
          {counts.uncategorized > 0 ? (
            <FolderCard
              href={`/saved/${UNCATEGORIZED_FOLDER}`}
              artId={SYNTHETIC_FOLDER_IDS.uncategorized}
              name="Uncategorized"
              count={counts.uncategorized}
            />
          ) : null}
          {snapshot.folders.map((folder) => (
            <FolderCard
              key={folder.folderId}
              href={`/saved/${folder.folderId}`}
              artId={folder.folderId}
              name={folder.name}
              count={counts.byFolderId.get(folder.folderId) ?? 0}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FolderCard({
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
    <li>
      <Link
        href={href}
        className={cx(
          "group/card flex flex-col overflow-hidden rounded-2xl",
          "border border-border-table bg-background-primary-default",
          "transition-shadow duration-150 hover:shadow-dropdown",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        <FolderCover folderId={artId} className="aspect-[16/10] w-full" />
        <span className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
          <span className="truncate text-body-medium text-text-primary">{name}</span>
          <span className="text-caption-2-regular tabular-nums text-text-tertiary">
            {count} {count === 1 ? "class" : "classes"}
          </span>
        </span>
      </Link>
    </li>
  );
}
