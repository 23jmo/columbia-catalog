import type { ReactNode } from "react";
import { CatalogSidebar } from "@/components/shell/catalog-sidebar";
import { MobileNavBar } from "@/components/shell/mobile-nav";
import type { ShellNavKey } from "@/components/shell/nav";
import { RefreshWorker } from "@/components/crawler/refresh-worker";
import { PlanSyncProvider } from "@/components/schedule/plan-sync-provider";
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
 * the browser. Only the four genuinely interactive pieces are client
 * components, and they are leaves:
 *
 *   TermSwitcher   (inside CatalogSidebar)
 *   ThemeToggle    (inside CatalogSidebar)
 *   AccountMenu    (inside CatalogSidebar)
 *   CatalogSidebar (collapse state)
 *   MobileNavBar   (drawer state)
 *
 * Plus two components that render nothing at all. `PlanSyncProvider` owns the
 * lifecycle of plan write-through sync, which has to start once per browser
 * session and stop cleanly. `RefreshWorker` is the crawl engine itself (spec
 * §10 — browsers are the engine, cron is the safety net): on idle it fetches
 * due directory pages from the visitor's own browser and posts the bytes back.
 * It belongs here rather than on one route because the whole point is that it
 * runs wherever a reader happens to be, and it stops itself on page hide.
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
      {/* Also renders nothing. Fetches due public directory pages on idle and
          relays them back — the seat data every other surface reads is kept
          fresh by the people reading it. Opt-out is honoured three ways; see
          the component. */}
      <RefreshWorker />

      {/* Desktop rail. `lg` and up only — below that the mobile bar owns nav. */}
      <CatalogSidebar activeNav={activeNav} flat className="sticky top-0 hidden h-dvh lg:flex" />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNavBar activeNav={activeNav} />
        <main className={cx("min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7", contentClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}
