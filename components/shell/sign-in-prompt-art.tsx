"use client";

import { cx } from "@/utils/cx";

import { SignInEmberOverlay } from "./sign-in-ember-overlay";
import { SignInPromptShader } from "./sign-in-prompt-shader";

/** Campus dither shader + static ember burn — no hover response. */
export function SignInPromptArt({ className }: { className?: string }) {
  return (
    <div className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <SignInPromptShader className="absolute inset-0" />
      <SignInEmberOverlay className="absolute inset-0" />
    </div>
  );
}
