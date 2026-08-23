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
  createLocalSearchSource,
  hasSectionLevelFilter,
  sectionHasOpenSeats,
  type CatalogSearchFilters,
} from "@/components/catalog/search-source";
import { loadSearchIndex, type LoadProgress } from "@/lib/search/client";
import type { SearchEngine } from "@/lib/search/engine";
import type { CourseWithSections, SearchResult, TermCode } from "@/lib/types";

import { EmptyResults } from "./empty-results";
import { FilterSheet } from "./filter-sheet";
import { IndexStatus } from "./index-status";
import { ResultsList, type ResultRow } from "./results-list";

/**
 * The Search screen.
 *
 * THE PRODUCT RULE THIS FILE EXISTS TO PROTECT (AGENTS.md, spec §19):
 * search never touches the network. The index is downloaded once, then every
 * keystroke and every filter toggle is a synchronous in-memory pass computed
 * during render. There is no debounce, no request, no pending state and no
 * spinner anywhere on the typing path — if you ever find yourself adding an
 * `isSearching` flag here, the thesis has been broken upstream.
 *
 * Two sources, one interface:
 *
 *   1. `createLocalSearchSource(catalog)` is built from the records the server
 *      already sent, so search is fully usable on the very first frame — before
 *      the binary index has finished downloading.
 *   2. `loadSearchIndex()` (lib/search/client) delivers the real engine: BM25,
 *      prefix/fuzzy matching, code and title boosts. When it resolves we swap
 *      it in behind the same `search(filters)` signature. Nothing above this
 *      line changes and no query is ever queued waiting for it.
 *
 * The swap is why the index load can afford to be visible (`IndexStatus`)
 * while typing stays silent: the loading state describes an *upgrade*, never a
 * blocker.
 */

/** Both search paths answer this exact shape. Synchronous, by contract. */
type QueryRunner = (filters: CatalogSearchFilters) => SearchResult;

export interface SearchScreenProps {
  /** Course records for the term, from the catalog read seam. */
  catalog: CourseWithSections[];
  initialFilters: CatalogSearchFilters;
  termCode: TermCode;
  termLabel: string;
}

/** Progress ticks arrive per network chunk; only redraw on real movement. */
function isWorthRendering(previous: LoadProgress | null, next: LoadProgress): boolean {
  if (!previous) return true;
  if (previous.stage !== next.stage) return true;
  if (next.fraction === null || previous.fraction === null) return true;
  return Math.abs(next.fraction - previous.fraction) >= 0.05;
}

export function SearchScreen({
  catalog,
  initialFilters,
  termCode,
  termLabel,
}: SearchScreenProps) {
  const [filters, setFilters] = useState<CatalogSearchFilters>(initialFilters);
  const [engine, setEngine] = useState<SearchEngine | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [isFilterSheetOpen, setFilterSheetOpen] = useState(false);

  // ---------------------------------------------------------------------
  // Sources
  // ---------------------------------------------------------------------

  // Built once from the server payload. Also the origin of the facet menus,
  // which must not wait on the index either.
  const localSource = useMemo(() => createLocalSearchSource(catalog), [catalog]);

  const coursesById = useMemo(() => {
    const map = new Map<string, CourseWithSections>();
    for (const course of catalog) map.set(course.courseId, course);
    return map;
  }, [catalog]);

  const runQuery = useMemo<QueryRunner>(() => {
    if (!engine) return (next) => localSource.search(next);
    return (next) => engine.search(next);
  }, [engine, localSource]);

  /*
   * The index artifact spans every built term, while `catalog` is one term's
   * records. Pinning the term on every query keeps the two halves describing
   * the same catalog, so a hit can always be resolved to a record.
   */
  const effectiveFilters = useMemo<CatalogSearchFilters>(
    () => ({ ...filters, termCode: filters.termCode ?? termCode }),
    [filters, termCode],
  );

  // THE hot path. Synchronous, inside render, no effect and no await.
  const result = useMemo(() => runQuery(effectiveFilters), [runQuery, effectiveFilters]);

  const sectionScoped = hasSectionLevelFilter(effectiveFilters);

  const rows = useMemo<ResultRow[]>(() => {
    const out: ResultRow[] = [];
    for (const hit of result.hits) {
      const course = coursesById.get(hit.courseId);
      // A hit we hold no record for cannot be drawn. It means the index and
      // the catalog payload disagree (mid-deploy, or a term mismatch); dropping
      // it is better than rendering a row with no title.
      if (!course) continue;
      out.push({ course, matchedSectionIds: hit.matchedSectionIds });
    }
    return out;
  }, [result, coursesById]);

  // ---------------------------------------------------------------------
  // Index loading — progressive, never blocking
  // ---------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const lastProgress = { current: null as LoadProgress | null };

    const adopt = (next: SearchEngine) => {
      if (cancelled) return;
      /*
       * Seat state is deliberately NOT in the index (spec §9: the volatile
       * half is merged at render). `openSeatsOnly` is therefore inert on the
       * engine until an overlay is installed — so we install one from the
       * records we already hold, and the filter behaves identically on both
       * paths.
       *
       * TODO(seats): when live seat polling lands, re-install this overlay
       * from `getSeatStates()` on each refresh instead of the static payload.
       */
      next.setSeatOverlay(
        catalog.flatMap((course) =>
          course.sections.map((section) => ({
            sectionId: section.sectionId,
            hasOpenSeats: sectionHasOpenSeats(section),
          })),
        ),
      );
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
      // A failed index download is not an outage: the local source is already
      // answering every keystroke. `IndexStatus` says so plainly.
    });

    return () => {
      cancelled = true;
    };
  }, [catalog]);

  // ---------------------------------------------------------------------
  // URL sync — the shareable source of truth
  // ---------------------------------------------------------------------

  /*
   * The URL is written with the native History API rather than the Next
   * router: a router navigation per keystroke would re-run the server render
   * and put the network back on the typing path, which is the one thing this
   * screen must never do. `history.replaceState` updates the address bar (so
   * the link stays copy-pasteable) and nothing else.
   *
   * It is also throttled, because a history write per character is churn no
   * one benefits from — the results are already on screen.
   */
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

  // Back/forward has to restore the results it showed before.
  useEffect(() => {
    const onPopState = () => setFilters(filtersFromLocation(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ---------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------

  const onQueryChange = useCallback((query: string) => {
    // Straight to state. The engine runs in the same render pass.
    setFilters((current) => (query ? { ...current, q: query } : withoutQuery(current)));
  }, []);

  const onFiltersChange = useCallback((next: CatalogSearchFilters) => setFilters(next), []);

  // The same descriptors that drive the chip rail and the panel's group
  // counts, so the sheet button can never disagree with either.
  const activeFilterCount = useMemo(
    () => describeActiveFilters(filters, () => "").length,
    [filters],
  );

  const resultSummary = `${result.total.toLocaleString()} ${
    result.total === 1 ? "course" : "courses"
  }${result.total === localSource.totalCourses ? "" : ` of ${localSource.totalCourses.toLocaleString()}`}`;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6">
      {/*
        The query field is promoted out of the results column and into the
        header, spanning the full width above both rails.

        It was previously a 44px input wedged into the narrow right-hand column
        beside a "Filters" button, which made the app's single most-used
        control the least prominent thing on the screen — and made the two
        stacked sidebars feel like the page's real subject. Full width and
        56px tall, it now reads as the page's primary action, which is exactly
        what it is: everything below is a response to what gets typed here.
      */}
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
            elapsedMs={result.elapsedMs}
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
        {/* Desktop filter rail. Sticky so a long result list never strands it. */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pr-1">
            <Filters
              filters={filters}
              onChange={onFiltersChange}
              facets={localSource.facets}
              // Review ingest is a separate lane; until it lands every course
              // reads as unrated and the reputation group says so itself.
              hasNoReviewData
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          <ActiveFilterChips filters={filters} onChange={onFiltersChange} />

          <IndexStatus progress={progress} isEngineLive={engine !== null} />

          {rows.length === 0 ? (
            <EmptyResults
              filters={filters}
              onChange={onFiltersChange}
              totalCourses={localSource.totalCourses}
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
          facets={localSource.facets}
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

