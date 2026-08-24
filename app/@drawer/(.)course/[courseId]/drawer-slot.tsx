"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { CourseDrawer } from "@/app/course/[courseId]/course-drawer";

/**
 * Unmounts the drawer when the reader navigates somewhere that is not a course.
 *
 * ── The Next.js behaviour this exists to correct ───────────────────────────
 *
 * Parallel-route slots do NOT clear themselves on a client-side navigation.
 * From the App Router docs: on a soft navigation Next.js keeps the previously
 * active state of a slot even when it does not match the current URL, and only
 * falls back to `default.tsx` on a hard navigation. `@drawer/default.tsx`
 * therefore never runs for a link click.
 *
 * The practical result: clicking an instructor's name inside an open section
 * drawer routed to `/instructor/[slug]` correctly — and left the course drawer
 * sitting on top of it, scrim, scroll lock and all. The reader had to dismiss a
 * panel about a course to read the page they had just asked for.
 *
 * `usePathname` is what breaks the tie. The slot is stale, but it is still
 * subscribed to the router, so it re-renders with the new path and can see that
 * the route it was intercepting is no longer the route being shown.
 *
 * ── Why the gate is HERE and not inside `CourseDrawer` ─────────────────────
 *
 * Returning null from inside the panel would keep the component mounted, and
 * everything the drawer has to undo lives in an effect cleanup: the body scroll
 * lock, the Escape/Tab listener, the pending exit timer, the focus restore. A
 * component that renders nothing runs none of them, so the page behind would
 * stay frozen under a panel that is no longer painted — strictly worse than the
 * bug being fixed. Unmounting is what runs the cleanup, so the decision has to
 * be made by the parent.
 *
 * ── Why it leaves without its exit animation ───────────────────────────────
 *
 * `CourseDrawer`'s dismiss plays the exit and THEN navigates, because there the
 * navigation is the unmount and the panel would otherwise blink out. Here the
 * navigation has already happened: the reader asked for another page and it is
 * rendering underneath. Holding a panel about the previous screen on top of it
 * for another 60ms to be graceful about leaving is latency in front of the
 * thing they actually clicked.
 */
export function InterceptedDrawerSlot({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  /*
   * `/course/...` is the only family this slot intercepts. Treating an unknown
   * pathname as ours is the safe default — a drawer that lingers one render too
   * long is recoverable, one that vanishes mid-open is not.
   */
  if (pathname && !pathname.startsWith("/course/")) return null;

  return <CourseDrawer>{children}</CourseDrawer>;
}
