"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import type { SavedCourseGroup } from "@/lib/bookmarks/grouping";

import { SavedCard } from "./saved-card";

/**
 * The saved classes, grouped by course and staged in.
 *
 * ── Why this is one component and not two copies ──────────────────────────
 *
 * `/saved` and `/saved/[folderId]` rendered byte-identical group markup — the
 * course heading, the `<ul>`, the card, the Select-mode wiring — in two files.
 * The same split is why `feed-layout.tsx` exists: the moment one of them grows
 * an entrance animation and the other does not, the same card arrives two
 * different ways depending on which door you came through.
 *
 * ── The entrance is the feed's, deliberately ──────────────────────────────
 *
 * Same numbers as `FeedDeck`: a 14px rise, a 50ms stagger capped at 450ms, and
 * `cubic-bezier(0.16, 1, 0.3, 1)` over 0.42s. A card you saw on `/` and saved
 * is the same object here — `saved-card.tsx` argues that at length — and an
 * object that arrives one way on one screen and another way on the next is
 * being re-introduced rather than recognised.
 *
 * It earns its place on this page for a reason `/` does not have: these cards
 * are resolved in the BROWSER, from a bookmark store and then a catalog
 * lookup, so they land mid-paint rather than in the server's HTML. Without
 * this they pop in against a skeleton that was already occupying the same
 * pixels. That is the "preventing a jarring change" case, not decoration.
 *
 * The stagger index runs across groups, not within them. Per-group indices
 * would start every course at delay 0, and three courses would arrive as three
 * simultaneous cards rather than one list.
 *
 * ── `layout="position"`, not `layout` ─────────────────────────────────────
 *
 * `/` uses plain `layout`, which animates size as well as position. Here that
 * is wrong: entering Select mode swaps the `EnrollmentChip` for a shorter seat
 * pill, so a full `layout` would animate the card's HEIGHT and scale-distort
 * every line of text inside it on the way. Position-only gives the one thing
 * this page actually needs — when you unsave a card, the cards below it slide
 * up instead of teleporting — with none of that.
 */

export interface SavedListProps {
  groups: SavedCourseGroup[];
  /** Select mode. Null when the page is in ordinary reading mode. */
  selection?: {
    selectedIds: ReadonlySet<string>;
    onToggle: (sectionId: string, isSelected: boolean) => void;
  };
}

export function SavedList({ groups, selection }: SavedListProps) {
  const reduceMotion = useReducedMotion();

  /*
   * A running position across the whole page, incremented as the groups are
   * walked, so the stagger reads down the list rather than restarting at each
   * course heading.
   */
  let position = 0;

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.course.courseId} className="flex flex-col gap-2">
          {/*
            Only when a course has more than one section saved. On the common
            case it was a line printing the code and title directly above a
            card whose first two lines are the code and the title.
          */}
          {group.sections.length > 1 ? (
            <div className="flex flex-wrap items-baseline gap-x-2 px-1">
              <Link
                href={`/course/${group.course.courseId}`}
                className="text-body-semibold tabular-nums text-text-primary outline-none hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                {group.course.subjectCode}
                {group.course.number}
              </Link>
              <span className="min-w-0 truncate text-caption-1-medium text-text-secondary">
                {group.sections.length} sections saved
              </span>
            </div>
          ) : null}

          <ul role="list" className="flex flex-col gap-4">
            {group.sections.map((section) => {
              const index = position++;
              return (
                <motion.li
                  key={section.sectionId}
                  className="flex min-w-0"
                  /*
                   * Reduced motion keeps the fade and drops every pixel of
                   * movement — the rise AND the reflow slide. Gentler, not
                   * off: the fade is what tells the reader the list arrived,
                   * and cutting it too would put them back in front of a
                   * hard swap from skeleton to content with nothing marking
                   * the change.
                   */
                  layout={reduceMotion ? false : "position"}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    // Capped: past about half a second of stagger the last
                    // cards feel like they are still loading rather than
                    // arriving.
                    delay: Math.min(index * 0.05, 0.45),
                    duration: 0.42,
                    ease: [0.16, 1, 0.3, 1],
                    layout: { type: "spring", stiffness: 380, damping: 40 },
                  }}
                >
                  <SavedCard
                    section={section}
                    course={group.course}
                    className="w-full"
                    selection={
                      selection
                        ? {
                            isSelected: selection.selectedIds.has(section.sectionId),
                            onChange: (next) => selection.onToggle(section.sectionId, next),
                          }
                        : undefined
                    }
                  />
                </motion.li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
