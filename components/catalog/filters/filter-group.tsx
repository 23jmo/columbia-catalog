"use client";

import { useId, useState, type ReactNode } from "react";
import { RiArrowDownSLine } from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
import { cx } from "@/utils/cx";

/**
 * Collapsible shell shared by every filter group.
 *
 * Collapsing is local state only -- it never touches the filter values, so
 * folding a group away does not change the result set. `activeCount` keeps a
 * collapsed group honest about what it is still doing to the results.
 */

export interface FilterGroupProps {
  title: string;
  /** How many filters inside this group are currently narrowing results. */
  activeCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function FilterGroup({
  title,
  activeCount = 0,
  defaultOpen = true,
  children,
}: FilterGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="border-b border-border-table last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((v) => !v)}
          className={cx(
            "flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left",
            "transition-colors hover:bg-background-primary-hover",
            "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
          )}
        >
          <span className="flex items-center gap-2">
            <span className="text-body-medium text-text-primary">{title}</span>
            {activeCount > 0 && <Badge color="primary">{activeCount}</Badge>}
          </span>
          <RiArrowDownSLine
            aria-hidden
            className={cx(
              "size-4 shrink-0 text-text-secondary transition-transform duration-200",
              isOpen && "rotate-180",
            )}
          />
        </button>
      </h3>
      {isOpen && (
        <div id={panelId} className="flex flex-col gap-4 px-4 pt-1 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}

/** Small label above an individual control inside a group. */
export function FilterLabel({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-body-2-medium text-text-primary">{children}</span>
      {hint != null && (
        <span className="text-caption-2-regular text-text-tertiary tabular-nums">{hint}</span>
      )}
    </div>
  );
}

/** A row of toggle pills (days, course level). Toggling is free and instant. */
export function TogglePill({
  isSelected,
  onToggle,
  children,
  ariaLabel,
  className,
}: {
  isSelected: boolean;
  onToggle: () => void;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={cx(
        "cursor-pointer rounded-lg border px-2.5 py-1 text-body-2-medium",
        "transition-colors duration-150",
        "outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-border-focus-ring",
        isSelected
          ? "border-accent-500 bg-accent-500 text-text-white"
          : "border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover hover:text-text-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}
