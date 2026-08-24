"use client";

import { useSyncExternalStore } from "react";

/**
 * Is a course drawer currently open as a *pushing* rail?
 *
 * The drawer lives in the `@drawer` slot, a sibling of `{children}` in the root
 * layout, so it cannot pass a prop to the nav rail that has to get out of its
 * way — and the root layout is not ours to add a provider to. `<html>` is the
 * one thing both sides already touch, which is exactly how `--drawer-rail`
 * already works. This is that same one-way handshake with a second signal on
 * it: the drawer sets `data-drawer-push` while it is pushing, anyone who cares
 * subscribes, and neither side imports the other.
 *
 * An attribute rather than another custom property because the consumer changes
 * its *structure*, not just a length — labels unmount, the account menu goes
 * compact. CSS can animate a width from a variable; it cannot do that.
 *
 * `useSyncExternalStore` rather than an effect: the attribute is already on the
 * document during hydration if a drawer deep-link was opened directly, and this
 * reads it at render time instead of painting the wrong state for one frame.
 * The server snapshot is `false` because there is no DOM to ask.
 */

const PUSH_ATTRIBUTE = "data-drawer-push";

function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributeFilter: [PUSH_ATTRIBUTE] });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return document.documentElement.hasAttribute(PUSH_ATTRIBUTE);
}

function getServerSnapshot(): boolean {
  return false;
}

export function useDrawerPush(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
