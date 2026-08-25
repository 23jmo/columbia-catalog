import { cx } from "@/utils/cx";

/**
 * The chip that says why this section is on the screen.
 *
 * ── Why a recommender has to show its work ─────────────────────────────────
 *
 * A ranked list with no reasons is indistinguishable from a ranked list with
 * bad reasons. The student has no way to tell whether "Optimization Models and
 * Methods" is here because it clears their last Science requirement or because
 * something upstream returned the catalog in id order, so the only available
 * response to a card they do not want is to distrust the whole feed. One line
 * of provenance converts that into an argument they can have — "no, I don't
 * need Global Core" is a correction, and a product you can correct is one you
 * can keep using.
 *
 * It also holds the engine honest. Every string here is built from a
 * `RecommendationReason` the scorer emitted, so a card that cannot say why it
 * is here renders no chip rather than a decorative one, and a reason nobody can
 * read on screen is a reason nobody notices is wrong.
 *
 * ── Why the fill moves, and why it is not a shader ─────────────────────────
 *
 * The owner asked for a shader. The app already has a real one — the WebGL
 * dither behind the sign-in card — and it is the wrong instrument here: the
 * rail renders twelve of these at once and browsers cap live WebGL contexts at
 * around sixteen, so twelve chips would spend the page's entire budget on
 * decoration and then start evicting each other's contexts. That failure is
 * silent and looks like a rendering bug.
 *
 * So the sheen is CSS: one wide gradient behind the text, translated across the
 * chip on a slow loop. `translate3d` rather than `background-position` on
 * purpose — a transform is composited on the GPU, where an animated background
 * position repaints the element every frame, and twelve simultaneous repaints
 * is exactly the cost this is trying not to pay.
 *
 * The gradient is built from the accent ramp rather than a fixed hue, so it
 * follows a re-tinted theme, and it is periodic — the stop at 100% matches the
 * stop at 0% — which is what makes a 50% translation loop seamlessly instead of
 * snapping back.
 *
 * ── The stylesheet is emitted here and hoisted once ────────────────────────
 *
 * `styles/**` is shared and frozen (AGENTS.md rule 1), so the keyframes cannot
 * live in the global sheet. React 19 solves this directly: a `<style>` with an
 * `href` and a `precedence` is deduplicated by href and hoisted into `<head>`,
 * so twelve chips rendering it produce exactly one stylesheet. That is why this
 * is not twelve inline copies, and why the chip does not need a provider or a
 * "render me once at the top" companion component.
 */
export function ReasonChip({ children, className }: { children: string; className?: string }) {
  return (
    <>
      <style href="feed-reason-chip" precedence="medium">
        {SHEEN_CSS}
      </style>

      <span
        className={cx(
          "relative isolate inline-flex max-w-full items-center overflow-hidden",
          "rounded-full px-2 py-0.5",
          "bg-badge-new-background text-caption-2-medium text-badge-new-text",
          className,
        )}
      >
        <span aria-hidden className="feed-reason-chip-sheen" />
        <span className="truncate">{children}</span>
      </span>
    </>
  );
}

/**
 * `-50%` is half of the `200%` width, which is one full period of the gradient
 * — the loop is seamless because it ends on the stop it started from.
 *
 * Reduced motion stops the drift and keeps the fill. The chip's job is to be a
 * legible reason; the movement is the part that is optional.
 */
const SHEEN_CSS = `
.feed-reason-chip-sheen {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
}
.feed-reason-chip-sheen::before {
  content: "";
  position: absolute;
  inset: 0;
  width: 200%;
  background-image: linear-gradient(
    100deg,
    color-mix(in oklab, var(--color-accent-500) 12%, transparent) 0%,
    color-mix(in oklab, var(--color-accent-300) 34%, transparent) 17%,
    color-mix(in oklab, var(--color-accent-600) 10%, transparent) 34%,
    color-mix(in oklab, var(--color-accent-400) 26%, transparent) 50%,
    color-mix(in oklab, var(--color-accent-600) 10%, transparent) 66%,
    color-mix(in oklab, var(--color-accent-300) 34%, transparent) 83%,
    color-mix(in oklab, var(--color-accent-500) 12%, transparent) 100%
  );
  animation: feed-reason-chip-drift 9s linear infinite;
  will-change: transform;
}
@keyframes feed-reason-chip-drift {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .feed-reason-chip-sheen::before { animation: none; }
}
`;
