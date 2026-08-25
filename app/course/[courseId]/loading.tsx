import { AppShell } from "@/components/shell/app-shell";
import { pageIdentityContentClass } from "@/components/shell/page-hero-layout";
import { PageContent } from "@/components/shell/page-content";
import { cx } from "@/utils/cx";

/**
 * Server-render wait for a cold course link.
 *
 * ── What a skeleton is actually for ────────────────────────────────────────
 *
 * Not "something is happening" — a spinner says that in one glyph. It is a
 * promise about the shape of what arrives, so the page settles instead of
 * being replaced. That makes an inaccurate skeleton worse than none: the old
 * version of this file drew a shadowed fact card and panels titled "Seat
 * history" and "Instructor", none of which exist any more, so every cold load
 * ended in a layout jump and two headings that never appeared.
 *
 * ── One file, two pages ────────────────────────────────────────────────────
 *
 * `/course/[id]` renders the course view for a course with several sections
 * and the SECTION view for a course with exactly one — same route segment, so
 * this skeleton covers both and cannot know which is coming. It therefore
 * commits only to what the two genuinely share: the identity block, the
 * hairline glance row, and a description. Below that the blocks are drawn
 * unlabelled, because the course view continues "Sections" and the section
 * view continues "In your week", and printing either would be a guess that
 * resolves wrong half the time.
 *
 * Where a label IS certain it is real text rather than a grey bar — a reader
 * who can see "DESCRIPTION" knows what is coming, which is more than three
 * anonymous rectangles tell them.
 */

/**
 * One shimmer bar.
 *
 * `secondary`, matching `app/search/loading.tsx`, `app/profile/loading.tsx`
 * and `app/instructor/[slug]/loading.tsx` — the house split is secondary for
 * thin text-shaped bars and tertiary for large solid areas (cover banners,
 * avatars). It measures faint on its own (1.19:1 on white, 1.09:1 at the
 * pulse trough), but a course skeleton one shade darker than the search
 * skeleton a click away is drift, and these are decorative placeholders
 * rather than content that has to be read.
 *
 * `motion-reduce` stops the pulse rather than the layout — the bars stay
 * exactly where they are, they just hold still.
 */
function Bar({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-full bg-background-secondary-default motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** A hairline-ruled block, matching `ReferenceBlock`'s chrome exactly. */
function BlockSkeleton({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <section className="flex w-full flex-col gap-3 border-t border-border-table pt-5">
      {label ? (
        <h2 className="text-caption-2-medium tracking-[0.06em] text-text-tertiary uppercase">
          {label}
        </h2>
      ) : (
        <Bar className="h-2 w-24" />
      )}
      {children}
    </section>
  );
}

/**
 * A row in the shape the sections list and the similar-courses list share:
 * a short identifier, a secondary line under it, and something small on the
 * right. Both surfaces resolve into this outline, so neither jumps.
 */
function RowSkeleton({ width }: { width: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-table px-2 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Bar className="h-3 w-12" />
        <Bar className={cx("h-2.5", width)} />
        <Bar className="h-2.5 w-20" />
      </div>
      <Bar className="h-4 w-24 rounded-md" />
    </div>
  );
}

export default function CourseLoading() {
  return (
    <AppShell activeNav="search">
      <PageContent className={pageIdentityContentClass("gap-0 sm:gap-5")}>
        {/* Identity — eyebrow, title, one action. */}
        <div className="flex w-full flex-col gap-4">
          <header className="flex flex-col gap-3">
            <Bar className="h-2.5 w-44" />
            {/*
              Two thirds, then one third on a second line. A single full-width
              bar reads as a paragraph, not a heading, and most course titles
              wrap to two lines at this measure.
            */}
            <div className="flex flex-col gap-2">
              <Bar className="h-7 w-2/3" />
              <Bar className="h-7 w-2/5" />
            </div>
            <Bar className="h-8 w-40 rounded-2lg" />
          </header>

          {/* The glance row: when it meets on the left, seats on the right. */}
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-t border-border-table pt-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bar className="h-4 w-64" />
              <Bar className="h-2.5 w-48" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Bar className="h-5 w-36 rounded-md" />
              <Bar className="h-2.5 w-28" />
            </div>
          </div>
        </div>

        <BlockSkeleton label="Description">
          <div className="flex flex-col gap-2">
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-11/12" />
            <Bar className="h-3 w-3/4" />
          </div>
        </BlockSkeleton>

        {/* Unlabelled: "Sections" on a course, "In your week" on a section. */}
        <BlockSkeleton>
          <div className="-mx-2 flex flex-col">
            <RowSkeleton width="w-40" />
            <RowSkeleton width="w-32" />
            <RowSkeleton width="w-44" />
          </div>
        </BlockSkeleton>

        <BlockSkeleton>
          <div className="grid gap-3 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-2lg border border-border-table p-4"
              >
                <Bar className="h-3 w-32" />
                <Bar className="h-2.5 w-full" />
                <Bar className="h-2.5 w-24" />
              </div>
            ))}
          </div>
        </BlockSkeleton>

        {/*
          The whole announcement, in one live region.

          `aria-busy` used to sit on `PageContent`, which forwards only
          `children` and `className` — so it never reached the DOM and the
          skeleton announced nothing at all. A `role="status"` line says the
          same thing and actually renders, and when the real page arrives it
          replaces this subtree outright, which is the "no longer busy"
          signal `aria-busy` would have carried.
        */}
        <p className="sr-only" role="status" aria-live="polite">
          Loading course details
        </p>
      </PageContent>
    </AppShell>
  );
}
