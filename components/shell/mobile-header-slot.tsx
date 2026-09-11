"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Lets a page put its own controls in the phone top bar.
 *
 * ── Why a portal and not a prop ────────────────────────────────────────────
 *
 * The bar lives in `MobileShell`, which wraps `<main>` from `AppShell` — three
 * levels above any page. The assistant's breadcrumb is derived from live
 * `messages` state inside `AssistantHome`, so no render in between knows the
 * title: passing it down would mean lifting the whole conversation into the
 * shell, and the shell is shared by six routes that do not have one.
 *
 * A portal moves the *output* up without moving the *state* up, which is the
 * one thing props cannot do here.
 *
 * ── Why the bar has no idea whether it was claimed ─────────────────────────
 *
 * A claimed bar has to hide its centred page name — "Chat" is wrong once you
 * are reading a thread. The obvious way to arrange that is a refcount in
 * context, and it is wrong twice over: React writes portal children outside the
 * provider's render, so the flag can only be set from an effect, and an effect
 * lands after the commit that already painted. For one frame the bar shows the
 * page name *and* the breadcrumb, jammed together.
 *
 * So the bar does not track it at all. The slot is a `peer` and the fallback
 * hides itself with `peer-[:not(:empty)]:hidden` — the same commit that writes
 * the portal children makes the slot non-`:empty`, so the swap happens in the
 * paint rather than one after it. No state, no effect, nothing to get out of
 * sync. See `mobile-nav.tsx` for the two classes that do it.
 */
const MobileHeaderSlot = createContext<HTMLElement | null>(null);

export function MobileHeaderSlotProvider({
  node,
  children,
}: {
  node: HTMLElement | null;
  children: ReactNode;
}) {
  return <MobileHeaderSlot.Provider value={node}>{children}</MobileHeaderSlot.Provider>;
}

/**
 * Renders `children` into the phone top bar. A no-op above `xl`, where the bar
 * is `display:none` and its contents leave the accessibility tree with it.
 */
export function MobileHeaderPortal({ children }: { children: ReactNode }) {
  const node = useContext(MobileHeaderSlot);
  if (!node) return null;
  return createPortal(children, node);
}
