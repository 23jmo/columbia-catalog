"use client";

import { useState } from "react";
import { RiArrowRightSLine, RiLoginBoxLine } from "@remixicon/react";
import { Avatar } from "@/components/base/avatar/avatar";
import {
  Dropdown,
  DropdownDivider,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { ChevronUpDownSmall } from "@/components/foundations/icons/chevrons";
import { useSessionAccount } from "@/hooks/use-session-account";
import { signOut } from "@/lib/db/auth";
import { SignInModal } from "@/components/shell/sign-in-modal";
import { SignInPromptCard } from "@/components/shell/sign-in-prompt-card";
import { cx } from "@/utils/cx";

/**
 * The account surface.
 *
 * Spec §15 is the whole design brief here: **read is free, write needs an
 * account**. So this control never gates browsing, never wraps the app in a
 * session check, and never redirects. It is a persistent affordance that says
 * "sign in when you want to save something", and nothing more.
 *
 * Wired to Supabase Google SSO, restricted to `columbia.edu` / `barnard.edu`
 * (spec §15). The session comes from `useSessionAccount()` rather than a prop
 * so the root layout can stay static — see that hook for why.
 *
 * The `account` / `onSignIn` / `onSignOut` props remain as overrides. They are
 * what Storybook and the tests drive, and they let a caller render a specific
 * state without a live session.
 *
 * The dialog itself is `components/shell/sign-in-modal.tsx`. It moved out of
 * this file when the catalog opened to guests: the nav rail and the results
 * banner both raise it now, and one Columbia/Barnard promise is easier to keep
 * honest than three.
 */

/** Narrow local shape. The real session type belongs to the auth lane. */
export interface ShellAccount {
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface AccountMenuProps {
  /** `null` (the default today) renders the signed-out affordance. */
  account?: ShellAccount | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  /** Collapse the trigger to an avatar/icon square for narrow bars. */
  compact?: boolean;
  /** Header row in the sidebar — single-line name, no subtitle. */
  appearance?: "default" | "sidebar";
  className?: string;
}

export function AccountMenu({
  account: accountOverride,
  onSignIn,
  onSignOut,
  compact = false,
  appearance = "default",
  className,
}: AccountMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSignInOpen, setIsSignInOpen] = useState(false);

  const session = useSessionAccount();
  // An explicit prop always wins, including an explicit `null` for "render the
  // signed-out state" — hence `undefined` rather than `null` as the default.
  const account = accountOverride !== undefined ? accountOverride : session.account;

  const openSignIn = () => {
    setIsMenuOpen(false);
    setIsSignInOpen(true);
  };

  const endSession = async () => {
    setIsMenuOpen(false);
    if (onSignOut) {
      onSignOut();
      return;
    }
    await signOut();
  };

  const initials = account
    ? account.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
    : null;

  const showLabel = !compact;
  const sidebar = appearance === "sidebar";

  return (
    <>
      <Dropdown isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownTrigger
          aria-label={account ? `Account: ${account.name}` : "Account — not signed in"}
          className={cx(
            "flex min-w-0 touch-manipulation items-center gap-2 transition-colors duration-150 outline-none",
            "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            sidebar
              ? cx(
                  "rounded-full p-1 hover:bg-background-secondary-hover",
                  compact ? "size-9 justify-center p-0 pointer-coarse:size-11" :"min-w-0 flex-1",
                )
              : cx(
                  "rounded-2lg p-1.5 hover:bg-background-secondary-hover",
                  compact ? "size-9 justify-center p-0 pointer-coarse:size-11" :"w-full",
                ),
            className,
          )}
        >
          {account ? (
            <Avatar
              size={sidebar && !compact ? "md" : "sm"}
              src={account.avatarUrl}
              initials={initials ?? undefined}
              alt={account.name}
            />
          ) : (
            <span
              className={cx(
                "flex shrink-0 items-center justify-center rounded-full bg-background-tertiary-default",
                sidebar && !compact ? "size-8" : "size-6",
              )}
            >
              <RiLoginBoxLine className="size-4 text-foreground-icon-secondary" aria-hidden />
            </span>
          )}
          {showLabel ? (
            sidebar ? (
              <span className="flex min-w-0 flex-1 items-center gap-0.5">
                <span className="truncate text-body-medium text-text-primary">
                  {account ? account.name : "Sign in"}
                </span>
                <ChevronUpDownSmall className="size-4 shrink-0 text-foreground-icon-tertiary" />
              </span>
            ) : (
              <span className="flex min-w-0 flex-col items-start">
                <span className="text-body-medium truncate text-text-primary">
                  {account ? account.name : "Not signed in"}
                </span>
                <span className="text-caption-1-regular truncate text-text-tertiary">
                  {account ? account.email : "Browsing is free"}
                </span>
              </span>
            )
          ) : null}
        </DropdownTrigger>

        <DropdownPopover
          aria-label="Account"
          placement={compact ? "bottom end" : sidebar ? "bottom start" : "top start"}
          className={account ? "w-[288px]" : "w-[320px] p-1.5"}
          dialogClassName={account ? undefined : "gap-0"}
        >
          {account ? (
            <>
              {/*
                The identity row is the door to `/profile`.

                It was a static block, and `components/shell/nav.tsx` has said
                all along that profile is reached "from the account menu" — the
                link was simply never there, which left the page unreachable
                from the shell once it came off the rail. Putting it here rather
                than back on the rail is the point: a profile is somewhere you
                go on purpose, under your own name, not a fourth tab competing
                with the three things this product is for.

                Your name and face are already the most profile-shaped thing on
                the screen, so they are the target rather than a "Profile" row
                underneath them. The chevron is what says so before the click.
              */}
              <DropdownGroup>
                <DropdownItem
                  href="/profile"
                  // Controlled menu: navigating does not unmount the popover on
                  // a client-side transition, so it has to be told to close.
                  onSelect={() => setIsMenuOpen(false)}
                  className="px-2 py-1.5"
                >
                  <Avatar
                    size="md"
                    src={account.avatarUrl}
                    initials={initials ?? undefined}
                    alt={account.name}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-medium truncate text-text-primary">
                      {account.name}
                    </span>
                    <span className="text-caption-1-regular truncate text-text-tertiary">
                      {account.email}
                    </span>
                  </span>
                  {/* The row's accessible name is otherwise "<name> <email>",
                      which says who but not where. */}
                  <span className="sr-only">Open your profile</span>
                  <RiArrowRightSLine
                    className="size-4 shrink-0 text-foreground-icon-tertiary"
                    aria-hidden
                  />
                </DropdownItem>
              </DropdownGroup>
              <DropdownDivider />
              <DropdownItem onSelect={() => void endSession()}>
                <span className="text-body-medium text-text-primary">Sign out</span>
              </DropdownItem>
            </>
          ) : isMenuOpen ? (
            <SignInPromptCard onSignIn={openSignIn} />
          ) : null}
        </DropdownPopover>
      </Dropdown>

      {/*
        No `next`: from here the right landing is wherever they already were.
        The catalog's own prompts pass `/onboarding`, because a guest reading
        the course list has not answered anything yet.
      */}
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onContinue={
          onSignIn
            ? () => {
                onSignIn();
                setIsSignInOpen(false);
              }
            : undefined
        }
      />
    </>
  );
}
