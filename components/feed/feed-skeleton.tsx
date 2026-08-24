import { cx } from "@/utils/cx";

/**
 * What the feed looks like while it is being computed.
 *
 * The feed is the slowest thing on the home page by a wide margin — a cold
 * process pages the whole active catalog and builds a prerequisite graph over
 * 8,189 courses, which is measured in seconds, and the memoised path is still a
 * database round trip. Awaiting it inline would hold back the week grid and the
 * watchlist too, so `/` streams it behind a `<Suspense>` boundary and this is
 * the boundary's fallback.
 *
 * Deliberately a skeleton of the real card rather than a spinner: the layout
 * does not jump when the content lands, and the reader can already see that
 * what is coming is a list of courses.
 *
 * Every block here paints a token that exists. `bg-background-secondary-default`
 * rather than `bg-background-secondary` — the latter looks like a real class,
 * resolves to nothing, and renders transparent. That exact mistake shipped once
 * as a drawer skeleton of nine invisible blocks, which is why
 * `lib/design-tokens.test.ts` exists.
 */
export function FeedSkeleton({
  cards = 3,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <section
      aria-busy="true"
      aria-label="Loading your recommendations"
      className={cx("flex flex-col gap-4", className)}
    >
      <div className="flex items-start gap-3">
        <div className="size-8 shrink-0 animate-pulse rounded-2lg bg-background-secondary-default" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="h-5 w-52 animate-pulse rounded-md bg-background-secondary-default" />
          <div className="h-3 w-full max-w-[46ch] animate-pulse rounded-md bg-background-secondary-default" />
        </div>
      </div>

      <ul className="flex flex-col gap-3.5">
        {Array.from({ length: cards }, (_, index) => (
          <li
            key={index}
            className="flex flex-col gap-3.5 rounded-[20px] border border-border-table bg-background-primary-default p-4 shadow-card sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="size-9 shrink-0 animate-pulse rounded-xl bg-background-secondary-default" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-3 w-24 animate-pulse rounded-md bg-background-secondary-default" />
                <div className="h-4 w-3/5 animate-pulse rounded-md bg-background-secondary-default" />
              </div>
            </div>
            <div className="h-5 w-48 animate-pulse rounded-md bg-background-secondary-default" />
            <div className="h-24 w-full animate-pulse rounded-2lg bg-background-secondary-default" />
          </li>
        ))}
      </ul>
    </section>
  );
}
