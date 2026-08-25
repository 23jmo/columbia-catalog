"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RiArrowDownLine } from "@remixicon/react";

import {
  countMessagesBelowFold,
  distanceFromBottom,
  isNearBottom,
  moreMessagesLabel,
} from "@/lib/agent/stick-to-bottom";
import { cx } from "@/utils/cx";

import "./jump-to-latest.css";

/**
 * Follow the stream only while the student is already at the bottom.
 *
 * The page is the scroller (the composer is sticky; the thread has no overflow
 * pane). Pinning is "near the document end". Unpinning is a real user scroll
 * that leaves that zone. A token arriving while pinned jumps the page down;
 * a token arriving while unpinned only updates the pill count.
 *
 * The pill is portalled to `document.body`. The mobile shell keeps a
 * `translate3d` on its page card, which would otherwise make `position: fixed`
 * attach to that card instead of the viewport — and the pill would sit at the
 * document bottom, off-screen, the moment the student scrolled up.
 */

function scrollRoot(): Element {
  const thread = document.querySelector("[data-assistant-thread]");
  let node: Element | null = thread?.parentElement ?? null;
  while (node && node !== document.documentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    const scrolls =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

function scrollToEnd(behavior: ScrollBehavior) {
  const node = scrollRoot();
  node.scrollTo({ top: node.scrollHeight, behavior });
}

function readPinned(): boolean {
  const node = scrollRoot();
  return isNearBottom(distanceFromBottom(node.scrollTop, node.clientHeight, node.scrollHeight));
}

function readMoreCount(): number {
  const dock = document.querySelector("[data-assistant-dock]");
  const foldY = dock ? dock.getBoundingClientRect().top : window.innerHeight;
  const bottoms = [...document.querySelectorAll("[data-thread-message]")].map(
    (node) => node.getBoundingClientRect().bottom,
  );
  return Math.max(1, countMessagesBelowFold(bottoms, foldY));
}

function preferInstant(smooth: boolean): ScrollBehavior {
  if (!smooth) return "auto";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "auto";
  return "smooth";
}

export function useStickToBottom(streamKey: string, stickOnSend = false) {
  const pinned = useRef(true);
  const ignoreScroll = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const [more, setMore] = useState(1);

  const publish = useCallback(() => {
    const near = readPinned();
    pinned.current = near;
    setShowJump(!near);
    if (!near) setMore(readMoreCount());
  }, []);

  // Instant follow must not set `ignoreScroll`. Fast streams would swallow the
  // student's own wheel events and they could never unpin. Smooth jump is the
  // exception: mid-animation positions look unpinned, so we mute that burst.
  const jump = useCallback((smooth: boolean) => {
    pinned.current = true;
    setShowJump(false);
    if (smooth) {
      ignoreScroll.current = true;
      scrollToEnd(preferInstant(true));
      window.setTimeout(() => {
        ignoreScroll.current = false;
        publish();
      }, 450);
      return;
    }
    scrollToEnd("auto");
  }, [publish]);

  useLayoutEffect(() => {
    if (stickOnSend) pinned.current = true;
    if (pinned.current) jump(false);
    else publish();
  }, [streamKey, stickOnSend, jump, publish]);

  useEffect(() => {
    // A wheel/trackpad is the only thing that may unpin. Growing content
    // while pinned has to follow, not publish — publish would see the new
    // scrollHeight, think we left the bottom, and flash the pill mid-stream.
    const onScroll = () => {
      if (ignoreScroll.current) return;
      publish();
    };
    const onGrow = () => {
      if (ignoreScroll.current) return;
      if (pinned.current) jump(false);
      else publish();
    };
    const root = scrollRoot();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onGrow);
    const thread = document.querySelector("[data-assistant-thread]");
    const observer = thread ? new ResizeObserver(onGrow) : null;
    if (thread && observer) observer.observe(thread);
    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onGrow);
      observer?.disconnect();
    };
  }, [jump, publish]);

  return { showJump, more, jumpToLatest: () => jump(true) };
}

export function JumpToLatest({
  count,
  onJump,
}: {
  count: number;
  onJump: () => void;
}) {
  const [bottom, setBottom] = useState(168);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const dock = document.querySelector("[data-assistant-dock]");
    const update = () => {
      const node = dock ?? document.querySelector("[data-assistant-dock]");
      if (!node) return;
      // 12px above the composer top, in viewport space (the pill is portalled).
      setBottom(Math.max(12, window.innerHeight - node.getBoundingClientRect().top + 12));
    };
    update();
    const observer = dock ? new ResizeObserver(update) : null;
    if (dock && observer) observer.observe(dock);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed left-1/2 z-50 -translate-x-1/2"
      style={{ bottom }}
    >
      <button
        type="button"
        onClick={onJump}
        className={cx(
          "assistant-jump-glass group pointer-events-auto relative isolate",
          "flex items-center gap-1.5 rounded-full px-3.5 py-2",
          "text-caption-1-medium text-text-primary tabular-nums",
          "backdrop-blur-[24px] backdrop-saturate-150 backdrop-brightness-105",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          "transition-[transform,box-shadow] duration-200 ease-out",
          "hover:-translate-y-px active:scale-[0.96]",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100",
        )}
        style={{
          boxShadow: [
            "0 10px 32px color-mix(in oklab, var(--color-text-primary) 16%, transparent)",
            "inset 0 1px 0 rgb(255 255 255 / 0.55)",
            "inset 0 -1px 0 rgb(0 0 0 / 0.08)",
          ].join(", "),
        }}
      >
        {/*
          Liquid glass: frost, a top sheen, and the landing rim-light ring.
          Tint is a token mix so it flips under `.dark` without a `dark:` prefix.
        */}
        <span
          aria-hidden
          data-jump-tint
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-background-primary-default) 58%, transparent)",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-0 h-1/2 rounded-full"
          style={{
            background: "linear-gradient(to bottom, rgb(255 255 255 / 0.5), transparent)",
          }}
        />
        <span aria-hidden className="landing-glass-stroke" />
        <span className="relative z-10 flex items-center gap-1.5">
          {moreMessagesLabel(count)}
          <RiArrowDownLine aria-hidden className="size-3.5" />
        </span>
      </button>
    </div>,
    document.body,
  );
}
