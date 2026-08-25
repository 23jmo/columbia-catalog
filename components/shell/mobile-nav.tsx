"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { RiMenuLine } from "@remixicon/react";

import { CatalogSidebar } from "@/components/shell/catalog-sidebar";
import type { ShellNavKey } from "@/components/shell/nav";
import { cx } from "@/utils/cx";

const PAGE_NAME: Record<ShellNavKey, string> = {
  home: "Home",
  search: "Search",
  saved: "Saved",
  schedule: "Schedule",
  progression: "Progression",
  profile: "Profile",
};

/** Matches the parked rail. Keep this in lockstep with the width class below. */
const RAIL_PX = 260;

/**
 * Desktop floating rail starts at `xl` (1280px), not `lg` (1024px).
 *
 * 1024 is iPad Pro portrait — still a tablet. Gating the push/radius on
 * `max-lg` made that size snap to the desktop rail and skip the join.
 */
const DESKTOP_MQ = "(min-width: 1280px)";

/**
 * Phone and tablet chrome — BoardUI AI Chat's slide, with a slim top bar.
 *
 * The rail is parked under the page, always 260px. Opening does not shrink
 * the content column (that would reflow every card). It translates the whole
 * card right, same width, so the extra 260px just leaves the screen.
 *
 * Transform is set as `translate3d` on the element itself, both open and
 * closed. Toggling a Tailwind `translate-x-*` class (or toggling
 * `overflow-hidden` with it) goes from `transform: none` to a list, which
 * most engines cannot interpolate — that is the snap. The header gets the
 * same left radius so its opaque fill does not square off the join.
 *
 * The shell behind the card is the sidebar grey. That is what shows in the
 * card's left radius — a white page behind it would read as a hole, not a join.
 *
 * At `xl` this is a passthrough: the bar and the rail both hide, and the
 * desktop floating sidebar (a sibling in `AppShell`) takes over.
 */
export function MobileShell({
  activeNav,
  children,
  className,
  style,
}: {
  activeNav: ShellNavKey;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pageName = PAGE_NAME[activeNav];

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MQ);
    const onChange = () => {
      if (media.matches) setIsOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  /*
   * The document must not be a scroller. A flex child with `h-dvh` still
   * grows when `min-height: auto` sizes to its contents, and then `body`
   * (`min-h-dvh`) takes the overflow — sidebar and page move as one.
   * Locking overflow here is the bit `app/layout.tsx` cannot say.
   */
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const htmlOverflow = html.style.overflow;
    const bodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = htmlOverflow;
      body.style.overflow = bodyOverflow;
    };
  }, []);

  return (
    <div
      className={cx(
        "relative h-full min-h-0 min-w-0 flex-1 overflow-hidden",
        "max-xl:bg-background-secondary-default",
      )}
    >
      {/*
        `fixed`, not `absolute`. Absolute is tied to this shell, and on
        mobile the shell still rides a document scroll. Fixed is the
        viewport, so the rail stays while the page column scrolls.
      */}
      <div
        id="mobile-catalog-nav"
        inert={!isOpen ? true : undefined}
        aria-hidden={!isOpen}
        className="fixed inset-y-0 left-0 z-0 h-dvh w-[260px] overflow-hidden xl:hidden"
      >
        <CatalogSidebar
          activeNav={activeNav}
          mobile
          flat
          onNavigate={() => setIsOpen(false)}
          className="h-full w-[260px]"
        />
      </div>

      <div
        className={cx(
          "relative z-10 flex h-full min-h-0 w-full flex-col bg-background-full",
          "transition-[transform,border-radius,box-shadow] duration-400 motion-reduce:transition-none",
          "ease-[cubic-bezier(0.32,0.72,0,1)]",
          isOpen ? "rounded-l-3xl shadow-sidebar" : "rounded-none shadow-none",
        )}
        style={{
          transform: isOpen ? `translate3d(${RAIL_PX}px,0,0)` : "translate3d(0,0,0)",
        }}
      >
        {/*
          Hamburger + the page name, optically centred. The trailing size-9
          spacer matches the button so "Home" sits in the real middle, not
          shifted toward the control. Not sticky: the page scroller is the
          column below, so this bar is just out of that flow.
        */}
        <header
          className={cx(
            "z-30 flex w-full shrink-0 items-center gap-2 bg-background-full px-3 xl:hidden",
            "h-[calc(3.5rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]",
            "transition-[border-radius] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            isOpen ? "rounded-tl-3xl" : "rounded-none",
          )}
        >
          <button
            type="button"
            aria-label={isOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isOpen}
            aria-controls="mobile-catalog-nav"
            onClick={() => setIsOpen((open) => !open)}
            className={cx(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              "border border-border-button-default bg-background-primary-default shadow-xs",
              "text-foreground-icon-secondary",
              "transition-[color,background-color,border-color,box-shadow,transform,scale] duration-150 ease-out",
              "hover:bg-background-primary-hover hover:border-border-button-hover",
              "active:scale-[0.97] active:duration-[160ms]",
              "motion-reduce:transition-none motion-reduce:active:scale-100",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiMenuLine className="size-5" aria-hidden />
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-title-3-semibold -tracking-[0.01em] text-text-primary">
            {pageName}
          </p>
          <span className="size-9 shrink-0" aria-hidden />
        </header>
        {/*
          The page. `min-h-0` is the flex shrink so this column, not the
          document, takes the overflow. The rail is a parked sibling and
          never enters this scroller.
        */}
        <div
          className={cx(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-none",
            className,
          )}
          style={style}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
