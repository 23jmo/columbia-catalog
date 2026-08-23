/**
 * `/schedule` loading state.
 *
 * Spec §3, principle 1: never show a skeleton where a skeleton could be
 * avoided. So this renders the parts of the screen that are already known —
 * the app shell, the page title, the panel titles — and only the data-shaped
 * regions pulse. Navigating here never flashes an empty page, and the layout
 * does not jump when the plan arrives, because the boxes are already the right
 * size.
 */

import { AppShell } from "@/components/shell/app-shell";
import { cx } from "@/utils/cx";

/** One placeholder region. `aria-hidden` — the live region below speaks for it. */
function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cx("animate-pulse rounded-lg bg-background-tertiary-default", className)}
      aria-hidden
    />
  );
}

export default function ScheduleLoading() {
  return (
    <AppShell activeNav="schedule">
      <div className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-title-1-medium text-text-primary">Schedule</h1>
          <p className="text-body-regular text-text-secondary">Loading your week…</p>
        </header>

        {/* Announced once, rather than a screen reader crawling every shimmer. */}
        <span role="status" aria-live="polite" className="sr-only">
          Loading your schedule.
        </span>

        <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-5">
          <section className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-background-secondary-default p-4 sm:p-5">
            <Shimmer className="h-[420px] w-full" />
          </section>

          <aside className="flex min-w-0 flex-col gap-4">
            {["Credits", "Conflicts", "Commute", "Requirements covered"].map((title) => (
              <section
                key={title}
                className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-background-secondary-default p-4"
              >
                <h2 className="text-body-medium text-text-primary">{title}</h2>
                <Shimmer className="h-5 w-2/3" />
                <Shimmer className="h-5 w-1/2" />
              </section>
            ))}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
