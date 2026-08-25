"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RiArrowLeftLine, RiArrowRightLine } from "@remixicon/react";

import { OrnamentAvatar } from "@/components/ornament/ornament-avatar";
import { haptic } from "@/lib/haptics";
import { cx } from "@/utils/cx";

import { TypewriterQuestion } from "./typewriter-question";

/**
 * The onboarding surface: one question, centred, on an empty ground.
 *
 * ── Why this is a takeover and not a page ───────────────────────────────────
 *
 * Every other route in the app wears `AppShell` — nav rail, hamburger bar.
 * This one deliberately does not. A student in setup has exactly one job, and
 * a nav rail is five invitations to abandon it half-finished, which leaves a
 * profile that is worse than no profile: enough coursework to look answered,
 * not enough to audit against. Removing the chrome is the cheapest way to
 * finish what was started.
 *
 * Because `AppShell` is also what paints `bg-background-full`, this component
 * has to paint its own ground. It uses `background-secondary-default` rather
 * than `background-full` — a light neutral rather than white — so that the one
 * screen which genuinely is a card (the last one) has something to sit on.
 * Both are theme tokens, so the inversion holds in dark mode without a single
 * `dark:` variant.
 *
 * ── One question, and nothing else ──────────────────────────────────────────
 *
 * The headline IS the copy. There is no subtitle, no helper paragraph, no step
 * description, and no progress bar. Every one of those was on this screen
 * before and every one of them was answering a question the student had not
 * asked yet. If a step cannot be explained by its own question, the question
 * is wrong — that is a much better failure to have than a paragraph of
 * scaffolding nobody reads.
 *
 * The progress rail went for the same reason plus one more: a five-dot rail
 * tells a student how much is left, and "four more screens" is a reason to
 * leave. The work is short enough that the honest move is to just ask.
 *
 * ── Reversibility survives the redesign ─────────────────────────────────────
 *
 * "Every step has a back button and everything is reversible — no one-way
 * doors" is a spec requirement, not a nicety. It is now the small square at the
 * top-left, the only persistent chrome on the surface, and it is the same
 * guarantee: `goBack` moves the cursor and never touches the record.
 */

/**
 * 240ms: comfortably inside the 300ms cap for UI motion, and long enough that a
 * whole-screen change reads as deliberate rather than as a flicker.
 *
 * The curve is a literal only because `motion` JS configs cannot read a CSS
 * custom property. It is the same cubic-bezier as the `--ease-out` token in
 * styles/theme.css -- if that token is retuned, this array must be updated by
 * hand to match.
 */
const STEP_TRANSITION = { duration: 0.24, ease: [0.23, 1, 0.32, 1] } as const;

/** How far a screen travels as it is replaced. Short on purpose: the content
 *  is being swapped, not carried somewhere, and a full-width slide would read
 *  as a carousel and fight the typewriter. */
const STEP_OFFSET_PX = 24;

export interface OnboardingScreenProps {
  /** The whole of the screen's copy. Sentence case, ends in `?` or `.`. */
  question: string;
  /** The answers. Chips, usually. */
  children: ReactNode;
  /** Omitted on the very first question, where there is nothing behind. */
  onBack?: () => void;
  /** Omitted on the last screen, which advances by leaving the flow. */
  onNext?: () => void;
  /** Greys the advance control until the question is answerable. */
  canAdvance?: boolean;
  /** Accessible name for the advance control — it has no visible label. */
  nextLabel?: string;
  /** Rendered under the answers, outside the centred measure. */
  footer?: ReactNode;
  /** Widens the column for the screens that hold more than a row of chips. */
  wide?: boolean;
  /**
   * Reserves room at the bottom of the column for a toast pinned to the
   * viewport's bottom edge.
   *
   * Without it the advance arrow — the last thing in the column and the only
   * way forward — comes to rest UNDER the toast card at full scroll, and a tap
   * on it hits the toast instead. The student is then stuck on a screen whose
   * only exit is invisible, which is the worst failure this flow can have.
   */
  hasPinnedToast?: boolean;
  /** Which two-hue pairing the ornament wears. One per screen, so the flow
   *  shifts colour as it advances without ever animating. */
  hue?: OrnamentHue;
  /**
   * Pin the screen to the viewport and clip overflow.
   *
   * The last step ranks up to ten cards. Guests must not be able to scroll
   * past the sign-in overlay and browse them. Signed-in students get the
   * same stack with the lock off, so they can actually read it.
   */
  lockViewport?: boolean;
  /**
   * Which way the flow just moved: `1` forward, `-1` back. Drives the direction
   * of the step transition so going back visibly reverses going forward.
   */
  direction?: 1 | -1;
  /**
   * First-screen Log in control. Omitted once the student is signed in, and
   * omitted after they leave the first question — later screens already have
   * a back arrow, and the last screen has the full sign-in card.
   *
   * Lands on `/` rather than staying in the wizard: this button is for people
   * who already have an account and should skip setup.
   */
  onSignIn?: () => void;
  /** Shown under the Log in control when OAuth could not start. */
  signInError?: string | null;
}

export function OnboardingScreen({
  question,
  children,
  onBack,
  onNext,
  canAdvance = true,
  nextLabel = "Continue",
  footer,
  wide = false,
  hasPinnedToast = false,
  hue,
  lockViewport = false,
  direction = 1,
  onSignIn,
  signInError,
}: OnboardingScreenProps) {
  /*
   * Reduced motion keeps the crossfade and drops the horizontal travel. The
   * fade is what signals that the question has been replaced; removing it too
   * would make the flow jump between screens with no transition at all.
   */
  const shouldReduceMotion = useReducedMotion();
  const offset = shouldReduceMotion ? 0 : STEP_OFFSET_PX;
  // Belt-and-suspenders for iOS rubber-banding: a child with overflow-hidden
  // is not always enough; the document itself has to refuse to scroll.
  useEffect(() => {
    if (!lockViewport) return;
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    const previousOverscroll = html.style.overscrollBehavior;
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = previousOverflow;
      html.style.overscrollBehavior = previousOverscroll;
    };
  }, [lockViewport]);

  return (
    <div
      className={cx(
        "relative flex w-full flex-col bg-background-secondary-default",
        lockViewport ? "h-dvh overflow-hidden overscroll-none" : "min-h-dvh",
      )}
    >
      {onBack ? <BackArrow onClick={onBack} /> : null}
      {onSignIn ? <SignInChip onClick={onSignIn} error={signInError} /> : null}

      {/*
        Upper-middle, not centred and not top-aligned.

        A vertically centred column drifts with the length of the answer list,
        so the headline lands somewhere different on every screen and the eye
        has to re-find it each time. Anchoring to a fraction of the viewport
        keeps the question in the same place from the first screen to the last,
        and leaves the whitespace where it belongs — below.
      */}
      <div
        className={cx(
          "mx-auto flex w-full flex-1 flex-col items-center px-5 pt-[13vh] sm:pt-[15vh]",
          wide ? "max-w-[760px]" : "max-w-[620px]",
          // Deep enough to clear the toast card at its two-line worst, which is
          // what a 390px viewport gives it.
          hasPinnedToast ? "pb-44" : "pb-24",
          lockViewport && "min-h-0 overflow-hidden",
        )}
      >
        <OrnamentAvatar hue={hue} mood="tracking" />

        {/*
          Keyed on the question rather than on the flow's step: the degree step
          asks up to four separate questions under one step name, and each of
          them is a screen the student experiences as its own.

          `mode="wait"` so the outgoing question is gone before the incoming one
          arrives -- two full-screen questions on top of each other are
          unreadable. `initial={false}` so the first screen does not animate in
          on page load.

          The wrapper repeats the column's flex properties because it now sits
          between the column and the content, and `lockViewport`'s `flex-1`
          child needs a flex parent to resolve against.
        */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={question}
            initial={{ opacity: 0, transform: `translateX(${direction * offset}px)` }}
            animate={{ opacity: 1, transform: "translateX(0px)" }}
            exit={{ opacity: 0, transform: `translateX(${-direction * offset}px)` }}
            transition={STEP_TRANSITION}
            className={cx(
              "flex w-full flex-col items-center",
              lockViewport && "min-h-0 flex-1",
            )}
          >
            <TypewriterQuestion
              text={question}
              className="mt-7 text-center text-display-4-regular -tracking-[0.02em] text-text-primary sm:mt-9 sm:text-display-3-regular"
            />

            <div
              className={cx(
                "mt-8 w-full sm:mt-10",
                lockViewport && "min-h-0 flex-1 overflow-hidden",
              )}
            >
              {children}
            </div>
          </motion.div>
        </AnimatePresence>

        {onNext ? (
          <AdvanceArrow onClick={onNext} disabled={!canAdvance} label={nextLabel} />
        ) : null}

        {footer ? <div className="mt-10 w-full">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ==========================================================================
 * Chrome
 * ========================================================================== */

/* ==========================================================================
 * The ornament
 * ========================================================================== */

/**
 * Columbia navy pairings — one per screen.
 *
 * The app's accent ramp already defaults to BoardUI blue; these lean into the
 * darker end (700–950) with a lighter blue highlight (400–600) so the disc
 * reads as Columbia navy rather than a generic pastel gradient.
 */
const ORNAMENT_HUES = {
  roseBlue: ["--color-blue-900", "--color-blue-500"],
  roseCyan: ["--color-blue-950", "--color-blue-600"],
  cyanRose: ["--color-blue-800", "--color-blue-400"],
  violetRose: ["--color-blue-900", "--color-blue-700"],
  tealViolet: ["--color-blue-950", "--color-blue-500"],
  blueRose: ["--color-blue-800", "--color-blue-600"],
  cyanViolet: ["--color-blue-900", "--color-blue-400"],
} as const;

export type OrnamentHue = keyof typeof ORNAMENT_HUES;

/**
 * Flat Columbia medallion — navy + bronze patina, grain/dither, feathered edge.
 * A seated-lion glyph (Alma Mater inspired, not the official mark) sits at ~14%
 * opacity so it reads as embossed metal, not a logo stamp.
 */
const FINE_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.85' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")";

const COARSE_DITHER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Cfilter id='d'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.48' numOctaves='2' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0.2 0.45 0.7 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23d)'/%3E%3C/svg%3E\")";

const FINE_DITHER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.15' numOctaves='3' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0.5 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E\")";

/** Soft falloff at the rim — dissolves into `background-secondary-default`. */
const ORNAMENT_SIZE = 92;
/** Extra canvas so the feather and grain are not clipped at the layout box. */
const ORNAMENT_CANVAS = 116;
const ORNAMENT_BLEED = (ORNAMENT_CANVAS - ORNAMENT_SIZE) / 2;

const EDGE_FEATHER =
  "radial-gradient(circle at 50% 50%, black 40%, rgba(0,0,0,0.82) 54%, rgba(0,0,0,0.42) 68%, rgba(0,0,0,0.14) 82%, transparent 100%)";

const LION_GLYPH = "/onboarding/lion-glyph.svg";

export function Ornament({ hue = "roseBlue" }: { hue?: OrnamentHue }) {
  const [deep, bright] = ORNAMENT_HUES[hue];

  return (
    <div
      aria-hidden
      className="relative shrink-0 overflow-visible"
      style={{ width: ORNAMENT_SIZE, height: ORNAMENT_SIZE }}
    >
      {/*
        Paint larger than the layout box. Mask + grain need room past the rim;
        a 92px clip was cutting the feather and bevel off flat.
      */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: ORNAMENT_CANVAS,
          height: ORNAMENT_CANVAS,
          WebkitMaskImage: EDGE_FEATHER,
          maskImage: EDGE_FEATHER,
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: `color-mix(in srgb, var(${deep}) 88%, #5c4a38)`,
            backgroundImage: [
              `linear-gradient(180deg, color-mix(in srgb, var(${bright}) 12%, var(${deep})) 0%, color-mix(in srgb, var(${deep}) 92%, #3d342c) 100%)`,
              `radial-gradient(circle at 50% 62%, color-mix(in srgb, #8a7355 14%, transparent) 0%, transparent 58%)`,
            ].join(", "),
            boxShadow: [
              `inset 0 2.5px 0 color-mix(in srgb, var(${bright}) 52%, white)`,
              `inset 0 -2.5px 0 color-mix(in srgb, var(${deep}) 62%, black)`,
              `inset 0 3px 8px -3px color-mix(in srgb, var(${bright}) 22%, white)`,
              `inset 0 -3px 8px -3px color-mix(in srgb, var(${deep}) 38%, black)`,
            ].join(", "),
          }}
        >
        {/* Seated-lion glyph — embossed medallion, barely there. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${LION_GLYPH})`,
            backgroundSize: "70%",
            backgroundPosition: "50% 56%",
            backgroundRepeat: "no-repeat",
            opacity: 0.14,
            mixBlendMode: "soft-light",
            filter: "sepia(0.35) brightness(1.08)",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            backgroundImage: FINE_GRAIN,
            backgroundSize: `${ORNAMENT_CANVAS}px ${ORNAMENT_CANVAS}px`,
            mixBlendMode: "overlay",
            opacity: 0.68,
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            backgroundImage: COARSE_DITHER,
            backgroundSize: "56px 56px",
            mixBlendMode: "hard-light",
            opacity: 0.55,
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            backgroundImage: FINE_DITHER,
            backgroundSize: "64px 64px",
            mixBlendMode: "overlay",
            opacity: 0.42,
          }}
        />
        </div>
      </div>
    </div>
  );
}

/**
 * Returning-account control. Same chrome as the back arrow, mirrored to the
 * right, with a label because "log in" is not a universally understood icon.
 *
 * Only the first screen mounts this. Later screens have a back arrow in the
 * other corner, and the last screen has the full Columbia sign-in card.
 */
function SignInChip({ onClick, error }: { onClick: () => void; error?: string | null }) {
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col items-end sm:top-6 sm:right-6">
      <button
        type="button"
        onClick={() => {
          haptic("impact");
          onClick();
        }}
        className="flex h-10 cursor-pointer items-center rounded-xl border border-border-button-default bg-background-full px-3.5 text-body-medium text-text-secondary transition-colors hover:bg-background-secondary-hover hover:text-text-primary pointer-coarse:h-11"
      >
        Log in
      </button>
      {error ? (
        <p
          role="alert"
          className="mt-1 max-w-52 text-right text-caption-1-regular text-text-error-primary"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function BackArrow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic("selection");
        onClick();
      }}
      aria-label="Back"
      className="absolute top-4 left-4 z-10 flex size-10 cursor-pointer items-center justify-center rounded-xl border border-border-button-default bg-background-full text-text-secondary transition-colors hover:bg-background-secondary-hover hover:text-text-primary sm:top-6 sm:left-6 pointer-coarse:size-11"
    >
      <RiArrowLeftLine className="size-5" aria-hidden />
    </button>
  );
}

/**
 * The only advance control.
 *
 * A circle with an arrow and no label, which is a deliberate trade: it says
 * "onward" without saying "Continue", "Next", "Skip for now" and "See my feed"
 * on four consecutive screens — four different words for one gesture, which is
 * how a flow starts to feel like paperwork. The accessible name still varies,
 * so a screen reader gets the specific verb the sighted reader gets from
 * context.
 *
 * Disabled is low-contrast rather than hidden. A control that appears only once
 * the answer is valid leaves a student looking for the way forward; one that is
 * visibly there but dim tells them the screen is waiting on them.
 */
function AdvanceArrow({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        // Advancing is the completed beat of each screen.
        haptic("success");
        onClick();
      }}
      disabled={disabled}
      aria-label={label}
      className={cx(
        "mt-10 flex size-14 items-center justify-center rounded-full border-2 transition-colors sm:mt-12",
        disabled
          ? "cursor-default border-border-button-default text-text-disabled"
          : "cursor-pointer border-accent-500 text-accent-500 hover:bg-accent-500/10",
      )}
    >
      <RiArrowRightLine className="size-6" aria-hidden />
    </button>
  );
}
