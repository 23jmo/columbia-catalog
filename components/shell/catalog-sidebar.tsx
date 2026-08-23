"use client";

import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { RiCloseLine, RiSearchLine, RiSideBarFill } from "@remixicon/react";

import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { AccountMenu } from "@/components/shell/account-menu";
import { SHELL_NAV_ITEMS, type ShellNavKey } from "@/components/shell/nav";
import { TermSwitcher } from "@/components/shell/term-switcher";
import { cx } from "@/utils/cx";

/**
 * Columbia Catalog sidebar — BoardUI `DashboardSidebar` structure with catalog
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
        "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity] duration-300 ease-in-out motion-reduce:transition-none",
        collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100",
      )}
    >
      {children}
    </span>
  );
}

function NavItem({
  icon: Icon,
  label,
  href,
  isSelected = false,
  collapsed = false,
  onNavigate,
}: {
  icon: IconComponent;
  label: string;
  href: string;
  isSelected?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isSelected ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cx(
        "flex items-center overflow-hidden rounded-2lg p-2",
        "transition-[width,background-color] duration-300 ease-in-out motion-reduce:transition-none",
        collapsed ? "size-9 justify-center" : "w-full",
        isSelected
          ? "bg-linear-to-b from-accent-500 to-accent-600 shadow-nav-selected"
          : "hover:bg-background-secondary-hover",
      )}
    >
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
    </Link>
  );
}

export interface CatalogSidebarProps {
  activeNav: ShellNavKey;
  mobile?: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
  /** Flush panel for the mobile drawer instead of the floating card. */
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
  const [collapsedState, setCollapsed] = useState(false);
  const collapsed = mobile ? false : collapsedState;

  return (
    <aside
      className={cx(
        "flex h-full shrink-0 flex-col justify-between overflow-hidden",
        flat
          ? "border-r border-border-table bg-background-secondary-default"
          : "rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar",
        "transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
        collapsed
          ? "w-[60px] px-[11px] py-3"
          : fluid
            ? "w-full p-3 lg:w-[260px]"
            : "w-[260px] p-3",
        className,
      )}
    >
      <div className="-m-2 flex min-h-0 w-[calc(100%+16px)] flex-col gap-3 overflow-y-auto p-2 [scrollbar-width:none]">
        {/* Account + collapse — mirrors BoardUI header row */}
        <div
          className={cx(
            "flex w-full transition-[gap] duration-300 ease-in-out motion-reduce:transition-none",
            collapsed
              ? "flex-col-reverse items-start justify-center gap-2.5"
              : "flex-row items-center justify-between gap-2",
          )}
        >
          <AccountMenu appearance="sidebar" compact={collapsed} />

          {mobile ? (
            <button
              type="button"
              aria-label="Close navigation"
              onClick={onClose}
              className="cursor-pointer text-foreground-icon-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <RiCloseLine className="size-5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsedState)}
              className={cx(
                "shrink-0 cursor-pointer text-foreground-icon-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                collapsed && "flex size-9 items-center justify-center",
              )}
            >
              <RiSideBarFill
                className={cx(
                  "size-5 transition-transform duration-300 ease-in-out motion-reduce:transition-none",
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

        {!collapsed ? (
          <Link
            href="/search"
            className={cx(
              "flex w-full items-center gap-2 rounded-full bg-background-tertiary-default p-2",
              "text-body-medium text-text-secondary transition-colors duration-150 ease",
              "hover:bg-background-tertiary-hover/55 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiSearchLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
            Search courses
          </Link>
        ) : null}

        <nav className={cx("flex w-full flex-col gap-1", !collapsed && "px-0.5")} aria-label="Primary">
          {SHELL_NAV_ITEMS.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              href={item.href}
              isSelected={item.key === activeNav}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-3 pt-2">
        {collapsed ? <ThemeToggle collapsed /> : <ThemeToggle appearance="sidebar-segmented" />}
      </div>
    </aside>
  );
}
