import { AppShell } from "@/components/shell/app-shell";

/**
 * Brief shell while the search route hydrates. Catalog data loads client-side
 * from the index artifact — not from a server `getAllCourses()` call.
 */

const SKELETON_ROWS = 6;

export default function SearchLoading() {
  return (
    <AppShell activeNav="search">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5" aria-busy="true">
        <div className="flex flex-col gap-2">
          <h1 className="text-title-1-semibold text-text-primary">Search</h1>
          <p className="text-body-regular text-text-secondary">Opening search…</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[264px_minmax(0,1fr)]">
          <aside className="hidden flex-col gap-3 lg:flex" aria-hidden>
            {["Time & structure", "Requirements", "Subject & instructor", "Reputation"].map(
              (group) => (
                <div key={group} className="flex flex-col gap-2 py-2">
                  <div className="text-body-2-medium text-text-tertiary">{group}</div>
                  <div className="h-2 w-3/4 animate-pulse rounded-full bg-background-secondary-default" />
                </div>
              ),
            )}
          </aside>

          <div className="flex min-w-0 flex-col gap-3">
            <div
              className="h-11 w-full animate-pulse rounded-2lg bg-background-secondary-default"
              aria-hidden
            />
            <ol className="flex flex-col gap-2 list-none" aria-hidden>
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <li
                  key={index}
                  className="rounded-2lg border border-border-table bg-background-primary-default p-4 shadow-card"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="h-2.5 w-24 animate-pulse rounded-full bg-background-secondary-default" />
                      <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-background-secondary-default" />
                      <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-background-secondary-default" />
                    </div>
                    <div className="h-6 w-28 shrink-0 animate-pulse rounded-md bg-background-secondary-default" />
                  </div>
                </li>
              ))}
            </ol>
            <p className="sr-only" role="status">
              Loading search
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
