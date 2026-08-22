"use client";

import { useMemo, useState } from "react";
import { CourseGroup } from "./CourseGroup";
import { EmptyState } from "./EmptyState";
import { Filters } from "./Filters";
import { SubjectSwitcher } from "./SubjectSwitcher";
import { EMPTY_FILTERS, filterSections, groupByCourse } from "@/lib/filters";
import { formatFetchedAt } from "@/lib/format";
import type { CatalogResult, SubjectOption } from "@/lib/types";

export function Catalog({
  catalog,
  subjects,
}: {
  catalog: CatalogResult;
  subjects: SubjectOption[];
}) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const visible = useMemo(
    () => filterSections(catalog.sections, filters),
    [catalog.sections, filters],
  );
  const groups = useMemo(() => groupByCourse(visible), [visible]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow)]">
            <SubjectSwitcher subjects={subjects} current={catalog.subject} />
            <div className="mt-5">
              <Filters value={filters} onChange={setFilters} />
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            {catalog.subjectName ?? catalog.subject} · {catalog.term}
            {catalog.bulletinJoined ? " · times from bulletin" : " · times when bulletin is available"}
          </p>
        </aside>

        <div>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl text-navy-deep">
                {catalog.subjectName ?? catalog.subject}
              </h1>
              <p className="mt-1 text-sm text-ink-soft">
                {visible.length} of {catalog.sections.length} sections
                {catalog.fetchedAt ? ` · fetched ${formatFetchedAt(catalog.fetchedAt)}` : ""}
              </p>
            </div>
          </div>

          {!catalog.ok && (
            <EmptyState
              title="Catalog unavailable"
              body={
                catalog.error ??
                "The public Directory of Classes did not return this subject. The app still built; try again later."
              }
            />
          )}

          {catalog.ok && groups.length === 0 && (
            <EmptyState
              title="No matching sections"
              body="Clear search or filters to see the rest of this subject."
            />
          )}

          <div className="grid gap-10">
            {groups.map((group) => (
              <CourseGroup key={group.key} sections={group.sections} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
