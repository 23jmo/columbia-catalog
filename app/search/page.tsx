import type { Metadata } from "next";

import { paramsToFilters, type ParamRecord } from "@/components/catalog/filter-params";
import { AppShell } from "@/components/shell/app-shell";
import { CURRENT_TERM, termLabel } from "@/lib/constants";
import { projectCourse } from "@/lib/catalog-list-types";
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
   * The records are narrowed by `projectCourse` to the display projection in
   * `lib/catalog-list-types` first — the full shape carried ~1.9 MB of columns
   * nothing on this screen reads, including six section fields that are `null`
   * on all 8,014 Fall 2026 sections.
   *
   * TODO(scale): the projection shrinks the payload but does not bound it. At
   * the real ~10–15k courses this still ships the whole term, and the remaining
   * step is spec §9's "fetched for visible rows only" split — either bake the
   * display projection into the index artifact, or window the fetch to visible
   * rows. The seam to change is exactly here: `SearchScreen` only needs a
   * `courseId → CourseListItem` lookup.
   */
  const catalog = (await getAllCourses(termCode)).map(projectCourse);

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
