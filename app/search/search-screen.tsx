"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ActiveFilterChips } from "@/components/catalog/active-filter-chips";
import {
  describeActiveFilters,
  filtersFromLocation,
  filtersToQueryString,
  clearTimeStructureFilters,
} from "@/components/catalog/filter-params";
import { SearchBar } from "@/components/catalog/search-bar";
import { PageHeader } from "@/components/shell/page-header";
import { PageContent } from "@/components/shell/page-content";
import {
  hasSectionLevelFilter,
  type CatalogSearchFilters,
  type SearchFacets,
} from "@/components/catalog/search-source";
import { loadSearchIndex, type LoadProgress } from "@/lib/search/client";
import type { PersonalOverlayEntry, SearchEngine } from "@/lib/search/engine";
import type { SearchResult, TermCode } from "@/lib/types";

import { getCatalogRelevanceAction } from "./relevance-actions";

import { EmptyResults } from "./empty-results";
import { FilterPopover } from "./filter-popover";
import { GuestSignInBanner } from "./guest-sign-in-banner";
import { IndexStatus } from "./index-status";
import { ResultsList, type ResultRow } from "./results-list";
import { SearchResultsSkeleton } from "./search-results-skeleton";

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
}

function isWorthRendering(previous: LoadProgress | null, next: LoadProgress): boolean {
  if (!previous) return true;
  if (previous.stage !== next.stage) return true;
  if (next.fraction === null || previous.fraction === null) return true;
  return Math.abs(next.fraction - previous.fraction) >= 0.05;
}

export function SearchScreen({ initialFilters, termCode }: SearchScreenProps) {
  const [filters, setFilters] = useState<CatalogSearchFilters>(initialFilters);
  const [engine, setEngine] = useState<SearchEngine | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);

  /*
   * Personal relevance — the catalog's secondary sort key — and the engine it
   * belongs to, held in refs because they arrive from two independent async
   * sources and either can win the race.
   *
   * `rankingVersion` counts installs. It is a cache key rather than an input:
   * an overlay mutates the engine in place, so the same object now answers
   * differently and identity cannot say so. Without it in the memo's
   * dependencies below, results keep the pre-overlay ordering until the next
   * keystroke.
   */
  const engineRef = useRef<SearchEngine | null>(null);
  const relevanceRef = useRef<PersonalOverlayEntry[] | null>(null);
  const [rankingVersion, setRankingVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const lastProgress = { current: null as LoadProgress | null };

    const adopt = (next: SearchEngine) => {
      if (cancelled) return;
      next.setSeatOverlay(next.seatOverlayForTerm(termCode));
      // A fresher index can land after the ranking did, and `onUpdate` swaps
      // the engine out from under it. Carrying the overlay across is what
      // stops a background index refresh from dropping the student back into
      // course order mid-session.
      if (relevanceRef.current) next.setPersonalOverlay(relevanceRef.current);
      engineRef.current = next;
      setEngine(next);
      if (relevanceRef.current) setRankingVersion((version) => version + 1);
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

  /*
   * The ranking, fetched in parallel with the index rather than before it.
   *
   * `search()` is synchronous by contract and nothing on this screen may wait
   * on the network, so the catalog renders in course order the moment the
   * index is ready and re-ranks when this lands — usually within the same
   * second, since both requests start together.
   *
   * A visitor with no record gets `personalized: false` and no overlay at all,
   * which leaves the engine ranking exactly as it did before this existed.
   */
  useEffect(() => {
    let cancelled = false;
    getCatalogRelevanceAction()
      .then((response) => {
        if (cancelled || !response.personalized || response.entries.length === 0) return;
        relevanceRef.current = response.entries;
        // No engine yet means the index is still downloading, and `adopt`
        // installs this the moment it arrives.
        const active = engineRef.current;
        if (!active) return;
        active.setPersonalOverlay(response.entries);
        setRankingVersion((version) => version + 1);
      })
      .catch(() => {
        // Personal ordering is an improvement on the catalog, not the catalog.
        // A failed rank leaves every course exactly where it already was.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveFilters = useMemo<CatalogSearchFilters>(
    () => ({ ...filters, termCode: filters.termCode ?? termCode }),
    [filters, termCode],
  );

  const result = useMemo(
    () => (engine ? engine.search(effectiveFilters) : EMPTY_RESULT),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rankingVersion is a cache key: the overlay mutates `engine` in place, so identity cannot signal a re-rank
    [engine, effectiveFilters, rankingVersion],
  );

  const facets = useMemo(
    () => (engine ? engine.facetsForTerm(termCode) : EMPTY_FACETS),
    [engine, termCode],
  );

  const totalCatalogCourses = engine?.totalCoursesForTerm(termCode) ?? 0;
  const meetingFiltersAvailable = engine?.hasMeetingCoverageForTerm(termCode) ?? false;
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
    if (!engine || meetingFiltersAvailable) return;
    setFilters((current) => {
      const hasTime =
        (current.days?.length ?? 0) > 0 ||
        current.startAfterMinute !== undefined ||
        current.endBeforeMinute !== undefined;
      if (!hasTime) return current;
      return clearTimeStructureFilters(current);
    });
  }, [engine, meetingFiltersAvailable]);

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

  /*
   * The ordering says so out loud.
   *
   * Results that silently rearrange a second after the page settles, with
   * nothing on screen to explain it, is the exact failure
   * `components/catalog/search-parity.test.ts` was written about. The re-rank
   * here is deliberate rather than a bug, which makes it worse to leave
   * unlabelled, not better. This line is already `aria-live="polite"` inside
   * `SearchBar`, so the change is announced rather than just drawn.
   *
   * Read from `rankingVersion` rather than `engine.hasPersonalOverlay`: the
   * engine's flag is mutable state that render must not reach into, and the
   * counter is the state change that made the overlay visible anyway.
   */
  const personalizedOrder = rankingVersion > 0;
  const resultSummary = engine
    ? `${result.total.toLocaleString()} ${result.total === 1 ? "course" : "courses"}${
        result.total === totalCatalogCourses ? "" : ` of ${totalCatalogCourses.toLocaleString()}`
      }${personalizedOrder ? " · ordered for you" : ""}`
    : "Loading…";

  return (
    /*
      `px-3` is the gutter the result rows bleed back out of.

      Every row body carries `px-3` so its hover tint and hairline have
      breathing room around the text. That padding used to push result titles
      12px right of the page title and the search field, which sit flush
      against this container — three different left edges in one column.

      Putting the gutter in `PageContent` and letting `ResultsList` cancel it with `-mx-3`
      gives the screen exactly two vertical edges: text on 12px, and row
      surfaces on 0. The rows still bleed, they just bleed into padding that
      exists instead of past the container.
    */
    /*
      No min-width here on purpose. The 480px floor that keeps a result row
      readable while the drawer is open lives on the shell's content column in
      `components/shell/app-shell.tsx` — a floor set at this level would
      overflow into the strip the fixed panel covers instead of making the page
      scrollable. See the note there.
    */
    <PageContent>
      {/*
        Sticky search. The shell scrolls its own column, not the window, so
        `position: sticky; top: 0` pins to that column — right under the
        mobile hamburger bar. Solid fill so result rows cannot show through
        while they pass underneath.

        `sm:-mx-3` / matching width + padding cancels PageContent's gutter the
        same way ResultsList does, so a scrolling row cannot peek in the 12px
        beside the field.
      */}
      <div className="sticky top-0 z-20 bg-background-full pb-3 pt-1 sm:-mx-3 sm:w-[calc(100%+1.5rem)] sm:px-3">
        <PageHeader title="Catalog" hideTitleOnMobile>
          <div className="flex items-start gap-2">
            <SearchBar
              query={filters.q ?? ""}
              onQueryChange={onQueryChange}
              resultSummary={resultSummary}
              elapsedMs={engine ? result.elapsedMs : undefined}
              appearance="hero"
              className="min-w-0 flex-1"
            />
            <FilterPopover
              filters={filters}
              onChange={onFiltersChange}
              facets={facets}
              hasNoReviewData
              meetingFiltersAvailable={meetingFiltersAvailable}
              activeFilterCount={activeFilterCount}
            />
          </div>
        </PageHeader>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {/*
          The guest offer, above the results and below the field.

          Above the results because it has to be seen; below the field because
          a visitor who arrived with a course in mind should be able to type it
          without reading an ad first. It renders nothing for a signed-in
          student and nothing until the session has answered, so this is the
          only line the catalog spends on being open to strangers.
        */}
        <GuestSignInBanner />

        <ActiveFilterChips filters={filters} onChange={onFiltersChange} />

        <IndexStatus progress={progress} />

        {!engine ? (
          <SearchResultsSkeleton status="Loading catalog index" />
        ) : rows.length === 0 ? (
          <EmptyResults
            filters={filters}
            onChange={onFiltersChange}
            totalCourses={totalCatalogCourses}
            meetingFiltersAvailable={meetingFiltersAvailable}
          />
        ) : (
          <ResultsList rows={rows} sectionScoped={sectionScoped} />
        )}
      </div>

    </PageContent>
  );
}

function withoutQuery(filters: CatalogSearchFilters): CatalogSearchFilters {
  const next = { ...filters };
  delete next.q;
  return next;
}
