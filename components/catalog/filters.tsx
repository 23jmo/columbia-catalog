"use client";

import { useMemo } from "react";
import { describeActiveFilters } from "./filter-params";
import type { CatalogSearchFilters, SearchFacets } from "./search-source";
import { OrgFilters } from "./filters/org-filters";
import { ReputationFilters } from "./filters/reputation-filters";
import { RequirementFilters } from "./filters/requirement-filters";
import { TimeFilters } from "./filters/time-filters";
import { cx } from "@/utils/cx";

/**
 * The filter panel: four groups, all applied client-side against the local
 * index. There is no apply button and no pending state anywhere in this tree,
 * because a toggle costs a synchronous pass over an in-memory array.
 *
 * The panel is layout-agnostic. The Search screen renders it in a sticky
 * sidebar on desktop and inside a bottom sheet at phone widths; nothing here
 * knows which.
 */

export interface FiltersProps {
  filters: CatalogSearchFilters;
  onChange: (next: CatalogSearchFilters) => void;
  facets: SearchFacets;
  /** True while the loaded catalog carries no review coverage at all. */
  hasNoReviewData?: boolean;
  className?: string;
}

export function Filters({
  filters,
  onChange,
  facets,
  hasNoReviewData,
  className,
}: FiltersProps) {
  // Per-group active counts, derived from the same descriptors that drive the
  // chip rail so the two can never disagree.
  const counts = useMemo(() => {
    const active = describeActiveFilters(filters, () => "");
    return {
      time: active.filter((a) => a.group === "time").length,
      requirements: active.filter((a) => a.group === "requirements").length,
      org: active.filter((a) => a.group === "org").length,
      reputation: active.filter((a) => a.group === "reputation").length,
    };
  }, [filters]);

  return (
    <div className={cx("flex flex-col", className)}>
      <TimeFilters
        filters={filters}
        onChange={onChange}
        creditRange={facets.creditRange}
        activeCount={counts.time}
      />
      <RequirementFilters
        filters={filters}
        onChange={onChange}
        activeCount={counts.requirements}
      />
      <OrgFilters
        filters={filters}
        onChange={onChange}
        facets={facets}
        activeCount={counts.org}
      />
      <ReputationFilters
        filters={filters}
        onChange={onChange}
        activeCount={counts.reputation}
        hasNoReviewData={hasNoReviewData}
      />
    </div>
  );
}
