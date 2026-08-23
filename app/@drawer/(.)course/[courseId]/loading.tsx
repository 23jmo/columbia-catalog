import { DRAWER_TITLE_ID, DrawerFrame } from "@/app/course/[courseId]/course-drawer";

/**
 * The drawer's own loading state.
 *
 * Without this file the intercepted route had no Suspense boundary, so nothing
 * appeared until the server had resolved the record -- a dead click, which is
 * precisely why the overlay read as "a whole new thing that has to render"
 * rather than a panel sliding in. Next streams this shell immediately and swaps
 * the real content in underneath when it arrives.
 *
 * Note what this file does NOT render: the panel. That lives in `layout.tsx`,
 * one level above the Suspense boundary, so it is already on screen and already
 * finished animating by the time this appears inside it. Rendering the panel
 * here as well is what used to play the enter transition twice -- this subtree
 * is destroyed when the data lands, and anything that animates on mount
 * animated again on the way in.
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
  /*
   * `bg-background-tertiary-default`, not `bg-background-secondary`.
   *
   * There is no `--color-background-secondary` token -- the theme defines only
   * `-default` and `-hover` -- so that class compiled to no rule at all and
   * every block here rendered fully transparent. Nine invisible rectangles on
   * a white panel is a white panel, which is exactly how this read: the drawer
   * slid in blank and stayed blank until the content landed.
   *
   * Tertiary rather than secondary because this panel is `bg-background-full`,
   * pure white. Secondary is 3% off it; at that distance a skeleton is
   * indistinguishable from the empty state it exists to prevent. Same tone the
   * schedule's skeleton uses.
   */
  return (
    <div className={`animate-pulse rounded-md bg-background-tertiary-default ${className}`} />
  );
}

export default function DrawerLoading() {
  return (
    // An em dash holds the rail's slot at roughly the right width instead of
    // collapsing it and then re-expanding when the real code arrives.
    <DrawerFrame code="—" href="#">
      <div className="flex w-full flex-col gap-8" aria-busy="true" aria-live="polite">
        {/*
          Carries the id the panel's `aria-labelledby` points at. Every state of
          this slot owns that id in turn, so the dialog always has a resolvable
          label -- during loading it is this line, and it is replaced by the real
          heading without the reference ever dangling.
        */}
        <span id={DRAWER_TITLE_ID} className="sr-only">
          Loading section details…
        </span>

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
    </DrawerFrame>
  );
}
