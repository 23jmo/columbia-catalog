import type { ReactNode } from "react";

/**
 * Intentionally a pass-through.
 *
 * The panel used to be mounted here, and that is exactly what made switching
 * courses look like a close followed by a re-open: a layout inside `[courseId]`
 * is scoped to one value of `[courseId]`, so a second result tore it down and
 * built another. It now lives one level up, in `app/@drawer/(.)course/layout.tsx`,
 * where a course change is a content swap instead of a new container.
 *
 * Kept as a file rather than deleted so the Suspense boundary that `loading.tsx`
 * creates still has this segment to attach to, and so there is somewhere
 * obvious to put anything that genuinely is per-course.
 */
export default function InterceptedCourseSegmentLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
