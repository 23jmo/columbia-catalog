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

/** Last onboarding beat — campus dither + ember, feed-specific copy. */
export function FeedSignInPanel({ onSignIn, disabled, error, className }: FeedSignInPanelProps) {
  return (
    <div
      className={cx(
        "relative w-full overflow-hidden rounded-2xl border border-border-table bg-background-full shadow-card",
        disabled && "opacity-60",
        className,
      )}
    >
      <SignInPromptArt />

      <div className="relative z-10 flex min-h-44 flex-col gap-4 p-5 pr-[38%]">
        <span className="inline-flex w-fit rounded-full bg-background-tertiary-default px-2 py-0.5 text-caption-1-medium text-text-secondary">
          Almost done
        </span>

        <div className="flex flex-col gap-1">
          <p className="text-title-3-semibold text-text-primary">Save this and see your feed</p>
          <p className="text-caption-1-regular text-text-secondary">
            Sign in moves your degree, coursework, and interests into your account. The
            recommendations behind this panel become yours.
          </p>
        </div>

        <Button
          variant="primary"
          size="medium"
          leadingIcon={GoogleMarkIcon}
          className="w-full"
          disabled={disabled}
          onClick={() => {
            if (!disabled) onSignIn();
          }}
        >
          Sign in with Columbia
        </Button>

        {error ? (
          <p className="text-caption-1-regular text-text-error-primary" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
