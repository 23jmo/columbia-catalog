"use client";

import Link from "next/link";
import { Fragment, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { RiCloseLine, RiLockLine, RiSideBarFill } from "@remixicon/react";

import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { AccountMenu } from "@/components/shell/account-menu";
import { ChatThreadList } from "@/components/shell/chat-thread-list";
import { SHELL_NAV_ITEMS, type ShellNavKey } from "@/components/shell/nav";
import { TermSwitcher } from "@/components/shell/term-switcher";
import { SidebarSecondaryNav } from "@/components/shell/sidebar-secondary-nav";
import { SignInModal } from "@/components/shell/sign-in-modal";
import { useDrawerPush } from "@/components/shell/use-drawer-push";
import { useSessionAccount } from "@/hooks/use-session-account";
import { isGuestAllowedPath } from "@/lib/onboarding/guest-gate";
import { cx } from "@/utils/cx";

/**
 * LionPlan sidebar — BoardUI `DashboardSidebar` structure with catalog
 * destinations, term switcher, and account menu.
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

function Collapsible({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={cx(
        /*
         * Only the opacity is animated. The `max-w-0` below still applies when
         * collapsed -- it just snaps rather than easing, and `overflow-hidden`
         * clips the label either way. Easing it added a layout animation to the
         * app's second most frequent interaction while carrying no information
         * the fade does not already carry.
         */
        "flex min-w-0 items-center overflow-hidden transition-opacity duration-150 ease-out motion-reduce:transition-none",
        collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100",
      )}
    >
      {children}
    </span>
  );
}

/**
 * A rail row — a link, or a locked button that asks for an account.
 *
 * `locked` is what a signed-out visitor sees on every destination except the
 * catalog. It renders a `<button>` rather than a `<Link>` on purpose: the
 * middleware would 307 the click to `/onboarding` anyway, and a navigation
 * that ends somewhere other than the label promised reads as the app losing
 * your place. Refusing the trip and explaining why, in place, is the honest
 * version of the same rule.
 *
 * The row keeps its full colour rather than dimming. A greyed-out tab says
 * "broken"; a lit tab with a padlock says "there is something here" — which is
 * true, and is the whole reason a guest would sign in.
 */
function NavItem({
  icon: Icon,
  label,
  href,
  isSelected = false,
  collapsed = false,
  locked = false,
  onNavigate,
  onLockedClick,
}: {
  icon: IconComponent;
  label: string;
  href: string;
  isSelected?: boolean;
  collapsed?: boolean;
  locked?: boolean;
  onNavigate?: () => void;
  onLockedClick?: () => void;
}) {
  const className = cx(
    "flex items-center overflow-hidden rounded-2lg p-2 text-left",
    "transition-colors duration-150 ease-out motion-reduce:transition-none",
    "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
    collapsed ? "size-9 justify-center" : "w-full",
    isSelected
      ? "bg-linear-to-b from-accent-500 to-accent-600 shadow-nav-selected"
      : "hover:bg-background-secondary-hover",
  );

  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          className={cx("size-5 shrink-0", isSelected ? "text-white" : "text-foreground-icon-secondary")}
          aria-hidden
        />
        <Collapsible collapsed={collapsed}>
          <span
            className={cx(
              "text-body-medium whitespace-nowrap",
              isSelected ? "text-white" : "text-text-secondary",
            )}
          >
            {label}
          </span>
        </Collapsible>
      </span>
      {locked && !collapsed ? (
        <RiLockLine
          className="ml-auto size-4 shrink-0 text-foreground-icon-tertiary"
          aria-hidden
        />
      ) : null}
    </>
  );

  if (locked) {
    return (
      <button
        type="button"
        onClick={onLockedClick}
        // The padlock is decorative, so the row has to say in words that this
        // is a sign-in prompt and not the destination it names.
        aria-label={`${label} — sign in to open`}
        title={collapsed ? `${label} — sign in to open` : undefined}
        className={cx(className, "cursor-pointer")}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isSelected ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={className}
    >
      {body}
    </Link>
  );
}

export interface CatalogSidebarProps {
  activeNav: ShellNavKey;
  mobile?: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
  /** Flush panel for the mobile push rail instead of the floating card. */
  flat?: boolean;
  fluid?: boolean;
  className?: string;
}

export function CatalogSidebar({
  activeNav,
  mobile = false,
  onClose,
  onNavigate,
  flat = false,
  fluid = false,
  className,
}: CatalogSidebarProps) {
  /*
    The rail collapses itself while a course drawer is pushing.

    Opening a drawer takes ~454px off the page, and with the rail at its full
    260px there was not enough left for the results to stay readable — the list
    hit its 480px floor and the rest of it went under the panel. Collapsing to
    the 60px icon rail hands back exactly 200px, which is the difference
    between "beside the drawer" and "behind it" from 1152px up.

    Clicking the toggle means two different things depending on when you do it,
    so it is two pieces of state rather than one.

    `userCollapsed` is a standing preference: collapse it with no drawer open
    and it stays collapsed through as many drawers as you like. Folding that
    into a single override would quietly break the toggle — the preference got
    cleared the first time a drawer closed.

    `episodeOverride` is a click made *while* a drawer is pushing, and it only
    outlives that one drawer. Clearing it on the transition is what makes it an
    episode: comparing the value against `drawerPushing` cannot, because the
    two states alternate, so an override from one drawer session matches again
    on the next and the rail silently stops collapsing. Comparing against the
    previous render instead is React's own "adjusting state when a prop
    changes" pattern — setState during render, which React re-runs before
    committing, so there is no effect to lint and no frame at the wrong width.

      standing collapse, then a whole drawer cycle -> still collapsed
      expand while the drawer is open              -> expands, that drawer only
      close and reopen                             -> collapses again
  */
  /*
    Which rows are locked, and why the rail is the one asking.

    `/search` is open to guests (`lib/onboarding/guest-gate.ts`), and it is the
    only app-shell route that is — so a signed-out visitor reading the catalog
    is one click away from three tabs the middleware would bounce. Reading the
    gate itself rather than hard-coding "everything except Catalog" is what
    keeps this honest: open another route there and its tab unlocks in the same
    commit, with nothing here to remember.

    `isLoading` matters more than it looks. `useSessionAccount` starts null and
    resolves in an effect, so treating "no account yet" as guest would slap a
    padlock on every tab for a frame on every page load, for people who are
    signed in. Locking only once the answer has actually arrived costs a beat
    of nothing and never lies.
  */
  const session = useSessionAccount();
  const isGuest = !session.isLoading && !session.account;
  const [gatedLabel, setGatedLabel] = useState<string | null>(null);

  const drawerPushing = useDrawerPush();
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [episodeOverride, setEpisodeOverride] = useState<boolean | null>(null);
  const [lastPush, setLastPush] = useState(drawerPushing);
  if (lastPush !== drawerPushing) {
    setLastPush(drawerPushing);
    setEpisodeOverride(null);
  }
  const collapsed = mobile ? false : (episodeOverride ?? (userCollapsed || drawerPushing));

  const toggleCollapsed = () => {
    const next = !collapsed;
    if (drawerPushing) setEpisodeOverride(next);
    else setUserCollapsed(next);
  };

  return (
    <aside
      className={cx(
        "flex h-full shrink-0 flex-col justify-between overflow-hidden",
        flat
          ? "bg-background-secondary-default"
          : "rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar",
        "transition-[width] ease-out motion-reduce:transition-none",
        // The width collapse relayouts this subtree on every frame. Containment
        // keeps that recalc from escaping into the results column beside it.
        "[contain:layout_paint]",
        collapsed
          ? "w-[60px] px-[11px] py-3"
          : fluid
            ? "w-full p-3 lg:w-[260px]"
            : "w-[260px] p-3",
        className,
      )}
      style={{
        // Ride the drawer's clock when the drawer is what moved us, so the rail
        // and the panel settle together instead of the nav still easing 200ms
        // after the panel has arrived. Absent on every page that has never
        // opened one, which is where the 300ms manual-toggle feel comes from.
        transitionDuration: "var(--drawer-push-duration, 300ms)",
      }}
    >
      <div className="-m-2 flex min-h-0 w-[calc(100%+16px)] flex-col gap-3 overflow-y-auto p-2 [scrollbar-width:none]">
        {/* Account + collapse — mirrors BoardUI header row */}
        <div
          className={cx(
            "flex w-full",
            collapsed
              ? "flex-col-reverse items-start justify-center gap-2.5"
              : "flex-row items-center justify-between gap-2",
          )}
        >
          <AccountMenu appearance="sidebar" compact={collapsed} />

          {mobile ? (
            onClose ? (
              <button
                type="button"
                aria-label="Close navigation"
                onClick={onClose}
                className="cursor-pointer text-foreground-icon-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <RiCloseLine className="size-5" aria-hidden />
              </button>
            ) : null
          ) : (
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={toggleCollapsed}
              className={cx(
                "shrink-0 cursor-pointer text-foreground-icon-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                collapsed && "flex size-9 items-center justify-center",
              )}
            >
              <RiSideBarFill
                className={cx(
                  "size-5 transition-transform duration-150 ease-out motion-reduce:transition-none",
                  !collapsed && "-scale-x-100",
                )}
                aria-hidden
              />
            </button>
          )}
        </div>

        {collapsed ? (
          <TermSwitcher appearance="sidebar" compact className="size-9 justify-center px-2" />
        ) : (
          <TermSwitcher appearance="sidebar" />
        )}

        <nav className={cx("flex w-full flex-col gap-1", !collapsed && "px-0.5")} aria-label="Primary">
          {SHELL_NAV_ITEMS.map((item) => {
            const locked = isGuest && !isGuestAllowedPath(item.href);
            return (
            <Fragment key={item.key}>
              <NavItem
                icon={item.icon}
                label={item.label}
                href={item.href}
                isSelected={item.key === activeNav}
                collapsed={collapsed}
                locked={locked}
                onNavigate={onNavigate}
                onLockedClick={() => setGatedLabel(item.label)}
              />
              {/*
                Threads hang off Chat the way files hang off a folder.

                They hung off Home until now, and that was correct exactly as
                long as Home WAS the chat — the box lived at `/` and the
                threads were that page's history. Home is the recommendations
                now, so the list was filed under a page it has nothing to do
                with: clicking a thread from under "Recommendations" navigated
                to `/chat`, and the rail was the only thing still claiming
                otherwise.

                Hidden when the rail is collapsed — five truncated titles at
                60px wide are not a list, they are noise.
              */}
              {item.key === "chat" && !collapsed && !locked ? (
                <Suspense fallback={null}>
                  <ChatThreadList onNavigate={onNavigate} />
                </Suspense>
              ) : null}
            </Fragment>
            );
          })}
        </nav>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-3 pt-2">
        <SidebarSecondaryNav collapsed={collapsed} />
        {collapsed ? <ThemeToggle collapsed /> : <ThemeToggle appearance="sidebar-segmented" />}
      </div>

      {/*
        Named after the tab they reached for, so the dialog answers the click
        instead of restating the product. `next="/onboarding"`: they have not
        told us anything about their degree yet, and Saved, Chat and
        Recommendations are all empty rooms until they do.
      */}
      <SignInModal
        isOpen={gatedLabel !== null}
        onClose={() => setGatedLabel(null)}
        next="/onboarding"
        title={gatedLabel ? `${gatedLabel} needs an account` : "Sign in with Columbia"}
        description={
          <>
            Browsing the catalog is free and always will be. Sign in with your Columbia
            or Barnard Google account and we&rsquo;ll set up your degree in about a
            minute — then Recommendations, Chat and Saved are yours.
          </>
        }
        actionLabel="Continue with your UNI"
      />
    </aside>
  );
}
