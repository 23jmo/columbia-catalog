"use client";

import { RiLoginBoxLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { SignInPromptShader } from "@/components/shell/sign-in-prompt-shader";
import { cx } from "@/utils/cx";

export interface SignInPromptCardProps {
  onSignIn: () => void;
  className?: string;
}

/**
 * Signed-out account popover — premium card with shader art on the right.
 * Spec §15: read is free; sign in only to save.
 */
export function SignInPromptCard({ onSignIn, className }: SignInPromptCardProps) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-2xl bg-background-secondary-default",
        className,
      )}
    >
      {/* Soft left fade so copy stays legible over the shader bleed. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[62%] bg-gradient-to-l from-transparent via-background-secondary-default/40 to-background-secondary-default"
      />

      <SignInPromptShader />

      <div className="relative z-10 flex flex-col gap-3.5 p-4 pr-[46%]">
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

        <Button
          variant="secondary"
          size="small"
          leadingIcon={RiLoginBoxLine}
          className="w-fit"
          onClick={onSignIn}
        >
          Sign in with Columbia
        </Button>
      </div>
    </div>
  );
}
