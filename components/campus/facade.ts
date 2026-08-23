/**
 * Campus-card lane — the window grid, drawn once into a canvas.
 *
 * The survey gives outlines and heights and nothing else, so before this every
 * building in the scene was a smooth prism: correct in plan, but with no cue at
 * all for how big it is. A window grid at a fixed real-world size is that cue —
 * it is what makes a nine-storey block read as nine storeys rather than as a
 * large grey wedge, and it is the difference between "a diagram of a campus"
 * and "a picture of one".
 *
 * WHY procedural rather than an image: the card must not make a network request
 * for scenery (spec §19), and a photographic facade would be wrong for every
 * building it was not photographed from. A grid is honest — it claims floors
 * and bays, which every one of these buildings has, and nothing else.
 *
 * WHY it tiles at exactly one plane unit: `extrudeParts` leaves wall uvs in
 * plane units (see `ExtrudedShell`), so a texture with the default 1×1 repeat
 * covers 26 m of wall — seven bays and seven floors of 3.7 m each, which is
 * close to what these buildings actually have. Every wall in the scene ends up
 * at the same real scale for free, with no per-building uv work.
 *
 * The result is cached for the lifetime of the chunk and deliberately never
 * disposed: it is one 512² canvas shared by every mesh on every plane, and
 * tearing it down when a card unmounts only means paying to rebuild it when the
 * next drawer opens.
 */

import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";

/** Bays and floors across one plane unit — 26 m, so 3.7 m each. */
const CELLS_PER_UNIT = 7;
const TILE_PIXELS = 512;

/**
 * Both maps read from one canvas.
 *
 * They have to be separate `Texture` objects even though the pixels are
 * identical, because colour space is a property of the texture and not of the
 * slot: `map` is sRGB and gets decoded on sample, `roughnessMap` is raw data
 * and must not be. Sharing one object would mean one of the two is wrong.
 */
export interface FacadeMaps {
  /** Multiplies the material's colour. White masonry, dark glass. */
  color: CanvasTexture;
  /**
   * Green channel × the material's `roughness`. Glass comes out around 0.3
   * against masonry's 1.0, so the windows pick up the environment map and the
   * walls stay matte — which is most of what sells them as windows.
   */
  roughness: CanvasTexture;
}

let cached: FacadeMaps | null | undefined;

/** Deterministic, so the same wall is the same wall on every reload. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function paintFacade(context: CanvasRenderingContext2D): void {
  const cell = TILE_PIXELS / CELLS_PER_UNIT;
  const random = seededRandom(0x0c01_5b1a);

  // Masonry is pure white so the material's own colour — which is a BoardUI
  // token, resolved per theme — passes through untouched. Everything drawn on
  // top can only darken it, which is the right direction for a window.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);

  // A floor line under each row. Barely there at card scale, but it is what
  // survives mipmapping down to two pixels a storey and keeps the wall from
  // flattening into one tone when the camera is zoomed out.
  context.fillStyle = "rgba(0, 0, 0, 0.07)";
  for (let row = 0; row < CELLS_PER_UNIT; row += 1) {
    context.fillRect(0, row * cell + cell * 0.9, TILE_PIXELS, Math.max(1, cell * 0.06));
  }

  // Taller than wide, and with real masonry between: the buildings this is
  // standing in for are Beaux-Arts, not curtain wall, and a square opening at
  // half the bay reads as an office block from the seventies.
  const windowWidth = cell * 0.44;
  const windowHeight = cell * 0.6;
  const insetX = (cell - windowWidth) / 2;
  const insetY = cell * 0.14;

  for (let row = 0; row < CELLS_PER_UNIT; row += 1) {
    for (let column = 0; column < CELLS_PER_UNIT; column += 1) {
      const x = column * cell + insetX;
      const y = row * cell + insetY;

      // The reveal: a lighter band around the opening, which is what gives the
      // grid depth instead of leaving it a sheet of stickers.
      context.fillStyle = "rgba(0, 0, 0, 0.10)";
      context.fillRect(x - cell * 0.05, y - cell * 0.05, windowWidth + cell * 0.1, windowHeight + cell * 0.1);

      // Glass, varied a little per opening. Real buildings have blinds at
      // different heights and rooms with the lights off; a perfectly uniform
      // grid is the one thing that reads instantly as computer-generated.
      const shade = 0.4 + random() * 0.16;
      context.fillStyle = `rgba(0, 0, 0, ${(1 - shade).toFixed(3)})`;
      context.fillRect(x, y, windowWidth, windowHeight);

      // Transom bar across the top third.
      context.fillStyle = "rgba(255, 255, 255, 0.22)";
      context.fillRect(x, y + windowHeight * 0.34, windowWidth, Math.max(1, cell * 0.035));
    }
  }
}

/**
 * The shared facade maps, or null where there is no canvas to draw into (SSR,
 * jsdom). Callers must handle null: an untextured campus is the pre-existing
 * rendering and is perfectly legible, so this never throws.
 */
export function facadeMaps(): FacadeMaps | null {
  if (cached !== undefined) return cached;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_PIXELS;
    canvas.height = TILE_PIXELS;
    const context = canvas.getContext("2d");
    if (!context) {
      cached = null;
      return cached;
    }
    paintFacade(context);

    const color = new CanvasTexture(canvas);
    color.colorSpace = SRGBColorSpace;
    const roughness = new CanvasTexture(canvas);
    roughness.colorSpace = NoColorSpace;

    for (const texture of [color, roughness]) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      // Walls are seen at a glancing angle from an isometric camera, which is
      // exactly the case trilinear filtering blurs to mush.
      texture.anisotropy = 8;
    }

    cached = { color, roughness };
  } catch {
    cached = null;
  }
  return cached;
}
