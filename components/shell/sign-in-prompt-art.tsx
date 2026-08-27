"use client";

import { cx } from "@/utils/cx";

import { SignInEmberOverlay } from "./sign-in-ember-overlay";
import { SignInPromptShader } from "./sign-in-prompt-shader";

/**
 * Campus dither shader + static ember burn.
 *
 * `stirred` is passed straight through to the shader, where it raises the swell
 * and the glint rate. It defaults to off, which is the still plate every caller
 * had before the prop existed: the water is meant to be there before you
 * arrive, so this is a response to attention, never a switch that turns the art
 * on. Only the onboarding gate wires it — that card is the one asking for
 * something.
 */
export function SignInPromptArt({
  stirred = false,
  className,
}: {
  stirred?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <SignInPromptShader stirred={stirred} className="absolute inset-0" />
      <SignInEmberOverlay className="absolute inset-0" />
    </div>
  );
}
