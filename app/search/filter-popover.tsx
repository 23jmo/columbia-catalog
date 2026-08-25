"use client";

import { useState } from "react";
import { RiEqualizerLine } from "@remixicon/react";

import {
  Dropdown,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { Filters } from "@/components/catalog/filters";
import type { CatalogSearchFilters, SearchFacets } from "@/components/catalog/search-source";
import { cx } from "@/utils/cx";

/**
 * Filter panel as a popover anchored to the Filters button.
 * Changes apply live; outside click or Escape dismisses via Dropdown.
 */

export interface FilterPopoverProps {
  filters: CatalogSearchFilters;
  onChange: (next: CatalogSearchFilters) => void;
  facets: SearchFacets;
  hasNoReviewData?: boolean;
  meetingFiltersAvailable?: boolean;
  activeFilterCount: number;
}

export function FilterPopover({
  filters,
  onChange,
  facets,
  hasNoReviewData,
  meetingFiltersAvailable = true,
  activeFilterCount,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dropdown isOpen={isOpen} onOpenChange={setIsOpen}>
      <DropdownTrigger
        aria-label="Open filters"
        className={cx(
          "inline-flex h-14 shrink-0 items-center justify-center gap-0.5 overflow-hidden whitespace-nowrap",
          "rounded-2lg p-2 text-body-medium font-sans select-none",
          "border border-border-button-default bg-background-primary-default text-text-primary shadow-xs",
          "hover:border-border-button-hover hover:bg-background-primary-hover",
          "active:border-border-button-active active:bg-background-primary-active",
          "active:scale-[0.97] transition-transform duration-[160ms] ease-out",
          "motion-reduce:transition-none motion-reduce:active:scale-100",
          "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring",
        )}
      >
        <RiEqualizerLine className="size-5 shrink-0" aria-hidden />
        {/*
          The word goes away on a phone; the count never does.

          With "Filters" spelled out this button takes ~180px of a 390px row,
          which left the search field 177px — not enough for its own
          placeholder, so the primary discovery surface opened on "Search
          courses, code:" cut mid-word. The icon is the standard one and the
          button already carries `aria-label="Open filters"`, so nothing is
          lost for assistive tech; what could not be lost is the signal that
          filters are *on*, which is why the count survives the collapse and
          gets a bare pill of its own at this width.
        */}
        <span className="hidden shrink-0 items-center justify-center px-1 sm:inline-flex">
          {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : "Filters"}
        </span>
        {activeFilterCount > 0 ? (
          <span className="inline-flex shrink-0 items-center justify-center px-1 tabular-nums sm:hidden">
            {activeFilterCount}
          </span>
        ) : null}
      </DropdownTrigger>

      <DropdownPopover
        aria-label="Filters"
        placement="bottom end"
        offset={8}
        className="w-[min(calc(100vw-2rem),22.5rem)] max-h-[min(70dvh,640px)] overflow-y-auto overscroll-contain p-0"
        dialogClassName="gap-0"
      >
        <div className="border-b border-border-table px-5 py-3">
          <h2 className="text-headline-semibold text-balance text-text-primary">Filters</h2>
        </div>
        <div className="px-5 py-3">
          <Filters
            filters={filters}
            onChange={onChange}
            facets={facets}
            hasNoReviewData={hasNoReviewData}
            meetingFiltersAvailable={meetingFiltersAvailable}
          />
        </div>
      </DropdownPopover>
    </Dropdown>
  );
}
