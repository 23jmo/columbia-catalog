"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/base/buttons/button";
import { GoogleMarkIcon } from "@/components/shell/sign-in-prompt-card";
import { SignInPromptArt } from "@/components/shell/sign-in-prompt-art";
import { signIn } from "@/lib/db/auth";
import { cx } from "@/utils/cx";

/**
 * The door, sitting on the box it opens.
 *
 * ── Why it lives against the composer ──────────────────────────────────────
 *
 * A signed-out student can read the whole feed, and should — the spec lets
 * guests all the way through the first feed on purpose. The one thing they
 * cannot do is ask, and the box is where they find that out. Putting the prompt
 * anywhere else makes it an ad; putting it directly above the box makes it a
 * label for the control underneath it, answering the question at the moment it
 * gets asked. It rides inside the sticky wrapper for the same reason, so it
 * stays with the box rather than scrolling away from it.
 *
 * ── Why this is not `SignInPromptCard` ─────────────────────────────────────
 *
 * That card is the same promise in the account popover, and it is shaped for a
 * popover: `min-h-52`, a portrait column, `pr-[38%]` holding the paragraph off
 * the art, and a full-bleed button. At the composer's width — the whole content
 * column on a desktop — that becomes a tall panel with a button stretched
 * across two thirds of the screen, and it would push the box it is introducing
 * below the fold.
 *
 * So the copy and the artwork are reused and the geometry is not: one row,
 * two lines of text, the button at its natural size on the right. The art stack
 * anchors the campus plate to the right edge, so it reads correctly in a
 * landscape box without touching the component.
 *
 * A failed sign-in renders inline rather than throwing. The likeliest failure
 * is the Google provider not being enabled on the Supabase project, and saying
 * so beats a button that silently does nothing.
 */
export function SignInFlair({ className }: { className?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const start = useCallback(() => {
    if (isPending) return;
    setError(null);
    setIsPending(true);
    void signIn().then((result) => {
      // On success the browser navigates to Google, so this only runs on failure.
      if (result.error) {
        setError(result.error);
        setIsPending(false);
      }
    });
  }, [isPending]);

  return (
    <div
      className={cx(
        "relative w-full overflow-hidden rounded-2xl",
        "bg-background-secondary-default",
        className,
      )}
    >
      {/*
        Dimmed on a phone, because there the copy has to cross it.

        The plate ramps in at 51% of the card and is at full density by 80%
        (`ART_LEFT` plus the `smoothstep(0.30, 0.72)` clearing in the shader).
        From `sm` this box is a row and `sm:max-w-[26rem]` keeps the paragraph
        entirely to the left of that ramp — the cap below says as much. Below
        `sm` the box stacks, the paragraph is full width by necessity, and
        capping it to half of a 352px card would leave ~176px for two
        sentences. So the art yields instead of the words: the flourish is
        still there, and "get a feed built from what you have actually taken"
        is no longer set over a dither.
      */}
      <SignInPromptArt className="max-sm:opacity-35" />

      <div
        className={cx(
          "relative z-10 flex flex-col gap-3 p-3.5",
          "sm:flex-row sm:items-center sm:gap-6 sm:p-4",
        )}
      >
        {/*
          Capped rather than merely `flex-1`. The plate ramps in from half the
          box and is at full density past two thirds, so a paragraph allowed to
          run to the button collides with the dither — invisible in light mode,
          unreadable in dark. This is the landscape equivalent of the popover
          card's `pr-[38%]`.
        */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:max-w-[26rem]">
          <p className="text-body-semibold text-text-primary">
            Reading is free. Asking needs an account.
          </p>
          <p className="text-caption-1-regular text-text-secondary">
            Sign in to ask Roarie, save sections, and get a feed built from what you
            have actually taken.
          </p>
        </div>

        <Button
          variant="primary"
          size="medium"
          leadingIcon={GoogleMarkIcon}
          onClick={start}
          className="shrink-0 max-sm:w-full sm:ml-auto"
        >
          Sign in with Columbia
        </Button>
      </div>

      {error ? (
        <p
          role="status"
          className="relative z-10 px-3.5 pb-3 text-caption-1-regular text-text-error-primary sm:px-4 sm:pb-4"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
