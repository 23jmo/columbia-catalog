"use client";

import { useState } from "react";

import { Button } from "@/components/base/buttons/button";
import { GoogleMarkIcon } from "@/components/shell/sign-in-prompt-card";
import { SignInPromptArt } from "@/components/shell/sign-in-prompt-art";
import { haptic } from "@/lib/haptics";
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
 *
 * ── Why this one is louder than the other two sign-in surfaces ─────────────
 *
 * `SignInPromptArt` renders in three places and is deliberately quiet in the
 * other two: in the account menu and the assistant it is decoration on a
 * surface the reader went looking for. Here it is not decoration. The gate
 * pulls this card UP over the feed (`-mt-6` on the row above), so it lands as
 * a white rounded rectangle flush against a white rounded rectangle, the same
 * width, in a column of them — and it read as the bottom half of the course
 * card above rather than as the one thing on the screen asking for a decision.
 *
 * Two changes, one at rest and one on approach. At rest an accent ring and a
 * tinted lift separate it from the stack, which is what a border cannot do
 * when the thing above is the same colour. On approach the water is `stirred`:
 * the shader's own intensity knob, which raises the swell and the glint rate
 * over about half a second and settles back over two. Pointer OR keyboard
 * focus, since a student tabbing to the button should get the same response as
 * one reaching for it.
 */
export function FeedSignInPanel({ onSignIn, disabled, error, className }: FeedSignInPanelProps) {
  const [isStirred, setIsStirred] = useState(false);

  return (
    <div
      // `focus`/`blur` rather than `focusin`/`focusout`: React's onFocus and
      // onBlur already bubble, so these fire for the button inside.
      onPointerEnter={() => setIsStirred(true)}
      onPointerLeave={() => setIsStirred(false)}
      onFocus={() => setIsStirred(true)}
      onBlur={() => setIsStirred(false)}
      className={cx(
        "relative w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-background-full",
        // Ring rather than border: it draws outside the box, so the card keeps
        // its width in a column whose neighbours are exactly as wide.
        "ring-1 ring-accent-500/25 transition-shadow duration-500",
        "shadow-[0_10px_36px_-12px_var(--color-accent-500)]",
        !disabled && "hover:shadow-[0_16px_48px_-10px_var(--color-accent-500)]",
        disabled && "opacity-60",
        className,
      )}
    >
      <SignInPromptArt stirred={isStirred && !disabled} />

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

        {/*
          Edge to edge on a phone, and inside the art gutter from `sm`.
          `62%` is `100% - 38%`, the same reservation the copy above uses, so
          the button ends on the same line the paragraph does. Without the cap
          it kept `w-full` all the way up, and once the panel grew to the width
          of the cards it sits between, the blue ran underneath the dithered
          flag — a 712px button with an ornament printed on its right end.
        */}
        <Button
          variant="primary"
          size="medium"
          leadingIcon={GoogleMarkIcon}
          className="w-full shrink-0 sm:max-w-[62%]"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            haptic("success");
            onSignIn();
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
