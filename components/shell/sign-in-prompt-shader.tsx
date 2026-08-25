"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/utils/cx";

/**
 * The sign-in card's artwork: an ordered-dither of Morningside Heights sitting
 * in moving water, with the surface catching light.
 *
 * ── What replaced what ──────────────────────────────────────────────────────
 *
 * This used to be four blurred radial gradients in a stack, animated on a
 * three-second loop, with a sparkle canvas on top. It was four CSS blobs
 * pretending to be a flame, and it read as one — a soft blue smear that could
 * have been any product's empty state. The problem was not the execution. A
 * blurred gradient has no subject; there is nothing in it to look at, so no
 * amount of tuning makes it worth looking at.
 *
 * What is here now has a subject. The plate at `/art/campus-plate.png` is an
 * axonometric of the actual campus — real surveyed footprints and real roof
 * heights, the same NYC Open Data survey the course drawer's 3D campus card
 * renders, baked by `scripts/build-signin-art.ts`. Low Library is the notched
 * cross at the centre of the frame.
 *
 * ── Why a dither, and why an ORDERED one ────────────────────────────────────
 *
 * The plate is a grey-and-alpha silhouette, and this shader quantises it to a
 * single ink colour through an 8×8 Bayer matrix. That does three useful things
 * at once:
 *
 *   1. It is theme-agnostic. One asset, one ink token, and the art inverts with
 *      the theme for free — a full-colour illustration would need two files and
 *      would still be wrong for any theme added later.
 *   2. It turns the plate's soft atmospheric ramp into visible texture. This is
 *      the whole reason the bake script bothers with haze and per-face
 *      lighting: a gradient crossed by a Bayer matrix reads as woven pattern,
 *      where a flat fill would quantise into a flat block.
 *   3. It sets a grid. Every pixel of this canvas — the campus, the ripple, the
 *      glints — lands on the same dither cell, which is what makes the water
 *      look like it belongs to the image instead of like a filter laid over it.
 *
 * Ordered rather than error-diffused because ordered is stateless: each cell's
 * threshold is a pure function of its coordinates, so it can be evaluated in a
 * fragment shader, and — more importantly — the pattern does not crawl when the
 * image moves underneath it. Floyd–Steinberg would have to re-diffuse the whole
 * frame every tick and would boil.
 *
 * ── Why water is density, not colour ────────────────────────────────────────
 *
 * The obvious way to draw a highlight is to add bright pixels. In a one-bit
 * dither there are no bright pixels to add — there is ink and there is paper.
 * So the sheen is drawn the other way round: where light crosses the surface it
 * *removes* ink, and the band reads as a lightening sweep because the dither
 * thins under it. Glints are the only thing that adds, and they are deliberately
 * sparse, because a dense field of them stops reading as sparkle and starts
 * reading as noise.
 *
 * ── The waterline ──────────────────────────────────────────────────────────
 *
 * There is no mirrored copy of the plate. The impression of the campus standing
 * in water comes from a single ramp: ripple amplitude climbs toward the bottom
 * edge, so the skyline stays crisp while the lower band smears and swims. That
 * is much cheaper than a real reflection and, at this size, indistinguishable
 * from one.
 *
 * ── Motion budget ───────────────────────────────────────────────────────────
 *
 * Unlike a still dither, ambient water has to keep drawing, so the frame loop
 * cannot simply stop when nothing is being pointed at. It is gated instead, on
 * the same three conditions the `/saved` folder covers use: the tab is visible,
 * the card is on screen, and the reader has not asked for reduced motion. A
 * card scrolled out of view or sitting in a popover nobody has opened runs no
 * loop at all.
 *
 * ── Degrading ───────────────────────────────────────────────────────────────
 *
 * The plate is also rendered as a plain `<img>` underneath, dimmed to roughly
 * the dither's ink weight. That is what shows if WebGL is missing, if the
 * context is lost, or in the moment before the texture decodes — so the card
 * never has a hole in it, and there is never a layout shift. `getContext`
 * failing is a normal outcome here, not an error: this component is mounted
 * inside the account popover, and a long-lived page can genuinely run out of
 * contexts.
 *
 * An earlier version of this file carried a note that WebGL had been "dropped
 * because it kept mounting at 0×0 inside the hidden popover and never
 * recovered". That was real, and it is why nothing here is created eagerly: the
 * context, the texture and the first draw all wait for a `ResizeObserver` to
 * report a box worth drawing into. A popover that opens later gets its first
 * frame when it opens.
 */

const PLATE_SRC = "/art/campus-plate.png";
const PLATE_WIDTH = 1024;
const PLATE_HEIGHT = 432;

/**
 * Dither cell in CSS pixels. Big enough to read as a deliberate print screen
 * rather than as noise or as a failed anti-alias, small enough that a building
 * gets enough cells to keep its shape — at three the campus came out as
 * chunky blocks, and a coarse grid cannot shimmer, because the sheen has
 * nowhere to move between one cell and the next.
 */
const CELL_CSS_PX = 2;

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D u_plate;
uniform vec2  u_resolution;   // canvas size in device pixels
uniform vec2  u_plateSize;    // texture size in texels
uniform float u_cell;         // dither cell edge in device pixels
uniform float u_time;         // seconds; frozen under reduced motion
uniform float u_stir;         // 0 = still, 1 = someone is at the card
uniform vec3  u_ink;
uniform vec3  u_glint;

// ---------------------------------------------------------------------------
// Ordered dither
// ---------------------------------------------------------------------------
//
// The recursive formulation of the Bayer matrix: a 2x2 evaluated in closed
// form, then refined twice. Cheaper than a 64-entry lookup and, because it is
// pure arithmetic on the cell coordinate, it costs nothing to evaluate several
// times per fragment — which is what keeps the plate, the sheen and the glints
// all on one shared grid.

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}

float bayer8(vec2 a) {
  float b4 = bayer2(a * 0.25) * 0.25 + bayer2(a * 0.5);
  // The matrix runs 0/64 .. 63/64, and a threshold of exactly zero is a trap:
  // every comparison against it is a step(), and step(0.0, 0.0) is 1.0, so the
  // one cell per 8x8 block holding the zero entry inks even at zero density.
  // That is a lit dot every eight cells across the whole canvas — a visible
  // lattice, including everywhere the art is supposed to be masked out
  // entirely. Half a step up puts every threshold strictly inside (0, 1),
  // which is the standard (index + 0.5) / n^2 convention and costs nothing.
  return b4 * 0.25 + bayer2(a) + (0.5 / 64.0);
}

// ---------------------------------------------------------------------------
// Value noise
// ---------------------------------------------------------------------------

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(19.0, 7.3);
    a *= 0.5;
  }
  return v;
}

// ---------------------------------------------------------------------------

/**
 * The art occupies the right of the card; the copy has the left. Everything
 * below works in ART space, not canvas space — the plate is fitted to that
 * region rather than to the whole canvas, which keeps a 1024x432 plate from
 * being cropped to a letterbox slot inside a card four times as wide as it is
 * tall.
 *
 * The plate starts about a third across, which is well behind the paragraph.
 * That is deliberate: the art is given room to be large, and it is kept off the
 * copy by the fade below rather than by where it starts. Starting it later
 * instead would buy the same clearance at the cost of a cramped campus.
 */
const float ART_LEFT = 0.30;

vec2 artSpace(vec2 uv) {
  return vec2((uv.x - ART_LEFT) / (1.0 - ART_LEFT), uv.y);
}

/** "Cover" fit within the art region, so the plate keeps its proportions in
 * whatever box the card gives this canvas — the account popover and the
 * profile page are not the same shape. */
vec2 coverUv(vec2 art) {
  float regionAspect = (u_resolution.x * (1.0 - ART_LEFT)) / u_resolution.y;
  float plateAspect = u_plateSize.x / u_plateSize.y;
  vec2 scale = regionAspect > plateAspect
    ? vec2(1.0, plateAspect / regionAspect)
    : vec2(regionAspect / plateAspect, 1.0);
  return (art - 0.5) * scale + 0.5;
}

/**
 * How much of the water this row is in: 0 across the skyline, rising to 1 at
 * the bottom edge. Everything that says "water" rather than "print" is scaled
 * by this — the ripple, the extra sheen, the glint density — so the campus
 * keeps its edges and only its footing swims.
 */
float waterline(float y) {
  // Written as 1 - smoothstep rather than with the edges swapped: the spec
  // leaves smoothstep undefined when edge0 >= edge1, and drivers only happen
  // to agree about it.
  return 1.0 - smoothstep(0.0, 0.52, y);
}

/**
 * Surface displacement, in art-space units.
 *
 * Two things are happening. A very slow, very shallow warp across the whole
 * plate is the wind — barely a pixel at this size, but enough that the image is
 * never quite still. Under it, a travelling wave whose amplitude follows the
 * waterline is the ripple. The wave is deliberately anisotropic: much stronger
 * horizontally than vertically, because water displaces a reflection sideways
 * and a symmetrical wobble reads as heat haze instead.
 */
vec2 surface(vec2 art, float t, float stir) {
  float wind = fbm(vec2(art.x * 1.9 + t * 0.055, art.y * 2.3 - t * 0.041));
  vec2 breeze = vec2(wind - 0.5, (fbm(vec2(art.y * 2.4 - t * 0.037, art.x * 1.7)) - 0.5) * 0.55);

  float depth = waterline(art.y);
  float swell = sin(art.y * 26.0 - t * 0.85 + fbm(vec2(art.x * 3.0, t * 0.12)) * 6.2831);
  float chop = sin(art.x * 9.0 + art.y * 17.0 + t * 1.35);

  float amount = 0.0035 + 0.0065 * stir;
  vec2 ripple = vec2(swell * 0.7 + chop * 0.3, swell * 0.12) * depth * (0.010 + 0.008 * stir);

  return breeze * amount + ripple;
}

/**
 * The sheen: a broad, soft band of light crossing the surface on a long period.
 * Returned as 0..1, and used to REMOVE ink rather than add it — see the header.
 */
float sheen(vec2 art, float t) {
  // A diagonal sweep, slow enough (about fourteen seconds end to end) that it
  // reads as light moving over the card rather than as an animation looping.
  float phase = fract(art.x * 0.62 + art.y * 0.28 - t * 0.07);
  float centred = abs(phase - 0.5) * 2.0;
  float band = 1.0 - smoothstep(0.0, 0.62, centred);
  // Softened by noise so the band has an edge like light on water rather than
  // like a gradient wiped across a rectangle.
  return band * (0.72 + 0.28 * fbm(vec2(art.x * 4.0, art.y * 4.0 - t * 0.2)));
}

void main() {
  vec2 fragment = gl_FragCoord.xy;

  // Everything samples at the CENTRE of its dither cell, not at the fragment.
  // Sampling per-fragment would resolve detail finer than the cell can display
  // and the plate would shimmer along its edges — the wrong kind of shimmer.
  vec2 cellId = floor(fragment / u_cell);
  vec2 cellCentre = (cellId + 0.5) * u_cell;
  vec2 uv = cellCentre / u_resolution;
  float threshold = bayer8(cellId);

  vec2 art = artSpace(uv);

  // The copy sits on the left. Rather than lay a scrim over the canvas, the art
  // is faded out from under it — one fewer element, and one fewer thing to keep
  // in sync with the copy's width.
  //
  // The ramp starts inside the art region rather than at its edge. Running it
  // all the way from the edge sounds gentler and is not: spread that thin, the
  // subject spends most of the region at partial density and only reaches full
  // strength in the last hundred pixels, so the campus is a ghost everywhere
  // and solid nowhere. Holding at zero and then ramping over about a fifth of
  // the card keeps the gradient soft — a dither needs the ramp long enough that
  // no two adjacent bands differ by a whole dot — while still leaving the
  // subject somewhere to actually be.
  float clearing = pow(smoothstep(0.30, 0.72, art.x), 1.2);

  float t = u_time;
  float stir = u_stir;

  vec4 plate = texture2D(u_plate, coverUv(art + surface(art, t, stir)));
  float luma = plate.r;
  float coverage = plate.a;

  // Ink density.
  //
  // A tone curve, not a straight read of the plate. The bake composes the plate
  // — a solid core, a neighbourhood stipple, and real paper at the margins —
  // and this places the black and white points on it.
  //
  // An S-curve rather than a gamma. A gamma steep enough to make the core solid
  // also lifts the surrounding stipple into visibility, and the whole art
  // region goes back to being an even woven field with no subject in it; the
  // toe is what keeps the surround quiet while the shoulder brings the campus
  // up.
  //
  // The white point sits above the plate's actual maximum on purpose. Putting
  // it at the top of the range makes the densest roofs solid black, and a solid
  // area has no weave in it — the picture goes blotchy, hard shapes against
  // bare paper, which is the one thing a halftone is supposed to avoid. Leaving
  // headroom keeps even the heaviest mass as dense weave.
  //
  // Worth knowing if these numbers ever need moving: this curve cannot rescue a
  // plate that has no negative space. An earlier bake filled the whole frame,
  // and every threshold tried here only traded a dense checkerboard for a
  // sparse one. The fix was in the bake, not here.
  float mass = smoothstep(0.04, 0.82, (1.0 - luma) * coverage);
  float density = mass * clearing * 1.15;

  float depth = waterline(art.y);
  float light = sheen(art, t);

  // Light crossing the surface thins the dither. Strongest on the water, where
  // a real surface would be doing the reflecting, and stronger again when
  // someone is at the card.
  //
  // These numbers are far larger than they look like they should be. A dither
  // only has whole dots to spend: a ten per cent change in density moves about
  // one cell in ten, which is inside the noise of the pattern and reads as
  // nothing at all. Anything meant to be SEEN through a one-bit quantiser has
  // to be coarse in the underlying signal.
  density *= 1.0 - light * (0.40 + 0.35 * depth) * (0.60 + 0.40 * stir);

  // The water itself carries tone even where the campus does not, so the lower
  // band is a surface rather than empty paper. Banded by the swell so it reads
  // as ripple lines, and raised to a power so the crests stay narrow and the
  // troughs stay open — an unshaped sine fills the whole band evenly and reads
  // as grey wash rather than as water.
  float swellLines = 0.5 + 0.5 * sin(art.y * 34.0 - t * 0.9 + fbm(vec2(art.x * 2.6, t * 0.1)) * 6.2831);
  swellLines = pow(swellLines, 2.2);
  density += depth * clearing * swellLines * (0.38 + 0.16 * stir) * (0.50 + 0.50 * light);

  float plateInk = step(threshold, density);

  // Glints: individual cells catching the light. Sparse on purpose — a dense
  // field of these stops reading as sparkle and starts reading as noise. Seeded
  // from the cell id directly rather than from smooth noise sampled at a
  // rational frequency, which lands on the same phase every few cells and lays
  // the sparkles out on a visible lattice.
  float twinkle = hash(cellId + floor(vec2(t * 2.2, hash(cellId) * 5.0)));
  // Squared, so glints gather in the bright core of the sweep instead of
  // spreading evenly across its whole width — scattered evenly they read as
  // stray coloured pixels, gathered they read as light on a surface.
  //
  // Gated on there being something to glint off — mass above, swell below.
  // Ungated they scatter across bare paper, which reads as stray coloured
  // pixels rather than as light on a surface.
  float surface = max(mass, depth * swellLines);
  float glintChance = light * light * (0.30 + 0.70 * depth) * (0.55 + 0.45 * stir)
    * clearing * (0.15 + 0.85 * surface);
  float glintInk = step(1.0 - glintChance * 0.34, twinkle);

  float ink = max(plateInk, glintInk);
  if (ink < 0.5) discard;

  // Ink under the sheen picks up a wash of the light's colour, so the band is
  // legible as light and not merely as a thinner patch of dither.
  vec3 colour = mix(u_ink, u_glint, light * (0.10 + 0.30 * depth) * (0.5 + 0.5 * stir));
  // Tinted toward the accent, not replaced by it: a cell painted the full accent
  // colour reads as a stray blue pixel, where a blue-shifted dark one reads as
  // ink catching the light.
  colour = mix(colour, u_glint, glintInk * 0.72);

  // 0.62 rather than 1.0: this is artwork behind a card, not a photograph in
  // it. Glints are allowed to sit brighter so they actually register.
  float alpha = mix(0.62, 0.95, glintInk);
  gl_FragColor = vec4(colour, alpha);
}
`;

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  // A link failure is not worth a console error on a decorative surface — the
  // `<img>` underneath is already showing the same picture.
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * A theme token as a `vec3` of 0..1 floats.
 *
 * The token can be any CSS colour syntax the theme happens to use, so rather
 * than parse it this borrows a parser that always answers in sRGB bytes: paint
 * the value into a one-pixel canvas and read the pixel back.
 *
 * Reading `getComputedStyle(...).color` and pulling three numbers out of it
 * with a regex looks equivalent and is not. Computed style preserves modern
 * colour spaces verbatim, and this theme's text tokens compute to `lab(...)` —
 * so the regex returns lightness and two opponent-axis values and treats them
 * as red, green and blue. In light mode that is `lab(2.75% 0 0)`, which lands
 * on a near-black by coincidence and looks correct; in dark mode it is
 * `lab(97% 0 0)`, which comes out as dark red on a dark card. A canvas does the
 * conversion properly whatever the source syntax.
 *
 * The fill style is set twice on purpose: an unparseable value is ignored by
 * the canvas rather than throwing, so the first assignment stands as the
 * fallback.
 */
function readToken(host: HTMLElement, token: string): [number, number, number] {
  const raw = getComputedStyle(host).getPropertyValue(token).trim();
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) return [0.5, 0.5, 0.5];

  context.fillStyle = "#888888";
  context.fillStyle = raw;
  context.fillRect(0, 0, 1, 1);

  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return [red / 255, green / 255, blue / 255];
}

export interface SignInPromptShaderProps {
  /** Whether the card is being pointed at or holds keyboard focus. Raises the
   * swell and the glint rate; it never switches anything on or off, because the
   * water is meant to be there before you arrive. */
  stirred?: boolean;
  className?: string;
}

export function SignInPromptShader({ stirred = false, className }: SignInPromptShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPainting, setIsPainting] = useState(false);

  /** Read by the frame loop rather than closed over, so toggling hover does not
   * tear down and rebuild the GL setup. */
  const stirredRef = useRef(stirred);

  /** Set by the effect below; called on hover to wake a loop that has stopped. */
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stirredRef.current = stirred;
    wakeRef.current?.();
  }, [stirred]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};

    let plate: HTMLImageElement | null = null;
    let disposed = false;
    let frame = 0;

    /** Eased. The swell has weight: it comes up over about half a second and
     * settles back over rather longer, because water that changes state the
     * instant the pointer leaves reads as a light switch. */
    let stir = 0;
    let lastTick = 0;
    let clock = 0;

    let onScreen = true;

    /** Resolved theme colours, cached. Re-reading these per frame would mean a
     * detached element and a style recalculation sixty times a second for two
     * values that only change when the theme does. */
    let ink: [number, number, number] = [0.5, 0.5, 0.5];
    // The accent ramp rather than a raw blue, so the water catches whatever hue
    // the product is wearing — accent-* is re-tintable at runtime.
    let glint: [number, number, number] = [0.2, 0.57, 1.0];

    const refreshTokens = () => {
      const host = canvas.parentElement ?? canvas;
      ink = readToken(host, "--color-text-primary");
      glint = readToken(host, "--color-accent-400");
    };

    /** True while the loop has a reason to keep drawing. Ambient water still
     * has to answer for its frames: off screen, in a hidden tab, or under
     * reduced motion, it draws one frame and stops. */
    const shouldAnimate = () =>
      onScreen && !document.hidden && !motionQuery.matches;

    const ensureContext = (): boolean => {
      if (gl) return true;
      const box = canvas.getBoundingClientRect();
      // The popover mounts this at 0×0. Wait for a real box — creating the
      // context now is what used to leave it permanently blank.
      if (box.width < 8 || box.height < 8) return false;

      gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,
      }) as WebGLRenderingContext | null;
      if (!gl) return false;

      program = buildProgram(gl);
      if (!program) {
        gl = null;
        return false;
      }

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );

      gl.useProgram(program);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      for (const name of [
        "u_plate",
        "u_resolution",
        "u_plateSize",
        "u_cell",
        "u_time",
        "u_stir",
        "u_ink",
        "u_glint",
      ]) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      refreshTokens();
      return true;
    };

    const ensureTexture = (): boolean => {
      if (!gl || !plate || !plate.complete || plate.naturalWidth === 0) return false;
      if (texture) return true;

      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // The plate is authored top-down; GL samples bottom-up.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, plate);
      // Clamped and linear: the shader already quantises, and a mipmap would
      // only blur the ramp the dither is reading.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return true;
    };

    const sizeCanvas = (): boolean => {
      const box = canvas.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(box.width * dpr);
      const height = Math.round(box.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl?.viewport(0, 0, width, height);
      }
      return true;
    };

    const draw = (): void => {
      if (!gl || !program) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniforms.u_plate, 0);
      gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
      gl.uniform2f(uniforms.u_plateSize, PLATE_WIDTH, PLATE_HEIGHT);
      gl.uniform1f(uniforms.u_cell, CELL_CSS_PX * dpr);
      gl.uniform1f(uniforms.u_time, clock);
      gl.uniform1f(uniforms.u_stir, stir);
      gl.uniform3f(uniforms.u_ink, ink[0], ink[1], ink[2]);
      gl.uniform3f(uniforms.u_glint, glint[0], glint[1], glint[2]);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const tick = (now: number): void => {
      frame = 0;
      if (disposed) return;

      const delta = lastTick === 0 ? 0 : Math.min((now - lastTick) / 1000, 0.05);
      lastTick = now;

      const target = stirredRef.current ? 1 : 0;
      // Asymmetric: rises in about half a second, settles back over about two.
      const rate = target > stir ? 2.2 : 0.55;
      stir += (target - stir) * Math.min(delta * rate, 1);

      const animating = shouldAnimate();
      if (animating) clock += delta;

      if (!ensureContext() || !sizeCanvas() || !ensureTexture()) {
        // Nothing to draw into yet. The ResizeObserver will call back.
        return;
      }

      draw();
      setIsPainting(true);

      if (animating) {
        frame = requestAnimationFrame(tick);
      } else {
        lastTick = 0;
      }
    };

    const wake = (): void => {
      if (disposed || frame !== 0) return;
      lastTick = 0;
      frame = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;

    plate = new Image();
    plate.decoding = "async";
    const onLoad = () => wake();
    // Listener before `src`: a plate already in the HTTP cache — and it will be,
    // because the `<img>` below asks for the same file — can otherwise finish
    // before anything is listening, and the first frame never gets scheduled.
    plate.addEventListener("load", onLoad);
    plate.src = PLATE_SRC;

    // A lost context leaves the `<img>` underneath showing, which is the same
    // picture — so there is nothing to repair and nothing to report.
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setIsPainting(false);
      disposed = true;
      cancelAnimationFrame(frame);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    const resizeObserver = new ResizeObserver(() => {
      texture = null; // force a re-upload against the new viewport
      wake();
    });
    resizeObserver.observe(canvas);

    // A gallery of cards must not run a loop for the ones you cannot see, and a
    // background tab spinning a GPU is a battery complaint.
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        if (onScreen) wake();
      },
      { rootMargin: "64px" },
    );
    intersectionObserver.observe(canvas);

    const onVisibility = () => wake();
    document.addEventListener("visibilitychange", onVisibility);
    motionQuery.addEventListener("change", onVisibility);

    // The tokens are cached, so the theme flip has to say so.
    const themeObserver = new MutationObserver(() => {
      refreshTokens();
      wake();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });

    wake();

    return () => {
      disposed = true;
      wakeRef.current = null;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      plate?.removeEventListener("load", onLoad);
      if (gl) {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
      gl = null;
      uniforms = {};
    };
  }, []);

  return (
    <div
      aria-hidden
      className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/*
        The fallback and the shader draw the same picture, so the swap is a
        cross-fade between two versions of one image rather than a replacement.
        It will never be the dither, but it is the same campus at the same
        density and in the same place, which is all the fallback has to be.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PLATE_SRC}
        alt=""
        className="absolute inset-y-0 right-0 h-full w-[70%] object-cover opacity-25 transition-opacity duration-500 mask-[linear-gradient(to_right,transparent_0%,transparent_30%,black_72%)] dark:invert"
        style={{ opacity: isPainting ? 0 : undefined }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full transition-opacity duration-500"
        style={{ opacity: isPainting ? 1 : 0 }}
      />
    </div>
  );
}
