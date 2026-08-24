import Link from "next/link";
import type { ComponentType } from "react";
import {
  RiCalendarScheduleLine,
  RiGraduationCapLine,
  RiHome5Line,
  RiSearchLine,
} from "@remixicon/react";
import { cx } from "@/utils/cx";

/**
 * The app's top-level destinations (spec §4). `/course/[id]` is deliberately
 * absent: it is a drawer over search, not a nav destination.
 *
 * `/profile` is last because it is the only one that needs an account. It still
 * sits in the primary nav rather than behind the account menu: a degree audit
 * is a destination a student comes back to, and burying it in a dropdown would
 * make it feel like a settings page. Signed out it renders an explanation
 * rather than an auth wall, so linking at it unconditionally is safe.
 *
 * Route ownership note: `/search` and `/schedule` are built by other lanes.
 * This module only ever links at them, so it stays correct whether or not
 * those routes exist yet.
 */

export type ShellNavKey = "home" | "search" | "schedule" | "profile";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface ShellNavItem {
  key: ShellNavKey;
  label: string;
  href: string;
  icon: IconComponent;
}

export const SHELL_NAV_ITEMS: ShellNavItem[] = [
  {
    key: "home",
    label: "Home",
    href: "/",
    icon: RiHome5Line,
  },
  {
    key: "search",
    label: "Search",
    href: "/search",
    icon: RiSearchLine,
  },
  {
    key: "schedule",
    label: "Schedule",
    href: "/schedule",
    icon: RiCalendarScheduleLine,
  },
  {
    key: "profile",
    label: "Profile",
    href: "/profile",
    icon: RiGraduationCapLine,
  },
];

export interface ShellNavProps {
  activeNav: ShellNavKey;
  /** Fires after a nav item is chosen, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  className?: string;
}

/**
 * Plain links, no client state — the active item is passed in by the route so
 * this renders on the server wherever the host component allows it.
 */
export function ShellNav({ activeNav, onNavigate, className }: ShellNavProps) {
  return (
    <nav aria-label="Primary" className={cx("flex w-full flex-col gap-1", className)}>
      {SHELL_NAV_ITEMS.map((item) => {
        const selected = item.key === activeNav;
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={selected ? "page" : undefined}
            className={cx(
              "flex w-full items-center gap-2 rounded-2lg p-2 transition-colors duration-150 ease",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              selected
                ? "bg-linear-to-b from-accent-500 to-accent-600 shadow-nav-selected"
                : "hover:bg-background-secondary-hover",
            )}
          >
            <item.icon
              className={cx(
                "size-5 shrink-0",
                selected ? "text-white" : "text-foreground-icon-secondary",
              )}
              aria-hidden
            />
            <span
              className={cx(
                "text-body-medium whitespace-nowrap",
                selected ? "text-white" : "text-text-secondary",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
