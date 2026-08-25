import { AppShell } from "@/components/shell/app-shell";
import {
  pageHeroBodyClass,
  pageHeroCoverClass,
  pageHeroSectionClass,
  pageIdentityContentClass,
} from "@/components/shell/page-hero-layout";
import { PageContent } from "@/components/shell/page-content";

/**
 * Server-render wait for the profile.
 *
 * Shaped like the real page — the cover-and-avatar hero, a headline figure, a
 * stat strip, then the stack of cards — so the arriving content settles into
 * the same rhythm rather than replacing a spinner. The card radii and the
 * hero's 165/124/80px geometry are the real ones, which is what stops the
 * layout jumping when the audit lands.
 */

const CARD_HEIGHTS = [200, 260, 320, 280, 180];

export default function ProfileLoading() {
  return (
    <AppShell activeNav="profile">
      <PageContent className={pageIdentityContentClass()} aria-busy="true">
        <section className={pageHeroSectionClass("card")}>
          <div className={`${pageHeroCoverClass()} animate-pulse bg-background-tertiary-default`} />
          <div className={pageHeroBodyClass()}>
            <span className="size-20 animate-pulse rounded-full bg-background-tertiary-default ring-4 ring-background-primary-default" />
            <div className="flex flex-col gap-2">
              <div className="h-5 w-48 animate-pulse rounded-full bg-background-secondary-default" />
              <div className="h-3.5 w-64 animate-pulse rounded-full bg-background-secondary-default" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-10 w-28 animate-pulse rounded-full bg-background-secondary-default" />
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  "Courses on record",
                  "Points earned",
                  "Requirements done",
                  "Still outstanding",
                ].map((label) => (
                  <div
                    key={label}
                    className="flex min-w-0 flex-col gap-2 rounded-2lg bg-background-inner-default p-3.5"
                  >
                    <span className="truncate text-caption-1-medium text-text-tertiary">
                      {label}
                    </span>
                    <div className="h-6 w-12 animate-pulse rounded-full bg-background-secondary-default" />
                  </div>
                ))}
              </div>
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
          Loading your degree audit
        </p>
      </PageContent>
    </AppShell>
  );
}
