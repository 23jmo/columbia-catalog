"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * A before/after wipe over two full pages.
 *
 * Both pages are laid into the same grid cell, so the wrapper is as tall as
 * the taller of the two and both scroll together. The "after" layer sits on
 * top and is cut with `clip-path` from the left edge to the divider, so
 * left of the line is the page as shipped and right of it is the redesign.
 * `clip-path` creates a stacking context, which is what keeps any fixed or
 * sticky chrome inside the redesign from escaping its half.
 *
 * Only the handle drags. The pages underneath keep their links, and a page
 * you cannot click is not a fair comparison. A range input backs the handle
 * for keyboard use; it is visually the same knob.
 *
 * Temporary, like the page that mounts it.
 */
export function CompareSlider({ before, after }: { before: ReactNode; after: ReactNode }) {
  const [position, setPosition] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, next)));
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(event.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setPosition((p) => Math.max(0, p - 2));
      if (event.key === "ArrowRight") setPosition((p) => Math.min(100, p + 2));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={frame} className="relative isolate grid w-full overflow-x-clip">
      <div className="col-start-1 row-start-1 min-w-0">{before}</div>

      <div
        className="col-start-1 row-start-1 min-w-0"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        aria-hidden={position >= 100}
      >
        {after}
      </div>

      {/* The divider: full height of the taller page, knob pinned mid-viewport. */}
      <div
        className="absolute inset-y-0 z-10 w-0"
        style={{ left: `${position}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="absolute inset-y-0 -left-px w-0.5 bg-white mix-blend-difference" />
        <div
          className="sticky top-[calc(50vh-24px)] -ml-6 flex size-12 cursor-ew-resize touch-none items-center justify-center rounded-full border border-black/10 bg-white text-black shadow-lg"
          role="slider"
          aria-label="Reveal the redesign"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          tabIndex={0}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M7 5 2 10l5 5M13 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <Tag side="left">Before</Tag>
      <Tag side="right">After</Tag>
    </div>
  );
}

function Tag({ side, children }: { side: "left" | "right"; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed top-3 z-20 rounded-full bg-black/75 px-3 py-1 text-xs font-medium tracking-wide text-white uppercase backdrop-blur"
      style={side === "left" ? { left: 12 } : { right: 12 }}
    >
      {children}
    </div>
  );
}
