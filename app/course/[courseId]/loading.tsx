import { AppShell } from "@/components/shell/app-shell";

/**
 * Server-render wait for a cold course link.
 *
 * Shaped like the real page — identity block, fact card, then the stack of
 * panels — so the arriving content settles into the same rhythm instead of
 * replacing a spinner. The panel headings are real: they tell a reader what is
 * about to appear, which is more useful than three grey bars.
 */

const PANEL_TITLES = [
  "Description",
  "Sections",
  "Schedule preview",
  "Seat history",
  "Instructor",
];

export default function CourseLoading() {
  return (
    <AppShell activeNav="search">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8" aria-busy="true">
        <header className="flex flex-col gap-4">
          <div className="h-2.5 w-28 animate-pulse rounded-full bg-background-secondary-default" />
          <div className="h-6 w-2/3 animate-pulse rounded-full bg-background-secondary-default" />
          <div className="h-2.5 w-40 animate-pulse rounded-full bg-background-secondary-default" />

          <div className="grid gap-4 rounded-2lg border border-border-table bg-background-primary-default p-4 shadow-card sm:grid-cols-2">
            <div className="grid grid-cols-2 gap-4">
              {["Meets", "Where", "Credits", "Sections"].map((label) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <span className="text-caption-2-medium tracking-wide text-text-tertiary uppercase">
                    {label}
                  </span>
                  <div className="h-3 w-24 animate-pulse rounded-full bg-background-secondary-default" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:border-l sm:border-border-table sm:pl-4">
              <div className="h-5 w-32 animate-pulse rounded-full bg-background-secondary-default" />
              <div className="h-1.5 w-full animate-pulse rounded-full bg-background-secondary-default" />
              <div className="h-2.5 w-44 animate-pulse rounded-full bg-background-secondary-default" />
            </div>
          </div>
        </header>

        {PANEL_TITLES.map((title) => (
          <section key={title}>
            <h2 className="mb-3 text-headline-semibold text-text-primary">{title}</h2>
            <div className="rounded-2lg border border-border-table bg-background-primary-default p-4 shadow-card">
              <div className="h-3 w-full animate-pulse rounded-full bg-background-secondary-default" />
              <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-background-secondary-default" />
            </div>
          </section>
        ))}

        <p className="sr-only" role="status">
          Loading course details
        </p>
      </div>
    </AppShell>
  );
}
