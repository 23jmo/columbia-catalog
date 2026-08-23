import type { Metadata } from "next";

import { paramsToFilters, type ParamRecord } from "@/components/catalog/filter-params";
import { AppShell } from "@/components/shell/app-shell";
import { CURRENT_TERM, termLabel } from "@/lib/constants";
import { getAllCourses } from "@/lib/data/catalog";

import { SearchScreen } from "./search-screen";

/**
 * The search surface.
 *
 * This file is a **server component** and stays one: it reads the URL, pulls
 * the catalog through the single read seam (`@/lib/data/catalog`) and hands
 * both to the client screen. Nothing about the query itself happens here —
 * per AGENTS.md and spec §9, search never touches the network, so the server's
 * only job is to deliver the starting state and the course records the rows
 * render from.
 *
 * Filters live in the URL. `paramsToFilters` is the one decoder (shared with
 * `filtersToQueryString` on the client), so a pasted link, a bookmark and a
 * back button all reconstruct exactly the same result set.
 */

export const metadata: Metadata = {
  title: "Search — Columbia Catalog",
  description:
    "Search every Columbia and Barnard course instantly. Filters apply locally, so results update within a frame of every keystroke.",
};

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = (await searchParams) as ParamRecord;
  const initialFilters = paramsToFilters(params);
  const termCode = initialFilters.termCode ?? CURRENT_TERM;

  /*
   * The course records the result rows render from.
   *
   * The binary search index (`public/index/*.bin`) carries the *searchable*
   * projection of the catalog, not a renderable one — the engine answers with
   * course ids. Row display needs the real records, so they travel with the
   * RSC payload. At the seed's scale (tens of courses) that is a few dozen KB
   * and buys a fully-rendered first paint with zero client fetching.
   *
   * TODO(scale): once the catalog is the real ~10–15k courses, this payload
   * has to become either a display projection baked into the index artifact or
   * a windowed fetch for visible rows only (spec §9's "fetched for visible
   * rows only" split). The seam to change is exactly here — `SearchScreen`
   * only needs a `courseId → CourseWithSections` lookup.
   */
  const catalog = await getAllCourses(termCode);

  return (
    <AppShell activeNav="search">
      <SearchScreen
        catalog={catalog}
        initialFilters={initialFilters}
        termCode={termCode}
        termLabel={termLabel(termCode)}
      />
    </AppShell>
  );
}
