/**
 * Bakes the sign-in card's artwork: an axonometric plate of Morningside
 * Heights, drawn from the same surveyed footprints the campus card renders in
 * 3D (`lib/campus/generated/campus-footprints.json`).
 *
 *   npm run build:signin-art   →   public/art/campus-plate.png
 *
 * ── Why bake a raster at all ────────────────────────────────────────────────
 *
 * The card's art is a *dither* — `components/shell/sign-in-prompt-shader.tsx`
 * quantises a luminance ramp through a Bayer matrix. A dither is only as good
 * as the tones it is given: flat fills quantise into flat blocks, and the
 * pattern that makes the effect read as print only appears across a gradient.
 * So the interesting work here is not the geometry, it is the *shading* —
 * three-tone faces, a per-building tonal jitter, and an atmospheric haze that
 * lifts distant mass toward the paper. Those ramps are what the shader turns
 * into texture.
 *
 * Doing it offline rather than in the browser also keeps ~230 KB of polygon
 * rings out of the client bundle, which is the same reason `footprints.ts`
 * lives under `components/campus/` instead of `lib/campus/`.
 *
 * ── Grayscale + alpha, not RGB ──────────────────────────────────────────────
 *
 * The plate stores luminance in the grey channel and *coverage* in alpha, so
 * what ships is a silhouette rather than a picture with a background. The card
 * composites it over its own surface token, which is how one asset survives the
 * light/dark flip — an RGB plate would need a second file and would still be
 * wrong for any theme added later.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { CAMPUS_LAYOUT_BUILDINGS } from "../lib/campus";
import footprints from "../lib/campus/generated/campus-footprints.json";

// ---------------------------------------------------------------------------
// Output geometry
// ---------------------------------------------------------------------------

/**
 * The card reserves a ~494×208 CSS slot for art. Baking at 2× covers retina
 * without shipping a plate nobody's display can resolve — and because the
 * shader quantises to chunky dither cells anyway, there is no visible return
 * above 2×.
 */
const OUT_WIDTH = 1024;
const OUT_HEIGHT = 432;

/** Supersampling factor. The plate's edges are resolved *before* the shader
 * quantises them, so the dither has a clean ramp to work against rather than
 * a staircase. 3× is where the improvement stops being visible. */
const SS = 3;

const BUF_WIDTH = OUT_WIDTH * SS;
const BUF_HEIGHT = OUT_HEIGHT * SS;

const PLANE: string = "morningside-heights";

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * A true 30° isometric. The campus plan is McKim, Mead & White's — rigidly
 * symmetrical about the College Walk axis — and an isometric is the projection
 * that keeps that symmetry legible instead of throwing it away to perspective.
 *
 * Plane coordinates are +x east, +z south, +y up (see `lib/campus/layout.ts`).
 */
const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);

/** Vertical exaggeration. The surveyed heights are honest but the campus is
 * low-rise, and at true scale the skyline flattens into a rug. */
const HEIGHT_GAIN = 1.55;

interface Projected {
  screenX: number;
  screenY: number;
}

function project(x: number, z: number, y: number): Projected {
  return {
    screenX: (x - z) * ISO_COS,
    screenY: (x + z) * ISO_SIN - y * HEIGHT_GAIN,
  };
}

/** Depth key: in this projection the viewer stands to the south-east, so mass
 * with a larger (x + z) is nearer the camera and must be painted later. */
function depthOf(x: number, z: number): number {
  return x + z;
}

// ---------------------------------------------------------------------------
// Shading
// ---------------------------------------------------------------------------

/**
 * Three tones, the oldest trick in axonometric drawing: lit roof, mid-value
 * wall, shadow wall. The sun sits north-west, which is not where the sun goes
 * over Manhattan — it is where it has to go for the College Walk facades to
 * catch light rather than fall into shadow.
 */
const TONE_ROOF = 0.8;
const TONE_WALL_LIT = 0.47;
const TONE_WALL_SHADE = 0.16;

/** Landmarks (Low, Butler, the ones the campus card also keeps at higher
 * contrast) are pushed a little brighter so the plate has focal points instead
 * of an even field of blocks. */
const LANDMARK_LIFT = 0.07;

/**
 * Where the plate is aimed. Low sits at the north end of the College Walk
 * axis and Butler at the south end, both at x = 0 — so the axis itself is the
 * frame's centre line, and the crop is a view *along* the campus rather than a
 * survey of the neighbourhood around it.
 */
const FOCUS_X = 0;
const FOCUS_Z = -1.1;

/**
 * Plane units across the frame. One unit is 26 m.
 *
 * Framing the whole Morningside block sounds right and photographs badly: the
 * campus proper is only about six units across, so at seventeen it sat in the
 * middle of the plate at a third of the frame, and once the shader had cropped,
 * faded and dithered it there were not enough cells left per building to read
 * as a building. Individual roofs came out as three or four dots — dust, not
 * architecture.
 *
 * Eleven units frames the campus and lets the neighbourhood run off the edges,
 * which is the crop a photographer would have taken in the first place.
 */
const VIEW_WIDTH_UNITS = 11;

/**
 * Atmospheric haze, measured from the focus rather than from the raw depth
 * range: mass lifts toward the paper as it leaves the centre of interest. This
 * is the plate's principal tonal ramp — once the shader has quantised
 * everything to two levels, this gradient *is* the depth cue, and the Bayer
 * pattern crossing it is what reads as texture rather than as banding.
 */
function hazeAt(x: number, z: number): number {
  const distance = Math.hypot(x - FOCUS_X, (z - FOCUS_Z) * 0.85);
  // Reaching only about half the framed block, and squared on the way down.
  //
  // A gentle linear falloff across the whole frame sounds like the softer
  // choice and is the wrong one: it holds almost everything near full strength
  // and only thins at the extreme edge, so the plate comes out as a rectangle
  // of city with no paper in it. Once the shader quantises that to one bit
  // there is no subject left — just an even woven field, which is what a
  // 50%-grey ordered dither looks like.
  //
  // Squaring a shorter reach buys negative space. The core stays solid, the
  // neighbourhood falls away quickly, and the plate ends in paper on every
  // side, which is also what lets the card's left-hand fade blend into
  // something rather than clip a wall of dots.
  //
  // Smoothstepped rather than squared, because a squared falloff peaks: it is
  // only at full strength exactly at the focus, so even the campus core comes
  // out thin and the whole plate reads as a faint smudge. The S-curve holds a
  // plateau over the core, falls away through the neighbourhood, and flattens
  // into paper before the frame edge — solid subject, soft surround, clean
  // margins.
  const reach = clamp01(1 - distance / (VIEW_WIDTH_UNITS * 0.75));
  return reach * reach * (3 - 2 * reach);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Deterministic per-building tonal jitter. Without it every roof in a block
 * is the same value and the dither renders them as one shape. */
function jitterFor(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 8) & 0xff) / 255;
}

// ---------------------------------------------------------------------------
// Scene assembly
// ---------------------------------------------------------------------------

type Ring = Array<[number, number]>;

interface Massing {
  /** Absolute plane-coordinate ring, wound as authored. */
  ring: Ring;
  height: number;
  depth: number;
  centreX: number;
  centreZ: number;
  tone: number;
  /** Context blocks stay flatter than campus buildings so the eye reads the
   * campus as the subject and the neighbourhood as ground. */
  isContext: boolean;
}

interface ContextEntry {
  plane: string;
  height: number;
  footprint: Ring;
}

function buildScene(): Massing[] {
  const massings: Massing[] = [];

  // Campus buildings: rings are stored relative to their own centroid, so the
  // layout table stays the single source of truth for position.
  const rings = footprints.buildings as unknown as Record<string, Ring>;

  for (const building of CAMPUS_LAYOUT_BUILDINGS) {
    if (building.plane !== PLANE) continue;
    const localRing = rings[building.buildingId];
    if (!localRing) continue;

    const ring: Ring = localRing.map(([localX, localZ]) => [
      localX + building.x,
      localZ + building.z,
    ]);

    const jitter = (jitterFor(building.buildingId) - 0.5) * 0.1;

    massings.push({
      ring,
      height: building.height,
      depth: depthOf(building.x, building.z),
      centreX: building.x,
      centreZ: building.z,
      tone: jitter + (building.isLandmark ? LANDMARK_LIFT : 0),
      isContext: false,
    });
  }

  // Context: the neighbourhood, already in absolute plane coordinates.
  const context = footprints.context as unknown as ContextEntry[];
  for (let index = 0; index < context.length; index += 1) {
    const entry = context[index];
    if (entry.plane !== PLANE) continue;
    if (entry.footprint.length < 4) continue;

    const centroid = ringCentroid(entry.footprint);

    massings.push({
      ring: entry.footprint,
      height: entry.height,
      depth: depthOf(centroid[0], centroid[1]),
      centreX: centroid[0],
      centreZ: centroid[1],
      tone: (jitterFor(`ctx-${index}`) - 0.5) * 0.08 - 0.06,
      isContext: true,
    });
  }

  return massings;
}

function ringCentroid(ring: Ring): [number, number] {
  let sumX = 0;
  let sumZ = 0;
  for (const [x, z] of ring) {
    sumX += x;
    sumZ += z;
  }
  return [sumX / ring.length, sumZ / ring.length];
}

// ---------------------------------------------------------------------------
// Rasteriser
// ---------------------------------------------------------------------------

const luma = new Float32Array(BUF_WIDTH * BUF_HEIGHT);
const coverage = new Float32Array(BUF_WIDTH * BUF_HEIGHT);

/** Convex-agnostic scanline fill with the even-odd rule — the surveyed rings
 * are simple but not reliably convex, and a fan triangulation would bridge
 * across the notches in buildings like Low. */
function fillPolygon(points: Projected[], tone: number, alpha: number): void {
  if (points.length < 3) return;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.screenY < minY) minY = point.screenY;
    if (point.screenY > maxY) maxY = point.screenY;
  }

  const startRow = Math.max(0, Math.ceil(minY));
  const endRow = Math.min(BUF_HEIGHT - 1, Math.floor(maxY));
  if (startRow > endRow) return;

  const crossings: number[] = [];

  for (let row = startRow; row <= endRow; row += 1) {
    const scanY = row + 0.5;
    crossings.length = 0;

    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if (a.screenY === b.screenY) continue;
      const lower = Math.min(a.screenY, b.screenY);
      const upper = Math.max(a.screenY, b.screenY);
      if (scanY < lower || scanY >= upper) continue;
      const t = (scanY - a.screenY) / (b.screenY - a.screenY);
      crossings.push(a.screenX + t * (b.screenX - a.screenX));
    }

    if (crossings.length < 2) continue;
    crossings.sort((left, right) => left - right);

    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const spanStart = Math.max(0, Math.ceil(crossings[pair] - 0.5));
      const spanEnd = Math.min(BUF_WIDTH - 1, Math.floor(crossings[pair + 1] - 0.5));
      const rowOffset = row * BUF_WIDTH;
      for (let column = spanStart; column <= spanEnd; column += 1) {
        luma[rowOffset + column] = tone;
        coverage[rowOffset + column] = alpha;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

function drawScene(massings: Massing[]): void {
  // Fixed framing rather than fit-to-extent. The extent is the whole
  // neighbourhood; the subject is the campus, and letting the data decide the
  // crop is how the first bake came out as an even field of blocks with no
  // focal point.
  const scale = BUF_WIDTH / (VIEW_WIDTH_UNITS * ISO_COS * 2);

  const focus = project(FOCUS_X, FOCUS_Z, 0);
  // Bias right, for the same reason the vertical bias exists: the card fades
  // the plate out from its left edge, so a campus centred in the plate lands
  // half-inside that fade and gets erased. Composing it right of centre puts
  // the subject where the card is at full strength. Doing this in the bake
  // rather than by panning the texture in the shader matters — panning walks
  // off the edge of the plate and smears the clamped column across the fade.
  const offsetX = BUF_WIDTH * 0.63 - focus.screenX * scale;
  // Bias down, and further than centring the mass would suggest. The buildings
  // grow upward from the ground plane, so a frame centred on the ground puts
  // the skyline above the optical centre — and the card then crops the plate's
  // top and bottom to fit its own shape, which takes the roofs off. The extra
  // bias is headroom for that second crop.
  const offsetY = BUF_HEIGHT / 2 - focus.screenY * scale + BUF_HEIGHT * 0.31;

  const toBuffer = (x: number, z: number, y: number): Projected => {
    const point = project(x, z, y);
    return {
      screenX: point.screenX * scale + offsetX,
      screenY: point.screenY * scale + offsetY,
    };
  };

  // Painter's algorithm. Separated masses only — the surveyed footprints do not
  // interlock, so a per-object depth sort resolves them correctly.
  const ordered = [...massings].sort((left, right) => left.depth - right.depth);

  for (const massing of ordered) {
    const haze = hazeAt(massing.centreX, massing.centreZ);
    if (haze <= 0.001) continue;

    // Near mass is fully opaque and fully toned; far mass lifts toward the
    // paper and thins out, so the plate dissolves into the card.
    //
    // Context massing recedes by being mixed TOWARD the paper. The obvious
    // move — scaling its tone down — does the opposite of what it sounds like:
    // these tones run bright-is-paper, so a factor below one drives the
    // neighbourhood darker and it competes with the campus instead of framing
    // it. Mixing toward white is the operation that actually means "further
    // away".
    const recede = massing.isContext ? 0.5 : 0;
    const alpha = clamp01(
      (massing.isContext ? 0.02 : 0.34) + haze * (massing.isContext ? 0.45 : 0.66),
    );
    const lift = Math.pow(1 - haze, 1.4) * 0.52;

    const shade = (base: number): number => {
      const toned = clamp01(base + massing.tone);
      const paled = toned + (1 - toned) * recede;
      return clamp01(paled * (1 - lift) + lift * 0.95);
    };

    // Cast shadow, drawn before the building that throws it. The sun is to the
    // north-west, so shadows fall south-east — toward the viewer — which means
    // a nearer building painted later correctly covers them.
    // Six hundred neighbourhood buildings each throwing a shadow is most of
    // what used to fill the frame with flat mid-grey. Only the campus casts.
    if (massing.height > 0.05 && !massing.isContext) {
      const throwDistance = massing.height * 0.9;
      fillPolygon(
        massing.ring.map(([x, z]) =>
          toBuffer(x + throwDistance * 0.62, z + throwDistance * 0.62, 0),
        ),
        shade(TONE_WALL_SHADE * 0.72),
        alpha * 0.5,
      );
    }

    // Walls, painted back-to-front within the building so the silhouette
    // resolves without a visibility test per edge.
    const walls: Array<{ points: Projected[]; depth: number; tone: number }> = [];

    for (let index = 0; index + 1 < massing.ring.length; index += 1) {
      const [ax, az] = massing.ring[index];
      const [bx, bz] = massing.ring[index + 1];

      const edgeX = bx - ax;
      const edgeZ = bz - az;
      const edgeLength = Math.hypot(edgeX, edgeZ);
      if (edgeLength < 1e-6) continue;

      // Outward normal, assuming the ring is wound consistently. Which of the
      // two candidates is "outward" does not matter: the tone only has to be
      // consistent per facing so the three-tone read holds.
      const normalX = edgeZ / edgeLength;
      const normalZ = -edgeX / edgeLength;

      // Sun to the north-west: -x, -z.
      const lambert = clamp01((-normalX - normalZ) / Math.SQRT2 * 0.5 + 0.5);
      const wallTone = TONE_WALL_SHADE + (TONE_WALL_LIT - TONE_WALL_SHADE) * lambert;

      walls.push({
        points: [
          toBuffer(ax, az, 0),
          toBuffer(bx, bz, 0),
          toBuffer(bx, bz, massing.height),
          toBuffer(ax, az, massing.height),
        ],
        depth: depthOf((ax + bx) / 2, (az + bz) / 2),
        tone: wallTone,
      });
    }

    walls.sort((left, right) => left.depth - right.depth);
    for (const wall of walls) {
      fillPolygon(wall.points, shade(wall.tone), alpha);
    }

    // Roof last — it is the highest surface on an extrusion, so it can never
    // be occluded by its own walls.
    fillPolygon(
      massing.ring.map(([x, z]) => toBuffer(x, z, massing.height)),
      shade(TONE_ROOF),
      alpha,
    );
  }
}

// ---------------------------------------------------------------------------
// Downsample + encode
// ---------------------------------------------------------------------------

function downsample(): Buffer {
  // Grayscale + alpha, 8 bit: two bytes per pixel, plus one filter byte per row.
  const raw = Buffer.alloc(OUT_HEIGHT * (1 + OUT_WIDTH * 2));
  const samples = SS * SS;

  let cursor = 0;
  for (let row = 0; row < OUT_HEIGHT; row += 1) {
    raw[cursor] = 0; // filter: none
    cursor += 1;

    for (let column = 0; column < OUT_WIDTH; column += 1) {
      let lumaSum = 0;
      let coverageSum = 0;

      for (let subRow = 0; subRow < SS; subRow += 1) {
        const bufferRow = (row * SS + subRow) * BUF_WIDTH + column * SS;
        for (let subColumn = 0; subColumn < SS; subColumn += 1) {
          const index = bufferRow + subColumn;
          // Weight luma by coverage so transparent pixels do not drag the
          // average toward black at every silhouette edge.
          lumaSum += luma[index] * coverage[index];
          coverageSum += coverage[index];
        }
      }

      const alpha = coverageSum / samples;
      const grey = coverageSum > 0 ? lumaSum / coverageSum : 0;

      raw[cursor] = Math.round(clamp01(grey) * 255);
      raw[cursor + 1] = Math.round(clamp01(alpha) * 255);
      cursor += 2;
    }
  }

  return raw;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = -1;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(raw: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(OUT_WIDTH, 0);
  header.writeUInt32BE(OUT_HEIGHT, 4);
  header[8] = 8; // bit depth
  header[9] = 4; // colour type: greyscale + alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

const scene = buildScene();
drawScene(scene);

const output = resolve(process.cwd(), "public/art/campus-plate.png");
mkdirSync(dirname(output), { recursive: true });
const png = encodePng(downsample());
writeFileSync(output, png);

console.log(
  `campus-plate.png  ${OUT_WIDTH}×${OUT_HEIGHT}  ${scene.length} massings  ${(png.length / 1024).toFixed(1)} KB`,
);
