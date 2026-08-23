"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Start fetching a route when the reader shows they might go there.
 *
 * ── The gap this closes ────────────────────────────────────────────────────
 *
 * A `<Link>` with no `prefetch` prop is in Next's `auto` mode, which for a
 * dynamic route fetches only as far as the nearest loading boundary. For the
 * section drawer that means the skeleton is warm and the content is not, so a
 * click buys a panel that mounts almost immediately and then sits showing
 * placeholder blocks while the section is actually fetched. Measured on the
 * drawer: panel at ~77ms, real content at ~380ms.
 *
 * Prefetching on intent moves that fetch to where the reader is still deciding
 * — the moment a pointer settles on a row, or the row takes keyboard focus —
 * so by the time they commit, the payload is in the client cache and the panel
 * can mount with the real thing already in it. The drawer then slides in fully
 * rendered rather than sliding in and filling.
 *
 * ── Why intent rather than just `prefetch` ─────────────────────────────────
 *
 * `prefetch` fetches every link as it enters the viewport. On a search results
 * page that is one server round trip and one set of queries per row the reader
 * scrolled past, most of which they will never open — the cost lands on the
 * database whether or not anyone was interested. Hovering a row, or tabbing to
 * it, is the cheapest available signal that someone actually is.
 *
 * The delay is the other half: a pointer crossing a list on its way somewhere
 * else passes over rows without meaning anything by it. Waiting a moment
 * before firing means a sweep costs nothing and a pause costs one fetch.
 *
 * Touch has no hover, so a touch start fires immediately — it is already a
 * commitment, and it still buys the ~100ms the browser spends deciding the
 * gesture was a tap rather than a scroll.
 */

/** Long enough to ignore a pointer passing through, short enough to still win. */
const INTENT_DELAY_MS = 80;

/**
 * Module scope, so a row that has already been prefetched stays prefetched
 * across re-renders and remounts as the list is filtered and re-sorted.
 * Next caches the payload itself; this only avoids asking it to.
 */
const alreadyRequested = new Set<string>();

export interface IntentHandlers {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onTouchStart: () => void;
}

export function usePrefetchOnIntent(href: string): IntentHandlers {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = useCallback(() => {
    if (alreadyRequested.has(href)) return;
    alreadyRequested.add(href);
    /*
     * Prefetching is a nicety, and a nicety must never be able to break the
     * page it is decorating. `router.prefetch` is a no-op in development and
     * can reject on a route that fails to resolve; neither is worth an
     * unhandled rejection in the console, let alone an error boundary.
     */
    try {
      void Promise.resolve(router.prefetch(href)).catch(() => {});
    } catch {
      /* prefetching is optional; navigation still works without it */
    }
  }, [href, router]);

  const start = useCallback(() => {
    if (alreadyRequested.has(href) || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fire();
    }, INTENT_DELAY_MS);
  }, [fire, href]);

  const cancel = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // A row unmounted mid-hover — filtered out, or the list re-sorted — must not
  // leave a timer pointing at a router it no longer has any business calling.
  useEffect(() => cancel, [cancel]);

  return {
    onPointerEnter: start,
    onPointerLeave: cancel,
    onFocus: start,
    onBlur: cancel,
    onTouchStart: fire,
  };
}
