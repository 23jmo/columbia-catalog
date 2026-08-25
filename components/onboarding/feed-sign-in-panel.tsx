"use client";

import { Button } from "@/components/base/buttons/button";
import { GoogleMarkIcon } from "@/components/shell/sign-in-prompt-card";
import { SignInPromptArt } from "@/components/shell/sign-in-prompt-art";
import { cx } from "@/utils/cx";

export interface FeedSignInPanelProps {
  onSignIn: () => void;
  disabled?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Last onboarding beat — campus dither + ember, feed-specific copy.
 *
 * ── Why the button is outside the art gutter ───────────────────────────────
 *
 * The copy yields the right third to the campus plate (`pr-[38%]` from `sm`).
 * The button does not: "Sign in with Columbia" plus the Google mark needs
 * ~220px, and 62% of a phone-width card is under that — the label was
 * clipping inside the button's own `overflow-hidden`. Full-bleed under the
 * copy matches `SignInPromptCard`.
 *
 * Below `sm` the gutter shrinks to a few rem. A 38% reservation on a 340px
 * card left ~180px for the paragraph, which overflowed the card and sheared
 * the right edge of the viewport.
 */
export function FeedSignInPanel({ onSignIn, disabled, error, className }: FeedSignInPanelProps) {
  return (
    <div
      className={cx(
        "relative w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border-table bg-background-full shadow-card",
        disabled && "opacity-60",
        className,
      )}
    >
      <SignInPromptArt />

      <div className="relative z-10 flex min-h-44 min-w-0 flex-col gap-4 p-4 sm:p-5">
        {/*
          Copy only in the art gutter. On phones keep a small clearance so the
          dither does not collide with the last words; from `sm` use the full
          third the plate is designed around.
        */}
        <div className="flex min-w-0 flex-col gap-4 pr-12 sm:pr-[38%]">
          <span className="inline-flex w-fit rounded-full bg-background-tertiary-default px-2 py-0.5 text-caption-1-medium text-text-secondary">
            Almost done
          </span>

          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-title-3-semibold text-text-primary">Save this and see your feed</p>
            <p className="text-caption-1-regular text-pretty text-text-secondary">
              Sign in moves your degree, coursework, and interests into your account. The
              recommendations behind this panel become yours.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="medium"
          leadingIcon={GoogleMarkIcon}
          className="w-full shrink-0"
          disabled={disabled}
          onClick={() => {
            if (!disabled) onSignIn();
          }}
        >
          Sign in with Columbia
        </Button>

        {error ? (
          <p className="text-caption-1-regular text-pretty text-text-error-primary" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
