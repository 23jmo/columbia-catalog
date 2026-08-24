/**
 * `/saved/[folderId]` — one folder's classes.
 *
 * `all` and `uncategorized` come through here too rather than getting their
 * own routes. They are computed views over the same set — "everything" and
 * "everything with no folder" — and giving them separate files would mean
 * three copies of a list that has to stay identical. A real folder id is a
 * uuid, so it can never collide with either word.
 */

import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";

import { SavedFolderView } from "../saved-folder-view";

export const metadata: Metadata = {
  title: "Saved classes",
};

export default async function SavedFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;

  return (
    <AppShell activeNav="saved" contentClassName="mx-auto w-full max-w-4xl">
      <SavedFolderView folderId={folderId} />
    </AppShell>
  );
}
