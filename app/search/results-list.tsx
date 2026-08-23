"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

import { useHasMounted } from "@/hooks/use-has-mounted";
import type { CourseListItem } from "@/lib/catalog-list-types";

import { CourseResultRow } from "./course-result-row";

/**
 * The result list.
 *
 * Virtualized with TanStack Virtual (spec §6: "no pagination, no load more"),
 * against the *window* scroller rather than an inner scroll container. That
 * matters more than it looks: an inner scroller would trap the wheel, break
 * the browser's own scroll restoration, and give phones a nested scroll region
 * inside the page — all so the list could own a height it does not need to.
 * `scrollMargin` tells the virtualizer where the list starts in the document
 * and the page scrolls normally.
 *
 * Rows measure themselves (`measureElement`) because a course row is not a
 * fixed height: it grows when expanded to show sections.
 *
 * ── Why the first screenful is NOT virtualized ─────────────────────────────
 *
 * A window virtualizer has no window on the server, so `getVirtualItems()`
 * returns nothing and the server rendered an empty list: the HTML shipped a
 * complete page with a blank results area, and rows appeared only once ~4 MB of
 * RSC payload had parsed and React had hydrated. That gap was the "search feels
 * slow" complaint -- the engine answers in ~1ms, but nobody could see it.
 *
 * So the first `SSR_ROW_COUNT` rows render as a plain list until `hasMounted`
 * flips. The server and the hydration pass render the identical plain list, so
 * there is no mismatch to reconcile; the commit right after swaps in the
 * virtualizer, which then owns every row including these. Results are legible
 * in the first paint and the list is still O(viewport) a frame later.
 */

export interface ResultRow {
  course: CourseListItem;
  /** Non-null when a section-level filter was active — spec §6. */
  matchedSectionIds: string[] | null;
}

export interface ResultsListProps {
  rows: ResultRow[];
  /** True when a day/time/instructor/open-seats filter is narrowing sections. */
  sectionScoped: boolean;
}

/**
 * The list's distance from the top of the document. Measured in a layout
 * effect rather than read off the ref during render, so the first painted
 * frame already has the right offset and React never sees a ref touched
 * mid-render.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Enough to fill a tall viewport at ~64px per collapsed row, and no more: these
 * rows are paid for twice (once in HTML, once on hydration), so the number is a
 * first-paint budget rather than a page size.
 */
const SSR_ROW_COUNT = 14;

export function ResultsList({ rows, sectionScoped }: ResultsListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const hasMounted = useHasMounted();

  useIsomorphicLayoutEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const measure = () => setScrollMargin(node.getBoundingClientRect().top + window.scrollY);
    measure();
    // The header above the list reflows (chips wrap, the index strip appears
    // and disappears), which moves the list without scrolling it.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    // A collapsed row is ~64px now that the card chrome is gone; being close
    // keeps the scrollbar honest before anything has been measured.
    estimateSize: () => 64,
    overscan: 6,
    scrollMargin,
    getItemKey: (index) => rows[index].course.courseId,
  });

  const items = virtualizer.getVirtualItems();

  /*
   * Server and first-hydration render. Plain flow layout -- no absolute
   * positioning and no explicit container height, because neither is knowable
   * without a window and guessing either would move every row on mount.
   */
  if (!hasMounted) {
    return (
      <div ref={listRef} className="w-full">
        <ol className="relative w-full list-none" aria-label="Search results">
          {rows.slice(0, SSR_ROW_COUNT).map((row, index) => (
            <li key={row.course.courseId} data-index={index}>
              <CourseResultRow
                course={row.course}
                matchedSectionIds={row.matchedSectionIds}
                defaultExpanded={sectionScoped || row.matchedSectionIds !== null}
                position={index + 1}
                total={rows.length}
              />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div ref={listRef} className="w-full">
      <ol
        className="relative w-full list-none"
        style={{ height: virtualizer.getTotalSize() }}
        aria-label="Search results"
      >
        {items.map((item) => {
          const row = rows[item.index];
          return (
            <li
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${item.start - scrollMargin}px)`,
              }}
            >
              <div>
                <CourseResultRow
                  course={row.course}
                  matchedSectionIds={row.matchedSectionIds}
                  /*
                   * Open when THIS row has sections to show, rather than on the
                   * global flag. Identical behaviour under a section filter
                   * (every row is scoped then), but it also opens the one row
                   * whose section the query named by title -- which is the
                   * whole point of surfacing sections: hiding the answer behind
                   * a collapsed row makes the search look like it missed.
                   */
                  defaultExpanded={sectionScoped || row.matchedSectionIds !== null}
                  position={item.index + 1}
                  total={rows.length}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
