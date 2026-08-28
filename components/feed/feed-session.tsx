"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiRefreshLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { refreshFeedAction } from "@/app/feed-actions";
import type { FeedCard, FeedResult } from "@/lib/recommend/feed";
import { courseIdsFromSectionIds } from "@/lib/recommend/section-id";
import { showToast } from "@/lib/toast/store";
import { cx } from "@/utils/cx";

import { getDismissed } from "./dismissed-store";
import { FeedDeck } from "./feed-deck";

/**
 * The live feed: SSR cards, then a client that can rebuild them.
 *
 * The home page is a server component, so the first ranking is HTML. Everything
 * after that — a tap on Refresh, a second discard — has to happen here, because
 * a server tree cannot call `refreshFeedAction` in response to a thumb.
 *
 * Discards travel with the rebuild. They live in this browser (see
 * `dismissed-store.ts`) so the server has never heard of them unless we send
 * them. Saved classes are the opposite: `buildFeed` already drops those from
 * the database, and the deck hides any that the bookmark store knows about.
 */

export function FeedSession({
  feed,
  limit,
}: {
  feed: FeedResult;
  limit: number;
}) {
  const [cards, setCards] = useState<readonly FeedCard[]>(feed.cards);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);
  const bookmarks = useBookmarks();
  const savedCourseIds = useMemo(
    () => courseIdsFromSectionIds(bookmarks.saved),
    [bookmarks.saved],
  );

  // A navigation that re-renders HomeFeed with a new server result should
  // replace the client copy, or a back-button would keep the old deck.
  useEffect(() => {
    setCards(feed.cards);
  }, [feed.cards]);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      const id = ++requestId.current;
      setPending(true);
      try {
        const dismissed = [...getDismissed()];
        const next = await refreshFeedAction({
          limit,
          excludeCourseIds: [...dismissed, ...savedCourseIds],
          demoteCourseIds: dismissed,
        });
        if (id !== requestId.current) return;
        if (opts?.silent) {
          /*
           * Keep cards still on screen. A discard-driven rebuild that shuffled
           * the unread list under a thumb would feel like the page fighting
           * the student. Fill the holes from the new ranking instead.
           */
          const skip = new Set(dismissed);
          setCards((current) => {
            const keep = current.filter(
              (card) => !skip.has(card.courseId) && !savedCourseIds.has(card.courseId),
            );
            const keepIds = new Set(keep.map((card) => card.courseId));
            const incoming = next.cards.filter((card) => !keepIds.has(card.courseId));
            return [...keep, ...incoming].slice(0, limit);
          });
        } else {
          setCards(next.cards);
        }
        if (!opts?.silent) {
          showToast({
            title: "Recommendations updated",
            description:
              dismissed.length > 0
                ? "Ranked away from the classes you skipped."
                : "A fresh ranking of what is still on offer.",
            status: "success",
            dedupeKey: "feed-refresh",
          });
        }
      } catch (cause) {
        console.error("feed: refresh failed:", cause);
        if (id !== requestId.current) return;
        showToast({
          title: "Could not refresh",
          description: "The current list is unchanged. Try again in a moment.",
          status: "error",
          dedupeKey: "feed-refresh-error",
        });
      } finally {
        if (id === requestId.current) setPending(false);
      }
    },
    [limit, savedCourseIds],
  );

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-end px-1">
        <Button
          type="button"
          size="small"
          variant="ghost"
          leadingIcon={RiRefreshLine}
          onClick={() => void refresh()}
          disabled={pending}
          aria-busy={pending}
          className={cx(pending && "[&_svg]:animate-spin")}
        >
          {pending ? "Updating…" : "Refresh"}
        </Button>
      </div>
      {cards.length === 0 ? (
        <p className="rounded-2xl border border-border-table bg-background-primary-default p-5 text-body-regular text-text-secondary">
          Nothing left to recommend with the classes you have saved or skipped.
          Unsave one, or refresh after undoing a skip.
        </p>
      ) : (
        <FeedDeck cards={cards} onRerank={() => void refresh({ silent: true })} />
      )}
    </div>
  );
}
