/**
 * `/schedule` — the dated calendar (spec §8).
 *
 * The canvas is the Nuxt-style day/week/month calendar in `PlanWorkspace`.
 * This route owns the page chrome: proposals, the empty-state path through
 * the planner, and the optional `?demo=1` sample analysis.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiRoadMapLine,
  RiWalkLine,
} from "@remixicon/react";
import { AppShell } from "@/components/shell/app-shell";
import { WeekGrid } from "@/components/schedule";
import { PlanWorkspace } from "@/components/schedule/plan-workspace";
import { Chip } from "@/components/base/badges/chip";
import { WeekGridSlot } from "@/components/home/week-grid-slot";
import { loadPlanSnapshot, type PlanSnapshot } from "@/components/home/load-plan-snapshot";
import {
  CURRENT_TERM,
  REQUIREMENT_FILTERS,
  WEEKDAY_LABEL,
  WEEKDAY_SHORT,
  ZONE_LABEL,
} from "@/lib/constants";
import { listPendingProposalsForViewer } from "@/lib/db/proposal-reads";
import { getTerm } from "@/lib/db/term-reads";
import { ProposalReview } from "@/components/proposals/proposal-review";
import { isPlanKind } from "@/lib/mcp/proposals";
import { partitionConflicts, type PlanAnalysisDetail } from "@/lib/schedule";
import { cx } from "@/utils/cx";

export const metadata: Metadata = {
  title: "Schedule · Columbia Catalog",
  description:
    "Your week, with overlaps, cross-campus walks, credit totals and requirement coverage checked as you build it.",
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const useSamplePlan = params.demo === "1";
  const termCode = CURRENT_TERM;

  const [snapshot, allProposals, term] = await Promise.all([
    loadPlanSnapshot({ termCode, useSamplePlan }),
    listPendingProposalsForViewer(),
    // Only the row carries the term's real first and last day of instruction,
    // and only the server can read it — the workspace is a client component
    // that would otherwise bound its `.ics` export with a per-season estimate.
    getTerm(termCode),
  ]);

  /*
   * Only the plan kinds. A proposal to save a class is answered on `/saved`.
   *
   * One inbox rendered in two places would let the same card be accepted
   * twice, and would put a decision about a shortlist on a page about a
   * timetable.
   */
  const proposals = allProposals.filter((proposal) => isPlanKind(proposal.kind));

  return (
    <AppShell activeNav="schedule" contentClassName="flex min-h-0 flex-1 flex-col px-0 py-0 sm:px-0 sm:py-0 lg:px-0 lg:py-0">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        {proposals.length > 0 ? (
          <div className="shrink-0 border-b border-border-table px-3 py-2 sm:px-4">
            <ProposalReview proposals={proposals} />
          </div>
        ) : null}
        <PlanWorkspace termCode={termCode} term={term ?? undefined} className="min-h-0 flex-1" />

        {snapshot.plan && snapshot.analysis && snapshot.isSample ? (
          <>
            <div className="h-px w-full bg-separator-border" />
            <p className="text-caption-1-regular text-text-tertiary">
              Below is a sample plan, shown so the analysis rail has something to
              explain. It is not yours and nothing here is saved.
            </p>
            <ScheduleWorkspace snapshot={snapshot} analysis={snapshot.analysis} />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function ScheduleWorkspace({
  snapshot,
  analysis,
}: {
  snapshot: PlanSnapshot;
  analysis: PlanAnalysisDetail;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-5">
      <section className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-background-secondary-default p-4 sm:p-5">
        {snapshot.isSample ? (
          <p className="text-caption-1-regular flex items-start gap-2 rounded-2lg bg-background-inner-default p-3 text-text-secondary">
            <RiInformationLine className="mt-px size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
            <span>
              Sample plan. Courses, sections, call numbers, instructors and seat counts
              are real Fall 2026 records; the plan membership is fabricated so the screen
              has something to analyse.
            </span>
          </p>
        ) : null}
        <WeekGridSlot weekGrid={WeekGrid} blocks={snapshot.blocks} />
      </section>
      <aside className="flex min-w-0 flex-col gap-4">
        <CreditsPanel analysis={analysis} sectionCount={snapshot.sections.length} />
        <ConflictsPanel analysis={analysis} />
        <CommutePanel analysis={analysis} />
        <RequirementsPanel analysis={analysis} />
      </aside>
    </div>
  );
}

function Panel({
  title,
  children,
  trailing,
}: {
  title: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-background-secondary-default p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-body-medium text-text-primary">{title}</h2>
        {trailing}
      </header>
      {children}
    </section>
  );
}

function CreditsPanel({
  analysis,
  sectionCount,
}: {
  analysis: PlanAnalysisDetail;
  sectionCount: number;
}) {
  const isRange = analysis.creditsMin !== analysis.creditsMax;
  return (
    <Panel title="Credits">
      <div className="flex items-baseline gap-2">
        <span className="text-title-1-semibold -tracking-[0.01em] tabular-nums text-text-primary">
          {isRange ? `${analysis.creditsMin}–${analysis.creditsMax}` : analysis.creditsMin}
        </span>
        <span className="text-caption-1-regular text-text-secondary">
          points across {sectionCount} {sectionCount === 1 ? "section" : "sections"}
        </span>
      </div>
    </Panel>
  );
}

function ConflictsPanel({ analysis }: { analysis: PlanAnalysisDetail }) {
  const timeConflicts = analysis.conflicts.filter((conflict) => conflict.kind !== "commute");
  const { hard, soft } = partitionConflicts(timeConflicts);
  return (
    <Panel
      title="Conflicts"
      trailing={
        <Chip variant="caption" color={hard.length > 0 ? "rose" : "lime"}>
          {hard.length > 0 ? `${hard.length} hard` : "Clear"}
        </Chip>
      }
    >
      {timeConflicts.length === 0 ? (
        <p className="text-caption-1-regular flex items-start gap-2 text-text-secondary">
          <RiCheckboxCircleLine className="mt-px size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          Nothing in this plan overlaps anything else, custom blocks included.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {[...hard, ...soft].map((conflict, index) => (
            <li
              key={`${conflict.kind}-${conflict.weekday}-${index}`}
              className={cx(
                "flex items-start gap-2 rounded-2lg p-2.5",
                conflict.severity === "hard" ? "bg-status-rose-background" : "bg-background-inner-default",
              )}
            >
              <RiErrorWarningLine
                className={cx(
                  "mt-px size-4 shrink-0",
                  conflict.severity === "hard" ? "text-status-rose-text" : "text-foreground-icon-tertiary",
                )}
                aria-hidden
              />
              <span className="text-caption-1-regular text-text-secondary">{conflict.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CommutePanel({ analysis }: { analysis: PlanAnalysisDetail }) {
  const legs = [...analysis.commuteLegs].sort(
    (a, b) => a.gapMinutes - a.walkMinutes - (b.gapMinutes - b.walkMinutes),
  );
  const infeasible = legs.filter((leg) => !leg.feasible).length;
  return (
    <Panel
      title="Commute"
      trailing={
        <Chip variant="caption" color={infeasible > 0 ? "rose" : legs.length > 0 ? "soft" : "lime"}>
          {infeasible > 0 ? `${infeasible} won’t fit` : legs.length > 0 ? `${legs.length} walks` : "None"}
        </Chip>
      }
    >
      {legs.length === 0 ? (
        <p className="text-caption-1-regular flex items-start gap-2 text-text-secondary">
          <RiWalkLine className="mt-px size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          No back-to-back meetings in different buildings.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {legs.slice(0, 6).map((leg, index) => (
            <li
              key={`${leg.fromId}-${leg.toId}-${leg.weekday}-${index}`}
              className={cx(
                "flex min-w-0 flex-col gap-1 rounded-2lg p-2.5",
                leg.feasible ? "bg-background-inner-default" : "bg-status-rose-background",
              )}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <RiRoadMapLine
                  className={cx(
                    "size-4 shrink-0",
                    leg.feasible ? "text-foreground-icon-tertiary" : "text-status-rose-text",
                  )}
                  aria-hidden
                />
                <span className="text-caption-1-medium text-text-primary">
                  {WEEKDAY_SHORT[leg.weekday]} · {leg.fromLabel} → {leg.toLabel}
                </span>
                <Chip variant="caption" color={leg.feasible ? "soft" : "rose"}>
                  {leg.feasible ? "Makeable" : "Won’t fit"}
                </Chip>
              </span>
              <span className="text-caption-1-regular tabular-nums text-text-secondary">
                ~{leg.walkMinutes} min walk · {leg.gapMinutes} min between
              </span>
              {leg.fromZone !== leg.toZone ? (
                <span className="text-caption-2-regular text-text-tertiary">
                  {ZONE_LABEL[leg.fromZone]} → {ZONE_LABEL[leg.toZone]}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RequirementsPanel({ analysis }: { analysis: PlanAnalysisDetail }) {
  const labelByKey = new Map(REQUIREMENT_FILTERS.map((filter) => [filter.key, filter.label]));
  return (
    <Panel title="Requirements covered">
      {analysis.satisfiedRequirements.length === 0 ? (
        <p className="text-caption-1-regular flex items-start gap-2 text-text-secondary">
          <RiInformationLine className="mt-px size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          None of these courses carry a curriculum flag we have ingested.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {analysis.satisfiedRequirements.map((key) => (
            <Chip key={key} variant="caption" color="lime">
              {labelByKey.get(key) ?? key}
            </Chip>
          ))}
        </div>
      )}
      <p className="text-caption-2-regular text-text-tertiary">
        Flags come from the course record.{" "}
        <Link
          href="/search"
          className="rounded text-text-secondary underline underline-offset-2 outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Filter search by requirement
        </Link>
        .
      </p>
    </Panel>
  );
}
