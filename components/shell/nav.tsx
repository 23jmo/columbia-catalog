import Link from "next/link";
import type { ComponentType } from "react";
import {
  RiBookmarkLine,
  RiChat3Line,
  RiCalendarScheduleLine,
  RiGraduationCapLine,
  RiHome5Line,
  RiSearchLine,
} from "@remixicon/react";
import { cx } from "@/utils/cx";

/**
 * The app's top-level destinations.
 *
 * ── Two, because the product is one sentence ───────────────────────────────
 *
 * This list was five: Home, Search, Saved, Schedule, Profile. Each was a
 * defensible page and together they described nothing. A student arriving at a
 * five-item rail has to work out what this app is FOR before it can help them,
 * and the answer — "find classes worth taking, keep the ones you want, hand
 * them to Vergil" — was the one reading the nav did not give.
 *
 * So the rail names the steps of that sentence and nothing else. Home is the
 * recommendations — the answer to "what should I take", given without being
 * asked. Chat is the same question in the student's own words, for everything
 * a ranked list cannot anticipate. Saved is where the survivors wait.
 *
 * Chat sits second, and second is the point. It used to BE the home page, with
 * the recommendations reduced to a rail above the box. That had the burden
 * backwards: "what should I take" is the state of not yet having a question,
 * and an empty box is the worst possible answer to it. The box is now the
 * thing you go to when the list did not cover your case.
 *
 * ── Nothing was deleted ────────────────────────────────────────────────────
 *
 * `/search`, `/schedule` and `/profile` are untouched routes that still render,
 * still work, and are still linked to from inside the app — search from the
 * assistant and from empty states, profile from the account menu, schedule
 * from a plan. `ShellNavKey` deliberately keeps their keys so those pages can
 * go on declaring `activeNav` without a cast: they are pages you arrive at
 * with a purpose, not places you browse to because the rail suggested it.
 *
 * Putting one back is adding one object here. That is the whole cost, and it
 * should stay that cheap — but the bar is a page a student would go looking
 * for on their own, not a page we are proud of.
 *
 * Route ownership note: this module only ever LINKS at routes, so it stays
 * correct whether or not any of them exist.
 */

export type ShellNavKey =
  | "home"
  | "chat"
  | "search"
  | "saved"
  | "schedule"
  | "progression"
  | "profile";

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
    key: "chat",
    label: "Chat",
    href: "/chat",
    icon: RiChat3Line,
  },
  {
    key: "saved",
    label: "Saved",
    href: "/saved",
    icon: RiBookmarkLine,
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
              "flex w-full items-center gap-2 rounded-2lg p-2 transition-colors duration-150",
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
