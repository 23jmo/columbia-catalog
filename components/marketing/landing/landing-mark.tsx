import Image from "next/image";

import lionMark from "@/app/icon.png";
import { cx } from "@/utils/cx";

/**
 * The LionPlan mark, cropped past its own edge.
 *
 * `app/icon.png` is the canonical mark — the favicon, the app icon, and the
 * lockup on the social card all read this one file, and it is imported as a
 * module rather than copied into `public/` so there is exactly one of it.
 *
 * ── Why this is a component and not an `<Image>` ───────────────────────────
 *
 * The file is a navy disc on an OPAQUE BLACK square: pixel (2,2) is
 * rgba(0,0,0,255), not transparent. Every surface that shows it therefore has
 * to round it — `app/opengraph-image.tsx` does exactly that with
 * `borderRadius: 999` — and a bare `rounded-full` is not quite enough on its
 * own, because the disc's edge is anti-aliased against that black. Clipping
 * exactly at the circle keeps the darkest ring of the blend and draws a smudged
 * halo, which is invisible on the social card's near-white ground and very
 * visible on the hero's navy.
 *
 * So the image is rendered a few pixels larger than its box and pulled back by
 * the same amount: the blend falls outside the clip and what is left is the
 * lion. Stated once here because the nav, the footer and the product shot all
 * need it and three hand-tuned copies is how two of them end up wrong.
 */
export function LionMark({
  size = 26,
  priority = false,
  className,
}: {
  size?: number;
  /** Only the nav's copy — it is above the fold on the landing page. */
  priority?: boolean;
  className?: string;
}) {
  // 8% a side, floored at 2px: enough to clear the anti-aliased rim at 22px
  // without eating into the mane at 64px.
  const bleed = Math.max(2, Math.round(size * 0.08));

  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src={lionMark}
        alt=""
        width={size + bleed * 2}
        height={size + bleed * 2}
        priority={priority}
        style={{ margin: -bleed, maxWidth: "none" }}
      />
    </span>
  );
}
