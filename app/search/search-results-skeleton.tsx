import { cx } from "@/utils/cx";

/**
 * Placeholder rows while the search index loads.
 *
 * Matches the collapsed result row geometry — hairline dividers, title band,
 * metadata line, enrollment on the right — so the list does not jump when real
 * hits replace it.
 */

const DEFAULT_ROWS = 8;

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-full bg-background-secondary-default motion-reduce:animate-none",
        className,
      )}
    />
  );
}

function ResultRowSkeleton() {
  return (
    <li className="border-b border-border-table px-3 py-3 sm:py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SkeletonBar className="h-4 w-4/5 max-w-md" />
          <SkeletonBar className="h-2.5 w-40" />
          <SkeletonBar className="h-2.5 w-56 max-w-full" />
        </div>
        <SkeletonBar className="h-5 w-24 shrink-0 rounded-md sm:mt-0.5" />
      </div>
    </li>
  );
}

export interface SearchResultsSkeletonProps {
  rows?: number;
  /** Screen-reader announcement while the skeleton is visible. */
  status?: string;
  className?: string;
}

export function SearchResultsSkeleton({
  rows = DEFAULT_ROWS,
  status = "Loading search results",
  className,
}: SearchResultsSkeletonProps) {
  return (
    <div
      className={cx("-mx-3 w-[calc(100%+1.5rem)]", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <ol className="flex list-none flex-col" aria-hidden>
        {Array.from({ length: rows }, (_, index) => (
          <ResultRowSkeleton key={index} />
        ))}
      </ol>
      <p className="sr-only" role="status">
        {status}
      </p>
    </div>
  );
}
