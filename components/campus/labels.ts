/**
 * Campus-card lane — street names, painted on the asphalt.
 *
 * The flat map has always labelled Broadway and Amsterdam; the 3D scene had
 * roads but no names, so the one thing a reader needs to orient themselves —
 * "which side of Broadway is this?" — was the one thing the model would not
 * tell them. These put the names back.
 *
 * WHY painted flat rather than billboarded: a street name that turns to face
 * the camera reads as an annotation ON the picture. One lying on the road reads
 * as part of the place, the way it does on every printed map and on the road
 * itself, and it tells you the street's direction for free by lying along it.
 *
 * WHY a canvas texture rather than `troika-three-text` (which drei's `<Text>`
 * would give us, and which is already in the tree as a transitive dependency):
 * troika wants a font FILE, and its default is fetched from Google's CDN at
 * first render. The card is not allowed to make a network request for scenery
 * (spec §19), and a street name that arrives late — or not at all, offline —
 * is worse than one that was never promised. A 2D canvas can set `ctx.font` to
 * the same system stack the rest of the card uses and rasterise it locally,
 * which is exactly what `facade.ts` already does for the window grid.
 *
 * Textures are cached for the lifetime of the chunk and never disposed, for the
 * same reason the facade's are: there are under a dozen of them, they are tiny,
 * and tearing them down on unmount only means paying to rebuild them when the
 * next drawer opens.
 */

import { CanvasTexture, SRGBColorSpace } from "three";

/**
 * Texture resolution, in device pixels per plane unit of label height.
 *
 * A label is ~0.5 units tall and the camera can zoom to 3x, so this is a little
 * over 2x the pixels it can ever be asked for — enough that the anisotropic
 * filter has something to work with at the glancing angle an isometric camera
 * sees the ground at, and small enough that every label on a plane together is
 * well under one 512² facade tile.
 */
const PIXELS_PER_UNIT = 320;

/** Breathing room around the glyphs, as a fraction of the label height. */
const PADDING = 0.28;

/**
 * Width of the halo drawn behind the glyphs, as a fraction of the label height.
 *
 * The labels ignore depth so that buildings cannot hide them, which means a
 * name can end up lying across a dark landmark roof rather than the pale road
 * it belongs to — and grey type on a dark roof is not type any more. Outlining
 * each glyph in the road's own colour is what every printed map does for the
 * same reason, and it costs one extra stroke per character at bake time.
 */
const HALO = 0.16;

export interface GroundLabel {
  texture: CanvasTexture;
  /** Plane units — the aspect the caller must give its plane geometry. */
  width: number;
  height: number;
}

const cache = new Map<string, GroundLabel | null>();

/**
 * A single line of text as a texture, sized in plane units.
 *
 * Returns null where there is no canvas to draw into (SSR, jsdom) or where the
 * text measures to nothing. Callers must handle it: an unlabelled road is the
 * pre-existing rendering, so this never throws.
 */
export function groundLabel(
  text: string,
  color: string,
  halo: string,
  heightUnits: number,
): GroundLabel | null {
  const key = `${text}|${color}|${halo}|${heightUnits}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const built = paint(text, color, halo, heightUnits);
  cache.set(key, built);
  return built;
}

function paint(text: string, color: string, halo: string, heightUnits: number): GroundLabel | null {
  try {
    const capHeight = heightUnits * PIXELS_PER_UNIT;
    const measuring = document.createElement("canvas").getContext("2d");
    if (!measuring) return null;

    // Set on both contexts. The measuring pass needs it to size the canvas, and
    // resizing a canvas resets every 2D state including the font.
    const font = `600 ${capHeight}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const tracking = capHeight * 0.06;
    measuring.font = font;
    const textWidth = measuring.measureText(text).width + tracking * (text.length - 1);
    if (!(textWidth > 0)) return null;

    const padding = capHeight * (PADDING + HALO / 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(textWidth + padding * 2);
    canvas.height = Math.ceil(capHeight + padding * 2);
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.font = font;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = color;
    context.strokeStyle = halo;
    context.lineWidth = capHeight * HALO;
    // Round joins so the halo does not sprout spikes off the corners of a
    // glyph, which at this stroke width it otherwise will.
    context.lineJoin = "round";
    context.miterLimit = 2;
    // Letter-spacing is not in every engine's 2D context yet, so the tracking
    // is applied by hand — street names are set loose on maps, and at this size
    // the default tracking reads as a smudge rather than as a word.
    let x = padding;
    for (const character of text) {
      context.strokeText(character, x, canvas.height / 2);
      context.fillText(character, x, canvas.height / 2);
      x += context.measureText(character).width + tracking;
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    // The ground is seen at a glancing angle from an isometric camera, which is
    // exactly the case trilinear filtering blurs away to nothing.
    texture.anisotropy = 8;

    return {
      texture,
      width: canvas.width / PIXELS_PER_UNIT,
      height: canvas.height / PIXELS_PER_UNIT,
    };
  } catch {
    return null;
  }
}
