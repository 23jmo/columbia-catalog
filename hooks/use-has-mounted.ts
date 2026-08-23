"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` on the server and through hydration, `true` on every render after.
 *
 * Two screens need this for the same reason: they display something the server
 * cannot know (a measured elapsed time, a scroll offset), and rendering a
 * placeholder for it during SSR is the only way the markup can match.
 *
 * ── Why not `useState(false)` + `useEffect(() => setState(true))` ──────────
 *
 * That is the familiar shape and React 19 flags it (`react-hooks/
 * set-state-in-effect`), correctly: it schedules a second render pass for a
 * value that was never uncertain — the component always mounts. Every consumer
 * of that state re-renders twice on first paint.
 *
 * `useSyncExternalStore` expresses the same thing as what it actually is: one
 * value read differently on the server than in the browser. React reads
 * `getServerSnapshot` while rendering HTML and during hydration, then reads
 * `getSnapshot` afterwards. No effect, no cascade.
 *
 * `subscribe` returns a no-op unsubscribe because the value never changes
 * again — there is no external store to listen to, which is precisely why this
 * is cheap. Both callbacks are module constants; a fresh closure per render
 * would make React re-subscribe (and, for `getSnapshot`, loop) forever.
 */
const subscribe = (): (() => void) => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHasMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
