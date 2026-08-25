"use client";

import { useEffect, useRef, useState } from "react";

import { folderArt, folderGradientCss } from "@/lib/bookmarks/folder-art";

/**
 * A folder's cover, animated.
 *
 * ── Where this is used, and where it deliberately is not ──────────────────
 *
 * Only the `/saved` gallery, where there are at most a couple of dozen cards
 * and each is big enough that the motion reads as texture. The chip, the
 * picker row and the schedule dropdown use the static CSS gradient from
 * `folder-art.ts`. Three shaders inside a dropdown would be an animation
 * budget spent on something nobody is looking at.
 *
 * ── Four ways this degrades, all to the same picture ──────────────────────
 *
 * The static gradient renders underneath *always*, and the canvas fades in on
 * top only once it is genuinely drawing. So the failure modes are not special
 * cases with their own layout:
 *
 *   · `prefers-reduced-motion` → the canvas is never created.
 *   · No WebGL (old hardware, blocked context, a browser that has run out of
 *     contexts because the gallery is long) → `getContext` returns null and
 *     nothing is mounted.
 *   · Off screen → an `IntersectionObserver` stops the frame loop. A gallery
 *     of forty folders must not run forty render loops for the two you can
 *     see.
 *   · Tab hidden → `visibilitychange` stops it too, because a background tab
 *     spinning a GPU is a battery complaint.
 *
 * The shader resolves the same three chart tokens through `getComputedStyle`,
 * so an animated card and its own chip elsewhere on the page are literally the
 * same colours, and both flip with the theme.
 */

export interface FolderCoverProps {
  folderId: string;
  className?: string;
}

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/*
 * Three drifting blobs over a two-colour wash — the moving version of the same
 * three radial gradients the CSS draws. `u_time` advances slowly (the whole
 * loop is minutes long) because a folder cover that visibly cycles turns into
 * something you watch instead of something you scan past.
 */
const FRAGMENT_SHADER = `
precision mediump float;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_seed;
uniform vec3  u_a;
uniform vec3  u_b;
uniform vec3  u_c;

float blob(vec2 uv, vec2 center, float radius) {
  float d = distance(uv, center);
  return smoothstep(radius, 0.0, d);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  // Square up the sampling space so blobs stay round on a wide card.
  uv.x *= u_resolution.x / u_resolution.y;

  float t = u_time * 0.06 + u_seed * 100.0;
  float w = u_resolution.x / u_resolution.y;

  vec2 p1 = vec2(0.24 * w + sin(t * 0.9) * 0.10, 0.28 + cos(t * 0.7) * 0.10);
  vec2 p2 = vec2(0.78 * w + cos(t * 0.6) * 0.12, 0.34 + sin(t * 1.1) * 0.09);
  vec2 p3 = vec2(0.50 * w + sin(t * 0.5) * 0.14, 0.82 + cos(t * 0.8) * 0.11);

  vec3 color = mix(u_a, u_c, uv.y) * 0.22;
  color += u_a * blob(uv, p1, 0.62) * 0.62;
  color += u_b * blob(uv, p2, 0.55) * 0.52;
  color += u_c * blob(uv, p3, 0.50) * 0.44;

  gl_FragColor = vec4(color, 1.0);
}
`;

export function FolderCover({ folderId, className }: FolderCoverProps) {
  const art = folderArt(folderId);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPainting, setIsPainting] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    // Read the preference here rather than through a hook: this effect has to
    // decide whether to allocate a GL context at all, and a hook's value
    // arrives after the first paint.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const gl =
      canvas.getContext("webgl", { alpha: false, antialias: false, depth: false }) ?? null;
    if (!gl) return;

    const program = buildProgram(gl);
    if (!program) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      seed: gl.getUniformLocation(program, "u_seed"),
      a: gl.getUniformLocation(program, "u_a"),
      b: gl.getUniformLocation(program, "u_b"),
      c: gl.getUniformLocation(program, "u_c"),
    };

    // The same three tokens the CSS gradient uses, resolved off the live
    // element so a theme flip repaints the shader with the new palette.
    const palette = art.stops.map((token) => readToken(host, token));
    gl.uniform3fv(uniforms.a, palette[0]);
    gl.uniform3fv(uniforms.b, palette[1]);
    gl.uniform3fv(uniforms.c, palette[2]);
    gl.uniform1f(uniforms.seed, art.seed);

    let frame = 0;
    let running = false;
    let visible = true;
    let onScreen = false;
    const started = performance.now();

    const resize = () => {
      // Half-resolution is deliberate: this is a soft gradient with no edges,
      // so the DPR-perfect version costs four times the fill rate to draw a
      // picture nobody can tell apart.
      const ratio = Math.min(window.devicePixelRatio || 1, 2) / 2;
      const width = Math.max(1, Math.round(host.clientWidth * ratio));
      const height = Math.max(1, Math.round(host.clientHeight * ratio));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.resolution, width, height);
    };

    const draw = () => {
      if (!running) return;
      resize();
      gl.uniform1f(uniforms.time, (performance.now() - started) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = requestAnimationFrame(draw);
    };

    const sync = () => {
      const shouldRun = visible && onScreen;
      if (shouldRun === running) return;
      running = shouldRun;
      if (running) {
        frame = requestAnimationFrame(draw);
        setIsPainting(true);
      } else {
        cancelAnimationFrame(frame);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { rootMargin: "120px" },
    );
    observer.observe(host);

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      // Contexts are a scarce per-document resource — a browser will drop the
      // oldest once a gallery has opened too many. Releasing on unmount keeps
      // a long scroll from silently killing the cards above it.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [art.seed, art.stops]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={className}
      // The static art is the floor, not the fallback: it is always painted,
      // and the canvas fades in over it only once it is actually drawing.
      style={{ backgroundImage: folderGradientCss(art) }}
    >
      <canvas
        ref={canvasRef}
        className="size-full transition-opacity duration-500 ease-out"
        style={{ opacity: isPainting ? 1 : 0 }}
      />
    </div>
  );
}

/**
 * `--color-chart-N` as a `vec3` of 0..1 floats.
 *
 * The tokens can be any CSS colour syntax the theme happens to use, so rather
 * than parse them this borrows the browser's own parser: paint the value onto
 * a detached element, read back the computed `rgb(...)`, which is normalised.
 */
function readToken(host: HTMLElement, token: string): Float32Array {
  const raw = getComputedStyle(host).getPropertyValue(token).trim();
  const probe = document.createElement("span");
  probe.style.color = raw || "#888";
  probe.style.display = "none";
  host.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  const parts = computed.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return new Float32Array([0.5, 0.5, 0.5]);
  return new Float32Array([
    Number(parts[0]) / 255,
    Number(parts[1]) / 255,
    Number(parts[2]) / 255,
  ]);
}

function buildProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // A link failure is not worth a console error on a decorative surface — the
  // static gradient underneath is already a complete picture.
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
}

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
