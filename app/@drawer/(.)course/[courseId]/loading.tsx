import { CourseDrawer } from "@/app/course/[courseId]/course-drawer";

/**
 * The drawer's own loading state.
 *
 * Without this file the intercepted route had no Suspense boundary, so nothing
 * appeared until `loadCourseDetail` had resolved on the server -- ~700ms of a
 * dead click, which is precisely why the overlay read as "a whole new thing
 * that has to render" rather than a panel sliding in. Next now streams this
 * shell immediately and swaps the real content in underneath when it arrives.
 *
 * The shell is the SAME `CourseDrawer` chrome, not a lookalike: the panel that
 * animates in during loading is the panel that stays, so there is no second
 * mount, no re-run of the enter transition, and no visible jump when the
 * content lands. Only the body swaps.
 *
 * The skeleton mirrors `CourseDetail`'s real geometry -- title, meta line, the
 * facts card, then the section list -- because a skeleton whose blocks sit
 * somewhere else than the content is worse than no skeleton: it promises a
 * layout and then moves it.
 */

function Line({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-background-secondary ${className}`} />;
}

export default function DrawerLoading() {
  return (
    // `code` is unknown until the record loads; an em dash holds the slot at the
    // right width instead of collapsing the header rail and then re-expanding.
    <CourseDrawer code="—" href="#">
      <div className="flex w-full flex-col gap-10" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading course details…</span>

        <div className="flex flex-col gap-3">
          <Line className="h-3.5 w-40" />
          <Line className="h-9 w-4/5" />
          <Line className="h-4 w-56" />
        </div>

        <Line className="h-32 w-full rounded-[20px]" />

        <div className="flex flex-col gap-3">
          <Line className="h-5 w-32" />
          <Line className="h-20 w-full rounded-2lg" />
          <Line className="h-20 w-full rounded-2lg" />
        </div>
      </div>
    </CourseDrawer>
  );
}
