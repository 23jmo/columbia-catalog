"use client";

import { useMemo } from "react";

import { useBookmarks } from "./use-bookmarks";
import type { FolderRecord } from "@/lib/db/bookmarks";

export interface SectionBookmarkState {
  saved: boolean;
  /** True until the first answer arrives, so a control can stay neutral. */
  isLoading: boolean;
  /** True when this section has a write in flight. */
  pending: boolean;
  signedOut: boolean;
  /** The folders this section is filed in, in the student's folder order. */
  folders: FolderRecord[];
  /** Every folder the student has, for the picker. */
  allFolders: readonly FolderRecord[];
}

/**
 * One section's bookmark state.
 *
 * A thin selector over `useBookmarks` rather than its own store read, so a row
 * with an icon, an overflow menu and a chip list re-renders once per change
 * instead of three times.
 */
export function useBookmark(sectionId: string): SectionBookmarkState {
  const snapshot = useBookmarks();

  const folderIds = snapshot.folderIdsBySection.get(sectionId);

  const folders = useMemo(() => {
    if (!folderIds || folderIds.length === 0) return [];
    const wanted = new Set(folderIds);
    // Walk the store's folder list rather than the id list, so chips always
    // render in the same order as the picker does.
    return snapshot.folders.filter((folder) => wanted.has(folder.folderId));
  }, [folderIds, snapshot.folders]);

  return {
    saved: snapshot.saved.has(sectionId),
    isLoading: snapshot.status === "idle" || snapshot.status === "loading",
    pending: snapshot.pending.has(sectionId),
    signedOut: snapshot.status === "signed_out",
    folders,
    allFolders: snapshot.folders,
  };
}
