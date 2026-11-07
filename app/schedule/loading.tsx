/**
 * `/schedule` loading state — the same header line and five-column canvas
 * the page draws, so nothing jumps when the week hydrates.
 */

import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";
import { cx } from "@/utils/cx";

function Shimmer({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-background-tertiary-default", className)} aria-hidden />;
}

export default function ScheduleLoading() {
  return (
    <AppShell activeNav="schedule">
      <PageContent className="max-w-[1100px] gap-4 sm:gap-5">
        <span role="status" aria-live="polite" className="sr-only">
          Loading your schedule.
        </span>
        <div className="flex items-center justify-between gap-3">
          <Shimmer className="h-5 w-40" />
          <div className="flex gap-2">
            <Shimmer className="h-8 w-8 sm:w-24" />
            <Shimmer className="h-8 w-28" />
          </div>
        </div>
        <Shimmer className="h-[480px] w-full rounded-2xl" />
      </PageContent>
    </AppShell>
  );
}
