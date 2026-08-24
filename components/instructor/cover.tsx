/**
 * The cover banner behind the avatar.
 *
 * The BoardUI template ships a photograph here. We deliberately do NOT show a
 * photograph of an instructor: we have no licensed image, faculty photos are
 * not ours to republish, and a scraped headshot on a page that also carries
 * review scores is exactly the combination to avoid. Nor do we want a blank
 * grey band — the cover is what gives the card its identity.
 *
 * So the cover is generated: a deterministic composition seeded by the
 * instructor's name, drawn entirely from BoardUI chart tokens so it flips with
 * the theme like everything else on the page. The same person always gets the
 * same cover, which is what makes it feel like *their* page rather than
 * decoration.
 */

import { stableHash } from "./format";
import { cx } from "@/utils/cx";

/**
 * Chart tokens rather than raw palette values: these are semantic, already
 * theme-aware, and are the same eight hues the rest of the app plots with.
 */
const HUES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];

export interface ProfileCoverProps {
  /** Seed. The instructor's name — same name, same cover, every render. */
  seed: string;
  className?: string;
}

export function ProfileCover({ seed, className }: ProfileCoverProps) {
  const hash = stableHash(seed);

  /**
   * `>>>` throughout, never `>>`.
   *
   * `stableHash` returns the full unsigned 32-bit range, and `>>` coerces via
   * ToInt32 — so any hash at or above 2^31 comes back negative, `% n` yields a
   * negative index, and the lookup is `undefined`. That reached the DOM as
   * `color-mix(in oklab, undefined 72%, transparent)`, which is an invalid
   * colour, which silently drops the whole `background-image` and leaves a
   * blank grey band. Unsigned shifts keep every index in range.
   */
  const pick = (shift: number, modulus: number) => (hash >>> shift) % modulus;

  // Two hues, forced apart in the ramp so they never read as one colour.
  const primaryIndex = pick(0, HUES.length);
  const primary = HUES[primaryIndex];
  const secondary = HUES[(primaryIndex + 3 + pick(3, HUES.length - 5)) % HUES.length];

  // Blob placement, quantised so the composition stays balanced at any width.
  const xa = 12 + pick(6, 5) * 12;
  const ya = 18 + pick(9, 4) * 14;
  const xb = 58 + pick(12, 4) * 10;
  const yb = 22 + pick(15, 4) * 16;
  // Diagonal rule angle, so two adjacent profiles do not stripe identically.
  const angle = 100 + pick(18, 8) * 10;

  return (
    <div
      aria-hidden
      className={cx("size-full bg-background-tertiary-default", className)}
      style={{
        backgroundImage: [
          `radial-gradient(60% 120% at ${xa}% ${ya}%, color-mix(in oklab, ${primary} 85%, transparent) 0%, transparent 62%)`,
          `radial-gradient(52% 110% at ${xb}% ${yb}%, color-mix(in oklab, ${secondary} 72%, transparent) 0%, transparent 58%)`,
          // A faint rule pattern gives the band texture at large sizes; without
          // it the gradients read as a smear on a wide monitor.
          `repeating-linear-gradient(${angle}deg, color-mix(in oklab, var(--color-text-primary) 6%, transparent) 0px, color-mix(in oklab, var(--color-text-primary) 6%, transparent) 1px, transparent 1px, transparent 9px)`,
          `linear-gradient(160deg, color-mix(in oklab, ${primary} 30%, transparent) 0%, transparent 55%)`,
        ].join(", "),
      }}
    />
  );
}
