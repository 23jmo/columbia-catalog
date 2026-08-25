"use client";

import { useState } from "react";
import { RiInformationLine, RiLoginBoxLine, RiShieldCheckLine } from "@remixicon/react";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
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
import { ChevronUpDownSmall } from "@/components/foundations/icons/chevrons";
import { useSessionAccount } from "@/hooks/use-session-account";
import { isConfigured } from "@/lib/db/client";
import { signIn, signOut } from "@/lib/db/auth";
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
  const [signInError, setSignInError] = useState<string | null>(null);

  const session = useSessionAccount();
  // An explicit prop always wins, including an explicit `null` for "render the
  // signed-out state" — hence `undefined` rather than `null` as the default.
  const account = accountOverride !== undefined ? accountOverride : session.account;

  const openSignIn = () => {
    setIsMenuOpen(false);
    setSignInError(null);
    setIsSignInOpen(true);
  };

  const startColumbiaSignIn = async () => {
    if (onSignIn) {
      onSignIn();
      setIsSignInOpen(false);
      return;
    }
    // Success navigates away to Google, so the dialog is deliberately left
    // open: closing it first would flash the menu behind the redirect.
    const { error } = await signIn();
    if (error) setSignInError(error);
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
              <DropdownItem onSelect={() => void endSession()}>
                <span className="text-body-medium text-text-primary">Sign out</span>
              </DropdownItem>
            </>
          ) : isMenuOpen ? (
            <SignInPromptCard onSignIn={openSignIn} />
          ) : null}
        </DropdownPopover>
      </Dropdown>

      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onContinue={() => void startColumbiaSignIn()}
        error={signInError}
        isConfigured={isConfigured()}
      />
    </>
  );
}

function SignInModal({
  isOpen,
  onClose,
  onContinue,
  error,
  isConfigured,
}: {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  error: string | null;
  isConfigured: boolean;
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
          /*
           * Reduced motion neutralises the scale and the blur and keeps the
           * fade. `transition-none` would be wrong here -- it would drop the
           * opacity too, and the dialog would hard-cut into view over the page
           * it is covering. Same shape as HOVER_CARD_SURFACE.
           */
          "motion-reduce:data-[entering]:scale-100 motion-reduce:data-[exiting]:scale-100",
          "motion-reduce:data-[entering]:blur-none motion-reduce:data-[exiting]:blur-none",
        )}
      >
        <AriaDialog
          aria-label="Sign in to LionPlan"
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

          {(error || !isConfigured) && (
            <div className="flex items-start gap-2 rounded-2lg bg-background-secondary-default p-3 dark:bg-background-tertiary-default">
              <RiInformationLine
                className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
                aria-hidden
              />
              <p className="text-caption-1-regular text-text-secondary">
                {error ??
                  "Sign-in is not configured on this deployment. Everything readable still works."}
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-caption-1-regular text-text-tertiary">
            We never ask for your Vergil or SSOL password, and we never register,
            drop, or waitlist anyone on your behalf.
          </p>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
