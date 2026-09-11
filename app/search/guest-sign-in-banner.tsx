"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/base/buttons/button";
import { GoogleMarkIcon } from "@/components/shell/sign-in-prompt-card";
import { SignInPromptArt } from "@/components/shell/sign-in-prompt-art";
import { useSessionAccount } from "@/hooks/use-session-account";
import { isConfigured } from "@/lib/db/env";
import { signIn } from "@/lib/db/auth";

/**
 * What a signed-out visitor is offered on the one screen they can reach.
 *
 * The catalog is open to guests (`lib/onboarding/guest-gate.ts`), and the rail
 * beside it is three padlocks. This card is the other half of that bargain: it
 * has to be worth the padlocks, which means it cannot be a bar that says
 * "Sign in" and leaves the reason to the reader.
 *
 * ── It still names what is already free ────────────────────────────────────
 *
 * The headline leads with the ask and the body names the free part directly
 * after. The order matters less than the naming: the reader can see the
 * results underneath this card, so a prompt implying they are being shown a
 * teaser would be contradicted by the page it is sitting on. Saying "free to
 * search and browse" accurately is what lets the rest read as a description of
 * what an account adds rather than as a pitch.
 *
 * Both things it promises are real and both are genuinely gated: saving lives
 * in `app/saved/` and needs an account, and personalization needs a student
 * record. Do not add a third benefit here without checking it is actually
 * behind the sign-in — an unkept promise on this card is paid for by the
 * padlocks in the rail, which have no other justification.
 *
 * ── It goes to `/onboarding`, not back here ────────────────────────────────
 *
 * `signIn()` defaults its redirect to the current path, which for every other
 * caller is right. Here it would be the worst possible landing: the student
 * has just agreed to tell us about their degree and would arrive back at the
 * undifferentiated course list they were already reading, with nothing
 * visibly changed and no prompt to finish. `next: "/onboarding"` spends the
 * yes while it is still a yes.
 *
 * ── The plate is a wide-card decoration, and only that ─────────────────────
 *
 * `SignInPromptArt` masks itself from the left — transparent to 22%, opaque by
 * 48% — which reserves the right third of a card for the campus dither and
 * keeps it off the words. That is a proportion, not a width, so on a 355px
 * phone card the plate lands squarely on the paragraph: body copy and the
 * grey fine print both ended up reading through a dot pattern.
 *
 * Below `sm` the card is a single column with no right third to give away, so
 * the art is not rendered at all. Not hidden — not rendered: it is a WebGL
 * canvas, and spinning up a GL context to `display: none` it would spend the
 * cost on the devices least able to afford it and show nobody anything.
 *
 * ── Not dismissible ────────────────────────────────────────────────────────
 *
 * There is no X. It is not an interruption — it does not cover anything, it
 * sits above the results and scrolls away with the first flick — and a
 * dismissal would have to be remembered somewhere, which means a second
 * source of truth about a state the session already answers. Signing in is
 * the dismissal.
 */
/**
 * True from the `sm` breakpoint up — the width at which the card has a right
 * third for the campus plate.
 *
 * `useSyncExternalStore` rather than an effect: the value is external state
 * that React must read, not state React owns, and a rotation has to move it.
 * The server snapshot is `false` because the banner is client-only anyway
 * (it renders nothing until the session answers), and "no art" is the safe
 * first frame either way.
 */
const WIDE_CARD_MQ = "(min-width: 40rem)";

function useWideCard(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE_CARD_MQ);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE_CARD_MQ).matches,
    () => false,
  );
}

export function GuestSignInBanner() {
  const session = useSessionAccount();
  const isWideCard = useWideCard();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isStirred, setIsStirred] = useState(false);

  // Render nothing until the session has actually answered. `useSessionAccount`
  // starts null and resolves in an effect, so keying off the account alone
  // would flash this card at every signed-in student on every catalog load.
  if (session.isLoading || session.account) return null;

  async function start() {
    setError(null);
    setIsPending(true);
    const result = await signIn({ next: "/onboarding" });
    // On success the browser navigates to Google, so this only runs on failure.
    if (result.error) {
      setError(result.error);
      setIsPending(false);
    }
  }

  return (
    <section
      aria-label="Sign in to LionPlan"
      onPointerEnter={() => setIsStirred(true)}
      onPointerLeave={() => setIsStirred(false)}
      className="relative overflow-hidden rounded-3xl border border-border-button-white bg-background-secondary-default"
    >
      {/*
        The campus plate is right-weighted and masked from the left, so the
        copy column can run under it without the text ever meeting the image.
        `stirred` is wired to hover for the reason the art documents: this is
        the card that is asking for something. Phones get no plate — see the
        header note.
      */}
      {isWideCard ? <SignInPromptArt stirred={isStirred} /> : null}

      {/*
        The measure is on the column, not on the headline.

        It was on the copy block alone, and the fine print underneath — which
        is `text-tertiary` and therefore the lowest-contrast line on the card —
        ran the full width and finished on top of the dither. Every child yields
        the right quarter now, so nothing legible ever crosses the plate.
      */}
      <div className="relative z-10 flex flex-col items-start gap-4 p-5 sm:max-w-[38rem] sm:p-6 sm:pr-[22%]">
        <div className="flex flex-col gap-3">
          <span className="inline-flex w-fit rounded-full bg-background-tertiary-default px-2 py-0.5 text-caption-1-medium text-text-secondary">
            Browsing as a guest
          </span>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-title-2-medium text-text-primary">
              Sign in to get personalized results!
            </h2>
            <p className="text-body-regular text-text-secondary">
              LionPlan is free to search and browse courses. Sign in to save them for
              later and get personalized results based on your graduation requirements
              and interests.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col items-start gap-2">
          <Button
            variant="primary"
            size="medium"
            leadingIcon={GoogleMarkIcon}
            onClick={() => void start()}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Sign in and set up my degree
          </Button>
          <p className="text-caption-1-regular text-text-tertiary">
            About a minute. We never ask for your Vergil or SSOL password, and we
            never register or drop anyone on your behalf.
          </p>
          {error || !isConfigured() ? (
            <p role="status" className="text-caption-1-regular text-text-error-primary">
              {error ??
                "Sign-in is not configured on this deployment. Everything readable still works."}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
