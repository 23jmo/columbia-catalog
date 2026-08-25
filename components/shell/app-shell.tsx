import type { ReactNode } from "react";
import { CatalogSidebar } from "@/components/shell/catalog-sidebar";
import { MobileShell } from "@/components/shell/mobile-nav";
import type { ShellNavKey } from "@/components/shell/nav";
import { BookmarkProvider } from "@/components/bookmarks/bookmark-provider";
import { RefreshWorker } from "@/components/crawler/refresh-worker";
import { PlanSyncProvider } from "@/components/schedule/plan-sync-provider";
import { Toaster } from "@/components/toast/toaster";
import { WatchlistProvider } from "@/components/watch/watchlist-provider";
import { cx } from "@/utils/cx";

/**
 * The persistent chrome every screen wraps itself in.
 *
 *   <AppShell activeNav="search">…</AppShell>
 *
 * That is the entire API. `activeNav` only decides which nav item is lit; it
 * has no other effect, so a route can pass it and forget about it.
 *
 * This file is a **server component** on purpose. The rail's structure, the
 * links, and the page frame are all static markup that never needs to reach
 * the browser. Only the genuinely interactive pieces are client
 * components, and they are leaves:
 *
 *   TermSwitcher   (inside CatalogSidebar)
 *   ThemeToggle    (inside CatalogSidebar)
 *   AccountMenu    (inside CatalogSidebar)
 *   CatalogSidebar (collapse state)
 *   MobileShell    (hamburger push on phone and tablet)
 *
 * Plus components that render nothing until something asks them to.
 * `PlanSyncProvider` owns the lifecycle of plan write-through sync, which has
 * to start once per browser session and stop cleanly. `RefreshWorker` is the
 * crawl engine itself (spec §10 — browsers are the engine, cron is the safety
 * net): on idle it fetches due directory pages from the visitor's own browser
 * and posts the bytes back. It belongs here rather than on one route because
 * the whole point is that it runs wherever a reader happens to be, and it
 * stops itself on page hide. `Toaster` is the single toast surface — mounted
 * once so a confirmation appears in the same place whichever screen raised it,
 * and so two screens can never stack two competing stacks.
 *
 * `children` therefore stays a server subtree — a route's async data fetching
 * is not forced into the client by wrapping itself in the shell.
 */

export type { ShellNavKey };

export interface AppShellProps {
  children: ReactNode;
  /** Which top-level destination is lit in the nav. Defaults to `home`. */
  activeNav?: ShellNavKey;
  /** Extra classes on the <main> content column. */
  contentClassName?: string;
}

export function AppShell({ children, activeNav = "home", contentClassName }: AppShellProps) {
  return (
    <div className="flex min-h-dvh w-full bg-background-full">
      {/* Renders nothing. Keeps localStorage plans and Supabase in step for a
          signed-in student, and claims anonymous plans on first sign-in. */}
      <PlanSyncProvider />
      <WatchlistProvider />
      {/* Also nothing on screen. Keeps saved classes tied to the signed-in
          identity, and mirrors the watch cascade into the watchlist store. */}
      <BookmarkProvider />
      {/* Also renders nothing. Fetches due public directory pages on idle and
          relays them back — the seat data every other surface reads is kept
          fresh by the people reading it. Opt-out is honoured three ways; see
          the component. */}
      <RefreshWorker />
      {/* The one toast surface. Top-center, portalled to <body>, so a
          confirmation is in the same place whichever screen raised it. */}
      <Toaster />

      {/* Desktop rail — floating panel. `xl`, not `lg`: 1024px is still a tablet. */}
      <div className="sticky top-0 hidden h-dvh shrink-0 p-3 xl:block">
        <CatalogSidebar activeNav={activeNav} className="h-full" />
      </div>

      {/*
        The right edge yields to the section rail — and stops yielding at 34rem.

        ── The channel ───────────────────────────────────────────────────────
        When the drawer opens as a rail it writes its footprint to
        `--drawer-rail` on `<html>`, and this column reserves that much of its
        own width. The two never import each other: the drawer lives in the
        `@drawer` slot, a sibling of `{children}` in the root layout, so there
        is no prop path between them and a custom property is the channel they
        already share. The fallback `0px` keeps every page that has never
        opened a drawer fully specified — no class toggling, nothing to clean
        up if a panel unmounts abruptly.

        Padding rather than a transform: the results genuinely have less room
        and should re-wrap into it. A transform would slide the column leftward
        under the nav instead, hiding content rather than fitting it.

        `lg:` on both because that is the only width where pushing leaves a
        usable list — below it the panel is an overlay and must not move
        anything, and an unconditional floor would put a horizontal scrollbar
        on every phone.

        ── The floor ─────────────────────────────────────────────────────────
        The nav rail is `shrink-0`, so the entire squeeze lands here. With
        plain `min-w-0` there was no bottom to it: at a 1024px viewport the
        rail takes ~454px and the nav 284px, leaving this column 286px — titles
        wrapping to three lines and an enrollment column sitting on top of the
        text, at the exact moment the list is being read against the drawer
        beside it. Below the floor the page scrolls horizontally instead of
        compressing further; a scrollbar is a recoverable inconvenience, an
        unreadable list is not.

        34rem = 544px = a 480px content measure plus this column's own `lg:px-8`
        gutters. 480px is where a search row still reads: title on one line,
        the code/credits line intact, the 168px meter column clear of the text.

        ── Why both live on THIS box ─────────────────────────────────────────
        The reservation used to be `padding-right` on the shell root, and the
        floor cannot work from there: a parent's padding always absorbs its own
        children's overflow. At 1024 the line needed 284 + 544 = 828px inside a
        570px content box — a real 258px overflow, but 828 is still inside the
        root's 1024px border box, so `scrollWidth` never grew and the overflow
        just sat under the fixed panel. Correct width, invisible.

        Held here the nav becomes a *sibling* that adds to the flex line
        instead of a child that shares a padded box: 284 + (544 + 454) = 1282
        against a 1024px viewport, so the document really does overflow.
        `min-width` therefore has to carry the rail too — it is a border-box
        floor, and a bare 34rem would be eaten by the padding.

        The numbers land exactly: at full scroll the column's content sits
        flush against the panel's left edge, because the floor IS the content
        measure plus its gutters.
      */}
      <MobileShell
        activeNav={activeNav}
        className={cx(
          "transition-[padding,min-width] motion-reduce:transition-none",
          "lg:[padding-right:var(--drawer-rail,0px)] lg:[min-width:calc(34rem+var(--drawer-rail,0px))]",
        )}
        style={{
          // Instant: the drawer does not animate, so the page must not ease
          // around it either. The variable still exists so a drag can zero it
          // independently, but the fallback is already 0.
          transitionDuration: "var(--drawer-push-duration, 0ms)",
          transitionTimingFunction: "var(--drawer-push-ease, linear)",
        }}
      >
        <main
          className={cx(
            "min-w-0 flex-1 overflow-x-clip px-4 py-5 sm:px-6 xl:overflow-x-visible xl:px-8 xl:py-7",
            contentClassName,
          )}
        >
          {children}
        </main>
      </MobileShell>
    </div>
  );
}
