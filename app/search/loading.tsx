import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";

import { SearchResultsSkeleton } from "./search-results-skeleton";

/**
 * Brief shell while the search route hydrates. Catalog data loads client-side
 * from the index artifact — not from a server `getAllCourses()` call.
 */

export default function SearchLoading() {
  return (
    <AppShell activeNav="search">
      <PageContent aria-busy="true">
        <div className="flex flex-col gap-2">
          <h1 className="text-title-1-semibold text-text-primary">Search</h1>
          <p className="text-body-regular text-text-secondary">Opening search…</p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div
            className="h-11 w-full animate-pulse rounded-2lg bg-background-secondary-default motion-reduce:animate-none"
            aria-hidden
          />
          <SearchResultsSkeleton status="Loading search" />
        </div>
      </PageContent>
    </AppShell>
  );
}
