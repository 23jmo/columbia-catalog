"use client";

import type { CatalogSearchFilters, SearchFacets } from "../search-source";
import { FilterGroup } from "./filter-group";
import { MultiSelect } from "./multi-select";

/**
 * Who teaches it and who owns it: school, department/subject, instructor.
 *
 * `SearchFilters` models the department axis as `subjects` (the subject code
 * a department publishes under), so the department control writes subject
 * codes. That is also how the directory itself is organised.
 */

export interface OrgFiltersProps {
  filters: CatalogSearchFilters;
  onChange: (next: CatalogSearchFilters) => void;
  facets: SearchFacets;
  activeCount: number;
}

function writeList(
  filters: CatalogSearchFilters,
  key: "subjects" | "schools" | "instructors",
  values: string[],
): CatalogSearchFilters {
  const updated = { ...filters };
  if (values.length) updated[key] = values;
  else delete updated[key];
  return updated;
}

export function OrgFilters({ filters, onChange, facets, activeCount }: OrgFiltersProps) {
  return (
    <FilterGroup title="School and instructor" activeCount={activeCount} defaultOpen={false}>
      <MultiSelect
        label="School"
        options={facets.schools}
        selected={filters.schools ?? []}
        onChange={(values) => onChange(writeList(filters, "schools", values))}
        placeholder="Any school"
        emptyMessage="School data lands with the subject index"
      />

      <MultiSelect
        label="Department"
        options={facets.subjects}
        selected={filters.subjects ?? []}
        onChange={(values) => onChange(writeList(filters, "subjects", values))}
        placeholder="Any department"
        searchPlaceholder="COMS, MATH, HIST"
        emptyMessage="No departments in this term"
      />

      <MultiSelect
        label="Instructor"
        options={facets.instructors}
        selected={filters.instructors ?? []}
        onChange={(values) => onChange(writeList(filters, "instructors", values))}
        placeholder="Anyone"
        searchPlaceholder="Type a name"
        emptyMessage="No instructors listed in this term"
      />
    </FilterGroup>
  );
}
