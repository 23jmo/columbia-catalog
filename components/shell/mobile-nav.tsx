"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { RiMenuLine } from "@remixicon/react";

import { HapticRoot } from "@/components/haptics/haptic-root";
import { CatalogSidebar } from "@/components/shell/catalog-sidebar";
import { ChatFab } from "@/components/shell/chat-fab";
import { MobileHeaderSlotProvider } from "@/components/shell/mobile-header-slot";
import { ProgressiveBlur } from "@/components/shell/progressive-blur";
import { SHELL_NAV_ITEMS, type ShellNavKey } from "@/components/shell/nav";
import { haptic } from "@/lib/haptics";
import { cx } from "@/utils/cx";

/*
 * What the bar calls each page.
 *
 * This used to be seven hand-written strings, and it drifted the first time
 * one of them was renamed: the rail and the page heading both became
 * "Recommendations" while the phone's bar went on saying "Home" — on the very
 * screen where `hideTitleOnMobile` suppresses the heading BECAUSE the bar is
 * supposed to be printing it. The phone was the only surface still showing the
 * old name, so nothing on desktop could catch it.
 *
 * The spread is what stops that happening again: for anything in the rail,
 * `SHELL_NAV_ITEMS` is the only source of the word. Those four keys are still
 * written out below — TypeScript cannot see that `Object.fromEntries` covers
 * them, so without a literal the object does not satisfy the `Record` — but
 * the spread comes last and wins, and editing one of those four values here
 * does nothing. Rename in `SHELL_NAV_ITEMS`.
 *
 * The other three are real. They are deliberately NOT in the rail (see the
 * note there), so they have no label to borrow and this is where they live.
 */
export const PAGE_NAME: Record<ShellNavKey, string> = {
  // Overridden by the spread — see above.
  home: "Recommendations",
  chat: "Chat",
  search: "Catalog",
  saved: "Saved",
  // Not in the rail; these are the live values.
  schedule: "Schedule",
  progression: "Progression",
  profile: "Profile",
  ...Object.fromEntries(SHELL_NAV_ITEMS.map((item) => [item.key, item.label])),
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

  /*
   * The bar's own contents are owned by whichever page claims them. `Home` is
   * the fallback, not the default — see `mobile-header-slot.tsx`.
   */
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

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
      <HapticRoot />
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
          onNavigate={() => {
            // Tick as the rail closes behind a destination tap.
            haptic("selection");
            setIsOpen(false);
          }}
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
          Hamburger, then whatever the page put here — falling back to the page
          name, optically centred, with a trailing size-9 spacer matching the
          button so the label sits in the real middle rather than shifted toward
          the control.

          ── Why this overlays rather than stacks ────────────────────────────
          It used to be a `shrink-0` flex row above the scroller, which meant
          nothing ever passed behind it and an opaque fill was the only way to
          hide the content it did not overlap. A blur needs a backdrop to bend,
          so the bar is now lifted out of the flow and the scroller reclaims the
          full height with an equal `padding-top`. Same geometry, but the thread
          now runs underneath and softens as it goes.
        */}
        <header
          className={cx(
            "absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-3 xl:hidden",
            "h-[calc(3.5rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]",
            "transition-[border-radius] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            isOpen ? "rounded-tl-3xl" : "rounded-none",
          )}
        >
          {/*
            Tint first, blur second, both behind the controls. The tint is what
            keeps a dense paragraph from reading as grey mush under the
            hamburger; the blur is what removes the bar's own edge. Painted in
            this order the blur samples the tint too, which is what stops the
            gradient from banding against the sharp content below it.
          */}
          <span
            aria-hidden
            className={cx(
              "absolute inset-0 -z-10",
              "bg-linear-to-b from-background-full via-background-full/72 to-transparent",
              isOpen ? "rounded-tl-3xl" : "rounded-none",
            )}
          />
          <ProgressiveBlur
            side="top"
            className={cx("-z-10", isOpen ? "rounded-tl-3xl" : "rounded-none")}
          />

          <button
            type="button"
            aria-label={isOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isOpen}
            aria-controls="mobile-catalog-nav"
            onClick={() => {
              haptic("selection");
              setIsOpen((open) => !open);
            }}
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
          {/*
            `contents` so a claiming page's own children become flex items of
            the bar directly, and lay out against the hamburger without an
            intermediate box to fight over width.
          */}
          <div ref={setHeaderSlot} data-mobile-header-slot className="peer contents" />

          {/*
            The fallback, and it hides itself. `peer-[:not(:empty)]` reads the
            slot's own child list, so the page name disappears in the very
            commit that fills the slot rather than an effect later — which is
            the difference between a clean swap and one frame of "Home" wedged
            against a breadcrumb. Both halves need the class: `~` only reaches
            forward, and the spacer is a separate sibling.
          */}
          <p
            className={cx(
              "min-w-0 flex-1 truncate text-center text-title-3-semibold -tracking-[0.01em] text-text-primary",
              "peer-[:not(:empty)]:hidden",
            )}
          >
            {pageName}
          </p>
          <span className="size-9 shrink-0 peer-[:not(:empty)]:hidden" aria-hidden />
        </header>
        {/*
          The page. `min-h-0` is the flex shrink so this column, not the
          document, takes the overflow. The rail is a parked sibling and
          never enters this scroller.
        */}
        <div
          className={cx(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-none",
            // Exactly the overlaid bar's height, so the resting layout is
            // unchanged and only the scrolled-under state differs. Zeroed at
            // `xl`, where the bar is hidden and the desktop rail takes over.
            "pt-[calc(3.5rem+env(safe-area-inset-top,0px))] xl:pt-0",
            // Room to scroll the last card out from under the FAB. Only below
            // `xl`: at desktop the button sits in the empty margin beside a
            // centred column, and padding here would be a hole under it.
            activeNav !== "chat" &&
              "max-xl:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]",
            className,
          )}
          style={style}
        >
          <MobileHeaderSlotProvider node={headerSlot}>{children}</MobileHeaderSlotProvider>
        </div>
      </div>

      {/*
        Sibling of the transformed card, not a child of it. `position: fixed`
        inside that card would ride the rail's `translate3d` and leave the
        viewport. Hidden on `/chat` (the page already is the box) and while
        the rail is open (the Chat row is on screen, covering this would be
        a second copy of the same door).
      */}
      <ChatFab hidden={isOpen || activeNav === "chat"} />
    </div>
  );
}
