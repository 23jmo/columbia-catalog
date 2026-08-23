import type { ReactNode } from "react";

import { CourseDrawer } from "@/app/course/[courseId]/course-drawer";

/**
 * Mounts the drawer panel exactly once per open.
 *
 * This file exists for one reason: `loading.tsx` and `page.tsx` occupy two
 * different slots of the same Suspense boundary, so React unmounts one subtree
 * and mounts the other when the data lands. Anything that animates on mount
 * therefore animated twice — the panel slid up for the skeleton, was destroyed,
 * and slid up again for the content.
 *
 * A layout sits ABOVE that boundary. It mounts when the route is entered and
 * stays mounted while the page below it suspends, resolves, and re-renders, so
 * the enter transition runs once and the skeleton simply becomes the content
 * inside a panel that never moved. Moving between sections of the same course
 * is a content swap for the same reason.
 *
 * It deliberately holds NO data. Loading anything here would put an await in
 * front of the panel and give back the dead click the skeleton exists to
 * prevent; the layout's whole job is to render instantly and then get out of
 * the way. The rail's label and its "Full page" target come from `DrawerFrame`
 * inside `children`, which is where the record is actually known.
 */
export default function InterceptedCourseDrawerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CourseDrawer>{children}</CourseDrawer>;
}
