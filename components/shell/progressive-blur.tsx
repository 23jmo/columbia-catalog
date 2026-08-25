"use client";

import { cx } from "@/utils/cx";

/**
 * A blur that ramps from one edge instead of stopping at a line.
 *
 * ── Why not a single `backdrop-blur-md` ────────────────────────────────────
 *
 * One uniform blur has a hard edge wherever the blurring element ends, and the
 * eye reads that edge as a bar even when the fill is fully transparent. What we
 * want is the opposite: content that softens as it approaches the chrome and is
 * completely untouched a couple of centimetres away, so the chrome never
 * announces its own bounding box.
 *
 * ── How it works ───────────────────────────────────────────────────────────
 *
 * `backdrop-filter` samples everything already painted below the element in
 * paint order, and that includes earlier siblings. So four absolutely-stacked
 * layers, each blurring a little more and each masked to fade out sooner than
 * the last, compose: near the anchored edge all four apply and the result is
 * heavy; a third of the way in only the gentlest one is still opaque. The mask
 * does the ramping, not the blur radius, which is why it stays smooth rather
 * than stepping between four discrete levels.
 *
 * The layers are ordered gentlest-first so the strongest one is painted last
 * and therefore samples the other three's output rather than being sampled by
 * them — that ordering is what makes the radii add up instead of competing.
 *
 * ── Notes for whoever touches this next ────────────────────────────────────
 *
 * - `-webkit-mask-image` is set alongside the standard property. Safari still
 *   needs it, same as `components/application/theme/theme-toggle.tsx` does.
 * - There is no background fill here on purpose. The caller decides whether it
 *   also wants a tint; this component only bends light.
 * - `pointer-events-none` throughout — it sits over scrolling content and must
 *   never eat a tap meant for a card underneath.
 */
const LAYERS = [
  // `cover` is how far the layer stays fully opaque before it fades, as a
  // percentage of the box measured from the anchored edge.
  { blur: 1, cover: 100 },
  { blur: 2, cover: 74 },
  { blur: 4, cover: 48 },
  { blur: 10, cover: 24 },
] as const;

export function ProgressiveBlur({
  side,
  className,
}: {
  /** The edge the blur is heaviest at, and ramps away from. */
  side: "top" | "bottom";
  className?: string;
}) {
  // 0% of the gradient must be the anchored edge, so the axis flips with `side`.
  const axis = side === "top" ? "to bottom" : "to top";

  return (
    <div
      aria-hidden
      className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {LAYERS.map(({ blur, cover }) => {
        // Hold the layer solid for most of its reach, then fade. Fading across
        // the whole band instead of the last sliver is what keeps the ramp from
        // showing four seams.
        const solid = cover * 0.45;
        const mask = `linear-gradient(${axis}, rgb(0 0 0) 0%, rgb(0 0 0) ${solid}%, rgb(0 0 0 / 0) ${cover}%)`;

        return (
          <div
            key={blur}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
    </div>
  );
}
