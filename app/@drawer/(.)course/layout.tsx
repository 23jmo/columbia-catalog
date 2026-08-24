import type { ReactNode } from "react";

import { InterceptedDrawerSlot } from "./[courseId]/drawer-slot";

/**
 * Mounts the drawer panel exactly once per drawer SESSION.
 *
 * ── Why this file is here and not one level down ───────────────────────────
 *
 * It began one level down, inside `[courseId]`, for a good reason:
 * `loading.tsx` and `page.tsx` occupy two different slots of the same Suspense
 * boundary, so React unmounts one subtree and mounts the other when the data
 * lands. Anything that animates on mount therefore animated twice — the panel
 * slid up for the skeleton, was destroyed, and slid up again for the content.
 * A layout sits ABOVE that boundary and stays mounted while the page below it
 * suspends and resolves, so the skeleton simply becomes the content inside a
 * panel that never moved.
 *
 * That fixed one open. It did not fix moving BETWEEN courses, because a layout
 * inside `[courseId]` is scoped to a value of `[courseId]`: clicking a second
 * result is a different segment, so the layout instance is torn down and a new
 * one built. The reader saw the panel leave and arrive again, and — worse — the
 * fresh instance mounts with `isVisible: false`, writes `--drawer-rail: 0px`,
 * and corrects it a frame later. That single frame is enough for the shell's
 * padding to start easing back to full width and reverse, so the whole page
 * flinched outward and in again on every course change.
 *
 * Hoisting the panel ABOVE `[courseId]` makes the course a prop of the content
 * rather than the identity of the container. Every navigation within
 * `/course/*` is now a content swap in a panel that never moved — the same
 * thing that was already true of switching sections within one course, which
 * is the behaviour this was always supposed to have.
 *
 * It deliberately holds NO data. Loading anything here would put an await in
 * front of the panel and give back the dead click the skeleton exists to
 * prevent; the layout's whole job is to render instantly and then get out of
 * the way. Close and section identity live in the slot content itself.
 *
 * `InterceptedDrawerSlot` is the one piece of logic above the panel: a slot
 * does not empty itself on a client-side navigation, so it decides whether this
 * drawer is still the route being shown. See that file.
 */
export default function InterceptedCourseDrawerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <InterceptedDrawerSlot>{children}</InterceptedDrawerSlot>;
}
