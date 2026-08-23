"use client";

import { RiInformationLine } from "@remixicon/react";
import { Slider } from "@/components/base/slider/slider";
import { Switch } from "@/components/base/switch/switch";
import { cx } from "@/utils/cx";
import type { CatalogSearchFilters } from "../search-source";
import { FilterGroup, FilterLabel } from "./filter-group";

/**
 * Reputation: workload, difficulty, teaching quality.
 *
 * Two rules from the spec govern this whole group.
 *
 * 1. Course quality and instructor quality are scored SEPARATELY (principle 3).
 *    Workload and difficulty describe the course; teaching quality describes
 *    the person in front of it. They are three sliders, never one number.
 *
 * 2. "Include unrated" defaults to ON and is the most prominent control here
 *    (spec section 6). Silently dropping every unreviewed course the moment a
 *    student nudges a reputation slider is a trap: it hides the entire long
 *    tail of the catalog behind a control that looks like it only reorders.
 *    Turning it off is an explicit, visible, reversible act.
 *
 * A slider parked at its permissive end (workload/difficulty at 5, teaching at
 * 1) removes the filter entirely rather than encoding a no-op constraint, so
 * the URL and the chip rail stay clean.
 */

const SCALE_MIN = 1;
const SCALE_MAX = 5;

export interface ReputationFiltersProps {
  filters: CatalogSearchFilters;
  onChange: (next: CatalogSearchFilters) => void;
  activeCount: number;
  /** True while no review data has been ingested for the loaded catalog. */
  hasNoReviewData?: boolean;
}

export function ReputationFilters({
  filters,
  onChange,
  activeCount,
  hasNoReviewData = false,
}: ReputationFiltersProps) {
  const includeUnrated = filters.includeUnrated !== false;

  const setCeiling = (key: "maxWorkload" | "maxDifficulty", value: number) => {
    const updated = { ...filters };
    if (value >= SCALE_MAX) delete updated[key];
    else updated[key] = value;
    onChange(updated);
  };

  const setFloor = (value: number) => {
    const updated = { ...filters };
    if (value <= SCALE_MIN) delete updated.minTeachingQuality;
    else updated.minTeachingQuality = value;
    onChange(updated);
  };

  const workload = filters.maxWorkload ?? SCALE_MAX;
  const difficulty = filters.maxDifficulty ?? SCALE_MAX;
  const teaching = filters.minTeachingQuality ?? SCALE_MIN;

  return (
    <FilterGroup title="Reputation" activeCount={activeCount} defaultOpen={false}>
      {/* The unrated toggle leads the group deliberately -- it is the control
          that decides whether the sliders below can hide anything at all. */}
      <div
        className={cx(
          "flex flex-col gap-2 rounded-2lg border p-3",
          includeUnrated
            ? "border-border-button-default bg-background-secondary-default"
            : "border-accent-500 bg-background-tertiary-default",
        )}
      >
        <Switch
          size="md"
          isSelected={includeUnrated}
          onChange={(isSelected) => onChange({ ...filters, includeUnrated: isSelected })}
        >
          Include unrated courses
        </Switch>
        <p className="text-caption-1-regular text-text-secondary">
          {includeUnrated
            ? "Courses with no reviews stay in the results. Reputation sliders only narrow the courses that do have reviews."
            : "Only courses with review coverage are shown. Most of the catalog has none, so this hides a lot."}
        </p>
      </div>

      {hasNoReviewData && (
        <p className="flex items-start gap-1.5 text-caption-1-regular text-text-tertiary">
          <RiInformationLine aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>
            No review data has been ingested for this term yet, so every course
            currently reads as unrated.
          </span>
        </p>
      )}

      <div className="flex flex-col gap-1">
        <FilterLabel hint={workload >= SCALE_MAX ? "any" : `at most ${workload}`}>
          Workload
        </FilterLabel>
        <Slider
          aria-label="Maximum workload"
          thumbLabel="Maximum workload"
          minValue={SCALE_MIN}
          maxValue={SCALE_MAX}
          step={1}
          value={workload}
          onChange={(v) => setCeiling("maxWorkload", v as number)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <FilterLabel hint={difficulty >= SCALE_MAX ? "any" : `at most ${difficulty}`}>
          Difficulty
        </FilterLabel>
        <Slider
          aria-label="Maximum difficulty"
          thumbLabel="Maximum difficulty"
          minValue={SCALE_MIN}
          maxValue={SCALE_MAX}
          step={1}
          value={difficulty}
          onChange={(v) => setCeiling("maxDifficulty", v as number)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <FilterLabel hint={teaching <= SCALE_MIN ? "any" : `at least ${teaching}`}>
          Teaching quality
        </FilterLabel>
        <Slider
          aria-label="Minimum teaching quality"
          thumbLabel="Minimum teaching quality"
          minValue={SCALE_MIN}
          maxValue={SCALE_MAX}
          step={1}
          value={teaching}
          onChange={(v) => setFloor(v as number)}
        />
      </div>
    </FilterGroup>
  );
}
