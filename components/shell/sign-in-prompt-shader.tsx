"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/utils/cx";

/** Iridescent sparkle palette — teal/cyan core with warm edge glow. */
const SPARKLE_COLORS = ["#5eead4", "#22d3ee", "#67e8f9", "#818cf8", "#c084fc", "#fbbf24", "#ffffff"];

/**
 * Lightweight canvas sparkle inside a bust silhouette.
 * Runs only while mounted (dropdown open) — no WebGL dependency.
 */
export function SignInPromptShader({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const particles = Array.from({ length: 320 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 1.6 + 0.35,
      color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]!,
      twinkle: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.018 + 0.006,
    }));

    const insideSilhouette = (x: number, y: number, w: number, h: number) => {
      const nx = (x - w * 0.58) / (w * 0.42);
      const ny = (y - h * 0.06) / (h * 0.94);
      const inHead =
        ((nx - 0.52) / 0.34) ** 2 + ((ny - 0.2) / 0.26) ** 2 <= 1;
      const inShoulders = ny > 0.36 && ny < 0.98 && nx > 0.02 && nx < 0.98;
      return inHead || inShoulders;
    };

    const draw = () => {
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx.clearRect(0, 0, w, h);

      // Warm aura — matches the reference's yellow edge glow.
      const glow = ctx.createRadialGradient(w * 0.74, h * 0.42, 0, w * 0.74, h * 0.42, w * 0.62);
      glow.addColorStop(0, "rgba(255, 236, 170, 0.7)");
      glow.addColorStop(0.35, "rgba(255, 196, 90, 0.35)");
      glow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      frame += 1;
      const t = frame * 0.016;

      for (const p of particles) {
        const px = p.x * w;
        const py = p.y * h;
        if (!insideSilhouette(px, py, w, h)) continue;

        const alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * p.speed * 80 + p.twinkle));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cx(
        "pointer-events-none absolute inset-y-0 right-0 w-[58%]",
        "[mask-image:linear-gradient(to_right,transparent_0%,black_38%)]",
        "[-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_38%)]",
        className,
      )}
    />
  );
}
