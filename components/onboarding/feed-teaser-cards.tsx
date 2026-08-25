"use client";

/** Placeholder while the last onboarding screen ranks its cards. */
export function FeedPreviewCardSkeleton() {
  return (
    <article
      className="flex flex-col gap-3 rounded-2xl border border-border-table bg-background-primary-default p-4"
      aria-hidden
    >
      <div className="h-3 w-40 animate-pulse rounded-md bg-background-secondary-default" />
      <div className="h-5 w-4/5 animate-pulse rounded-md bg-background-secondary-default" />
      <div className="h-3 w-36 animate-pulse rounded-md bg-background-secondary-default" />
      <div className="h-4 w-48 animate-pulse rounded-md bg-background-secondary-default" />
      <div className="h-3 w-40 animate-pulse rounded-md bg-background-secondary-default" />
      <div className="mt-1 h-1.5 w-full animate-pulse rounded-full bg-background-secondary-default" />
    </article>
  );
}
