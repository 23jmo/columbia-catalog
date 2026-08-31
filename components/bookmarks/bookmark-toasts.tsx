"use client";

import { undoRemoval } from "@/lib/bookmarks/store";
import { signIn } from "@/lib/db/auth";
import { toast } from "@/lib/toast/store";
import { toggleWatch } from "@/lib/watchlist/store";

import { FolderPickerAction } from "./folder-popover";

/**
 * What a save, a removal, and a refused write say.
 *
 * There are three ways to remove a bookmark — the filled star, the overflow
 * menu, and Select mode on `/saved` — and three ways to hear about it is two
 * too many. Wording, Undo behaviour, and the dedupe key all live here so the
 * paths cannot drift apart, which is how somebody ends up unsure whether the
 * second one actually did anything.
 *
 * All three share `dedupeKey: bookmark:<sectionId>`. Toggling one section
 * quickly should replace its own message, never stack five of them.
 */

/** The confirmation, with the folder picker hanging off it. */
export function announceSave(sectionId: string, name: string): void {
  toast.success({
    title: `Saved ${name}`,
    dedupeKey: `bookmark:${sectionId}`,
    action: {
      label: "Add to folder",
      render: (controls) => (
        <FolderPickerAction sectionId={sectionId} name={name} {...controls} />
      ),
    },
  });
}

/**
 * The removal notice, with Undo.
 *
 * Undo restores the folder filing too, not just the bookmark. Losing "this was
 * in Systems track and Spring backups" to a misclick, and getting back a bare
 * bookmark, is a worse outcome than no Undo at all — it looks like it worked.
 *
 * The watch is a separate restore because the database dropped it: `watches`
 * cascades off `bookmarks`, so re-inserting the bookmark cannot bring the bell
 * back on its own.
 */
export function announceRemoval(
  sectionId: string,
  name: string,
  folderIds: readonly string[],
  hadWatch: boolean,
): void {
  toast.info({
    title: `Removed ${name}`,
    // Quietly cancelling a promise to email somebody is the worst version of
    // this, so the consequence is stated — and only when there was one.
    description: hadWatch ? "Seat alerts turned off." : undefined,
    dedupeKey: `bookmark:${sectionId}`,
    action: {
      label: "Undo",
      onPress: () => {
        void (async () => {
          const restored = await undoRemoval(sectionId, folderIds);
          if (restored && hadWatch) void toggleWatch(sectionId);
        })();
      },
    },
  });
}

/**
 * What a signed-out click gets.
 *
 * Nothing is staged for replay after the redirect. Holding a save through an
 * OAuth round trip means either a local cache that contradicts the
 * Supabase-only decision, or a URL parameter that writes on page load — and a
 * page load that writes is a page load that writes twice on refresh.
 */
export function showSignInToast(): void {
  toast.info({
    title: "Sign in to save classes",
    description: "LionPlan is free to search and browse. Sign in to save classes for later.",
    dedupeKey: "bookmark-signed-out",
    action: {
      label: "Sign in with Columbia",
      onPress: () => {
        void signIn().then(({ error }) => {
          if (error) toast.error({ title: "Couldn't start sign-in", description: error });
        });
      },
    },
  });
}
