import { CourseDrawer } from "@/app/course/[courseId]/course-drawer";

/**
 * The drawer's own loading state.
 *
 * Without this file the intercepted route had no Suspense boundary, so nothing
 * appeared until the server had resolved the record -- a dead click, which is
 * precisely why the overlay read as "a whole new thing that has to render"
 * rather than a panel sliding in. Next streams this shell immediately and swaps
 * the real content in underneath when it arrives.
 *
 * The shell is the SAME `CourseDrawer` chrome, not a lookalike: the panel that
 * animates in during loading is the panel that stays, so there is no second
 * mount, no re-run of the enter transition, and no visible jump when the
 * content lands. Only the body swaps.
 *
 * The skeleton mirrors `SectionDetail`'s real geometry -- eyebrow, heading,
 * instructor line, the facts card, then the sibling-section list -- because a
 * skeleton whose blocks sit somewhere else than the content is worse than no
 * skeleton: it promises a layout and then moves it.
 *
 * On how long it is up for: this route resolves one course record and picks a
 * section out of it. It deliberately does not assemble similar courses or
 * offering history, which is what used to keep this shell on screen for
 * seconds. A skeleton is a promise that something is coming; hold it long
 * enough and it reads as a hang instead.
 */

function Line({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-background-secondary ${className}`} />;
}

export default function DrawerLoading() {
  return (
    // `code` is unknown until the record loads; an em dash holds the slot at the
    // right width instead of collapsing the header rail and then re-expanding.
    <CourseDrawer code="—" href="#">
      <div className="flex w-full flex-col gap-8" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading section details…</span>

        {/* Eyebrow, heading, instructors — mirrors the header block. */}
        <div className="flex flex-col gap-3">
          <Line className="h-3.5 w-52" />
          <Line className="h-8 w-4/5" />
          <Line className="h-4 w-44" />
        </div>

        {/* The facts card: a 2-column dl, then the seat row under a rule. */}
        <Line className="h-40 w-full rounded-[20px]" />

        {/* Registration handoff + watch. */}
        <div className="flex gap-2">
          <Line className="h-9 w-36 rounded-2lg" />
          <Line className="h-9 w-24 rounded-2lg" />
        </div>

        {/* Sibling sections. */}
        <div className="flex flex-col gap-2">
          <Line className="h-5 w-40" />
          <Line className="h-10 w-full rounded-lg" />
          <Line className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </CourseDrawer>
  );
}
