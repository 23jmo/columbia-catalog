"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RiExternalLinkLine } from "@remixicon/react";

import { CloseButton } from "@/components/base/buttons/close-button";
import { cx } from "@/utils/cx";

/**
 * The overlay shell for an intercepted `/course/[courseId]`.
 *
 * Only the chrome lives here — the content is the same `CourseDetail` the
 * standalone page renders, passed in as `children` so it stays a server
 * subtree.
 *
 * WHY EVERY DISMISS PATH CALLS `router.back()`:
 * the drawer is not UI state, it is a URL. Opening one pushed a history entry;
 * closing it must pop that entry, or the address bar starts describing a
 * screen that is no longer on top and the browser's own back button becomes a
 * trap ("back" would re-open the thing you just closed). Escape, the backdrop
 * and the close button therefore all do exactly what the back gesture does.
 *
 * Accessibility: `role="dialog"` + `aria-modal`, focus moves into the panel on
 * open and returns to whatever opened it on close, Tab cycles inside, and the
 * page behind is scroll-locked so a wheel over the backdrop does not silently
 * move the results underneath.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface CourseDrawerProps {
  /**
   * Element id of the course title inside `children`, for `aria-labelledby`.
   * Omitted by the loading skeleton, which has no title to point at yet and
   * falls back to a static `aria-label`.
   */
  titleId?: string;
  /** Course code, shown in the drawer's own header rail. */
  code: string;
  /** Canonical standalone URL, for "open as a page". */
  href: string;
  children: ReactNode;
}

export function CourseDrawer({ titleId, code, href, children }: CourseDrawerProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const [isVisible, setVisible] = useState(false);

  useEffect(() => {
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    // Focus the panel itself rather than the first control: a screen reader
    // should hear the course title, not "close button".
    panelRef.current?.focus();
    // Next frame, so the enter transition has something to animate from.
    const frame = requestAnimationFrame(() => setVisible(true));

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        router.back();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Back where they were: the row they clicked, not the top of the page.
      restoreFocusTo.current?.focus?.();
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-100 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close course details"
        onClick={() => router.back()}
        className={cx(
          "absolute inset-0 cursor-default bg-black/50 transition-opacity duration-200 ease-out",
          isVisible ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : "Course details"}
        tabIndex={-1}
        className={cx(
          "relative flex h-dvh w-full max-w-2xl flex-col outline-none",
          "border-l border-border-table bg-background-full shadow-xl",
          // A real slide off the right edge. This was `translate-x-4` -- a 16px
          // nudge, which reads as a flicker rather than a panel arriving, and
          // is why the overlay felt like a new screen rather than a side panel.
          "transition-transform duration-300 ease-out will-change-transform",
          isVisible ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-table bg-background-primary-default px-4 py-3">
          <span className="text-caption-1-medium tabular-nums text-text-secondary">{code}</span>
          <div className="flex items-center gap-1">
            {/*
              A real anchor, not a <Link>: this deliberately leaves the overlay
              and loads the standalone page, which is the natural home for
              "open in a new tab" and for anyone who wants the URL alone.
            */}
            <a
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-caption-1-medium text-text-secondary transition-colors outline-none hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <RiExternalLinkLine aria-hidden className="size-3.5" />
              Full page
            </a>
            <CloseButton
              size="md"
              aria-label="Close course details"
              onClick={() => router.back()}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
