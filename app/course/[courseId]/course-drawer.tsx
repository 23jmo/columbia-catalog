"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RiExternalLinkLine } from "@remixicon/react";

import { CloseButton } from "@/components/base/buttons/close-button";
import { cx } from "@/utils/cx";

/**
 * The overlay shell for an intercepted `/course/[courseId]`.
 *
 * Only the chrome lives here — the content is the same `SectionDetail` the
 * standalone page renders, passed in as `children` so it stays a server
 * subtree.
 *
 * ── Why this is mounted from a LAYOUT, not from the page ───────────────────
 *
 * The enter transition is driven by state (`isVisible` flips on the frame after
 * mount), so it replays on every mount. That used to happen twice per open:
 * `loading.tsx` rendered a drawer, and when the data arrived React unmounted
 * that whole subtree and mounted the page's drawer in its place. Two React
 * elements in two different Suspense slots are two components, however
 * identical their props — so the panel slid up, vanished, and slid up again.
 *
 * Hoisting the panel into `app/@drawer/(.)course/[courseId]/layout.tsx` puts it
 * ABOVE the Suspense boundary, where nothing the page does can unmount it. The
 * skeleton and the real content are now just different `children` inside one
 * panel that mounted once. The same structure makes moving between sections
 * (`?section=D01` → `?section=D02`) a content swap rather than a fresh drawer.
 *
 * Everything that must not restart mid-open lives here for the same reason:
 * the scroll lock, the focus trap, the Escape handler, and the record of what
 * to restore focus to.
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

/**
 * The id of the heading inside `children`, for `aria-labelledby`.
 *
 * A constant rather than a prop because the panel is now mounted a layout above
 * whatever renders the heading. Every state the slot can be in — the skeleton,
 * a section, the chooser, not-found — puts this id on its own heading, so the
 * reference always resolves. An `aria-labelledby` pointing at an element that
 * does not exist yet is worse than no label at all.
 */
export const DRAWER_TITLE_ID = "drawer-section-title";

export function CourseDrawer({ children }: { children: ReactNode }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const [isVisible, setVisible] = useState(false);

  useEffect(() => {
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    // Focus the panel itself rather than the first control: a screen reader
    // should hear the section title, not "close button".
    panelRef.current?.focus();
    /*
     * The panel renders hidden and flips to visible a frame later, so the
     * browser has painted the off-screen state for the transition to run from.
     *
     * The timer is not belt-and-braces. `requestAnimationFrame` only fires
     * while the compositor is actually painting this surface -- in a
     * background tab, an offscreen or headless pane, or some embedded
     * webviews, the callback simply never runs. Without a fallback `isVisible`
     * stays false forever and the panel sits permanently translated
     * off-screen while STILL trapping focus and scroll-locking the page
     * behind it: a click that freezes the app and shows nothing. An enter
     * animation is allowed to be skipped; it is not allowed to be the thing
     * that decides whether the drawer exists.
     *
     * Whichever lands first wins. The second `setVisible(true)` is a no-op --
     * React bails out when the value is unchanged -- so this cannot double the
     * transition, which is the whole point of the layout above it.
     */
    const frame = requestAnimationFrame(() => setVisible(true));
    const fallback = setTimeout(() => setVisible(true), 60);

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
      clearTimeout(fallback);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Back where they were: the row they clicked, not the top of the page.
      restoreFocusTo.current?.focus?.();
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-100 flex items-end justify-center sm:items-stretch sm:justify-end"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close section details"
        onClick={() => router.back()}
        className={cx(
          "absolute inset-0 cursor-default bg-black/30 backdrop-blur-sm transition-opacity duration-200 ease-out",
          isVisible ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={DRAWER_TITLE_ID}
        tabIndex={-1}
        className={cx(
          "relative flex flex-col outline-none bg-background-full shadow-xl",
          /*
           * Two shapes, one component.
           *
           * On a phone the panel is a bottom sheet: full width, capped short of
           * the top so the list stays visible behind it, and it arrives from the
           * bottom edge. That is the direction a thumb expects and it keeps the
           * controls in the half of the screen a thumb can reach. On a wide
           * screen it is a right-hand sidebar, where a bottom sheet would waste
           * the horizontal room and cover the results it is meant to sit beside.
           */
          "h-[88dvh] w-full rounded-t-2xl border-t border-border-table",
          "sm:h-dvh sm:max-w-2xl sm:rounded-none sm:border-t-0 sm:border-l",
          /*
           * The axis has to switch with the shape. At `sm` and up `translate-y`
           * is pinned to 0 so `translate-x` alone drives the slide; below `sm`
           * no x-translate is set, so y alone drives it. One transition,
           * whichever axis is live.
           *
           * Do not keep `will-change-transform` after open — it leaves the
           * panel on a compositor layer and makes body text look slightly soft.
           */
          "transition-transform duration-300 ease-out motion-reduce:transition-none",
          isVisible
            ? "translate-y-0 sm:translate-x-0"
            : "translate-y-full sm:translate-y-0 sm:translate-x-full",
        )}
      >
        {/*
          Grab handle: the standard signal that a sheet is draggable-dismissable
          and, more importantly here, that there is a page behind it. Pointless
          on the desktop sidebar, which has a visible edge instead.
        */}
        <div aria-hidden className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-border-table" />
        </div>

        {children}
      </div>
    </div>
  );
}

/**
 * The rail and the scroll area — the parts of the drawer that DO change as the
 * slot's content changes.
 *
 * This sits inside the panel rather than in the layout because its label and
 * its "Full page" target are facts about the record being shown, which the
 * layout (one segment above, with no access to `?section=`) cannot know. Both
 * the loading skeleton and the loaded page render one of these, so the rail
 * swaps in place under a panel that never moves.
 */
export function DrawerFrame({
  code,
  href,
  children,
}: {
  /** Shown in the rail — e.g. "COMS 3261 · 001". */
  code: string;
  /** Canonical standalone URL, for "open as a page". */
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-table bg-background-primary-default px-4 py-3">
        <span className="text-caption-1-medium tabular-nums text-text-secondary">{code}</span>
        <div className="flex items-center gap-1">
          {/*
            A real anchor, not a <Link>: this deliberately leaves the overlay
            and loads the standalone page, which is the natural home for
            "open in a new tab" and for anyone who wants the URL alone. A
            client-side navigation would be caught by this very intercepting
            route and never escape.
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
            aria-label="Close section details"
            onClick={() => router.back()}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
        {children}
      </div>
    </>
  );
}
