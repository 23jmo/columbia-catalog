import { AppShell } from "@/components/shell/app-shell";

/**
 * Server-render wait for a cold instructor link.
 *
 * Shaped like the real page — the cover-and-avatar hero, a stat row, then the
 * stack of cards — so arriving content settles into the same rhythm rather than
 * replacing a spinner. The card widths and radii are the real ones, which is
 * what stops the layout jumping when the data lands.
 */

const CARD_HEIGHTS = [268, 262, 300, 200];

export default function InstructorLoading() {
  return (
    <AppShell activeNav="search">
      <div
        className="mx-auto flex w-full max-w-[680px] flex-col items-center gap-4"
        aria-busy="true"
      >
        <div className="mr-auto h-3 w-24 animate-pulse rounded-full bg-background-secondary-default" />

        <section className="relative w-full overflow-hidden rounded-3xl border border-border-ai-profile-card">
          <div className="absolute inset-x-0 top-0 h-[165px] animate-pulse rounded-t-[23px] bg-background-tertiary-default" />
          <div className="relative flex w-full flex-col gap-[15px] px-4 pt-[124px] pb-4">
            <span className="size-20 animate-pulse rounded-full bg-background-tertiary-default ring-4 ring-background-primary-default" />
            <div className="flex flex-col gap-2">
              <div className="h-5 w-56 animate-pulse rounded-full bg-background-secondary-default" />
              <div className="h-3.5 w-36 animate-pulse rounded-full bg-background-secondary-default" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-7 w-32 animate-pulse rounded-full bg-background-secondary-default" />
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-stretch">
                {["Courses", "Sections", "Seats offered", "Class time / week"].map((label) => (
                  <div
                    key={label}
                    className="flex min-w-0 flex-col gap-1 rounded-2lg bg-background-secondary-default p-2.5 sm:flex-1"
                  >
                    <div className="h-3 w-10 animate-pulse rounded-full bg-background-tertiary-default" />
                    <span className="truncate text-body-2-medium text-text-tertiary">{label}</span>
                  </div>
                ))}
              </div>
              <div className="h-14 w-full animate-pulse rounded-lg bg-background-secondary-default" />
            </div>
          </div>
        </section>

        {CARD_HEIGHTS.map((height, index) => (
          <div
            key={index}
            style={{ height }}
            className="w-full animate-pulse rounded-[20px] bg-background-secondary-default"
          />
        ))}

        <p className="sr-only" role="status">
          Loading instructor profile
        </p>
      </div>
    </AppShell>
  );
}
