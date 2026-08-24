"use client";

import type { ReactNode } from "react";
import { RiArrowLeftLine, RiArrowRightLine } from "@remixicon/react";

import { cx } from "@/utils/cx";

/**
 * The onboarding surface: one question, centred, on an empty ground.
 *
 * ── Why this is a takeover and not a page ───────────────────────────────────
 *
 * Every other route in the app wears `AppShell` — nav rail, tab bar, header.
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
}: OnboardingScreenProps) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col bg-background-secondary-default">
      {onBack ? <BackArrow onClick={onBack} /> : null}

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
        )}
      >
        <Ornament hue={hue} />

        <h1 className="mt-7 text-center text-display-4-regular -tracking-[0.02em] text-balance text-text-primary sm:mt-9 sm:text-display-3-regular">
          {question}
        </h1>

        <div className="mt-8 w-full sm:mt-10">{children}</div>

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
 * The hue pairings, one per screen.
 *
 * Two hues, never one. A single-hue disc is a ball; the shift from one hue to
 * another across the face is the whole reason this reads as light rather than
 * as an icon. The pairings are deliberately unbalanced — a warm and a cool —
 * because two neighbouring hues just look like a printing error.
 *
 * These are Tailwind's built-in palette vars, the same source
 * `--contribution-tier-*` in `styles/globals.css` already reads from. They are
 * fixed hues rather than theme tokens, which is why every one of them is mixed
 * down into `--color-background-secondary-default` below: that token IS
 * theme-aware, so the mix lands near the page's own ground in either theme
 * instead of glowing at full strength against a dark one.
 */
const ORNAMENT_HUES = {
  roseBlue: ["--color-rose-400", "--color-blue-500"],
  roseCyan: ["--color-rose-400", "--color-cyan-500"],
  cyanRose: ["--color-cyan-500", "--color-rose-400"],
  violetRose: ["--color-violet-500", "--color-rose-400"],
  tealViolet: ["--color-teal-500", "--color-violet-500"],
  blueRose: ["--color-blue-500", "--color-rose-400"],
  cyanViolet: ["--color-cyan-500", "--color-violet-500"],
} as const;

export type OrnamentHue = keyof typeof ORNAMENT_HUES;

/**
 * The ornament above the headline.
 *
 * ── What it is not ──────────────────────────────────────────────────────────
 *
 * The first version of this was a sphere: one hue, a specular highlight at 30%
 * 26%, an inset shadow along the bottom edge, and a hard circular rim. Those
 * four things together are the visual grammar of a 3D marble or a voice
 * assistant's microphone button, and it was the one element on the page that
 * announced itself as decoration. All four are gone. There is no highlight, no
 * inset shadow, no rim, and no single hue.
 *
 * ── What it is ──────────────────────────────────────────────────────────────
 *
 * Three overlapping radial gradients — two offset hue blooms and a centre wash
 * — under a grain overlay, the whole thing masked by a fourth radial so the
 * disc DISSOLVES at its edge rather than terminating. The mask is what does the
 * real work: it starts fading at 34% of the radius, so there is no point at
 * which the shape has a boundary you could trace. `overflow-hidden` and
 * `rounded-full` are deliberately absent, because both would reintroduce
 * exactly the crisp circle the mask exists to avoid.
 *
 * Saturation is pulled down by mixing every hue into
 * `--color-background-secondary-default` — the page's own ground — rather than
 * into white or into transparent. Mixing toward the ground desaturates AND
 * keeps the disc sitting in the page in both themes; mixing toward transparent
 * would leave it fully saturated and merely faint.
 *
 * ── Static, and deliberately so ─────────────────────────────────────────────
 *
 * No canvas, no WebGL, no animation frame.
 * `components/shell/sign-in-prompt-shader.tsx` was checked first, as the one
 * existing piece of generative art in the app. It does not do grain: it is a
 * 48-particle 2D canvas driven by `requestAnimationFrame`, sized by a
 * `ResizeObserver`, shaped as a bottom-anchored flame filling its container's
 * right half. Nothing in it is reusable at 85px, and running an animation loop
 * on every screen of a setup flow to decorate one is a cost with no return.
 */
export function Ornament({ hue = "roseBlue" }: { hue?: OrnamentHue }) {
  const [warm, cool] = ORNAMENT_HUES[hue];

  /* Mixed toward the page's ground: desaturates and stays theme-aware. */
  const soften = (token: string, strength: number) =>
    `color-mix(in srgb, var(${token}) ${strength}%, var(--color-background-secondary-default))`;

  /*
   * Fades to `transparent`, not to the ground colour. A gradient that ends on
   * an opaque colour paints a filled square behind the disc, which the mask
   * then cuts into — a circle with a visible edge, the exact thing being
   * avoided. Ending on transparent lets the three layers accumulate only where
   * they actually overlap.
   */
  const bloom = (position: string, token: string, strength: number, radius: number) =>
    `radial-gradient(circle at ${position}, ${soften(token, strength)} 0%, transparent ${radius}%)`;

  const dissolve = "radial-gradient(circle at 50% 50%, black 34%, transparent 72%)";

  return (
    <div
      aria-hidden
      className="relative size-[85px] shrink-0"
      style={{
        backgroundImage: [
          /*
           * Placed close together with radii far wider than the gap between
           * them, so the two blooms overlap across most of the disc and the
           * hue shifts continuously. Pushed further apart — or given radii
           * that stop short of each other — they resolve into two visibly
           * separate blobs with a seam down the middle, which is the failure
           * mode this geometry is tuned against.
           */
          bloom("38% 34%", warm, 66, 78),
          bloom("64% 64%", cool, 66, 80),
          // A wide, weak wash across the whole face, so the overlap lands on a
          // third colour rather than on bare ground.
          bloom("50% 50%", cool, 28, 92),
        ].join(", "),
        maskImage: dissolve,
        WebkitMaskImage: dissolve,
      }}
    >
      {/*
        The grain, and the reason this does not read as a CSS gradient.

        `soft-light` rather than `overlay`: overlay drives the light half toward
        white and the dark half toward black, which rebuilds the very
        highlight-and-shadow reading the sphere was dropped for. Soft-light
        perturbs without polarising. It inherits the parent's mask, so the grain
        dissolves at the edge along with everything else.
      */}
      <span
        className="absolute inset-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          mixBlendMode: "soft-light",
          opacity: 0.55,
        }}
      />
    </div>
  );
}

function BackArrow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      onClick={onClick}
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
