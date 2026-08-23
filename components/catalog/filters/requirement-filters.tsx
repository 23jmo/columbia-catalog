"use client";

import { useMemo } from "react";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { REQUIREMENT_FILTERS } from "@/lib/constants";
import type { CatalogSearchFilters } from "../search-source";
import { FilterGroup } from "./filter-group";

/**
 * Curriculum requirements, driven entirely by REQUIREMENT_FILTERS so a new
 * flag in lib/constants shows up here without a code change.
 *
 * Matching semantics (mirrored in the local search source): OR within a
 * curriculum group, AND across groups. "Global Core or Science" is a real
 * question a student asks; "Global Core and Ethics and Values" is a different
 * one, and grouping is what tells them apart.
 */

export interface RequirementFiltersProps {
  filters: CatalogSearchFilters;
  onChange: (next: CatalogSearchFilters) => void;
  activeCount: number;
}

export function RequirementFilters({
  filters,
  onChange,
  activeCount,
}: RequirementFiltersProps) {
  const selected = useMemo(
    () => new Set(filters.requirements ?? []),
    [filters.requirements],
  );

  // Preserve the declaration order of the groups in lib/constants.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string }[]>();
    for (const requirement of REQUIREMENT_FILTERS) {
      const bucket = map.get(requirement.group);
      if (bucket) bucket.push(requirement);
      else map.set(requirement.group, [requirement]);
    }
    return [...map.entries()];
  }, []);

  const toggle = (key: string) => {
    const next = selected.has(key)
      ? (filters.requirements ?? []).filter((k) => k !== key)
      : [...(filters.requirements ?? []), key];
    const updated = { ...filters };
    if (next.length) updated.requirements = next;
    else delete updated.requirements;
    onChange(updated);
  };

  return (
    <FilterGroup title="Requirements" activeCount={activeCount} defaultOpen={false}>
      {groups.map(([groupName, requirements]) => (
        <fieldset key={groupName} className="flex flex-col gap-2">
          <legend className="mb-1 text-caption-1-semibold tracking-normal text-text-secondary uppercase">
            {groupName}
          </legend>
          <div className="flex flex-col gap-2">
            {requirements.map((requirement) => (
              <Checkbox
                key={requirement.key}
                size="sm"
                isSelected={selected.has(requirement.key)}
                onChange={() => toggle(requirement.key)}
              >
                {requirement.label}
              </Checkbox>
            ))}
          </div>
        </fieldset>
      ))}
    </FilterGroup>
  );
}
