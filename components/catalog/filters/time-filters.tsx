"use client";

import { RangeSlider } from "@/components/base/slider/slider";
import { Switch } from "@/components/base/switch/switch";
import { COURSE_LEVELS, WEEKDAYS, WEEKDAY_LABEL, WEEKDAY_SHORT, minutesToLabel } from "@/lib/constants";
import type { Weekday } from "@/lib/types";
import type { CatalogSearchFilters } from "../search-source";
import { FilterGroup, FilterLabel, TogglePill } from "./filter-group";

/**
 * Time and structure: when the class meets, whether it has room, how big it is
 * and how advanced it is.
 *
 * Every control writes straight through to the filter object -- there is no
 * "apply" button, because applying is free.
 */

/** Window the sliders span. Nothing at Columbia meets before 7am. */
const DAY_START_MINUTE = 7 * 60;
const DAY_END_MINUTE = 23 * 60;
const TIME_STEP = 15;

const MAX_CREDIT_STEP = 12;

export interface TimeFiltersProps {
  filters: CatalogSearchFilters;
  onChange: (next: CatalogSearchFilters) => void;
  /** [min, max] credits actually present in the catalog. */
  creditRange: [number, number];
  activeCount: number;
}

export function TimeFilters({ filters, onChange, creditRange, activeCount }: TimeFiltersProps) {
  const selectedDays = filters.days ?? [];
  const windowStart = filters.startAfterMinute ?? DAY_START_MINUTE;
  const windowEnd = filters.endBeforeMinute ?? DAY_END_MINUTE;

  const creditLo = Math.max(0, Math.floor(creditRange[0]));
  const creditHi = Math.max(creditLo + 1, Math.ceil(creditRange[1]), MAX_CREDIT_STEP);
  const creditsMin = filters.creditsMin ?? creditLo;
  const creditsMax = filters.creditsMax ?? creditHi;

  const toggleDay = (day: Weekday) => {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    const updated = { ...filters };
    if (next.length) updated.days = next;
    else delete updated.days;
    onChange(updated);
  };

  const setTimeWindow = (values: number[]) => {
    const [start, end] = values;
    const updated = { ...filters };
    if (start > DAY_START_MINUTE) updated.startAfterMinute = start;
    else delete updated.startAfterMinute;
    if (end < DAY_END_MINUTE) updated.endBeforeMinute = end;
    else delete updated.endBeforeMinute;
    onChange(updated);
  };

  const setCredits = (values: number[]) => {
    const [lo, hi] = values;
    const updated = { ...filters };
    if (lo > creditLo) updated.creditsMin = lo;
    else delete updated.creditsMin;
    if (hi < creditHi) updated.creditsMax = hi;
    else delete updated.creditsMax;
    onChange(updated);
  };

  const setLevel = (range: [number, number]) => {
    const isActive =
      filters.levelRange?.[0] === range[0] && filters.levelRange?.[1] === range[1];
    const updated = { ...filters };
    if (isActive) delete updated.levelRange;
    else updated.levelRange = range;
    onChange(updated);
  };

  return (
    <FilterGroup title="Time and structure" activeCount={activeCount}>
      {/* Days ------------------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <FilterLabel>Meets on</FilterLabel>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((day) => (
            <TogglePill
              key={day}
              isSelected={selectedDays.includes(day)}
              onToggle={() => toggleDay(day)}
              ariaLabel={WEEKDAY_LABEL[day]}
              className="min-w-10 text-center"
            >
              {WEEKDAY_SHORT[day]}
            </TogglePill>
          ))}
        </div>
      </div>

      {/* Time window ------------------------------------------------------ */}
      <div className="flex flex-col gap-1">
        <FilterLabel hint={`${minutesToLabel(windowStart)} to ${minutesToLabel(windowEnd)}`}>
          Time window
        </FilterLabel>
        <RangeSlider
          aria-label="Meeting time window"
          thumbLabels={["Starts no earlier than", "Ends no later than"]}
          minValue={DAY_START_MINUTE}
          maxValue={DAY_END_MINUTE}
          step={TIME_STEP}
          value={[windowStart, windowEnd]}
          onChange={(v) => setTimeWindow(v as number[])}
          formatValue={(value) => minutesToLabel(value)}
        />
      </div>

      {/* Open seats ------------------------------------------------------- */}
      <Switch
        size="sm"
        isSelected={filters.openSeatsOnly === true}
        onChange={(isSelected) => {
          const updated = { ...filters };
          if (isSelected) updated.openSeatsOnly = true;
          else delete updated.openSeatsOnly;
          onChange(updated);
        }}
      >
        Open seats only
      </Switch>

      {/* Credits ---------------------------------------------------------- */}
      <div className="flex flex-col gap-1">
        <FilterLabel hint={`${creditsMin} to ${creditsMax}`}>Credits</FilterLabel>
        <RangeSlider
          aria-label="Credit range"
          thumbLabels={["Fewest credits", "Most credits"]}
          minValue={creditLo}
          maxValue={creditHi}
          step={1}
          value={[creditsMin, creditsMax]}
          onChange={(v) => setCredits(v as number[])}
        />
      </div>

      {/* Level ------------------------------------------------------------ */}
      <div className="flex flex-col gap-2">
        <FilterLabel>Course level</FilterLabel>
        <div className="flex flex-wrap gap-1.5">
          {COURSE_LEVELS.map((level) => (
            <TogglePill
              key={level.label}
              isSelected={
                filters.levelRange?.[0] === level.range[0] &&
                filters.levelRange?.[1] === level.range[1]
              }
              onToggle={() => setLevel(level.range)}
            >
              {level.label}
            </TogglePill>
          ))}
        </div>
      </div>
    </FilterGroup>
  );
}
