import Link from "next/link";

import { loadCourseDetail } from "@/components/course/load-course-detail";
import { CURRENT_TERM, termLabel } from "@/lib/constants";

// The shared assembly lives with the standalone route and is imported here —
// never copied. See the note below.
import { CourseDetail } from "@/app/course/[courseId]/course-detail";
import { CourseDrawer } from "@/app/course/[courseId]/course-drawer";

/**
 * `/course/[courseId]`, intercepted.
 *
 * When the navigation starts inside the app — a result row, a similar-course
 * link — Next renders this into the root `drawer` slot instead of replacing
 * the page, so the drawer opens over whatever the student was on and their
 * search results and filters survive untouched (spec §7: "Opens over search.
 * Never loses the student's results or filters."). A cold load of the same URL
 * skips interception entirely and gets `app/course/[courseId]/page.tsx`.
 *
 * The body is the SAME `CourseDetail` that page renders. That is the whole
 * point of factoring it: two routes, one assembly, no drift.
 */

interface InterceptedCoursePageProps {
  params: Promise<{ courseId: string }>;
}

const TITLE_ID = "drawer-course-title";

export default async function InterceptedCoursePage({ params }: InterceptedCoursePageProps) {
  const { courseId } = await params;
  const data = await loadCourseDetail(courseId, CURRENT_TERM);

  /*
   * Deliberately NOT `notFound()`.
   *
   * A not-found thrown from a slot escapes the drawer and replaces the whole
   * screen — which would destroy the results the student was standing on to
   * report a bad link. Inside the overlay, "this course isn't offered" is a
   * message, and closing it puts them back exactly where they were. The
   * standalone route still does the real 404, because there is nothing behind
   * it to preserve.
   */
  if (!data) {
    return (
      <CourseDrawer
        titleId={TITLE_ID}
        code="Not found"
        href={`/course/${encodeURIComponent(courseId)}`}
      >
        <div className="flex flex-col items-start gap-3">
          <h1 id={TITLE_ID} className="text-title-2-semibold text-text-primary">
            No such course in {termLabel(CURRENT_TERM)}
          </h1>
          <p className="text-body-regular text-text-secondary">
            Nothing in this term matches{" "}
            <code className="font-mono text-text-primary">{courseId}</code>. Either the code
            is wrong or the course is not being offered — close this to go back to your
            results.
          </p>
          <Link
            href="/search"
            className="inline-flex h-9 items-center rounded-2lg bg-background-secondary-default px-3 text-body-medium text-text-primary transition-colors outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            Search the catalog
          </Link>
        </div>
      </CourseDrawer>
    );
  }

  return (
    <CourseDrawer
      titleId={TITLE_ID}
      code={data.code}
      href={`/course/${data.course.courseId}`}
    >
      <CourseDetail data={data} variant="drawer" titleId={TITLE_ID} />
    </CourseDrawer>
  );
}
