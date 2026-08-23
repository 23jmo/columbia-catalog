import type { ReactNode } from "react";
import { AccountMenu } from "@/components/shell/account-menu";
import { MobileNavBar } from "@/components/shell/mobile-nav";
import { ShellNav, type ShellNavKey } from "@/components/shell/nav";
import { TermSwitcher } from "@/components/shell/term-switcher";
import { ShellWordmark } from "@/components/shell/wordmark";
import { PlanSyncProvider } from "@/components/schedule/plan-sync-provider";
import { WatchlistProvider } from "@/components/watch/watchlist-provider";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
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
 *   TermSwitcher   (needs open state + storage)
 *   ThemeToggle    (BoardUI, needs the DOM class)
 *   AccountMenu    (needs open state + the Supabase session)
 *   MobileNavBar   (needs drawer state)
 *
 * Plus `PlanSyncProvider`, which renders nothing at all — it exists only to
 * own the lifecycle of plan write-through sync, which has to start once per
 * browser session and stop cleanly.
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

      {/* Desktop rail. `lg` and up only — below that the mobile bar owns nav. */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col justify-between gap-4 border-r border-border-table bg-background-secondary-default p-3 lg:flex">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto [scrollbar-width:none]">
          <ShellWordmark />
          <TermSwitcher />
          <ShellNav activeNav={activeNav} />
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <ThemeToggle appearance="sidebar-segmented" />
          <div className="h-px w-full bg-separator-border" />
          {/* Reads its own session. Signed-out renders the invitation, not a
              gate — reads are free (spec §15). */}
          <AccountMenu />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNavBar activeNav={activeNav} />
        <main className={cx("min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7", contentClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}
