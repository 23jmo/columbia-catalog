import type { Metadata } from "next";

import { paramsToFilters, type ParamRecord } from "@/components/catalog/filter-params";
import { AppShell } from "@/components/shell/app-shell";
import { CURRENT_TERM } from "@/lib/constants";

import { SearchScreen } from "./search-screen";

/**
 * The search surface — server shell only.
 *
 * Search data lives in the client index artifact (`public/index/*.bin`), not in
 * the RSC payload. The server reads URL filters and mounts the client screen;
 * `getAllCourses()` is intentionally NOT called here (that was ~3.3s + ~6 MB
 * on every cold load).
 */

export const metadata: Metadata = {
  title: "Search — LionPlan",
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

  return (
    <AppShell activeNav="search">
      <SearchScreen initialFilters={initialFilters} termCode={termCode} />
    </AppShell>
  );
}
