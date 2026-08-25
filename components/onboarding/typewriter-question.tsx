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
 */
export function TypewriterQuestion({ text, className }: TypewriterQuestionProps) {
  const reduceMotion = useReducedMotion();
  const tokens = useMemo(() => posterTokens(text), [text]);
  const [tokenCount, setTokenCount] = useState(reduceMotion ? tokens.length : 0);
  const [done, setDone] = useState(Boolean(reduceMotion));

  const visible = reduceMotion ? text : tokens.slice(0, tokenCount).join("");

  useEffect(() => {
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
