"use client";

import { useState } from "react";
import { RiLoginBoxLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { signInWithColumbia } from "@/lib/db/auth";

/**
 * The write wall, as a working door.
 *
 * Spec §15 makes saving a plan the first thing that needs an account, and this
 * is where most readers meet that rule. It used to be a disabled button with
 * "sign-in is not connected yet" beside it — true when it was written, and a
 * lie now that Google SSO is wired.
 *
 * A failure renders inline rather than throwing. The most likely one is that
 * the Google provider is not enabled on the Supabase project (see
 * .plans/BLOCKERS.md item 6), and "Sign-in is unavailable right now" told to
 * the reader beats a button that silently does nothing.
 */
export function SignInPrompt({ label = "Save a plan" }: { label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function start() {
    setError(null);
    setIsPending(true);
    const result = await signInWithColumbia();
    // On success the browser navigates to Google, so this only runs on failure.
    if (result.error) {
      setError(result.error);
      setIsPending(false);
    }
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        leadingIcon={RiLoginBoxLine}
        onClick={() => void start()}
        disabled={isPending}
      >
        {label}
      </Button>
      {error ? (
        <span role="status" className="text-caption-1-regular text-text-error-primary">
          {error}
        </span>
      ) : null}
    </span>
  );
}
