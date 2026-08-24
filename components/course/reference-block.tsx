import type { ReactNode } from "react";

/**
 * A reference block below the decision.
 *
 * One heading treatment for every one of them — a hairline, then a small-caps
 * label — so the panel reads as a document with sections rather than as a
 * stack of unrelated widgets. The old file gave "Description" an icon and a
 * `body-semibold` heading and "Other sections" a bare one with an inline
 * count, which is two designs for the same job.
 *
 * It lives here rather than inside `section-detail.tsx` because the course-level
 * panels a single-section page inherits have to wear the same heading as the
 * blocks above them. Two chrome treatments stacked in one column reads as two
 * pages stitched together, which is exactly what that page must not look like.
 */
export function ReferenceBlock({
  title,
  count,
  children,
}: {
  title: string;
  /** Rendered beside the label when the block is a list of a known size. */
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border-table pt-5">
      <h2 className="flex items-center gap-1.5 text-caption-2-medium tracking-[0.06em] text-text-tertiary uppercase">
        {title}
        {count != null ? (
          <span className="rounded-full bg-background-secondary-default px-1.5 tabular-nums">
            {count}
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}
