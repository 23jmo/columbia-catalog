"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RiEqualizerLine, RiSearchLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { ActiveFilterChips } from "@/components/catalog/active-filter-chips";
import {
  describeActiveFilters,
  filtersFromLocation,
  filtersToQueryString,
} from "@/components/catalog/filter-params";
import { Filters } from "@/components/catalog/filters";
import { SearchBar } from "@/components/catalog/search-bar";
import { PageHeader } from "@/components/shell/page-header";
import {
  hasSectionLevelFilter,
  type CatalogSearchFilters,
  type SearchFacets,
} from "@/components/catalog/search-source";
import { loadSearchIndex, type LoadProgress } from "@/lib/search/client";
import type { SearchEngine } from "@/lib/search/engine";
import type { SearchResult, TermCode } from "@/lib/types";

import { EmptyResults } from "./empty-results";
import { FilterSheet } from "./filter-sheet";
import { IndexStatus } from "./index-status";
import { ResultsList, type ResultRow } from "./results-list";

/**
 * The Search screen.
 *
 * Catalog data arrives via the binary index (`loadSearchIndex`), not the RSC
 * payload. Keystrokes stay synchronous against the in-memory engine once the
 * index is ready; IndexedDB cache makes repeat visits instant.
 */

const EMPTY_RESULT: SearchResult = { hits: [], total: 0, elapsedMs: 0 };

const EMPTY_FACETS: SearchFacets = {
  subjects: [],
  schools: [],
  instructors: [],
  creditRange: [0, 6],
};

export interface SearchScreenProps {
  initialFilters: CatalogSearchFilters;
  termCode: TermCode;
  termLabel: string;
}

function isWorthRendering(previous: LoadProgress | null, next: LoadProgress): boolean {
  if (!previous) return true;
  if (previous.stage !== next.stage) return true;
  if (next.fraction === null || previous.fraction === null) return true;
  return Math.abs(next.fraction - previous.fraction) >= 0.05;
}

export function SearchScreen({ initialFilters, termCode, termLabel }: SearchScreenProps) {
  const [filters, setFilters] = useState<CatalogSearchFilters>(initialFilters);
  const [engine, setEngine] = useState<SearchEngine | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [isFilterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const lastProgress = { current: null as LoadProgress | null };

    const adopt = (next: SearchEngine) => {
      if (cancelled) return;
      next.setSeatOverlay(next.seatOverlayForTerm(termCode));
      setEngine(next);
    };

    const handle = loadSearchIndex({
      onProgress: (next) => {
        if (cancelled || !isWorthRendering(lastProgress.current, next)) return;
        lastProgress.current = next;
        setProgress(next);
      },
      onUpdate: (next) => adopt(next),
    });

    handle.ready.then(adopt).catch(() => {
      // IndexStatus surfaces a failed download; there is no server fallback.
    });

    return () => {
      cancelled = true;
    };
  }, [termCode]);

  const effectiveFilters = useMemo<CatalogSearchFilters>(
    () => ({ ...filters, termCode: filters.termCode ?? termCode }),
    [filters, termCode],
  );

  const result = useMemo(
    () => (engine ? engine.search(effectiveFilters) : EMPTY_RESULT),
    [engine, effectiveFilters],
  );

  const facets = useMemo(
    () => (engine ? engine.facetsForTerm(termCode) : EMPTY_FACETS),
    [engine, termCode],
  );

  const totalCatalogCourses = engine?.totalCoursesForTerm(termCode) ?? 0;
  const sectionScoped = hasSectionLevelFilter(effectiveFilters);

  const rows = useMemo<ResultRow[]>(() => {
    if (!engine) return [];
    const out: ResultRow[] = [];
    for (const hit of result.hits) {
      const course = engine.getCourse(hit.courseId);
      if (!course) continue;
      out.push({ course, matchedSectionIds: hit.matchedSectionIds });
    }
    return out;
  }, [result, engine]);

  useEffect(() => {
    const query = filtersToQueryString(filters);
    const nextUrl = query ? `/search?${query}` : "/search";
    const timer = window.setTimeout(() => {
      if (window.location.pathname + window.location.search !== nextUrl) {
        window.history.replaceState(null, "", nextUrl);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    const onPopState = () => setFilters(filtersFromLocation(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const onQueryChange = useCallback((query: string) => {
    setFilters((current) => (query ? { ...current, q: query } : withoutQuery(current)));
  }, []);

  const onFiltersChange = useCallback((next: CatalogSearchFilters) => setFilters(next), []);

  const activeFilterCount = useMemo(
    () => describeActiveFilters(filters, () => "").length,
    [filters],
  );

  const resultSummary = engine
    ? `${result.total.toLocaleString()} ${result.total === 1 ? "course" : "courses"}${
        result.total === totalCatalogCourses ? "" : ` of ${totalCatalogCourses.toLocaleString()}`
      }`
    : "Loading catalog index…";

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6">
      <PageHeader
        eyebrow="Catalog"
        icon={RiSearchLine}
        title="Search"
        description={`Every ${termLabel} course, searched on your machine. Results update as you type — nothing is sent anywhere.`}
      >
        <div className="flex items-start gap-2">
          <SearchBar
            query={filters.q ?? ""}
            onQueryChange={onQueryChange}
            resultSummary={resultSummary}
            elapsedMs={engine ? result.elapsedMs : undefined}
            appearance="hero"
            className="min-w-0 flex-1"
          />
          <Button
            className="h-14 shrink-0 lg:hidden"
            size="medium"
            variant="secondary"
            leadingIcon={RiEqualizerLine}
            onClick={() => setFilterSheetOpen(true)}
            aria-label="Open filters"
          >
            {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : "Filters"}
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pr-1">
            <Filters
              filters={filters}
              onChange={onFiltersChange}
              facets={facets}
              hasNoReviewData
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          <ActiveFilterChips filters={filters} onChange={onFiltersChange} />

          <IndexStatus progress={progress} isEngineLive={engine !== null} />

          {!engine ? null : rows.length === 0 ? (
            <EmptyResults
              filters={filters}
              onChange={onFiltersChange}
              totalCourses={totalCatalogCourses}
            />
          ) : (
            <ResultsList rows={rows} sectionScoped={sectionScoped} />
          )}
        </div>
      </div>

      <FilterSheet isOpen={isFilterSheetOpen} onClose={() => setFilterSheetOpen(false)}>
        <Filters
          filters={filters}
          onChange={onFiltersChange}
          facets={facets}
          hasNoReviewData
        />
      </FilterSheet>
    </div>
  );
}

function withoutQuery(filters: CatalogSearchFilters): CatalogSearchFilters {
  const next = { ...filters };
  delete next.q;
  return next;
}
