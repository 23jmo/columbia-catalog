/**
 * The "no plan yet" surface.
 *
 * Spec §5: *"Empty state (no plan yet) becomes a search-forward prompt rather
 * than an empty grid."* This is the default state of the product for anyone who
 * has not signed in, so it is designed as a destination and not as an apology —
 * it is the first thing most visitors see.
 *
 * Spec §15 governs the buttons: reads are free, the first schedule **write** is
 * where the account is required. So "Save a plan" is rendered, visibly, and
 * explains why it is inert — hiding it would misrepresent the product as
 * account-gated when browsing is not.
 */

import Link from "next/link";
import {
  RiCalendarScheduleLine,
  RiEyeLine,
  RiLoginBoxLine,
  RiSearchLine,
} from "@remixicon/react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export interface NoPlanStateProps {
  termLabel: string;
  /**
   * TODO(auth): pass the real session state. `false` — the default — is
   * correct today because Supabase SSO is not wired up yet.
   */
  isSignedIn?: boolean;
  /** Link that turns the built-in sample plan on, so the screen can be judged. */
  sampleHref?: string;
  className?: string;
}

const WHAT_A_PLAN_DOES = [
  {
    icon: RiCalendarScheduleLine,
    title: "See the week, not a list",
    body: "Sections land on a canvas with overlaps and cross-campus walks flagged where they happen.",
  },
  {
    icon: RiEyeLine,
    title: "Hedge with more than one plan",
    body: "Name them — “Plan A”, “if I don’t get Op Systems” — and mark one primary. Primary is what this screen shows.",
  },
];

export function NoPlanState({
  termLabel,
  isSignedIn = false,
  sampleHref,
  className,
}: NoPlanStateProps) {
  return (
    <section
      className={cx(
        "flex w-full min-w-0 flex-col gap-5 rounded-[20px] bg-background-secondary-default p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <span className="flex size-10 items-center justify-center rounded-2lg bg-stat-card-icon-background">
          <RiCalendarScheduleLine className="size-5 text-foreground-icon-primary" aria-hidden />
        </span>
        <h2 className="text-title-2-medium text-text-primary">No plan for {termLabel} yet</h2>
        <p className="text-body-regular max-w-prose text-text-secondary">
          Start from a course. Search is free, needs no account, and runs entirely on
          your machine — every filter is instant because the catalog is already here.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href="/search" leadingIcon={RiSearchLine}>
          Search the catalog
        </ButtonLink>
        {sampleHref && (
          <ButtonLink href={sampleHref} variant="secondary" leadingIcon={RiEyeLine}>
            Preview with a sample plan
          </ButtonLink>
        )}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {WHAT_A_PLAN_DOES.map((item) => (
          <li
            key={item.title}
            className="flex flex-col gap-1.5 rounded-2lg bg-background-inner-default p-3"
          >
            <span className="flex items-center gap-2">
              <item.icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <span className="text-body-medium text-text-primary">{item.title}</span>
            </span>
            <span className="text-caption-1-regular text-text-secondary">{item.body}</span>
          </li>
        ))}
      </ul>

      {/* The write wall, stated once and plainly (spec §15). Rendered, not hidden. */}
      {!isSignedIn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2lg bg-background-inner-default p-3">
          <p className="text-caption-1-regular min-w-0 flex-1 text-text-secondary">
            Saving a plan is the first thing here that needs an account. Everything
            else — search, course pages, ratings, seat history — stays free.
            {/* TODO(auth): drop this sentence once Supabase Google SSO is wired. */}{" "}
            Sign-in is not connected yet, so this button does nothing.
          </p>
          <Button
            variant="secondary"
            leadingIcon={RiLoginBoxLine}
            disabled
            aria-describedby="no-plan-signin-note"
          >
            Save a plan
          </Button>
          <span id="no-plan-signin-note" className="sr-only">
            Requires an account. Sign-in is not connected yet.
          </span>
        </div>
      )}

      <p className="text-caption-1-regular text-text-tertiary">
        Already have a plan somewhere else?{" "}
        <Link
          href="/schedule"
          className="rounded text-text-secondary underline underline-offset-2 outline-none transition-colors duration-150 ease hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Build it on the schedule canvas
        </Link>
        .
      </p>
    </section>
  );
}
