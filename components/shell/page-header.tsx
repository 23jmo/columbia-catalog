import type { ComponentType, ReactNode } from "react";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/**
 * The one page title treatment, used by every route.
 *
 * Before this existed each screen invented its own heading, and they all
 * landed on `text-title-1-medium` (24px) over a 14px paragraph. Four screens,
 * four near-identical headers, none of them big enough to be an entry point.
 *
 * The scale here is deliberate. BoardUI's ramp runs to 64px and the app was
 * living entirely between 12 and 14px, so the page title jumps to `display-4`
 * (32px) with negative tracking: at that size the default letter-spacing reads
 * loose, which is the single most common tell of type set by someone who
 * picked a size but not a treatment.
 *
 * `eyebrow` carries the context that used to be crammed into the title —
 * "Registration" as a page name is meaningless, but "Registration · Fall 2026"
 * as eyebrow-over-title gives the reader a location and a subject.
 */
export interface PageHeaderProps {
  /** Small uppercase context line above the title. Where am I? */
  eyebrow?: ReactNode;
  title: ReactNode;
  /**
   * A status pill that belongs to the title, rendered on the same line.
   *
   * Status is an attribute of the subject, not an action taken on it, so it
   * reads wrong in `action`: floated to the far right of a wide header it
   * loses its referent and looks stranded. Beside the title it is plainly
   * "Fall 2026, registration open".
   */
  badge?: ReactNode;
  /** One or two sentences. Constrained to a readable measure, never full-bleed. */
  description?: ReactNode;
  /** Right-aligned controls, vertically centered against the title block. */
  action?: ReactNode;
  /** Renders full-width under the description — a stat strip, tabs, filters. */
  children?: ReactNode;
  icon?: IconComponent;
  className?: string;
  /**
   * Hide the title row below `xl`.
   *
   * The mobile shell already prints the page name in the hamburger bar, so a
   * second "Search" sitting under it is the same word twice. Desktop has no
   * bar, so the heading stays. An `sr-only` copy keeps a document outline on
   * the phone.
   */
  hideTitleOnMobile?: boolean;
}

export function PageHeader({
  eyebrow,
  title,
  badge,
  description,
  action,
  children,
  icon: Icon,
  className,
  hideTitleOnMobile = false,
}: PageHeaderProps) {
  return (
    <header className={cx("flex flex-col gap-5", className)}>
      {hideTitleOnMobile ? <h1 className="sr-only xl:hidden">{title}</h1> : null}

      <div
        className={cx(
          "flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
          hideTitleOnMobile && "hidden xl:flex",
        )}
      >
        <div className="flex min-w-0 flex-col gap-2">
          {eyebrow ? (
            <span className="text-caption-1-semibold flex items-center gap-2 tracking-[0.08em] text-text-tertiary uppercase">
              {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
              {eyebrow}
            </span>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-display-4-semibold -tracking-[0.02em] text-balance text-text-primary">
              {title}
            </h1>
            {badge}
          </div>

          {description ? (
            <p className="text-body-regular max-w-[62ch] text-pretty text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>

        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>

      {children}
    </header>
  );
}
