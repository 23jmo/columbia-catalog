"use client";

import { useCallback, useState } from "react";
import { RiBookmarkFill, RiBookmarkLine } from "@remixicon/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useBookmark } from "@/hooks/use-bookmark";
import { useWatchlist } from "@/hooks/use-watchlist";
import { toggleBookmark } from "@/lib/bookmarks/store";
import { cx } from "@/utils/cx";

import { announceRemoval, announceSave, showSignInToast } from "./bookmark-toasts";

/**
 * Save a section.
 *
 * ── Why it renders signed out ─────────────────────────────────────────────
 *
 * Same discipline as `WatchButton` and `AddToScheduleButton`: the affordance
 * stays visible and says what it needs, rather than vanishing. A missing
 * control reads as a missing feature; a control that answers "sign in to save
 * classes" reads as a door you know how to open. Reads are free in this
 * product and writes need an account (spec §15), and this is one of the places
 * a reader meets that line.
 *
 * Nothing is staged and replayed across the sign-in redirect. Holding a save
 * through an OAuth round trip means either a local cache that contradicts the
 * "Supabase only" decision, or a URL parameter that writes on page load —
 * and a page load that writes is a page load that writes twice on refresh.
 *
 * ── Motion ────────────────────────────────────────────────────────────────
 *
 * Saving springs and throws a small burst. Removing does neither: it is a
 * plain crossfade, because celebrating a removal is the wrong note and a
 * bounce on every un-save turns a correction into a performance. Under
 * `prefers-reduced-motion` both collapse to an instant state change.
 */

export interface BookmarkButtonProps {
  sectionId: string;
  /** For the accessible label — "Save section 001". */
  sectionCode: string;
  /** "COMS4113" — what the confirmation names. Falls back to the section code. */
  courseLabel?: string;
  size?: "xs" | "sm";
  className?: string;
}

export function BookmarkButton({
  sectionId,
  sectionCode,
  courseLabel,
  size = "sm",
  className,
}: BookmarkButtonProps) {
  const { saved, pending, signedOut, isLoading } = useBookmark(sectionId);
  const { watched } = useWatchlist();
  const reduceMotion = useReducedMotion();
  const [burstKey, setBurstKey] = useState(0);

  const label = signedOut
    ? "Sign in to save this class"
    : saved
      ? `Remove section ${sectionCode} from saved classes`
      : `Save section ${sectionCode}`;

  const name = courseLabel ? `${courseLabel} §${sectionCode}` : `Section ${sectionCode}`;

  const onPress = useCallback(async () => {
    if (signedOut) {
      showSignInToast();
      return;
    }

    // The burst is fired from the click, not from the resulting state, so it
    // lands with the press rather than a round trip later. The optimistic flip
    // means the two agree; a rollback simply un-fills an icon whose sparks
    // have already faded.
    const willSave = !saved;
    if (willSave && !reduceMotion) setBurstKey((key) => key + 1);

    // Read before the write: removing a bookmark cascades its watch away, so
    // by the time the result lands `watched` no longer remembers there was a
    // bell to mention.
    const hadWatch = watched.has(sectionId);

    const result = await toggleBookmark(sectionId);

    if (result.kind === "saved") {
      announceSave(sectionId, name);
    } else if (result.kind === "removed") {
      announceRemoval(sectionId, name, result.folderIds, hadWatch);
    } else if (result.kind === "denied") {
      showSignInToast();
    }
    // `failed` is already reported by BookmarkProvider from the store's error,
    // and `busy` is not worth telling anybody about.
  }, [name, reduceMotion, saved, sectionId, signedOut, watched]);

  const Icon = saved ? RiBookmarkFill : RiBookmarkLine;
  const iconSize = size === "xs" ? "size-4" : "size-[18px]";

  return (
    <span className={cx("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => void onPress()}
        disabled={pending || isLoading}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        className={cx(
          "relative inline-flex items-center justify-center rounded-full",
          size === "xs" ? "size-7" : "size-8",
          "cursor-pointer transition-colors duration-150 ease",
          "hover:bg-background-secondary-hover",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
          saved ? "text-accent-600" : "text-foreground-icon-secondary",
        )}
      >
        <motion.span
          key={saved ? "saved" : "unsaved"}
          initial={reduceMotion ? false : { scale: saved ? 0.7 : 1, opacity: saved ? 0.4 : 1 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            saved
              ? // Overshoot on the way in — the springiness is the whole
                // feeling of the control, and it is short enough to survive
                // being repeated during a browsing session.
                { type: "spring", stiffness: 700, damping: 18, mass: 0.5 }
              : { duration: 0.12, ease: "easeOut" }
          }
          className="inline-flex"
        >
          <Icon className={iconSize} aria-hidden />
        </motion.span>
      </button>

      {reduceMotion ? null : <SaveBurst runKey={burstKey} />}
    </span>
  );
}

/**
 * The save burst.
 *
 * Seven sparks, thrown outward on a fixed ring so the shape is the same every
 * time rather than randomly lopsided. Rendered in a `pointer-events-none`
 * layer above the icon: during registration people click these fast, and a
 * decoration that can swallow the next click would be a real bug traded for a
 * flourish.
 *
 * Keyed on a counter rather than on the saved state, so re-saving fires it
 * again — `AnimatePresence` needs a new key to replay, and the state has not
 * changed on a second save of the same section.
 */
function SaveBurst({ runKey }: { runKey: number }) {
  const SPARKS = 7;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <AnimatePresence>
        {runKey > 0 ? (
          <motion.span key={runKey} className="absolute size-0">
            {Array.from({ length: SPARKS }, (_, index) => {
              const angle = (index / SPARKS) * Math.PI * 2 - Math.PI / 2;
              const distance = 15;
              return (
                <motion.span
                  key={index}
                  className="absolute size-1 rounded-full bg-accent-500"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
                  animate={{
                    x: Math.cos(angle) * distance,
                    y: Math.sin(angle) * distance,
                    opacity: 0,
                    scale: 0.2,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              );
            })}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
