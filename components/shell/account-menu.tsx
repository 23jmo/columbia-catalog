"use client";

import { useState } from "react";
import {
  RiCheckLine,
  RiInformationLine,
  RiLoginBoxLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Divider } from "@/components/base/divider/divider";
import {
  Dropdown,
  DropdownDivider,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { SocialButton } from "@/components/base/social-button/social-button";
import { cx } from "@/utils/cx";

/**
 * The account surface.
 *
 * Spec §15 is the whole design brief here: **read is free, write needs an
 * account**. So this control never gates browsing, never wraps the app in a
 * session check, and never redirects. It is a persistent affordance that says
 * "sign in when you want to save something", and nothing more.
 *
 * TODO(auth): nothing below is wired. When the auth lane lands, Supabase
 * Google SSO restricted to the `columbia.edu` / `barnard.edu` hosted domains
 * (spec §15) replaces `startColumbiaSignIn` and supplies the signed-in
 * account. The seams are:
 *
 *   - `account`      — pass the signed-in student; `null` renders signed-out.
 *   - `onSignIn`     — replace with `supabase.auth.signInWithOAuth({...})`.
 *   - `onSignOut`    — replace with `supabase.auth.signOut()`.
 *
 * Deliberately NOT used: `components/application/auth/auth-card.tsx`. That card
 * always renders an email + password form, and this product has exactly one
 * sign-in method. Shipping a dead password field would be a lie about how the
 * product works, so the card's provider half — `SocialButton` — is used on its
 * own inside a modal that matches the card's surface treatment.
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
  className?: string;
}

const WRITE_ACTIONS = [
  "Save a plan and add sections to it",
  "Watch a section and get an email when a seat opens",
  "Connect an MCP client to your own schedule",
];

export function AccountMenu({
  account = null,
  onSignIn,
  onSignOut,
  compact = false,
  className,
}: AccountMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSignInOpen, setIsSignInOpen] = useState(false);

  const openSignIn = () => {
    setIsMenuOpen(false);
    setIsSignInOpen(true);
  };

  // TODO(auth): hand off to Supabase Google SSO. Until then this only closes
  // the dialog, so nothing in the UI pretends a session exists.
  const startColumbiaSignIn = () => {
    onSignIn?.();
    setIsSignInOpen(false);
  };

  const initials = account
    ? account.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
    : null;

  return (
    <>
      <Dropdown isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownTrigger
          aria-label={account ? `Account: ${account.name}` : "Account — not signed in"}
          className={cx(
            "flex items-center gap-2 rounded-2lg p-1.5 transition-colors duration-150 ease",
            "hover:bg-background-secondary-hover",
            compact ? "size-9 justify-center p-0" : "w-full",
            className,
          )}
        >
          {account ? (
            <Avatar
              size="sm"
              src={account.avatarUrl}
              initials={initials ?? undefined}
              alt={account.name}
            />
          ) : (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default">
              <RiLoginBoxLine className="size-4 text-foreground-icon-secondary" aria-hidden />
            </span>
          )}
          {!compact && (
            <span className="flex min-w-0 flex-col items-start">
              <span className="text-body-medium truncate text-text-primary">
                {account ? account.name : "Not signed in"}
              </span>
              <span className="text-caption-1-regular truncate text-text-tertiary">
                {account ? account.email : "Browsing is free"}
              </span>
            </span>
          )}
        </DropdownTrigger>

        <DropdownPopover
          aria-label="Account"
          placement={compact ? "bottom end" : "top start"}
          className="w-[288px]"
        >
          {account ? (
            <>
              <DropdownGroup>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Avatar
                    size="md"
                    src={account.avatarUrl}
                    initials={initials ?? undefined}
                    alt={account.name}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body-medium truncate text-text-primary">
                      {account.name}
                    </span>
                    <span className="text-caption-1-regular truncate text-text-tertiary">
                      {account.email}
                    </span>
                  </span>
                </div>
              </DropdownGroup>
              <DropdownDivider />
              <DropdownItem
                onSelect={() => {
                  setIsMenuOpen(false);
                  onSignOut?.();
                }}
              >
                <span className="text-body-medium text-text-primary">Sign out</span>
              </DropdownItem>
            </>
          ) : (
            <>
              <DropdownGroup>
                <div className="flex flex-col gap-1 px-2 pt-1 pb-2">
                  <p className="text-body-medium text-text-primary">
                    Everything you can read is free
                  </p>
                  <p className="text-caption-1-regular text-text-secondary">
                    Search, course pages, ratings and seat history need no account. Sign
                    in only when you want to save something.
                  </p>
                </div>
              </DropdownGroup>
              <DropdownDivider />
              <DropdownGroup label="An account adds">
                <ul className="flex flex-col gap-1 px-2 pb-1">
                  {WRITE_ACTIONS.map((action) => (
                    <li key={action} className="flex items-start gap-2">
                      <RiCheckLine
                        className="mt-0.5 size-4 shrink-0 text-foreground-icon-tertiary"
                        aria-hidden
                      />
                      <span className="text-caption-1-regular text-text-secondary">{action}</span>
                    </li>
                  ))}
                </ul>
              </DropdownGroup>
              <DropdownDivider />
              <div className="px-1 pb-0.5">
                <Button className="w-full" leadingIcon={RiLoginBoxLine} onClick={openSignIn}>
                  Sign in with Columbia
                </Button>
              </div>
            </>
          )}
        </DropdownPopover>
      </Dropdown>

      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onContinue={startColumbiaSignIn}
      />
    </>
  );
}

function SignInModal({
  isOpen,
  onClose,
  onContinue,
}: {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className={cx(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]",
        "transition-opacity duration-200 ease-out",
        "data-[entering]:opacity-0 data-[exiting]:opacity-0",
      )}
    >
      <AriaModal
        className={cx(
          "w-full max-w-[400px] outline-none",
          "transition duration-200 ease-out",
          "data-[entering]:scale-95 data-[entering]:opacity-0 data-[entering]:blur-[3px]",
          "data-[exiting]:scale-95 data-[exiting]:opacity-0 data-[exiting]:blur-[3px]",
        )}
      >
        <AriaDialog
          aria-label="Sign in to Columbia Catalog"
          className="relative flex w-full flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs outline-none sm:p-8 dark:bg-background-secondary-default"
        >
          <CloseButton
            size="2xs"
            aria-label="Close sign in"
            onClick={onClose}
            className="absolute top-4 right-4"
          />

          <span className="mb-5 flex size-10 items-center justify-center rounded-2lg bg-stat-card-icon-background">
            <RiShieldCheckLine className="size-5 text-foreground-icon-primary" aria-hidden />
          </span>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-title-2-medium text-text-primary">Sign in with Columbia</h2>
            <p className="text-body-regular text-text-secondary">
              Google sign-in, restricted to columbia.edu and barnard.edu. You only need
              this to save a plan, watch a section, or set an alert — reading stays free.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <SocialButton
              brand="google"
              appearance="white"
              fullWidth
              onClick={onContinue}
            >
              Continue with your UNI
            </SocialButton>
          </div>

          <div className="my-5">
            <Divider />
          </div>

          <div className="flex items-start gap-2 rounded-2lg bg-background-secondary-default p-3 dark:bg-background-tertiary-default">
            <RiInformationLine
              className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
              aria-hidden
            />
            <p className="text-caption-1-regular text-text-secondary">
              {/* TODO(auth): remove once Supabase Google SSO is wired up. */}
              Authentication is not connected yet. This dialog is the placement and the
              copy; the button does nothing.
            </p>
          </div>

          <p className="mt-6 text-center text-caption-1-regular text-text-tertiary">
            We never ask for your Vergil or SSOL password, and we never register,
            drop, or waitlist anyone on your behalf.
          </p>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
