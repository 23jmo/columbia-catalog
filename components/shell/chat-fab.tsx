"use client";

import Link from "next/link";
import { RiChat3Line } from "@remixicon/react";

import { CHAT_PATH } from "@/lib/agent/history-format";
import { haptic } from "@/lib/haptics";
import { cx } from "@/utils/cx";

/**
 * Always-on door to `/chat`, parked in the thumb's corner.
 *
 * Chat used to be the home page. It is now one item over in the rail — the
 * right place for a box you only open once the list did not cover your case,
 * and the wrong place for a destination that on a phone lives behind the
 * hamburger. This button is that gap: one tap from any other screen, without
 * asking the student to remember that the thing they want is named "Chat"
 * and sits second.
 *
 * ── Why this is a sibling of the page card, not inside it ──────────────────
 *
 * The mobile shell puts `translate3d` on the page while the rail slides out.
 * `position: fixed` inside a transformed ancestor attaches to that ancestor,
 * not the viewport — the same trap `JumpToLatest` portals out of. Mounting
 * next to the card, not in it, keeps the button on the screen while the
 * page moves.
 *
 * ── Why it hides on `/chat` ────────────────────────────────────────────────
 *
 * The page already IS the box. A button to the page you are on is a no-op
 * that covers the composer.
 */
export function ChatFab({ hidden }: { hidden?: boolean }) {
  if (hidden) return null;

  return (
    <Link
      href={CHAT_PATH}
      aria-label="Open chat"
      data-haptic=""
      onClick={() => haptic("selection")}
      className={cx(
        // z-40: above the page card (z-10) and its header (z-30 inside that
        // card), below the course drawer and toasts (both z-100). A sheet
        // covering the page should cover this too.
        "fixed z-40",
        "right-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]",
        "flex size-14 items-center justify-center rounded-full",
        "bg-button-primary text-text-white shadow-lg",
        "button-press-motion",
        "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring",
        "transition-[box-shadow,transform] duration-150 ease-out",
        "hover:-translate-y-px hover:shadow-xl",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      <RiChat3Line className="size-6" aria-hidden />
    </Link>
  );
}
