/**
 * Campus-card lane — BoardUI tokens → three.js colours.
 *
 * WHY read CSS variables at mount instead of hard-coding hex:
 *
 *   1. The token set flips wholesale under `.dark` (styles/theme.css), and the
 *      accent ramp can be re-tinted at runtime by
 *      `components/application/theme/accent.ts`. A literal in this file would
 *      be wrong in one theme and stale in both.
 *   2. AGENTS.md forbids raw hex and `dark:` prefixes for exactly this reason.
 *      A WebGL canvas cannot use a Tailwind class, so this is the equivalent:
 *      the token stays the single source of truth, we just resolve it once.
 *
 * WHY the 1×1 canvas: `getComputedStyle` hands back the token's *computed*
 * value, and almost the whole BoardUI palette is Tailwind v4's OKLCH defaults —
 * `oklch(0.72 0.19 250)`. `THREE.Color.setStyle` only parses hex, `rgb()`,
 * `hsl()` and named colours (see three/src/math/Color.js), so an OKLCH string
 * silently warns and leaves the material black. Painting one pixel and reading
 * it back makes the browser do the colour-space conversion for us, and works
 * for any CSS colour syntax that ships in the future.
 */

/** Every token the scene and the flat map need, resolved to `#rrggbb`. */
export interface CampusPalette {
  /** Ground plane. */
  ground: string;
  /** Road stripes cut into the ground. */
  road: string;
  /** Un-targeted Columbia buildings. */
  building: string;
  /** Landmarks — the darkest neutral, so they read through the muted mass. */
  landmark: string;
  /** The surrounding neighbourhood — nearly the ground, so it recedes. */
  context: string;
  /** The building this section actually meets in. */
  highlight: string;
  /** The pulsing ring and marker around it. */
  marker: string;
  /** Edge lines on the highlighted building. */
  outline: string;
}

/**
 * The scene's depth ordering IS this table, read top to bottom: ground, then
 * the neighbourhood barely above it, then Columbia's buildings a clear step
 * darker, then landmarks darkest of all, then the accent for the one building
 * that matters. Every entry has to keep that ramp monotonic in both themes,
 * which is why they are all drawn from the same neutral scale rather than
 * picked for what each token is nominally "for" — a WebGL canvas has no hover
 * state, so `quaternary-hover` here is simply the name of the darkest neutral
 * BoardUI ships.
 *
 * Getting this wrong is not subtle: with the neighbourhood and the campus one
 * step apart, the card renders 1,000 identical grey boxes and the reader cannot
 * tell which of them is Columbia.
 */
const TOKEN_BY_ROLE: Record<keyof CampusPalette, string> = {
  ground: "--color-background-secondary-default",
  road: "--color-background-full",
  // Deliberately the SAME token as the ground: the neighbourhood is relief,
  // not subject. It reads through shading and its own silhouette, and it never
  // competes for colour with the buildings that matter.
  context: "--color-background-secondary-default",
  building: "--color-background-quaternary-default",
  landmark: "--color-background-quaternary-hover",
  highlight: "--color-accent-500",
  marker: "--color-accent-400",
  outline: "--color-border-button-default",
};

/**
 * Last-resort values, used only when there is no document to read from (SSR,
 * jsdom without the stylesheet) so a mis-mounted card renders a grey campus
 * instead of a black void. Neutral on purpose — never a brand colour, because a
 * wrong brand colour is more misleading than an obviously placeholder grey.
 */
const NEUTRAL_FALLBACK: CampusPalette = {
  ground: "#f1f1f1",
  road: "#ffffff",
  context: "#f7f7f7",
  building: "#d4d4d4",
  landmark: "#a3a3a3",
  highlight: "#3392ff",
  marker: "#5aa9ff",
  outline: "#c8c8c8",
};

let sharedProbe: CanvasRenderingContext2D | null | undefined;

/** One reusable 1×1 context for the whole app; creating these is not free. */
function colorProbe(): CanvasRenderingContext2D | null {
  if (sharedProbe !== undefined) return sharedProbe;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    sharedProbe = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    sharedProbe = null;
  }
  return sharedProbe;
}

/** Any CSS colour string → `#rrggbb`, via the browser's own converter. */
export function cssColorToHex(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  // Already a plain hex — skip the round trip entirely.
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();

  const ctx = colorProbe();
  if (!ctx) return fallback;
  try {
    ctx.clearRect(0, 0, 1, 1);
    // An unparseable value leaves fillStyle untouched, so seed it with a colour
    // we can detect and treat "unchanged" as failure.
    ctx.fillStyle = "#000000";
    ctx.fillStyle = trimmed;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return fallback;
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return fallback;
  }
}

/**
 * Resolve the palette against a mounted element, so tokens scoped to a subtree
 * (a themed section, a preview panel) win over the ones on `:root`.
 */
export function readCampusPalette(element: Element | null): CampusPalette {
  if (typeof window === "undefined" || !element) return NEUTRAL_FALLBACK;

  let computed: CSSStyleDeclaration;
  try {
    computed = window.getComputedStyle(element);
  } catch {
    return NEUTRAL_FALLBACK;
  }

  const resolved = {} as CampusPalette;
  for (const role of Object.keys(TOKEN_BY_ROLE) as (keyof CampusPalette)[]) {
    const raw = computed.getPropertyValue(TOKEN_BY_ROLE[role]);
    resolved[role] = cssColorToHex(raw, NEUTRAL_FALLBACK[role]);
  }
  return resolved;
}

export { NEUTRAL_FALLBACK as NEUTRAL_CAMPUS_PALETTE };

/**
 * `#rrggbb` → its three channels, or null for anything this file did not make.
 * Every value in a `CampusPalette` has already been through `cssColorToHex`, so
 * in practice this only fails on a caller passing something else.
 */
function channels(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

/** Rec. 709 relative luminance, 0–1. Good enough to ask "is this theme light?". */
function luminance(rgb: [number, number, number]): number {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

/**
 * A shade of `base` pushed AWAY from `ground`, by `amount` of the remaining
 * range.
 *
 * The scene needs roofs to sit a readable step off the walls they cap, and
 * there is no BoardUI token below `quaternary-hover` to reach for — the neutral
 * ramp runs out. Darkening would be the obvious move and is exactly wrong in
 * dark mode, where it walks the roofs into the ground plane and the campus goes
 * back to being a field of silhouettes. Deriving the direction from the ground
 * instead keeps the same separation in both themes, and keeps the token as the
 * source of truth rather than smuggling in a literal.
 */
export function shadeAgainst(base: string, ground: string, amount: number): string {
  const rgb = channels(base);
  const groundRgb = channels(ground);
  if (!rgb || !groundRgb) return base;

  const towardWhite = luminance(groundRgb) < 0.5;
  const shifted = rgb.map((channel) =>
    Math.round(towardWhite ? channel + (255 - channel) * amount : channel * (1 - amount)),
  );
  return `#${shifted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
