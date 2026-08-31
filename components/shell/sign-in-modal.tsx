"use client";

import { useState, type ReactNode } from "react";
import { RiInformationLine, RiShieldCheckLine } from "@remixicon/react";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";

import { CloseButton } from "@/components/base/buttons/close-button";
import { Divider } from "@/components/base/divider/divider";
import { SocialButton } from "@/components/base/social-button/social-button";
import { isConfigured } from "@/lib/db/client";
import { signIn } from "@/lib/db/auth";
import { cx } from "@/utils/cx";

/**
 * The one sign-in dialog.
 *
 * It lived inside `account-menu.tsx` while the account menu was the only thing
 * that could ask for an account. It is not any more: a guest browsing the
 * catalog meets this dialog from the nav rail and from the banner on the
 * results, and three copies of a Google button is three places for the
 * Columbia/Barnard promise to drift out of step.
 *
 * ── It drives the OAuth start itself ───────────────────────────────────────
 *
 * Every caller had the same three pieces of state — is it open, did it fail,
 * is Supabase even configured — and the same handler. Owning them here means a
 * new caller is `<SignInModal isOpen onClose next="/onboarding" />` and cannot
 * forget to render the failure. `onContinue` remains as an override for tests
 * and Storybook, which need the button to be pressable without a live project.
 *
 * ── `next` is the whole reason this is parameterised ────────────────────────
 *
 * `signIn()` defaults its redirect to the path you pressed the button on,
 * which is right for a course page and wrong for the catalog: a guest who
 * signs in from `/search` has, by definition, never answered a question about
 * their degree, and landing them back on the course list they were already
 * reading wastes the one moment they said yes. Those callers pass
 * `next="/onboarding"`. See `postAuthPath` for the server half.
 *
 * Deliberately NOT used: `components/application/auth/auth-card.tsx`. That
 * card always renders an email + password form, and this product has exactly
 * one sign-in method. Shipping a dead password field would be a lie about how
 * the product works, so the card's provider half — `SocialButton` — is used on
 * its own inside a modal that matches the card's surface treatment.
 */
export interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Where OAuth should land. Omitted means "back where you were", which is
   * what a course page or the account menu wants.
   */
  next?: string;
  /** Headline. Say what THIS moment unlocks, not what sign-in is. */
  title?: string;
  /** Body copy under the headline. */
  description?: ReactNode;
  /** Label on the Google button. */
  actionLabel?: string;
  /** Replaces the real OAuth start. Tests and Storybook only. */
  onContinue?: () => void;
}

export function SignInModal({
  isOpen,
  onClose,
  next,
  title = "Sign in with Columbia",
  description = (
    <>
      Google sign-in, restricted to columbia.edu and barnard.edu. You only need this
      to save a plan, watch a section, or set an alert — reading stays free.
    </>
  ),
  actionLabel = "Continue with your UNI",
  onContinue,
}: SignInModalProps) {
  const [error, setError] = useState<string | null>(null);

  /*
    A failure from the last attempt must not greet the next one. Clearing on
    open rather than on close keeps the message readable while the dialog is
    still up, which is the only time it can be read at all.

    Set during render against the previous value rather than in an effect —
    React's "adjusting state when a prop changes" pattern, the same shape
    `catalog-sidebar.tsx` uses for its drawer episode. An effect would paint
    the stale error for a frame before clearing it.
  */
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setError(null);
  }

  const start = async () => {
    if (onContinue) {
      onContinue();
      return;
    }
    // Success navigates away to Google, so the dialog is deliberately left
    // open: closing it first would flash the page behind the redirect.
    const { error: reason } = await signIn(next ? { next } : undefined);
    if (reason) setError(reason);
  };

  const configured = isConfigured();

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
            <h2 className="text-title-2-medium text-text-primary">{title}</h2>
            <p className="text-body-regular text-text-secondary">{description}</p>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <SocialButton
              brand="google"
              appearance="white"
              fullWidth
              onClick={() => void start()}
            >
              {actionLabel}
            </SocialButton>
          </div>

          <div className="my-5">
            <Divider />
          </div>

          {(error || !configured) && (
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
