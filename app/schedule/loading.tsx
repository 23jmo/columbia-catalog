/**
 * `/schedule` loading state.
 *
 * Mirrors the calendar chrome (rail + month canvas) so the layout does not
 * jump when the planner hydrates.
 */

import { AppShell } from "@/components/shell/app-shell";
import { cx } from "@/utils/cx";

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
    <AppShell activeNav="schedule" contentClassName="flex min-h-0 flex-col px-0 py-0">
      <span role="status" aria-live="polite" className="sr-only">
        Loading your schedule.
      </span>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r border-border-table p-4 lg:flex">
          <Shimmer className="h-9 w-full" />
          <Shimmer className="h-24 w-full" />
          <Shimmer className="h-40 w-full" />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <Shimmer className="h-10 w-48" />
            <Shimmer className="h-9 w-40" />
          </div>
          <Shimmer className="min-h-0 flex-1 w-full" />
        </div>
      </div>
    </AppShell>
  );
}
