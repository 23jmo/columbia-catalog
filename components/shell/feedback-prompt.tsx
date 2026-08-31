"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { RiExternalLinkLine, RiFeedbackLine } from "@remixicon/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { ButtonLink } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import {
  DWELL_MS,
  FEEDBACK_FORM_URL,
  isEligible,
  isQuietRoute,
} from "@/lib/feedback/prompt-policy";
import {
  closePrompt,
  countVisit,
  getPromptOpenServerSnapshot,
  getPromptOpenSnapshot,
  openPrompt,
  sessionElapsedMs,
  settlePrompt,
  subscribePromptOpen,
} from "@/lib/feedback/store";
import { haptic } from "@/lib/haptics";
import { cx } from "@/utils/cx";

/**
 * The occasional "how is this going?" card, parked under the chat button.
 *
 * When it appears is entirely `lib/feedback/prompt-policy.ts`'s decision — see
 * that file for the four gates and why each one is there. This component owns
 * only the two things a policy module cannot: the wait, and the pixels.
 *
 * ── Why it is a corner card and not a modal ───────────────────────────────
 *
 * A dialog would be the easier build; `ProfileModal` already exists and would
 * have taken ten lines. It is the wrong shape. A modal traps focus, scrims the
 * page, and has to be answered before the reader can go back to the class list
 * they were reading — which turns an optional favour into a toll gate, on a
 * screen the reader navigated to for a different reason. The card can be
 * ignored by simply continuing to scroll, which is the honest affordance for
 * an optional request.
 *
 * ── Why it is mounted next to `ChatFab` ───────────────────────────────────
 *
 * Same reason that button is: the mobile shell puts `translate3d` on the page
 * card while the rail slides out, and `position: fixed` inside a transformed
 * ancestor attaches to that ancestor rather than the viewport. Mounting beside
 * the card keeps this on screen while the page moves under it.
 *
 * `raised` is passed rather than derived because the FAB's own visibility is
 * computed one level up. When the button is there this card sits above it;
 * when it is gone — on `/chat` — the card drops into the corner itself rather
 * than floating over a gap where a button used to be.
 */
export function FeedbackPrompt({
  hidden,
  raised,
}: {
  /** The mobile rail is open, or this screen suppresses floating chrome. */
  hidden?: boolean;
  /** The chat button is on screen below; clear it. */
  raised?: boolean;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  /*
   * Read straight from the session rather than seeded into `useState` by an
   * effect. A card raised on the previous page is therefore already open in
   * the first paint of this one, instead of appearing on the second — see
   * the note in `lib/feedback/store.ts`.
   */
  const isOpen = useSyncExternalStore(
    subscribePromptOpen,
    getPromptOpenSnapshot,
    getPromptOpenServerSnapshot,
  );

  const quiet = isQuietRoute(pathname);

  useEffect(() => {
    if (quiet) return;

    const state = countVisit(Date.now());

    // Already raised and unanswered: the store is showing it, and re-running
    // the policy here would spend a second ask on the same card.
    if (getPromptOpenSnapshot()) return;
    if (!isEligible(state, Date.now())) return;

    /*
     * Wait out the remainder of the dwell, not the whole of it. The clock
     * started when the session did, so someone who has been reading for two
     * minutes and just clicked through to a course sees the card promptly
     * instead of restarting a 45-second countdown on every navigation.
     */
    const remaining = Math.max(0, DWELL_MS - sessionElapsedMs(Date.now()));
    const timer = window.setTimeout(() => openPrompt(Date.now()), remaining);

    return () => window.clearTimeout(timer);
  }, [quiet]);

  /*
   * They are going to the form, so stop asking — and close the card, because
   * the answer is now open in a new tab and a lingering "tell us what you
   * think" behind it is asking twice.
   */
  const accept = () => {
    settlePrompt();
    haptic("selection");
  };

  return (
    <AnimatePresence>
      {isOpen && !hidden && !quiet ? (
        <motion.section
          // Matches `Toaster`: a consequence worth announcing once, politely,
          // not an interruption. `alert` here would talk over whatever the
          // reader is part-way through on a page they chose to be on.
          role="status"
          aria-live="polite"
          aria-label="Feedback"
          initial={
            reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }
          }
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: reduceMotion
              ? { duration: 0.15 }
              : { type: "spring", duration: 0.36, bounce: 0 },
          }}
          exit={
            reduceMotion
              ? { opacity: 0, transition: { duration: 0.1 } }
              : {
                  opacity: 0,
                  y: 8,
                  scale: 0.97,
                  transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
                }
          }
          className={cx(
            // z-40 matches the chat button: above the page card and its
            // header, below the course drawer and toasts. A sheet covering
            // the page covers this too.
            "fixed z-40 right-4",
            /*
             * The chat button is 3.5rem tall and sits 1rem off the bottom, so
             * clearing it costs 1 + 3.5 + 0.75 of gap = 5.25rem. Both offsets
             * carry the safe-area inset: on a notched phone in landscape the
             * home indicator eats the last few pixels of a card that measured
             * fine in the simulator.
             */
            raised
              ? "bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))]"
              : "bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]",
            // Full 20rem where there is room; a 1rem gutter each side where
            // there is not, so a 320px phone does not get a card off-screen.
            "w-[min(20rem,calc(100vw-2rem))]",
            "flex items-start gap-3 rounded-2xl p-4 pr-11",
            "border border-border-button-default",
            "bg-background-primary-default shadow-dropdown",
          )}
        >
          <span
            className={cx(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              "bg-background-tertiary-default text-foreground-icon-secondary",
            )}
          >
            <RiFeedbackLine className="size-5" aria-hidden />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-body-medium text-balance text-text-primary">
              How is LionPlan working out?
            </p>
            <p className="text-body-regular text-pretty text-text-secondary">
              A couple of minutes of feedback decides what gets built next.
            </p>

            <div className="mt-2">
              <ButtonLink
                variant="secondary"
                size="small"
                href={FEEDBACK_FORM_URL}
                // A new tab, because the alternative is throwing away whatever
                // search or half-built schedule they were in the middle of.
                target="_blank"
                rel="noopener noreferrer"
                trailingIcon={RiExternalLinkLine}
                onClick={accept}
              >
                Share feedback
              </ButtonLink>
            </div>
          </div>

          <CloseButton
            size="xs"
            aria-label="Dismiss feedback request"
            onClick={closePrompt}
            className="absolute top-4 right-4"
          />
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
