"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

import type { CourseWithSections } from "@/lib/types";

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
 */

export interface ResultRow {
  course: CourseWithSections;
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

export function ResultsList({ rows, sectionScoped }: ResultsListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

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
    // A collapsed row is ~104px; being close keeps the scrollbar honest before
    // anything has been measured.
    estimateSize: () => 112,
    overscan: 6,
    scrollMargin,
    getItemKey: (index) => rows[index].course.courseId,
  });

  const items = virtualizer.getVirtualItems();

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
              <div className="pb-2">
                <CourseResultRow
                  course={row.course}
                  matchedSectionIds={row.matchedSectionIds}
                  // When a section filter is on, the matching sections are the
                  // answer — hiding them behind a collapsed row would make the
                  // filter look broken (spec §6).
                  defaultExpanded={sectionScoped}
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
