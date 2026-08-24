/**
 * Folder cover art, derived rather than stored.
 *
 * ── Why there is no colour column ──────────────────────────────────────────
 *
 * A folder's look is a pure function of its id. That buys three things a
 * stored colour does not:
 *
 *   · No picker in the create flow. "New folder" stays a text field and an
 *     Enter key, which is the whole point of creating one from inside a toast.
 *   · The chip, the picker row, the schedule dropdown and the gallery card can
 *     never disagree, because none of them is reading a value that could be
 *     stale.
 *   · Nothing to migrate, and nothing a client can set to an unreadable value.
 *
 * ── Why the stops are tokens and not hex ───────────────────────────────────
 *
 * Every stop is a BoardUI chart token, so the art flips with the theme like
 * the rest of the app and never has to be re-tuned for dark mode. The shader
 * on `/saved` resolves the same tokens through `getComputedStyle`, so the
 * animated card and the static chip are literally the same three colours.
 *
 * This module is pure and framework-free — it is imported by a server
 * component, a client component and a test.
 */

/** How many `--color-chart-N` tokens `styles/theme.css` defines. */
const CHART_TOKEN_COUNT = 8;

export interface FolderArt {
  /** Three distinct chart tokens, as CSS custom property names. */
  stops: readonly [string, string, string];
  /** Where each stop sits, in percent of the box. */
  positions: readonly [Point, Point, Point];
  /** Linear base angle, degrees. */
  angle: number;
  /** Stable 0..1 value handed to the shader so two folders never drift alike. */
  seed: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * FNV-1a. Chosen over anything cryptographic because this needs to be fast,
 * synchronous, dependency-free and identical on the server and in the browser
 * — not unpredictable. A folder id is already random; this only spreads it.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A tiny deterministic PRNG seeded from the hash, so one id yields a whole
 * series of stable values rather than one.
 */
function sequence(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

/**
 * Strides that are coprime with `CHART_TOKEN_COUNT`.
 *
 * Coprimality is what makes the three-step walk below produce three distinct
 * tokens without a rejection loop. A stride of 4 would land the third stop on
 * the first and flatten the gradient, which is exactly the case this list
 * excludes.
 */
const STRIDES = [1, 3, 5, 7] as const;

/**
 * Three *distinct* token indices.
 *
 * Distinctness is the point: two identical stops collapse the gradient into a
 * flat wash and lose the folder's identity.
 *
 * Both the starting token AND the stride are drawn from the seed, which is
 * what keeps the palette from being the bottleneck. A fixed stride would give
 * only eight possible triples — for a student with fifty folders that is a
 * collision roughly every eighth folder, on the one attribute the eye reads
 * first. Varying the stride gives 8 × 4 = 32, and the angle and blob positions
 * vary continuously on top of that, so two folders sharing a triple still do
 * not look alike.
 *
 * The stride is taken from a different slice of the hash than the start, so
 * the two choices are independent rather than moving together.
 */
function pickStops(seed: number): [number, number, number] {
  const first = seed % CHART_TOKEN_COUNT;
  const stride = STRIDES[(seed >>> 11) % STRIDES.length];
  return [
    first,
    (first + stride) % CHART_TOKEN_COUNT,
    (first + stride * 2) % CHART_TOKEN_COUNT,
  ];
}

export function folderArt(folderId: string): FolderArt {
  const seed = hash(folderId);
  const next = sequence(seed);
  const [a, b, c] = pickStops(seed);

  // Positions are pushed toward the corners rather than scattered anywhere:
  // three blobs clustered near the middle read as mud at chip size, where most
  // of these are rendered.
  const corner = (baseX: number, baseY: number): Point => ({
    x: Math.round(baseX + next() * 24 - 12),
    y: Math.round(baseY + next() * 24 - 12),
  });

  return {
    stops: [`--color-chart-${a + 1}`, `--color-chart-${b + 1}`, `--color-chart-${c + 1}`],
    positions: [corner(18, 22), corner(82, 30), corner(46, 84)],
    angle: Math.round(next() * 360),
    seed: (seed % 100000) / 100000,
  };
}

/**
 * The static rendering: three layered radial gradients over a flat base.
 *
 * `color-mix` supplies the alpha because the tokens are opaque and a folder
 * cover that is three solid discs looks like a traffic light. Mixing toward
 * `transparent` in oklab keeps the falloff perceptually even, which
 * `rgba()`-style alpha on a hue-varying palette does not.
 *
 * Used everywhere except the `/saved` gallery cards, and used there too
 * whenever WebGL or motion is unavailable.
 */
export function folderGradientCss(art: FolderArt): string {
  const layers = art.stops.map((token, index) => {
    const point = art.positions[index];
    const strength = index === 0 ? 62 : index === 1 ? 52 : 44;
    return (
      `radial-gradient(circle at ${point.x}% ${point.y}%, ` +
      `color-mix(in oklab, var(${token}) ${strength}%, transparent) 0%, ` +
      `color-mix(in oklab, var(${token}) 0%, transparent) 62%)`
    );
  });

  // The base sits last (bottom of the stack) and keeps the card from showing
  // page background through the gaps between the blobs.
  layers.push(
    `linear-gradient(${art.angle}deg, ` +
      `color-mix(in oklab, var(${art.stops[0]}) 22%, transparent), ` +
      `color-mix(in oklab, var(${art.stops[2]}) 22%, transparent))`,
  );

  return layers.join(", ");
}

/** Convenience for the common case — a chip or a card that only needs a style. */
export function folderGradientStyle(folderId: string): { backgroundImage: string } {
  return { backgroundImage: folderGradientCss(folderArt(folderId)) };
}

/**
 * The two synthetic folders on `/saved`.
 *
 * They are computed views, not rows, but they still need stable art, and
 * hard-coding it here means "All" looks like "All" for every student on every
 * device rather than being derived from a fake id somebody might change.
 */
export const SYNTHETIC_FOLDER_IDS = {
  all: "columbia-catalog::all",
  uncategorized: "columbia-catalog::uncategorized",
} as const;
