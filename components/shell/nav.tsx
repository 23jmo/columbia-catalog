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
 * a ranked list cannot anticipate. Catalog is the whole course list, for a
 * student who already knows what they are looking for. Saved is where the
 * survivors wait.
 *
 * Chat sits second, and second is the point. It used to BE the home page, with
 * the recommendations reduced to a rail above the box. That had the burden
 * backwards: "what should I take" is the state of not yet having a question,
 * and an empty box is the worst possible answer to it. The box is now the
 * thing you go to when the list did not cover your case.
 *
 * ── Catalog is the one that came back ──────────────────────────────────────
 *
 * The three finding surfaces are ordered by how much of the question we
 * answer: Recommendations answers it outright, Chat answers it in the
 * student's words, Catalog answers nothing and hands over the whole list. That
 * is the right last resort and the wrong default, which is why it sits third
 * and not first — but it clears the bar below, because a student who arrives
 * knowing they want ECON UN3211 should not have to ask us for it.
 *
 * It is labelled "Catalog" rather than "Search" because the rail names places,
 * not actions: every other item is a noun. The route stays `/search` — links,
 * bookmarks and the assistant's deep links all point at it, and renaming a URL
 * to match a label is a cost paid by everyone who ever saved one.
 *
 * Adding it lit up eight pages that were already declaring `activeNav="search"`
 * and getting nothing for it: every course and instructor page says it too, so
 * the rail now highlights Catalog on a course detail page and the phone's bar
 * titles it "Catalog" instead of "Search". That is the intended reading — a
 * course page is a page of the catalog — and it is worth knowing that this
 * item owns four routes, not one.
 *
 * ── Nothing was deleted ────────────────────────────────────────────────────
 *
 * `/schedule` and `/profile` are untouched routes that still render, still
 * work, and are still linked to from inside the app — profile from the account
 * menu, schedule from a plan. `ShellNavKey` deliberately keeps their keys so
 * those pages can go on declaring `activeNav` without a cast: they are pages
 * you arrive at with a purpose, not places you browse to because the rail
 * suggested it.
 *
 * Putting one back is adding one object here. That is the whole cost, and it
 * should stay that cheap — but the bar is a page a student would go looking
 * for on their own, not a page we are proud of.
 *
 * Renaming one is NOT just this file: on a phone the top bar prints the label
 * for the active page and the page hides its own heading, so a label changed
 * here has to be changed on the page too. `page-name.test.ts` guards the pages
 * that spell both out in `page.tsx`; the catalog spells its heading inside
 * `search-screen.tsx`, which that scan does not reach.
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
    /*
     * "Home" was the only label in this list that named a position instead of
     * a page — and it was doing it above the one screen this whole product is
     * for. A student reading the rail learned that `/` was the first item,
     * which they could already see, and nothing about what was on it.
     *
     * The key stays `home` and the route stays `/`: every page in the app
     * declares `activeNav="home"`, and this is a rename of the word on the
     * button, not of the destination behind it.
     */
    label: "Recommendations",
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
    key: "search",
    /*
     * "Catalog" — the noun — while the route stays `/search`. See the note
     * above on why the label and the URL are allowed to disagree.
     */
    label: "Catalog",
    href: "/search",
    icon: RiSearchLine,
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
