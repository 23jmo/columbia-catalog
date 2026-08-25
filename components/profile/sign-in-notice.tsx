"use client";

import { useState } from "react";

import { SignInPromptCard } from "@/components/shell/sign-in-prompt-card";
import { signIn } from "@/lib/db/auth";
import { cx } from "@/utils/cx";

/**
 * The signed-out state of the profile screen.
 *
 * Reuses the shell's own sign-in card rather than writing a second one, so a
 * student who has already met "Read everything — sign in to add classes" in the
 * account menu meets the identical promise here. It adds nothing to that card
 * but the failure path — an earlier version also restated the promise in a
 * footnote underneath, which is the sort of thing that accumulates until a
 * page is more reassurance than product.
 *
 * A thin client wrapper exists because `SignInPromptCard` takes an `onSignIn`
 * handler and the page is a server component — a function is not something a
 * server component can hand across the boundary.
 */

export interface SignInNoticeProps {
  className?: string;
}

export function SignInNotice({ className }: SignInNoticeProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      className={cx(
        "flex w-full flex-col gap-1 rounded-[20px] bg-background-secondary-default p-2.5",
        className,
      )}
    >
      <SignInPromptCard
        onSignIn={() => {
          setError(null);
          void signIn().then((result) => {
            // Success navigates away to Google, so only a failure ever lands
            // back here to be rendered.
            if (result.error) setError(result.error);
          });
        }}
      />
      {/*
        The footnote that used to sit here ("a profile needs an account because
        it has to be saved somewhere…") restated the card directly above it,
        which already says reads are free and writes need an account. Two ways
        of saying one thing is how a page starts to read as anxious.
      */}
      {error ? (
        <p className="px-3 pb-2 text-caption-1-regular text-text-error-primary" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
