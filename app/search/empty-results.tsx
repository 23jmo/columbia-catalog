"use client";

import { RiFilterOffLine, RiSearchEyeLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import {
  clearAllFilters,
  describeActiveFilters,
  type ActiveFilter,
} from "@/components/catalog/filter-params";
import type { CatalogSearchFilters } from "@/components/catalog/search-source";
import { minutesToLabel } from "@/lib/constants";

/**
 * Zero results.
 *
 * An empty state that only says "no results" makes the reader re-derive what
 * went wrong. Every narrowing decision is listed here with a one-click release,
 * because in a catalog this dense the answer is almost always one filter, and
 * usually a filter the reader forgot they set two screens ago.
 *
 * The reputation group gets special billing: with review ingest not yet live
 * every course reads as unrated, so "rated courses only" empties the list on
 * its own. Naming that explicitly is the difference between a dead end and an
 * explanation.
 */

const GROUP_LABEL: Record<ActiveFilter["group"], string> = {
  text: "Search text",
  time: "Time & structure",
  requirements: "Requirements",
  org: "Subject & instructor",
  reputation: "Reputation",
};

export interface EmptyResultsProps {
  filters: CatalogSearchFilters;
  onChange: (next: CatalogSearchFilters) => void;
  /** Catalog size, so "0 of 43" reads differently from "0 of 0". */
  totalCourses: number;
  meetingFiltersAvailable?: boolean;
}

function hasTimeStructureFilter(filters: CatalogSearchFilters): boolean {
  return Boolean(
    (filters.days && filters.days.length > 0) ||
      filters.startAfterMinute !== undefined ||
      filters.endBeforeMinute !== undefined,
  );
}

export function EmptyResults({
  filters,
  onChange,
  totalCourses,
  meetingFiltersAvailable = true,
}: EmptyResultsProps) {
  const active = describeActiveFilters(filters, minutesToLabel);
  const query = filters.q?.trim();
  const ratedOnly = filters.includeUnrated === false;
  const timeFilterBlocked = !meetingFiltersAvailable && hasTimeStructureFilter(filters);

  return (
    <div className="flex flex-col items-start gap-4 rounded-2lg border border-border-table bg-background-primary-default p-6 shadow-card">
      <div className="flex items-start gap-3">
        <RiSearchEyeLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-headline-semibold text-balance text-text-primary">
            {query ? `Nothing matches “${query}”` : "Nothing matches these filters"}
          </h2>
          <p className="mt-1 text-body-regular text-pretty text-text-secondary">
            {totalCourses === 0
              ? "No courses are loaded for this term yet."
              : `The catalog holds ${totalCourses.toLocaleString()} ${
                  totalCourses === 1 ? "course" : "courses"
                } for this term — none of them survived every condition below.`}
          </p>
        </div>
      </div>

      {timeFilterBlocked ? (
        <p className="rounded-lg border border-dashed border-border-button-default bg-background-secondary-default px-3 py-2 text-body-regular text-text-secondary">
          <span className="text-text-primary">Day or time filters</span> are set, but this
          search index has no meeting schedules to match against — Columbia stopped publishing
          times in the directory. Clear those filters, or rebuild the index with historical
          patterns enabled.
        </p>
      ) : null}

      {ratedOnly ? (
        <p className="rounded-lg border border-dashed border-border-button-default bg-background-secondary-default px-3 py-2 text-body-regular text-text-secondary">
          <span className="text-text-primary">Rated courses only</span> is on, and no reviews
          have been matched to this catalog yet — so it currently excludes everything.
          Unreviewed is not the same as bad.
        </p>
      ) : null}

      {active.length > 0 ? (
        <div className="flex w-full flex-col gap-2">
          <p className="text-caption-2-medium tracking-wide text-text-tertiary uppercase">
            Release one to widen the search
          </p>
          <div className="flex flex-wrap gap-1.5">
            {active.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => onChange(filter.clear(filters))}
                className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border border-border-button-default px-2 py-1 text-body-2-medium text-text-primary transition-colors outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <span className="text-text-tertiary">{GROUP_LABEL[filter.group]}</span>
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {active.length > 0 ? (
          <Button
            variant="secondary"
            leadingIcon={RiFilterOffLine}
            onClick={() => onChange(clearAllFilters(filters))}
          >
            Clear all filters
          </Button>
        ) : null}
        {query ? (
          <Button
            variant="ghost"
            onClick={() => {
              const next = { ...filters };
              delete next.q;
              onChange(next);
            }}
          >
            Clear the search text
          </Button>
        ) : null}
      </div>
    </div>
  );
}
