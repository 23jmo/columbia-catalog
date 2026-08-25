"use client";

import { Button } from "@/components/base/buttons/button";
import { SOCIAL_COLOR_LOGOS } from "@/components/base/social-button/social-color-logos";
import { SignInPromptArt } from "@/components/shell/sign-in-prompt-art";
import { cx } from "@/utils/cx";

export function GoogleMarkIcon({ className }: { className?: string }) {
  const logo = SOCIAL_COLOR_LOGOS.google;
  if (!logo) return null;
  return (
    <svg
      viewBox={logo.viewBox}
      aria-hidden
      className={className}
      dangerouslySetInnerHTML={{ __html: logo.body }}
    />
  );
}

export interface SignInPromptCardProps {
  onSignIn: () => void;
  className?: string;
}

/**
 * Signed-out account popover — campus dither + ember on the right, promise on the left.
 */
export function SignInPromptCard({ onSignIn, className }: SignInPromptCardProps) {
  return (
    <div
      className={cx(
        "relative min-h-52 overflow-hidden rounded-2xl bg-background-secondary-default",
        className,
      )}
    >
      <SignInPromptArt />

      <div className="relative z-10 flex flex-col gap-3.5 p-4">
        {/*
          Copy yields the right third to the campus plate. The button does not:
          "Sign in with Columbia" plus the Google mark needs ~220px, and 62% of
          a 320px popover is 173px — the label was clipping inside the button's
          own overflow-hidden. Full-bleed under the copy is the layout the
          composer flair already uses.
        */}
        <div className="flex flex-col gap-3.5 pr-[38%]">
          <span className="inline-flex w-fit rounded-full bg-background-tertiary-default px-2 py-0.5 text-caption-1-medium text-text-secondary">
            Free to browse
          </span>

          <div className="flex flex-col gap-1">
            <p className="text-title-3-semibold text-text-primary">Read everything</p>
            <p className="text-caption-1-regular text-text-secondary">
              Search, seats, and ratings need no account. Sign in to add classes,
              watch sections, or connect MCP.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="medium"
          leadingIcon={GoogleMarkIcon}
          className="w-full shrink-0"
          onClick={onSignIn}
        >
          Sign in with Columbia
        </Button>
      </div>
    </div>
  );
}
