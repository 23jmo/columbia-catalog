"use client";

import { cx } from "@/utils/cx";

/**
 * Warm bottom burn on the art side. Gradients only — no backdrop blur, so the
 * campus dither underneath stays crisp.
 */
export function SignInEmberOverlay({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{
        maskImage:
          "linear-gradient(to right, transparent 0%, transparent 22%, black 48%, black 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, transparent 22%, black 48%, black 100%)",
      }}
    >
      <div className="absolute inset-0 bg-linear-to-b from-transparent from-0% via-accent-500/14 via-45% to-accent-500/24 to-100%" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-accent-500/20 to-transparent" />
    </div>
  );
}
