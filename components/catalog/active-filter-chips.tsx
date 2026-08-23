"use client";

import { RiCloseLine } from "@remixicon/react";
import { minutesToLabel } from "@/lib/constants";
import { cx } from "@/utils/cx";
import { clearAllFilters, describeActiveFilters } from "./filter-params";
import type { CatalogSearchFilters } from "./search-source";

/**
 * The active-filter rail.
 *
 * Filters are cheap to apply and therefore easy to forget. The rail keeps
 * every narrowing decision visible above the results with its own clear
 * button, so a student never has to hunt through collapsed groups to work out
 * why a course they expected is missing.
 */

export interface ActiveFilterChipsProps {
  filters: CatalogSearchFilters;
  onChange: (next: CatalogSearchFilters) => void;
  className?: string;
}

export function ActiveFilterChips({ filters, onChange, className }: ActiveFilterChipsProps) {
  const active = describeActiveFilters(filters, minutesToLabel);
  if (active.length === 0) return null;

  return (
    <div className={cx("flex flex-wrap items-center gap-1.5", className)}>
      {active.map((filter) => (
        <span
          key={filter.id}
          className={cx(
            "inline-flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2",
            "bg-background-secondary-default text-body-2-medium text-text-primary",
          )}
        >
          {filter.label}
          <button
            type="button"
            aria-label={`Clear filter: ${filter.label}`}
            onClick={() => onChange(filter.clear(filters))}
            className={cx(
              "cursor-pointer rounded-sm p-0.5 text-text-tertiary transition-colors",
              "hover:bg-background-tertiary-default hover:text-text-primary",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiCloseLine aria-hidden className="size-3.5" />
          </button>
        </span>
      ))}

      {active.length > 1 && (
        <button
          type="button"
          onClick={() => onChange(clearAllFilters(filters))}
          className={cx(
            "cursor-pointer rounded-md px-2 py-1 text-body-2-medium text-text-secondary",
            "transition-colors hover:bg-background-primary-hover hover:text-text-primary",
            "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          )}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
