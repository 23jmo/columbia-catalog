/**
 * The cover banner behind the avatar.
 *
 * Generated art, not a photograph — we have no licensed faculty images, and a
 * scraped headshot beside review scores is exactly what to avoid. The cover is
 * seeded by name or course code so the same subject always gets the same piece.
 *
 * The look is painterly: soft washes, diagonal motion streaks, impasto blobs,
 * and canvas grain — inspired by abstract nature photography, but drawn entirely
 * from BoardUI chart tokens so it flips with the theme.
 */

import { stableHash } from "./format";
import { cx } from "@/utils/cx";

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
  /** Seed — same string, same cover, every render. */
  seed: string;
  className?: string;
}

interface CoverBlob {
  left: string;
  top: string;
  width: string;
  height: string;
  color: string;
  mix: number;
  blur: string;
  opacity: number;
}

interface CoverAccent {
  left: string;
  top: string;
  size: string;
  opacity: number;
}

interface CoverComposition {
  base: string;
  streaks: string;
  streakRotate: number;
  light: string;
  blobs: CoverBlob[];
  highlights: CoverBlob[];
  accents: CoverAccent[];
  noiseSeed: number;
  brushAngle: number;
}

/** Inline SVG fractal noise — canvas grain without an asset file. */
function noiseTileDataUri(seed: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" seed="${seed % 997}" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)" opacity="0.5"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function mix(color: string, amount: number): string {
  return `color-mix(in oklab, ${color} ${amount}%, transparent)`;
}

function buildComposition(seed: string): CoverComposition {
  const hash = stableHash(seed);
  const pick = (shift: number, modulus: number) => (hash >>> shift) % modulus;

  const primaryIndex = pick(0, HUES.length);
  const primary = HUES[primaryIndex];
  const secondary = HUES[(primaryIndex + 3 + pick(3, HUES.length - 5)) % HUES.length];
  const tertiary = HUES[(primaryIndex + 5 + pick(5, HUES.length - 3)) % HUES.length];
  const accent = HUES[(primaryIndex + 1 + pick(7, HUES.length - 2)) % HUES.length];

  const streakAngle = 38 + pick(9, 14) * 8;
  const lightAngle = streakAngle - 28 + pick(11, 6) * 5;
  const streakRotate = -6 + pick(13, 5) * 3;

  const base = [
    `linear-gradient(152deg, ${mix(primary, 38)} 0%, transparent 46%)`,
    `linear-gradient(228deg, ${mix(secondary, 32)} 0%, transparent 52%)`,
    `radial-gradient(95% 130% at 18% 108%, ${mix(tertiary, 36)} 0%, transparent 58%)`,
    `radial-gradient(80% 100% at 88% -8%, ${mix(accent, 28)} 0%, transparent 55%)`,
  ].join(", ");

  // Diagonal motion streaks — the hazy "driving past a field" read.
  const streaks = [
    `linear-gradient(${streakAngle}deg, transparent 0%, ${mix(primary, 22)} 14%, transparent 28%, ${mix("var(--color-chart-neutral)", 18)} 42%, transparent 56%, ${mix(secondary, 20)} 68%, transparent 82%)`,
    `linear-gradient(${streakAngle + 12}deg, transparent 4%, ${mix(tertiary, 14)} 22%, transparent 38%, ${mix(accent, 12)} 58%, transparent 74%)`,
  ].join(", ");

  const light = [
    `linear-gradient(${lightAngle}deg, ${mix("var(--color-chart-neutral)", 42)} 0%, transparent 34%)`,
    `radial-gradient(55% 80% at ${22 + pick(15, 5) * 10}% ${8 + pick(17, 4) * 6}%, ${mix("var(--color-chart-neutral)", 35)} 0%, transparent 62%)`,
  ].join(", ");

  const blobs: CoverBlob[] = [
    {
      left: `${-8 + pick(19, 5) * 8}%`,
      top: `${-22 + pick(21, 4) * 6}%`,
      width: `${58 + pick(23, 4) * 10}%`,
      height: `${42 + pick(25, 3) * 8}%`,
      color: primary,
      mix: 52,
      blur: "blur-3xl",
      opacity: 0.85,
    },
    {
      left: `${38 + pick(27, 5) * 9}%`,
      top: `${-12 + pick(29, 4) * 7}%`,
      width: `${46 + pick(31, 4) * 9}%`,
      height: `${38 + pick(33, 3) * 10}%`,
      color: secondary,
      mix: 46,
      blur: "blur-2xl",
      opacity: 0.8,
    },
    {
      left: `${-4 + pick(35, 4) * 7}%`,
      top: `${26 + pick(37, 5) * 8}%`,
      width: `${40 + pick(39, 4) * 8}%`,
      height: `${36 + pick(41, 4) * 7}%`,
      color: tertiary,
      mix: 40,
      blur: "blur-3xl",
      opacity: 0.75,
    },
    {
      left: `${54 + pick(43, 4) * 9}%`,
      top: `${32 + pick(45, 4) * 8}%`,
      width: `${36 + pick(47, 3) * 8}%`,
      height: `${32 + pick(49, 3) * 9}%`,
      color: accent,
      mix: 36,
      blur: "blur-2xl",
      opacity: 0.7,
    },
  ];

  // Small bright washes — white wildflower clusters in the reference.
  const highlights: CoverBlob[] = [
    {
      left: `${16 + pick(51, 6) * 8}%`,
      top: `${18 + pick(53, 5) * 7}%`,
      width: `${14 + pick(55, 3) * 4}%`,
      height: `${12 + pick(57, 3) * 4}%`,
      color: "var(--color-chart-neutral)",
      mix: 55,
      blur: "blur-xl",
      opacity: 0.55,
    },
    {
      left: `${44 + pick(59, 5) * 9}%`,
      top: `${36 + pick(61, 4) * 8}%`,
      width: `${10 + pick(63, 3) * 3}%`,
      height: `${9 + pick(65, 3) * 3}%`,
      color: "var(--color-chart-neutral)",
      mix: 48,
      blur: "blur-lg",
      opacity: 0.45,
    },
    {
      left: `${68 + pick(67, 4) * 6}%`,
      top: `${12 + pick(69, 4) * 7}%`,
      width: `${11 + pick(71, 3) * 3}%`,
      height: `${10 + pick(73, 3) * 3}%`,
      color: accent,
      mix: 32,
      blur: "blur-xl",
      opacity: 0.4,
    },
  ];

  // Dark reflective accents — the reference's scattered spheres, kept subtle.
  const accents: CoverAccent[] = [
    {
      left: `${12 + pick(75, 8) * 7}%`,
      top: `${6 + pick(77, 4) * 5}%`,
      size: `${5 + pick(79, 3)}px`,
      opacity: 0.22 + pick(81, 3) * 0.06,
    },
    {
      left: `${58 + pick(83, 6) * 8}%`,
      top: `${4 + pick(85, 3) * 6}%`,
      size: `${4 + pick(87, 2)}px`,
      opacity: 0.18 + pick(89, 3) * 0.05,
    },
    {
      left: `${78 + pick(91, 4) * 5}%`,
      top: `${14 + pick(93, 4) * 5}%`,
      size: `${4 + pick(95, 2)}px`,
      opacity: 0.16 + pick(97, 3) * 0.04,
    },
  ];

  return {
    base,
    streaks,
    streakRotate,
    light,
    blobs,
    highlights,
    accents,
    noiseSeed: hash >>> 0,
    brushAngle: 64 + pick(18, 12) * 7,
  };
}

export function ProfileCover({ seed, className }: ProfileCoverProps) {
  const art = buildComposition(seed);
  const noise = noiseTileDataUri(art.noiseSeed);

  return (
    <div
      aria-hidden
      className={cx("relative size-full overflow-hidden bg-background-tertiary-default", className)}
    >
      <div className="absolute inset-0" style={{ backgroundImage: art.base }} />

      <div
        className="absolute inset-[-30%] opacity-80 mix-blend-soft-light"
        style={{
          backgroundImage: art.streaks,
          transform: `rotate(${art.streakRotate}deg)`,
        }}
      />

      <div className="absolute inset-0 opacity-90 mix-blend-screen" style={{ backgroundImage: art.light }} />

      {art.blobs.map((blob, index) => (
        <div
          key={`blob-${index}`}
          className={cx("absolute rounded-[40%] mix-blend-multiply", blob.blur)}
          style={{
            left: blob.left,
            top: blob.top,
            width: blob.width,
            height: blob.height,
            opacity: blob.opacity,
            background: mix(blob.color, blob.mix),
          }}
        />
      ))}

      {art.highlights.map((spot, index) => (
        <div
          key={`spot-${index}`}
          className={cx("absolute rounded-full mix-blend-screen", spot.blur)}
          style={{
            left: spot.left,
            top: spot.top,
            width: spot.width,
            height: spot.height,
            opacity: spot.opacity,
            background: mix(spot.color, spot.mix),
          }}
        />
      ))}

      {art.accents.map((dot, index) => (
        <div
          key={`dot-${index}`}
          className="absolute rounded-full"
          style={{
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            opacity: dot.opacity,
            background:
              "color-mix(in oklab, var(--color-text-primary) 75%, var(--color-chart-6) 25%)",
          }}
        />
      ))}

      <div
        className="absolute inset-0 opacity-[0.18] mix-blend-overlay"
        style={{ backgroundImage: noise, backgroundSize: "200px 200px" }}
      />

      <div
        className="absolute inset-0 opacity-25 mix-blend-overlay"
        style={{
          backgroundImage: `repeating-linear-gradient(${art.brushAngle}deg, color-mix(in oklab, var(--color-text-primary) 5%, transparent) 0px, color-mix(in oklab, var(--color-text-primary) 5%, transparent) 1px, transparent 1px, transparent 13px)`,
        }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(115%_95%_at_50%_0%,transparent_38%,color-mix(in_oklab,var(--color-background-full)_48%,transparent)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-14 bg-linear-to-b from-transparent to-background-full/65" />
    </div>
  );
}

/** Exported for tests — same seed must always yield the same layer recipe. */
export function coverCompositionForTests(seed: string): CoverComposition {
  return buildComposition(seed);
}
