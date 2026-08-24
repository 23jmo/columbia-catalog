"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RiArrowLeftLine, RiCheckboxMultipleLine } from "@remixicon/react";

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
import { SYNTHETIC_FOLDER_IDS } from "@/lib/bookmarks/folder-art";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

import { DeleteFolderDialog } from "./delete-folder-dialog";
import { SavedEmpty, SavedSignedOut } from "./saved-states";
import { SavedSectionRow } from "./saved-section-row";
import { SelectBar } from "./select-bar";
import { TermFilter } from "./term-filter";

/**
 * One folder's saved classes — `/saved/all`, `/saved/uncategorized`, or a real
 * folder id.
 *
 * ── Grouped by course, not a flat list ────────────────────────────────────
 *
 * Saving is per-section, but deciding is per-course: the question a shortlist
 * answers is "which of these three sections of 4118 do I take", and a flat
 * list of sections sorted by code puts those three rows nowhere near each
 * other. Grouping puts the comparison where the decision is.
 *
 * Course groups lead with the most recently saved, so the class you were just
 * looking at is at the top rather than wherever the alphabet puts it.
 *
 * ── Three scopes, one component ───────────────────────────────────────────
 *
 * `all` and `uncategorized` are computed views, not rows — Uncategorized is
 * "zero folder memberships", which is why it can never be renamed, deleted or
 * filed into. The only thing the real-folder case adds is a header with a
 * delete control and a "Remove from this folder" bulk action.
 */

export interface SavedFolderViewProps {
  /** `all`, `uncategorized`, or a folder id. */
  folderId: string;
}

export function SavedFolderView({ folderId }: SavedFolderViewProps) {
  const snapshot = useBookmarks();
  const [termFilter, setTermFilter] = useState<TermCode | null>(CURRENT_TERM);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);

  const isSynthetic = folderId === ALL_FOLDER || folderId === UNCATEGORIZED_FOLDER;
  const folder = snapshot.folders.find((f) => f.folderId === folderId) ?? null;

  const terms = useMemo(() => savedTermCodes(snapshot), [snapshot]);
  // A term filter pointing at a term with nothing in it strands the reader on
  // an empty page with no obvious way back, so it falls back to everything.
  const term = termFilter && terms.includes(termFilter) ? termFilter : null;

  const sectionIds = useMemo(
    () => savedSectionIds(snapshot, { termCode: term ?? undefined, folder: folderId }),
    [snapshot, term, folderId],
  );

  const { sections, courses, isResolving } = useSavedCatalog(sectionIds);

  const groups = useMemo(
    () =>
      groupSavedByCourse(sectionIds, sections, [...courses.values()], snapshot.savedAtBySection),
    [sectionIds, sections, courses, snapshot.savedAtBySection],
  );

  if (snapshot.status === "signed_out") return <SavedSignedOut />;

  // A folder id that is neither synthetic nor one of yours: either it was just
  // deleted in another tab, or somebody pasted a link to somebody else's. Both
  // deserve the same non-committal answer — RLS already guarantees you could
  // never read it.
  if (!isSynthetic && !folder && snapshot.status === "ready") {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-body-regular text-text-secondary">
          That folder isn&apos;t in your saved classes.
        </p>
      </div>
    );
  }

  const title =
    folderId === ALL_FOLDER
      ? "All saved"
      : folderId === UNCATEGORIZED_FOLDER
        ? "Uncategorized"
        : (folder?.name ?? "Folder");

  const artId =
    folderId === ALL_FOLDER
      ? SYNTHETIC_FOLDER_IDS.all
      : folderId === UNCATEGORIZED_FOLDER
        ? SYNTHETIC_FOLDER_IDS.uncategorized
        : folderId;

  // Across every term, which is what the delete dialog has to warn about — a
  // term-filtered count would understate what is about to go.
  const totalInFolder = folderCounts(snapshot).byFolderId.get(folderId) ?? 0;

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
      <BackLink />

      <header className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="size-11 shrink-0 rounded-xl ring-1 ring-inset ring-border-table"
          style={folderGradientStyle(artId)}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-title-2-semibold text-text-primary">{title}</h1>
          <p className="text-caption-1-regular text-text-tertiary">
            {sectionIds.length} {sectionIds.length === 1 ? "class" : "classes"}
            {term ? " this term" : ""}
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
          {folder ? (
            <DeleteFolderDialog
              folderId={folder.folderId}
              name={folder.name}
              count={totalInFolder}
            />
          ) : null}
        </div>
      </header>

      <TermFilter terms={terms} value={term} onChange={setTermFilter} />

      {sectionIds.length === 0 ? (
        <SavedEmpty scope={folderId} />
      ) : isResolving && groups.length === 0 ? (
        <p className="text-body-regular text-text-tertiary">Loading your saved classes…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.course.courseId} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-2 px-3">
                <Link
                  href={`/course/${group.course.courseId}`}
                  className="text-body-semibold tabular-nums text-text-primary outline-none hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  {group.course.subjectCode}
                  {group.course.number}
                </Link>
                <span className="min-w-0 truncate text-caption-1-regular text-text-secondary">
                  {group.course.title}
                </span>
              </div>

              <ul className={cx("flex flex-col", isSelecting ? "gap-1" : "gap-0")}>
                {group.sections.map((section) => (
                  <SavedSectionRow
                    key={section.sectionId}
                    section={section}
                    courseLabel={`${group.course.subjectCode}${group.course.number}`}
                    selection={
                      isSelecting
                        ? {
                            isSelected: selected.has(section.sectionId),
                            onChange: (next) => toggleSelected(section.sectionId, next),
                          }
                        : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {isSelecting ? (
        <SelectBar
          selected={[...selected]}
          folders={snapshot.folders}
          currentFolder={folder}
          // Bulk "add to schedule" needs one term. With "All terms" showing,
          // the current term is the only defensible target — and the toast
          // says what happened either way.
          termCode={term ?? CURRENT_TERM}
          onDone={leaveSelectMode}
        />
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/saved"
      className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-0.5 text-caption-1-medium text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <RiArrowLeftLine className="size-4" aria-hidden />
      Saved classes
    </Link>
  );
}
