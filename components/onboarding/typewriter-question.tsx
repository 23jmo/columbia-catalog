"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";

import { cx } from "@/utils/cx";

/** Pause between letterpress word stamps — chunky, not smooth. */
const MS_PER_TOKEN = 88;

function posterTokens(text: string): string[] {
  return text.match(/\S+\s*/gu) ?? (text ? [text] : []);
}

export interface TypewriterQuestionProps {
  text: string;
  className?: string;
}

/**
 * Onboarding headline — posterized typewriter.
 *
 * Words land in hard steps and the block caret snaps with steps(1).
 *
 * ── Why the first question does not type ────────────────────────────────────
 *
 * It used to. The component started at zero tokens and typed up from there on
 * every mount, which meant the server rendered the headline as an empty string
 * and the only copy in the document was the invisible span that reserves the
 * box. Two things followed from that, and both of them were measured on the
 * route rather than guessed at:
 *
 *   **The headline could not be the first thing painted.** It is the largest
 *   text on the screen and therefore the page's Largest Contentful Paint
 *   candidate, but there was nothing to paint until the bundle had downloaded,
 *   parsed and hydrated — and then another `88ms × word count` on top. LCP was
 *   pinned behind hydration by construction, no matter how fast the document
 *   arrived.
 *
 *   **Every stamp was a layout shift.** The invisible span reserves the final
 *   height, so the block below never moved, but the visible copy is
 *   `text-balance`, and a balanced line box re-breaks as the string grows. Each
 *   word landing moved the text nodes already on screen. On the first screen
 *   those shifts are unprompted, so they count against Cumulative Layout Shift
 *   in full.
 *
 * Starting at the full string fixes both at once: the server renders the real
 * headline, it paints with the rest of the document, and nothing reflows.
 *
 * Every question after the first still types, which is where the animation was
 * doing its work anyway — the flow's whole shape is one question replacing
 * another, and that replacement is what the stamping punctuates. A replacement
 * is always downstream of a tap on the advance arrow or an answer chip, so the
 * shifts it causes arrive inside the 500ms input window and are excluded from
 * CLS, which is exactly the distinction the metric exists to draw.
 *
 * ── Why "the first" is a module flag and not a ref ──────────────────────────
 *
 * `screen.tsx` keys the question's wrapper on the question itself, inside an
 * `AnimatePresence` set to `mode="wait"`. Every new question is therefore a new
 * mount of this component, not a re-render of the old one, so nothing held in a
 * ref or in state survives to say "you have already shown one of these" — a ref
 * seeded with the current text reads as unchanged on every single mount and the
 * typewriter would never run again.
 *
 * The flag below lives outside the component for that reason. It is only ever
 * written from an effect, which is to say only ever on the client, so on the
 * server it is permanently `false` and every server render emits the complete
 * headline — including for a student resuming three screens in. Later mounts
 * happen entirely in the browser with no hydration to match, which is what
 * makes reading it from a `useState` initializer safe.
 */

/**
 * Whether a question has already been on screen in this browser session.
 * Client-only by construction: see the note above.
 */
let hasShownAQuestion = false;

export function TypewriterQuestion({ text, className }: TypewriterQuestionProps) {
  const reduceMotion = useReducedMotion();
  const tokens = useMemo(() => posterTokens(text), [text]);

  /*
   * The first question of the session starts complete — server, hydration and
   * client alike, so there is no mismatch to reconcile and no empty headline to
   * wait through. Every later one starts empty and types up, and starting empty
   * on its very first render is what keeps the full string from flashing for a
   * frame before the effect winds it back.
   */
  const [tokenCount, setTokenCount] = useState(() => (hasShownAQuestion ? 0 : tokens.length));
  const [done, setDone] = useState(() => !hasShownAQuestion);

  const visible = reduceMotion ? text : tokens.slice(0, tokenCount).join("");

  useEffect(() => {
    if (!hasShownAQuestion) {
      // The first question is already painted, and repainting it a word at a
      // time is the thing this whole component was costing LCP for.
      hasShownAQuestion = true;
      return;
    }

    if (reduceMotion) {
      setTokenCount(tokens.length);
      setDone(true);
      return;
    }

    setTokenCount(0);
    setDone(false);

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTokenCount(index);
      if (index >= tokens.length) {
        window.clearInterval(timer);
        setDone(true);
      }
    }, MS_PER_TOKEN);

    return () => window.clearInterval(timer);
  }, [text, tokens, reduceMotion]);

  return (
    <>
      <style>{`
        @keyframes onboarding-poster-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .onboarding-poster-caret {
          animation: onboarding-poster-blink 0.85s steps(1, end) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .onboarding-poster-caret { animation: none; opacity: 1; }
        }
      `}</style>

      <h1 className={cx("relative", className)} aria-label={text}>
        <span className="invisible block text-balance" aria-hidden>
          {text}
        </span>

        <span className="absolute inset-x-0 top-0 text-balance" aria-hidden>
          <span className="relative inline text-text-primary">
            {visible}
            {!done ? (
              <span
                aria-hidden
                className="onboarding-poster-caret ml-0.5 inline-block h-[0.82em] w-[0.55em] translate-y-px bg-text-primary motion-reduce:hidden"
              />
            ) : null}
          </span>
        </span>
      </h1>
    </>
  );
}
