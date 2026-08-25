/**
 * `/progression` — prerequisites, what a course unlocks, and the four-year plan.
 *
 * ── What this route owns ────────────────────────────────────────────────────
 *
 * The page frame and the numbers in the header. Everything interactive is the
 * progression lane at `components/progression/**`, and everything factual comes
 * from `lib/prereqs/**` via `lib/progression/catalog.ts`.
 *
 * ── Why the coverage figures are in the header ──────────────────────────────
 *
 * Because they are not flattering. Prerequisites at Columbia are prose, and a
 * meaningful share of them ("Fluency in at least one programming language",
 * "Approval by a faculty member") cannot be checked by any tool. A screen that
 * showed a clean graph and said nothing about the 24 courses whose gates it
 * cannot evaluate would be lying by omission to a student planning four years.
 * So the split is stated up front, in the same place as the totals — the same
 * rule as "every seat number renders with its provenance" (AGENTS.md).
 *
 * TODO(db): `getProgressionGraph` reads a JSON built from captured bulletin
 * HTML by `npx tsx scripts/build-prereqs.ts`. When the crawler lane persists
 * `prerequisite_formula` (spec §Schema), that function's body changes and
 * nothing here does.
 *
 * TODO(auth): the plan is held in localStorage — see `use-progression-state`.
 * Spec §15 puts writes behind an account; a signed-out student should still be
 * able to plan, so this is the right signed-out behaviour rather than a stub.
 */

import type { Metadata } from "next";
import { RiNodeTree } from "@remixicon/react";

import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Chip } from "@/components/base/badges/chip";
import { Stat } from "@/components/shell/stat";
import { ProgressionScreen } from "@/components/progression";
import { getPrereqCatalog, getProgressionGraph } from "@/lib/progression/catalog";
import { CURRENT_TERM, parseTermCode } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Progression · LionPlan",
  description:
    "What each course unlocks, read out of the bulletin's own prerequisite text, and a four-year plan checked against it.",
};

/**
 * The course the map opens on.
 *
 * Chosen, not hardcoded: the most connected course in the catalog is the one
 * whose neighbourhood teaches the most about how the map works. For the CS
 * bulletin that is COMS W3134, and it stays right if the data changes.
 */
function defaultFocusCourseId(): string {
  const graph = getProgressionGraph();
  let best = [...graph.courses.keys()][0] ?? "";
  let bestScore = -1;

  for (const courseId of graph.courses.keys()) {
    const score =
      (graph.unlocks.get(courseId)?.length ?? 0) + (graph.requires.get(courseId)?.length ?? 0);
    if (score > bestScore) {
      best = courseId;
      bestScore = score;
    }
  }
  return best;
}

export default function ProgressionPage() {
  const graph = getProgressionGraph();
  const catalog = getPrereqCatalog();

  const withTree = catalog.courses.filter((course) => course.prereq?.tree).length;
  const proseOnly = catalog.courses.filter(
    (course) => course.prereq && !course.prereq.tree,
  ).length;

  const { year } = parseTermCode(CURRENT_TERM);

  return (
    <AppShell activeNav="progression">
      <PageContent className="max-w-[1600px] gap-7">
        <PageHeader
          eyebrow="Progression"
          icon={RiNodeTree}
          title="Prerequisites & four-year plan"
          badge={
            <Chip variant="caption" color="soft">
              {catalog.source.split("/").pop()}
            </Chip>
          }
          description="Every prerequisite below was read out of the bulletin's own words. Follow what a course unlocks, then lay four years out and have the order checked."
        >
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Courses mapped" value={String(graph.courses.size)} />
            <Stat label="Prerequisite links" value={String(graph.edges.length)} />
            <Stat
              label="Machine-checkable"
              value={String(withTree)}
              detail={`${proseOnly} more state a requirement only in prose`}
            />
            <Stat
              label="Named elsewhere"
              value={String(graph.external.size)}
              detail="Courses on department pages not yet ingested"
            />
          </dl>
        </PageHeader>

        <ProgressionScreen startYear={year} initialCourseId={defaultFocusCourseId()} />
      </PageContent>
    </AppShell>
  );
}
