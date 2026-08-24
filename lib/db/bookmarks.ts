/**
 * Saved classes — the database layer.
 *
 * The nearest sibling of `lib/db/watches.ts`, and deliberately so: bookmarks
 * are server-authoritative for the same reason watches are. A bookmark that
 * only ever existed in a browser tab is a saved class that vanishes when the
 * student opens their laptop instead of their phone, which is the one thing a
 * parking lot for decisions cannot do.
 *
 * ── The line this file keeps ───────────────────────────────────────────────
 *
 * Watcher counts are public (spec §14 — you deserve to know what you are up
 * against). **Bookmark counts are not, and there is no function here that
 * could produce one.** Saving is private browsing behaviour; publishing it
 * would turn a parking lot into a leaderboard and change what people feel free
 * to save. RLS makes "own" structural rather than a `where` clause somebody
 * has to remember.
 *
 * ── Errors are sentences ───────────────────────────────────────────────────
 *
 * The caps in migration 0022 raise named errcodes. They are translated here
 * rather than in a component, so every caller — the toast, the bulk bar, the
 * MCP proposal reviewer — reports the same thing in the same words.
 */

import type { TermCode } from "@/lib/types";

import { getBrowserClient, isConfigured } from "./client";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface BookmarkRecord {
  sectionId: string;
  termCode: TermCode;
  createdAt: string;
  /** Folder ids this bookmark is filed in. Empty means Uncategorized. */
  folderIds: string[];
}

export interface FolderRecord {
  folderId: string;
  name: string;
  createdAt: string;
}

/** Everything one load needs, so sign-in costs two round trips and not three. */
export interface BookmarkPayload {
  bookmarks: BookmarkRecord[];
  folders: FolderRecord[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BookmarkNotAvailableError extends Error {
  constructor() {
    super("Sign in with your Columbia or Barnard account to save a class.");
    this.name = "BookmarkNotAvailableError";
  }
}

/** A cap from migration 0022, already phrased for a student. */
export class BookmarkLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookmarkLimitError";
  }
}

/** A folder name that collides with one the student already has. */
export class DuplicateFolderError extends Error {
  readonly existing: FolderRecord | null;
  constructor(existing: FolderRecord | null) {
    super("You already have a folder with that name.");
    this.name = "DuplicateFolderError";
    this.existing = existing;
  }
}

interface PostgrestLikeError {
  message: string;
  code?: string;
}

/**
 * Turns a Postgres failure into something worth showing someone.
 *
 * The two caps arrive as `check_violation` carrying the raise message, and the
 * unique index arrives as `23505`. Everything else is passed through with its
 * operation named, because an unexplained "failed" in the middle of
 * registration is worse than a technical string.
 */
function translate(operation: string, error: PostgrestLikeError): Error {
  const message = error.message ?? "";

  if (message.includes("bookmark_limit_reached")) {
    return new BookmarkLimitError(
      "You've saved 500 classes — remove a few before saving more.",
    );
  }
  if (message.includes("folder_limit_reached")) {
    return new BookmarkLimitError("You've reached 50 folders. Delete one to make room.");
  }
  if (error.code === "23505" || message.includes("idx_bookmark_folders_user_name")) {
    return new DuplicateFolderError(null);
  }
  if (message.includes("bookmark_folders_name_length")) {
    return new Error("A folder name has to be between 1 and 60 characters.");
  }
  return new Error(`${operation} failed: ${message}`);
}

function client() {
  const supabase = isConfigured() ? getBrowserClient() : null;
  if (!supabase) throw new BookmarkNotAvailableError();
  return supabase;
}

async function requireUserId(): Promise<string> {
  const supabase = client();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new BookmarkNotAvailableError();
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Everything the store needs, in two parallel queries.
 *
 * Folder membership is fetched as its own table rather than as an embedded
 * select on `bookmarks`, because PostgREST would have to resolve the embed
 * through the composite FK and the flat read is both faster and easier to
 * reason about. The join happens in memory over at most 500 rows.
 *
 * Not term-filtered. The whole set is small by construction (the 500 cap) and
 * holding all of it means switching the term pill on /saved is instant and
 * offline-cheap, instead of a round trip per switch.
 */
export async function loadBookmarks(): Promise<BookmarkPayload> {
  const supabase = client();

  /*
   * Identity first, and it is not optional.
   *
   * RLS answers an anonymous SELECT on these tables with an empty array and no
   * error — which is correct at the database and a lie at the UI. Without this
   * check the store settles on "ready, nothing saved", and `/saved` tells a
   * signed-out visitor their shortlist is empty when it is really unreadable.
   * Throwing here is what turns that into the sign-in screen.
   */
  await requireUserId();

  const [bookmarkResult, folderResult, itemResult] = await Promise.all([
    supabase
      .from("bookmarks")
      .select("section_id, term_code, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("bookmark_folders")
      .select("folder_id, name, created_at")
      .order("created_at", { ascending: true }),
    supabase.from("bookmark_folder_items").select("folder_id, section_id"),
  ]);

  if (bookmarkResult.error) throw translate("loadBookmarks", bookmarkResult.error);
  if (folderResult.error) throw translate("loadFolders", folderResult.error);
  if (itemResult.error) throw translate("loadFolderItems", itemResult.error);

  const folderIdsBySection = new Map<string, string[]>();
  for (const item of itemResult.data ?? []) {
    const existing = folderIdsBySection.get(item.section_id);
    if (existing) existing.push(item.folder_id);
    else folderIdsBySection.set(item.section_id, [item.folder_id]);
  }

  return {
    bookmarks: (bookmarkResult.data ?? []).map((row) => ({
      sectionId: row.section_id,
      termCode: row.term_code,
      createdAt: row.created_at,
      folderIds: folderIdsBySection.get(row.section_id) ?? [],
    })),
    folders: (folderResult.data ?? []).map((row) => ({
      folderId: row.folder_id,
      name: row.name,
      createdAt: row.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Bookmark mutations
// ---------------------------------------------------------------------------

/**
 * Idempotent: saving an already-saved section is a no-op, not an error. The
 * icon is a toggle and a double click must not surface a failure.
 *
 * `term_code` is not sent — `bookmarks_stamp_term` fills it from the section,
 * so a client cannot file a bookmark under the wrong term.
 */
export async function addBookmark(sectionId: string): Promise<void> {
  const supabase = client();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("bookmarks")
    .upsert({ user_id: userId, section_id: sectionId }, { onConflict: "user_id,section_id" });
  if (error) throw translate("addBookmark", error);
}

/**
 * Removes the bookmark. Its folder memberships and its watch go with it via
 * `on delete cascade` — which is why turning off a seat alert is not something
 * this function has to remember to do.
 */
export async function removeBookmark(sectionId: string): Promise<void> {
  const supabase = client();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", userId)
    .eq("section_id", sectionId);
  if (error) throw translate("removeBookmark", error);
}

/** Bulk remove, for Select mode. One statement, one Undo. */
export async function removeBookmarks(sectionIds: string[]): Promise<void> {
  if (sectionIds.length === 0) return;
  const supabase = client();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", userId)
    .in("section_id", sectionIds);
  if (error) throw translate("removeBookmarks", error);
}

/**
 * Re-creates a bookmark exactly as it was, folders included. What Undo calls.
 *
 * The watch is NOT restored here; the caller re-adds it, because only the
 * caller knows whether one existed and re-arming an alert nobody asked for is
 * worse than dropping one.
 */
export async function restoreBookmark(
  sectionId: string,
  folderIds: readonly string[],
): Promise<void> {
  await addBookmark(sectionId);
  if (folderIds.length > 0) await setBookmarkFolders(sectionId, folderIds);
}

// ---------------------------------------------------------------------------
// Filing
// ---------------------------------------------------------------------------

/**
 * Sets a bookmark's folders to exactly this set.
 *
 * Written as a delete-then-insert rather than a diff because the picker sends
 * the whole desired state on every checkbox click, and a diff computed from a
 * possibly-stale local snapshot could file into a folder that was deleted in
 * another tab. The delete is scoped to the one bookmark, so it is cheap.
 */
export async function setBookmarkFolders(
  sectionId: string,
  folderIds: readonly string[],
): Promise<void> {
  const supabase = client();
  const userId = await requireUserId();

  const { error: clearError } = await supabase
    .from("bookmark_folder_items")
    .delete()
    .eq("user_id", userId)
    .eq("section_id", sectionId);
  if (clearError) throw translate("setBookmarkFolders", clearError);

  if (folderIds.length === 0) return;

  const { error } = await supabase.from("bookmark_folder_items").insert(
    folderIds.map((folderId) => ({
      folder_id: folderId,
      user_id: userId,
      section_id: sectionId,
    })),
  );
  if (error) throw translate("setBookmarkFolders", error);
}

/**
 * Files many bookmarks into one folder, for Select mode.
 *
 * Additive, not a replacement: filing three sections into "Systems track" must
 * not strip whatever else they were already filed under. `ignoreDuplicates`
 * makes re-filing something already there a no-op.
 */
export async function fileBookmarksIntoFolder(
  sectionIds: readonly string[],
  folderId: string,
): Promise<void> {
  if (sectionIds.length === 0) return;
  const supabase = client();
  const userId = await requireUserId();

  const { error } = await supabase.from("bookmark_folder_items").upsert(
    sectionIds.map((sectionId) => ({
      folder_id: folderId,
      user_id: userId,
      section_id: sectionId,
    })),
    { onConflict: "folder_id,user_id,section_id", ignoreDuplicates: true },
  );
  if (error) throw translate("fileBookmarksIntoFolder", error);
}

/** Removes many bookmarks from one folder. The inverse of the above. */
export async function unfileBookmarksFromFolder(
  sectionIds: readonly string[],
  folderId: string,
): Promise<void> {
  if (sectionIds.length === 0) return;
  const supabase = client();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("bookmark_folder_items")
    .delete()
    .eq("user_id", userId)
    .eq("folder_id", folderId)
    .in("section_id", sectionIds);
  if (error) throw translate("unfileBookmarksFromFolder", error);
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/**
 * Creates a folder.
 *
 * A duplicate name does not create a second folder — the picker checks the one
 * that already exists instead, so `DuplicateFolderError` carries it. Matching
 * is case-insensitive and trim-insensitive, exactly as the unique index is, so
 * the client and the database can never disagree about what a collision is.
 */
export async function createFolder(name: string): Promise<FolderRecord> {
  const supabase = client();
  const userId = await requireUserId();
  const trimmed = name.trim();

  if (trimmed.length === 0) throw new Error("Give the folder a name.");
  if (trimmed.length > 60) throw new Error("Folder names are limited to 60 characters.");

  const { data, error } = await supabase
    .from("bookmark_folders")
    .insert({ user_id: userId, name: trimmed })
    .select("folder_id, name, created_at")
    .single();

  if (error) {
    const translated = translate("createFolder", error);
    if (translated instanceof DuplicateFolderError) {
      throw new DuplicateFolderError(await findFolderByName(trimmed));
    }
    throw translated;
  }

  return { folderId: data.folder_id, name: data.name, createdAt: data.created_at };
}

async function findFolderByName(name: string): Promise<FolderRecord | null> {
  const supabase = client();
  const { data } = await supabase
    .from("bookmark_folders")
    .select("folder_id, name, created_at")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  return data
    ? { folderId: data.folder_id, name: data.name, createdAt: data.created_at }
    : null;
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  const supabase = client();
  const userId = await requireUserId();
  const trimmed = name.trim();

  if (trimmed.length === 0) throw new Error("Give the folder a name.");

  const { error } = await supabase
    .from("bookmark_folders")
    .update({ name: trimmed })
    .eq("folder_id", folderId)
    .eq("user_id", userId);
  if (error) throw translate("renameFolder", error);
}

/**
 * Deletes a folder, optionally with the bookmarks filed in it.
 *
 * Goes through the security-definer function rather than two client calls, so
 * "delete the folder and its 4 sections" cannot half-happen. Returns how many
 * bookmarks were actually removed, which is what the confirmation toast says.
 */
export async function deleteFolder(
  folderId: string,
  deleteBookmarks = false,
): Promise<number> {
  const supabase = client();
  await requireUserId();

  const { data, error } = await supabase.rpc("delete_bookmark_folder", {
    p_folder_id: folderId,
    p_delete_bookmarks: deleteBookmarks,
  });
  if (error) throw translate("deleteFolder", error);
  return Number(data ?? 0);
}
