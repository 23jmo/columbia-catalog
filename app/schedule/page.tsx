/**
 * `/schedule` — the full-screen week canvas and everything the plan analysis
 * knows about it (spec §8).
 *
 * ── What this file owns, and what it does not ───────────────────────────────
 *
 * The canvas itself — drag sections in and out, drop watched sections in as
 * translucent candidates, edit custom blocks — belongs to the schedule lane at
 * `components/schedule/**`. This route owns the page: the plan header, the
 * analysis panels, the empty state, and the slot the canvas drops into. See
 * `components/home/week-grid-slot.tsx`; wiring the canvas in is one prop.
 *
 * Every figure below comes from `analyzePlan` in `@/lib/schedule`. Credits are
 * a range because Columbia credits are a range; conflicts are split into hard
 * and soft because "can't be in two places" and "that walk is tight" are
 * different problems; commute legs carry the walk *and* the gap so the reader
 * can judge the estimate instead of trusting it.
 *
 * ── Two modes on one route ──────────────────────────────────────────────────
 *
 * `PlanWorkspace` is the real, interactive planner: plan tabs, section list,
 * custom blocks, `.ics` export, all reading the student's own plans. It is a
 * client component because it edits a live store.
 *
 * `?demo=1` still renders the read-only sample analysis below it. That is not
 * a leftover — it is the only way to show the analysis rail (which conflicts,
 * which walks, and why) to someone who has not built a plan yet, and it is
 * labelled "Sample" so it is never mistaken for the student's own week.
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
import { PageHeader } from "@/components/shell/page-header";
import { WeekGrid } from "@/components/schedule";
import { PlanWorkspace } from "@/components/schedule/plan-workspace";
import { RiCalendarScheduleLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { WeekGridSlot } from "@/components/home/week-grid-slot";
import { loadPlanSnapshot, type PlanSnapshot } from "@/components/home/load-plan-snapshot";
import {
  CURRENT_TERM,
  REQUIREMENT_FILTERS,
  WEEKDAY_LABEL,
  WEEKDAY_SHORT,
  ZONE_LABEL,
  buildTerm,
} from "@/lib/constants";
import { listPendingProposalsForViewer } from "@/lib/db/proposal-reads";
import { ProposalReview } from "@/components/schedule/proposal-review";
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

  /*
   * `?demo=1` is a fallback, not the default. `loadPlanSnapshot` returns the
   * reader's own saved plan when they have one; the sample only fills in for a
   * signed-out visitor who explicitly asked to see the analysis rail working.
   */
  const useSamplePlan = params.demo === "1";
  const termCode = CURRENT_TERM;

  const [snapshot, proposals] = await Promise.all([
    loadPlanSnapshot({ termCode, useSamplePlan }),
    listPendingProposalsForViewer(),
  ]);
  const term = buildTerm(termCode);

  return (
    <AppShell activeNav="schedule">
      <div className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-7">
        <PageHeader
          eyebrow="Schedule"
          icon={RiCalendarScheduleLine}
          title={term.label}
          description="Conflicts and cross-campus walks are checked as you build."
          action={
            snapshot.plan && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-medium text-text-primary">{snapshot.plan.name}</span>
                {snapshot.plan.isPrimary && (
                  <Chip variant="caption" color="blue">
                    Primary
                  </Chip>
                )}
                {snapshot.isSample && (
                  <Chip variant="caption" color="yellow">
                    Sample
                  </Chip>
                )}
              </div>
            )
          }
        />

        {/* Spec §16: the review step. An agent's `add_section` lands here as a
            card, and the accept button is the only thing in the system that can
            turn it into a change. Renders nothing when there is nothing pending,
            which is the usual case. */}
        <ProposalReview proposals={proposals} />

        {/* The planner owns its own state and renders the student's real
            plans. It shows its own empty state, so there is no server-side
            "no plan" branch to duplicate here. */}
        <PlanWorkspace termCode={termCode} />

        {snapshot.plan && snapshot.analysis && snapshot.isSample && (
          <>
            <div className="h-px w-full bg-separator-border" />
            <p className="text-caption-1-regular text-text-tertiary">
              Below is a sample plan, shown so the analysis rail has something to
              explain. It is not yours and nothing here is saved.
            </p>
            <ScheduleWorkspace snapshot={snapshot} analysis={snapshot.analysis} />
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * Canvas on the left, analysis rail on the right. The rail is what makes this
 * screen different from Home's summary: Home says *how many* conflicts, this
 * says *which ones and why*.
 */
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
        {snapshot.isSample && (
          <p className="text-caption-1-regular flex items-start gap-2 rounded-2lg bg-background-inner-default p-3 text-text-secondary">
            <RiInformationLine
              className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
              aria-hidden
            />
            <span>
              Sample plan. Courses, sections, call numbers, instructors and seat counts
              are real Fall 2026 records; the plan membership is fabricated so the screen
              has something to analyse. Sign in and the planner above saves your own.
            </span>
          </p>
        )}

        {/* The schedule lane's canvas, through the slot. Drop `weekGrid` and the
            honest agenda placeholder takes over — see `week-grid-slot.tsx`. */}
        <WeekGridSlot weekGrid={WeekGrid} blocks={snapshot.blocks} />

        {snapshot.unscheduledCount > 0 && (
          <p className="text-caption-2-regular text-text-tertiary">
            {snapshot.unscheduledCount === 1 ? "One section" : `${snapshot.unscheduledCount} sections`}{" "}
            here {snapshot.unscheduledCount === 1 ? "has" : "have"} no published meeting
            time for this term — Columbia lists times only in Vergil now.
            {snapshot.historicalCount > 0
              ? " The grey blocks are an earlier term's pattern, shown as a guide."
              : " Nothing is drawn for them, because we have no earlier pattern to go on."}
          </p>
        )}
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

// ---------------------------------------------------------------------------
// Analysis panels
// ---------------------------------------------------------------------------

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
  // Never flattened to one number — a 1–3 point section is genuinely a range,
  // and calling it 1 would misstate the load (`sectionCredits`, lib/schedule).
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
      {isRange && (
        <p className="text-caption-1-regular text-text-tertiary">
          A range, because at least one section carries variable points. We do not pick a
          number on your behalf.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-caption-1-regular text-text-secondary">Days off:</span>
        {analysis.daysWithNoClasses.length === 0 ? (
          <span className="text-caption-1-regular text-text-tertiary">none</span>
        ) : (
          analysis.daysWithNoClasses.map((day) => (
            <Chip key={day} variant="caption" color="soft">
              {WEEKDAY_SHORT[day]}
            </Chip>
          ))
        )}
      </div>
    </Panel>
  );
}

function ConflictsPanel({ analysis }: { analysis: PlanAnalysisDetail }) {
  // Only time conflicts belong here; commute has its own panel with the walk
  // and gap alongside, which a bare message cannot convey.
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
          <RiCheckboxCircleLine
            className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
            aria-hidden
          />
          Nothing in this plan overlaps anything else, custom blocks included.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {[...hard, ...soft].map((conflict, index) => (
            <li
              key={`${conflict.kind}-${conflict.weekday}-${index}`}
              className={cx(
                "flex items-start gap-2 rounded-2lg p-2.5",
                conflict.severity === "hard"
                  ? "bg-status-rose-background"
                  : "bg-background-inner-default",
              )}
            >
              <RiErrorWarningLine
                className={cx(
                  "mt-px size-4 shrink-0",
                  conflict.severity === "hard"
                    ? "text-status-rose-text"
                    : "text-foreground-icon-tertiary",
                )}
                aria-hidden
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={cx(
                    "text-caption-1-medium",
                    conflict.severity === "hard" ? "text-status-rose-text" : "text-text-secondary",
                  )}
                >
                  {conflict.kind === "duplicate_course" ? "Duplicate course" : "Overlap"} ·{" "}
                  {WEEKDAY_LABEL[conflict.weekday]}
                </span>
                <span className="text-caption-1-regular text-text-secondary">
                  {conflict.message}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CommutePanel({ analysis }: { analysis: PlanAnalysisDetail }) {
  // Every leg is shown with both numbers. The walking time is an estimate and
  // presenting it as a bare verdict would be presenting a guess as a fact.
  const legs = [...analysis.commuteLegs].sort(
    (a, b) => a.gapMinutes - a.walkMinutes - (b.gapMinutes - b.walkMinutes),
  );
  const infeasible = legs.filter((leg) => !leg.feasible).length;
  const busiestDay = Object.entries(analysis.totalWalkMinutesByDay).sort(
    (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
  )[0];

  return (
    <Panel
      title="Commute"
      trailing={
        <Chip variant="caption" color={infeasible > 0 ? "rose" : legs.length > 0 ? "soft" : "lime"}>
          {infeasible > 0
            ? `${infeasible} won’t fit`
            : legs.length > 0
              ? `${legs.length} ${legs.length === 1 ? "walk" : "walks"}`
              : "None"}
        </Chip>
      }
    >
      {legs.length === 0 ? (
        <p className="text-caption-1-regular flex items-start gap-2 text-text-secondary">
          <RiWalkLine className="mt-px size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          No back-to-back meetings in different buildings.
        </p>
      ) : (
        <>
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
                  {/* The verdict is a word, not just a colour (spec §18). */}
                  <Chip variant="caption" color={leg.feasible ? "soft" : "rose"}>
                    {leg.feasible ? "Makeable" : "Won’t fit"}
                  </Chip>
                </span>
                <span className="text-caption-1-regular tabular-nums text-text-secondary">
                  ~{leg.walkMinutes} min walk · {leg.gapMinutes} min between
                </span>
                {leg.fromZone !== leg.toZone && (
                  <span className="text-caption-2-regular text-text-tertiary">
                    {ZONE_LABEL[leg.fromZone]} → {ZONE_LABEL[leg.toZone]}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {busiestDay && (
            <p className="text-caption-2-regular text-text-tertiary">
              Most walking on {WEEKDAY_LABEL[busiestDay[0] as keyof typeof WEEKDAY_LABEL]}:{" "}
              about {busiestDay[1]} minutes. Walking times are zone-level estimates until
              buildings are geocoded.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function RequirementsPanel({ analysis }: { analysis: PlanAnalysisDetail }) {
  const labelByKey = new Map(REQUIREMENT_FILTERS.map((filter) => [filter.key, filter.label]));
  const satisfied = analysis.satisfiedRequirements;

  return (
    <Panel title="Requirements covered">
      {satisfied.length === 0 ? (
        // Honest about *why* it is empty: an unflagged catalog is not the same
        // thing as a student who is failing requirements.
        <p className="text-caption-1-regular flex items-start gap-2 text-text-secondary">
          <RiInformationLine
            className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
            aria-hidden
          />
          None of these courses carry a curriculum flag we have ingested. That is a gap in
          our data, not a verdict on your degree audit — Columbia&rsquo;s own audit is the
          authority.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {satisfied.map((key) => (
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
          className="rounded text-text-secondary underline underline-offset-2 outline-none transition-colors duration-150 ease hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Filter search by requirement
        </Link>{" "}
        to fill a gap.
      </p>
    </Panel>
  );
}
