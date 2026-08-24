/**
 * The cover banner behind the avatar on the profile hero.
 *
 * The BoardUI ai-profile template ships a photograph here. A student profile
 * has no photograph to ship: we hold a Google display name and an email, and
 * pulling an avatar from an SSO provider onto a page that also lists someone's
 * coursework is a combination worth avoiding. A flat grey band, though, is what
 * makes a profile screen look like a settings page.
 *
 * So the cover is generated — a deterministic composition seeded by the
 * student's own name, drawn from BoardUI chart tokens so it flips with the
 * theme. Same person, same cover, every render.
 *
 * Deliberately a local file rather than an import from
 * `components/instructor/cover.tsx`: that lane is separately owned and being
 * rewritten, and AGENTS.md is explicit that cross-lane needs are met with a
 * local implementation rather than a reach into someone else's directory.
 */

import { cx } from "@/utils/cx";
import { stableHash } from "./format";

/** Semantic, already theme-aware, and the same eight hues the app plots with. */
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
  /** Seed. The student's name — same name, same cover. */
  seed: string;
  className?: string;
}

export function ProfileCover({ seed, className }: ProfileCoverProps) {
  const hash = stableHash(seed);

  /*
   * `>>>` throughout, never `>>`.
   *
   * `stableHash` spans the full unsigned 32-bit range and `>>` coerces via
   * ToInt32, so any hash at or above 2^31 comes back negative, `% n` yields a
   * negative index, and the lookup is `undefined` — which reaches the DOM as
   * `color-mix(in oklab, undefined …)`, an invalid colour that silently drops
   * the whole `background-image` and leaves the blank band this file exists to
   * avoid.
   */
  const pick = (shift: number, modulus: number) => (hash >>> shift) % modulus;

  const primaryIndex = pick(0, HUES.length);
  const primary = HUES[primaryIndex];
  const secondary = HUES[(primaryIndex + 3 + pick(3, HUES.length - 5)) % HUES.length];

  const xa = 14 + pick(6, 5) * 11;
  const ya = 20 + pick(9, 4) * 13;
  const xb = 60 + pick(12, 4) * 9;
  const yb = 24 + pick(15, 4) * 15;
  const angle = 100 + pick(18, 8) * 10;

  return (
    <div
      aria-hidden
      className={cx("size-full bg-background-tertiary-default", className)}
      style={{
        backgroundImage: [
          `radial-gradient(60% 120% at ${xa}% ${ya}%, color-mix(in oklab, ${primary} 82%, transparent) 0%, transparent 62%)`,
          `radial-gradient(52% 110% at ${xb}% ${yb}%, color-mix(in oklab, ${secondary} 70%, transparent) 0%, transparent 58%)`,
          `repeating-linear-gradient(${angle}deg, color-mix(in oklab, var(--color-text-primary) 6%, transparent) 0px, color-mix(in oklab, var(--color-text-primary) 6%, transparent) 1px, transparent 1px, transparent 9px)`,
          `linear-gradient(160deg, color-mix(in oklab, ${primary} 28%, transparent) 0%, transparent 55%)`,
        ].join(", "),
      }}
    />
  );
}
