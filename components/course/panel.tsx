import type { ComponentType, ReactNode } from "react";
import { RiPlugLine } from "@remixicon/react";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export interface PanelProps {
  id?: string;
  title: string;
  /** Short line under the title explaining what the reader is looking at. */
  description?: ReactNode;
  icon?: IconComponent;
  /** Right-aligned controls in the header. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Drops the surrounding card chrome for panels that carry their own. */
  bare?: boolean;
}

/**
 * One numbered stop in the drawer's reading order.
 *
 * The header used to be a 16px heading over a bare grey icon, which meant a
 * column of twelve panels read as twelve identical grey rectangles with no way
 * to tell where one ended and the next began. Two changes fix that without
 * touching the layout: the title steps up to `title-3` (18px) so it clearly
 * outranks the 14px body it introduces, and the icon moves into a tinted
 * rounded square. The square is the important one — it gives every panel a
 * single high-contrast anchor at a fixed position, so scanning the page
 * becomes a matter of following a column of marks rather than reading headings.
 *
 * The tint is `accent-500/10` rather than `stat-card-icon-background`, which
 * resolves to solid white: that token is built for a card sitting on a tinted
 * surface, and these headers sit on the page background, so the square was
 * rendering white-on-white and the icon read as bare. An alpha tint composites
 * correctly over whatever is behind it, which also makes it survive the dark
 * theme without a second definition.
 */
export function Panel({
  id,
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bare = false,
}: PanelProps) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-heading` : undefined}
      className={cx("scroll-mt-20", className)}
    >
      <header className="mb-3.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span
              aria-hidden
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2lg bg-accent-500/10"
            >
              <Icon className="size-4 text-accent-500" />
            </span>
          ) : null}
          <div className="min-w-0">
            {/*
              `h2`, not `h3`. A Panel is a top-level section of its page, a
              sibling of the page header rather than a child of anything inside
              it, so `h3` left the document outline claiming these sections were
              subordinate to whichever heading happened to precede them.
            */}
            <h2
              id={id ? `${id}-heading` : undefined}
              className="text-title-3-semibold -tracking-[0.01em] text-text-primary"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 max-w-[62ch] text-caption-1-regular text-pretty text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div
        className={cx(
          !bare &&
            "rounded-[20px] border border-border-table bg-background-primary-default p-4 shadow-card sm:p-5",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Neutral "there is genuinely nothing here" copy. Never a spinner. */
export function EmptyNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("text-body-regular text-text-secondary", className)}>{children}</p>
  );
}

export interface LanePlaceholderProps {
  /** What will render here once the other lane ships. */
  what: string;
  /** The contract the implementation has to satisfy. */
  contract: string;
  children?: ReactNode;
}

/**
 * A designed stand-in for a dependency that has not landed yet. It states the
 * contract out loud rather than pretending the feature exists, and it still
 * shows whatever real data we already hold (passed as `children`).
 */
export function LanePlaceholder({ what, contract, children }: LanePlaceholderProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-border-button-default bg-background-secondary-default p-3">
        <RiPlugLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <div className="min-w-0">
          <p className="text-body-medium text-text-primary">{what}</p>
          <p className="mt-0.5 text-caption-1-regular text-text-secondary">
            Waiting on <code className="rounded-sm bg-background-tertiary-default px-1 py-px font-mono">{contract}</code>
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Label / value row used throughout the drawer's fact blocks. */
export function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="text-caption-2-medium tracking-[0.08em] text-text-tertiary uppercase">{label}</dt>
      <dd className="mt-1 text-headline-semibold -tracking-[0.01em] text-text-primary">{children}</dd>
    </div>
  );
}
