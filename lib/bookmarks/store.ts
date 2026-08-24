/**
 * The bookmark store.
 *
 * One module-level store shared by every bookmark icon, the overflow menus,
 * the folder picker, `/saved` and the schedule dropdown, exposed through
 * `useSyncExternalStore`. The icon in a search row, the icon in the drawer
 * opened on top of it, and the icon on the week-grid block are three renders
 * of one fact, and they will disagree the moment each owns its own `useState`.
 *
 * Modelled on `lib/watchlist/store.ts`, and server-authoritative for the same
 * reason: a saved class that only exists in one browser tab is a saved class
 * that is missing when the student opens their phone.
 *
 * ── Optimistic, with loud rollback ─────────────────────────────────────────
 *
 * The icon flips before the write lands. During registration a control that
 * waits on a round trip reads as broken and gets clicked again. A refused
 * write rolls the icon back AND raises an error the caller can show — never a
 * silent revert, which is the failure mode that makes people distrust the
 * whole feature.
 *
 * ── What this store does not do ────────────────────────────────────────────
 *
 * No realtime subscription of its own. Seat freshness on `/saved` comes from
 * the watchlist store, whose filtered subscription already covers exactly the
 * bell-on rows. Opening a second channel for saved-but-unwatched sections
 * would stream the crawl at every tab to keep numbers fresh that nobody asked
 * to be notified about.
 *
 * No folder counts. They depend on the term scope the caller is looking at, so
 * they are computed in `lib/bookmarks/grouping.ts` where that scope is known,
 * rather than cached here where it is not.
 */

import {
  addBookmark,
  createFolder as createFolderRow,
  deleteFolder as deleteFolderRow,
  fileBookmarksIntoFolder,
  loadBookmarks,
  removeBookmark,
  removeBookmarks,
  renameFolder as renameFolderRow,
  restoreBookmark,
  setBookmarkFolders,
  unfileBookmarksFromFolder,
  BookmarkNotAvailableError,
  type FolderRecord,
} from "@/lib/db/bookmarks";
import { isConfigured } from "@/lib/db/client";
import type { TermCode } from "@/lib/types";

export type BookmarkStatus = "idle" | "loading" | "ready" | "signed_out";

export interface BookmarkSnapshot {
  status: BookmarkStatus;
  /** Saved section ids. */
  saved: ReadonlySet<string>;
  /** section id → term code, so `/saved` can filter without a round trip. */
  termBySection: ReadonlyMap<string, TermCode>;
  /** section id → when it was saved, so `/saved` can lead with the newest. */
  savedAtBySection: ReadonlyMap<string, string>;
  /** section id → folder ids. Absent or empty means Uncategorized. */
  folderIdsBySection: ReadonlyMap<string, readonly string[]>;
  /** The caller's folders, oldest first. */
  folders: readonly FolderRecord[];
  /** Sections with a write in flight, so a control can show it. */
  pending: ReadonlySet<string>;
  /** Last mutation error, cleared by the next successful mutation. */
  error: string | null;
}

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_TERMS: ReadonlyMap<string, TermCode> = new Map();
const EMPTY_FOLDER_IDS: ReadonlyMap<string, readonly string[]> = new Map();
const EMPTY_SAVED_AT: ReadonlyMap<string, string> = new Map();
const EMPTY_FOLDERS: readonly FolderRecord[] = [];

/**
 * A single frozen object returned to every server render.
 * `useSyncExternalStore` compares snapshots by identity, so a fresh object
 * here would loop forever.
 */
const SERVER_SNAPSHOT: BookmarkSnapshot = {
  status: "idle",
  saved: EMPTY_SET,
  termBySection: EMPTY_TERMS,
  savedAtBySection: EMPTY_SAVED_AT,
  folderIdsBySection: EMPTY_FOLDER_IDS,
  folders: EMPTY_FOLDERS,
  pending: EMPTY_SET,
  error: null,
};

let snapshot: BookmarkSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(next: Partial<BookmarkSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

export function subscribeBookmarks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBookmarkSnapshot(): BookmarkSnapshot {
  return snapshot;
}

export function getBookmarkServerSnapshot(): BookmarkSnapshot {
  return SERVER_SNAPSHOT;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

let loadPromise: Promise<void> | null = null;

/**
 * Loads the caller's bookmarks once per session. Idempotent and safe to call
 * from every mounted icon — the in-flight promise is shared, so twenty section
 * rows on a course page produce one query, not twenty.
 */
export function ensureBookmarksLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (!isConfigured()) {
    emit({ status: "signed_out" });
    return Promise.resolve();
  }

  emit({ status: "loading" });
  loadPromise = (async () => {
    try {
      const payload = await loadBookmarks();

      const saved = new Set<string>();
      const termBySection = new Map<string, TermCode>();
      const savedAtBySection = new Map<string, string>();
      const folderIdsBySection = new Map<string, readonly string[]>();

      for (const record of payload.bookmarks) {
        saved.add(record.sectionId);
        termBySection.set(record.sectionId, record.termCode);
        savedAtBySection.set(record.sectionId, record.createdAt);
        if (record.folderIds.length > 0) {
          folderIdsBySection.set(record.sectionId, record.folderIds);
        }
      }

      emit({
        status: "ready",
        saved,
        termBySection,
        savedAtBySection,
        folderIdsBySection,
        folders: payload.folders,
        error: null,
      });
    } catch (cause) {
      // Not signed in is the ordinary case, not a failure: most visitors are
      // reading the catalog, which needs no account.
      if (cause instanceof BookmarkNotAvailableError) emit({ status: "signed_out" });
      else emit({ status: "signed_out", error: describe(cause) });
    }
  })();

  return loadPromise;
}

/** Called on sign-in/sign-out so the next read reflects the new identity. */
export function resetBookmarks(): void {
  loadPromise = null;
  snapshot = SERVER_SNAPSHOT;
  for (const listener of listeners) listener();
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function withPending(sectionIds: readonly string[], active: boolean): void {
  const pending = new Set(snapshot.pending);
  for (const id of sectionIds) {
    if (active) pending.add(id);
    else pending.delete(id);
  }
  emit({ pending });
}

// ---------------------------------------------------------------------------
// Toggling
// ---------------------------------------------------------------------------

/**
 * Who to tell when bookmarks disappear.
 *
 * `watches` carries a composite foreign key into `bookmarks` with
 * `on delete cascade`, so deleting a bookmark deletes its watch server-side.
 * Nothing tells the watchlist store that happened — the cascade fires in
 * Postgres and there is no realtime channel on `watches` — so its `watched`
 * set would keep claiming a bell is on for a row that no longer exists, and
 * the next click would try to delete an already-deleted watch rather than
 * create one.
 *
 * The reconciliation is a callback rather than a direct import on purpose.
 * This module would otherwise pull the whole realtime seat subscription in
 * behind it, and the dependency would run the wrong way: bookmarks are the
 * parent record, and a parent that has to know about its children in order to
 * delete them is the shape that turns into a cycle later. `BookmarkProvider`
 * wires the two together at the app edge, where both already exist.
 */
type RemovalListener = (sectionIds: readonly string[]) => void;

const removalListeners = new Set<RemovalListener>();

export function onBookmarksRemoved(listener: RemovalListener): () => void {
  removalListeners.add(listener);
  return () => {
    removalListeners.delete(listener);
  };
}

function announceRemoved(sectionIds: readonly string[]): void {
  if (sectionIds.length === 0) return;
  for (const listener of removalListeners) listener(sectionIds);
}

/**
 * What a toggle did, so the caller can raise the right toast — and, for a
 * removal, put the bookmark back exactly as it was.
 */
export type ToggleResult =
  | { kind: "saved"; sectionId: string }
  | { kind: "removed"; sectionId: string; folderIds: readonly string[] }
  | { kind: "denied"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "busy" };

/**
 * Saves or removes a section.
 *
 * Removal returns the folder memberships it destroyed, because Undo has to
 * restore the filing too — putting a bookmark back into "Uncategorized" when
 * it had been filed in three folders is not an undo, it is a second edit.
 */
export async function toggleBookmark(sectionId: string): Promise<ToggleResult> {
  if (snapshot.pending.has(sectionId)) return { kind: "busy" };
  if (snapshot.status === "signed_out" || !isConfigured()) {
    return { kind: "denied", reason: new BookmarkNotAvailableError().message };
  }

  const wasSaved = snapshot.saved.has(sectionId);
  const priorFolderIds = snapshot.folderIdsBySection.get(sectionId) ?? [];

  applyLocalToggle(sectionId, !wasSaved);
  withPending([sectionId], true);

  try {
    if (wasSaved) {
      await removeBookmark(sectionId);
      announceRemoved([sectionId]);
      return { kind: "removed", sectionId, folderIds: priorFolderIds };
    }
    await addBookmark(sectionId);
    return { kind: "saved", sectionId };
  } catch (cause) {
    // Roll back. Showing a class as saved when the row was never written is
    // the one failure mode a parking lot for decisions cannot have.
    applyLocalToggle(sectionId, wasSaved, priorFolderIds);
    const reason = describe(cause);
    emit({ error: reason });
    if (cause instanceof BookmarkNotAvailableError) return { kind: "denied", reason };
    return { kind: "failed", reason };
  } finally {
    withPending([sectionId], false);
  }
}

function applyLocalToggle(
  sectionId: string,
  save: boolean,
  restoreFolderIds: readonly string[] = [],
): void {
  const saved = new Set(snapshot.saved);
  const folderIdsBySection = new Map(snapshot.folderIdsBySection);
  const termBySection = new Map(snapshot.termBySection);
  const savedAtBySection = new Map(snapshot.savedAtBySection);

  if (save) {
    saved.add(sectionId);
    // `/saved` filters by term and defaults to the current one, so a section
    // saved without a term lands nowhere the student can see it until the next
    // reload. The database stamps `term_code` from `sections` in a trigger and
    // that value is authoritative, but the write returns nothing, so the local
    // copy is derived here from the id's own prefix — the same string the
    // trigger will resolve.
    termBySection.set(sectionId, termOf(sectionId));
    // Only stamp a time we do not already have, so re-saving an already-saved
    // section is a no-op rather than a reshuffle of `/saved`. Undo genuinely
    // does re-date: `restoreBookmark` inserts a fresh row whose `created_at`
    // defaults to now, so stamping now here matches the server rather than
    // drifting from it.
    if (!savedAtBySection.has(sectionId)) {
      savedAtBySection.set(sectionId, new Date().toISOString());
    }
    if (restoreFolderIds.length > 0) folderIdsBySection.set(sectionId, restoreFolderIds);
  } else {
    saved.delete(sectionId);
    folderIdsBySection.delete(sectionId);
    termBySection.delete(sectionId);
    savedAtBySection.delete(sectionId);
  }

  emit({ saved, termBySection, savedAtBySection, folderIdsBySection, error: null });
}

/**
 * A section id leads with its term: `20263` + `COMS4113W` + `001`. Parsing it
 * here rather than round-tripping to the server keeps a fresh save filterable
 * on the same commit as the click.
 */
function termOf(sectionId: string): TermCode {
  return sectionId.slice(0, 5) as TermCode;
}

/**
 * Puts a removed bookmark back, filing included. What the Undo action calls.
 *
 * The watch is restored by the caller, not here: only the caller knows whether
 * a bell was on, and silently re-arming an alert would be worse than dropping
 * one.
 */
export async function undoRemoval(
  sectionId: string,
  folderIds: readonly string[],
): Promise<boolean> {
  applyLocalToggle(sectionId, true, folderIds);
  withPending([sectionId], true);
  try {
    await restoreBookmark(sectionId, folderIds);
    return true;
  } catch (cause) {
    applyLocalToggle(sectionId, false);
    emit({ error: describe(cause) });
    return false;
  } finally {
    withPending([sectionId], false);
  }
}

/** Bulk removal for Select mode. One write, one Undo. */
export interface RestorableBookmark {
  sectionId: string;
  folderIds: readonly string[];
  termCode: TermCode;
  savedAt: string;
}

export async function removeMany(sectionIds: readonly string[]): Promise<
  { ok: true; restore: RestorableBookmark[] } | { ok: false; reason: string }
> {
  const ids = sectionIds.filter((id) => snapshot.saved.has(id));
  if (ids.length === 0) return { ok: true, restore: [] };

  // Undo has to put back everything the removal knew, not just the id — a
  // revived bookmark with no term is invisible under the default term filter,
  // and one re-dated to now jumps to the top of a list it never left.
  const restore = ids.map((sectionId) => ({
    sectionId,
    folderIds: snapshot.folderIdsBySection.get(sectionId) ?? [],
    termCode: snapshot.termBySection.get(sectionId) ?? termOf(sectionId),
    savedAt: snapshot.savedAtBySection.get(sectionId) ?? new Date().toISOString(),
  }));

  const saved = new Set(snapshot.saved);
  const folderIdsBySection = new Map(snapshot.folderIdsBySection);
  const termBySection = new Map(snapshot.termBySection);
  const savedAtBySection = new Map(snapshot.savedAtBySection);
  for (const id of ids) {
    saved.delete(id);
    folderIdsBySection.delete(id);
    termBySection.delete(id);
    savedAtBySection.delete(id);
  }
  emit({ saved, termBySection, savedAtBySection, folderIdsBySection, error: null });
  withPending(ids, true);

  try {
    await removeBookmarks(ids);
    announceRemoved(ids);
    return { ok: true, restore };
  } catch (cause) {
    const revived = new Set(snapshot.saved);
    const revivedFolders = new Map(snapshot.folderIdsBySection);
    const revivedTerms = new Map(snapshot.termBySection);
    const revivedSavedAt = new Map(snapshot.savedAtBySection);
    for (const entry of restore) {
      revived.add(entry.sectionId);
      revivedTerms.set(entry.sectionId, entry.termCode);
      revivedSavedAt.set(entry.sectionId, entry.savedAt);
      if (entry.folderIds.length > 0) revivedFolders.set(entry.sectionId, entry.folderIds);
    }
    emit({
      saved: revived,
      termBySection: revivedTerms,
      savedAtBySection: revivedSavedAt,
      folderIdsBySection: revivedFolders,
      error: describe(cause),
    });
    return { ok: false, reason: describe(cause) };
  } finally {
    withPending(ids, false);
  }
}

// ---------------------------------------------------------------------------
// Filing
// ---------------------------------------------------------------------------

/**
 * Sets one bookmark's folders to exactly this set — what a checkbox click in
 * the picker means. Optimistic, and rolled back on failure like everything
 * else here.
 */
export async function setFolders(
  sectionId: string,
  folderIds: readonly string[],
): Promise<boolean> {
  const prior = snapshot.folderIdsBySection.get(sectionId) ?? [];
  applyLocalFolders(sectionId, folderIds);
  withPending([sectionId], true);

  try {
    await setBookmarkFolders(sectionId, folderIds);
    return true;
  } catch (cause) {
    applyLocalFolders(sectionId, prior);
    emit({ error: describe(cause) });
    return false;
  } finally {
    withPending([sectionId], false);
  }
}

function applyLocalFolders(sectionId: string, folderIds: readonly string[]): void {
  const folderIdsBySection = new Map(snapshot.folderIdsBySection);
  if (folderIds.length > 0) folderIdsBySection.set(sectionId, [...folderIds]);
  else folderIdsBySection.delete(sectionId);
  emit({ folderIdsBySection, error: null });
}

/**
 * Files many bookmarks into one folder, additively.
 *
 * Additive matters: filing three sections into "Systems track" from Select
 * mode must not strip whatever else they were already filed under.
 */
export async function fileMany(
  sectionIds: readonly string[],
  folderId: string,
): Promise<boolean> {
  const prior = new Map(snapshot.folderIdsBySection);
  const next = new Map(snapshot.folderIdsBySection);
  for (const sectionId of sectionIds) {
    const current = next.get(sectionId) ?? [];
    if (!current.includes(folderId)) next.set(sectionId, [...current, folderId]);
  }
  emit({ folderIdsBySection: next, error: null });
  withPending(sectionIds, true);

  try {
    await fileBookmarksIntoFolder(sectionIds, folderId);
    return true;
  } catch (cause) {
    emit({ folderIdsBySection: prior, error: describe(cause) });
    return false;
  } finally {
    withPending(sectionIds, false);
  }
}

/** Removes many bookmarks from one folder. The inverse of `fileMany`. */
export async function unfileMany(
  sectionIds: readonly string[],
  folderId: string,
): Promise<boolean> {
  const prior = new Map(snapshot.folderIdsBySection);
  const next = new Map(snapshot.folderIdsBySection);
  for (const sectionId of sectionIds) {
    const current = next.get(sectionId);
    if (!current) continue;
    const remaining = current.filter((id) => id !== folderId);
    if (remaining.length > 0) next.set(sectionId, remaining);
    else next.delete(sectionId);
  }
  emit({ folderIdsBySection: next, error: null });
  withPending(sectionIds, true);

  try {
    await unfileBookmarksFromFolder(sectionIds, folderId);
    return true;
  } catch (cause) {
    emit({ folderIdsBySection: prior, error: describe(cause) });
    return false;
  } finally {
    withPending(sectionIds, false);
  }
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/**
 * Creates a folder and returns it.
 *
 * Not optimistic: the id comes from the database and the picker needs a real
 * one to file against. The write is a single insert on an indexed table, so
 * the wait is a few tens of milliseconds — cheaper than inventing a temporary
 * id and reconciling it.
 */
export async function createFolder(name: string): Promise<FolderRecord> {
  const folder = await createFolderRow(name);
  emit({ folders: [...snapshot.folders, folder], error: null });
  return folder;
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  const prior = snapshot.folders;
  emit({
    folders: prior.map((f) => (f.folderId === folderId ? { ...f, name: name.trim() } : f)),
  });
  try {
    await renameFolderRow(folderId, name);
  } catch (cause) {
    emit({ folders: prior, error: describe(cause) });
    throw cause;
  }
}

/**
 * Deletes a folder, optionally with the bookmarks filed in it.
 *
 * Returns how many bookmarks went with it, which is what the confirmation
 * says. The local state is rebuilt from the server's answer rather than
 * guessed, because "also delete its sections" is the one operation here that
 * is genuinely destructive and must not be reported optimistically.
 */
export async function deleteFolder(
  folderId: string,
  deleteBookmarks = false,
): Promise<number> {
  const removedCount = await deleteFolderRow(folderId, deleteBookmarks);

  const folders = snapshot.folders.filter((f) => f.folderId !== folderId);
  const folderIdsBySection = new Map<string, readonly string[]>();
  const saved = new Set(snapshot.saved);
  const termBySection = new Map(snapshot.termBySection);
  const savedAtBySection = new Map(snapshot.savedAtBySection);
  const removed: string[] = [];

  for (const [sectionId, ids] of snapshot.folderIdsBySection) {
    const remaining = ids.filter((id) => id !== folderId);
    const wasInFolder = remaining.length !== ids.length;

    if (deleteBookmarks && wasInFolder) {
      saved.delete(sectionId);
      termBySection.delete(sectionId);
      savedAtBySection.delete(sectionId);
      removed.push(sectionId);
      continue;
    }
    if (remaining.length > 0) folderIdsBySection.set(sectionId, remaining);
  }

  emit({ folders, folderIdsBySection, saved, termBySection, savedAtBySection, error: null });
  // These bookmarks are gone, so their watches cascaded away with them.
  announceRemoved(removed);
  return removedCount;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Folder ids for one section, in the store's folder order. */
export function foldersForSection(sectionId: string): readonly string[] {
  return snapshot.folderIdsBySection.get(sectionId) ?? [];
}
