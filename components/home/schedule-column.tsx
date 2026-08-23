/**
 * Home's left column: the student's week, and what the analysis says about it.
 *
 * This component owns everything *around* the week canvas — the plan header,
 * the summary stats, the warnings, and the empty state — but not the canvas
 * itself. That belongs to the schedule lane and arrives through the
 * `weekGrid` prop; see `week-grid-slot.tsx` for the one-line wiring.
 *
 * Every number on screen comes from `analyzePlan` in `@/lib/schedule`. Nothing
 * here recomputes credits, conflicts, or commutes: a second implementation
 * would mean Home and `/schedule` could disagree about the same plan, which is
 * worse than either being wrong alone.
 */

import Link from "next/link";

import {
  RiArrowRightUpLine,
  RiCalendarEventLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiStackLine,
  RiWalkLine,
} from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { Stat, StatStrip, type StatProps } from "@/components/shell/stat";
import { WEEKDAY_SHORT, buildTerm } from "@/lib/constants";
import { partitionConflicts, type PlanAnalysisDetail } from "@/lib/schedule";
import type { Plan, TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";
import { NoPlanState } from "@/components/home/no-plan-state";
import {
  WeekGridSlot,
  type WeekGridBlock,
  type WeekGridSlotComponent,
} from "@/components/home/week-grid-slot";

export interface ScheduleColumnProps {
  /** The term this column is pointed at — needed even when there is no plan. */
  termCode: TermCode;
  /** `null` renders the search-forward empty state (spec §5). */
  plan: Plan | null;
  analysis: PlanAnalysisDetail | null;
  blocks: WeekGridBlock[];
  /** Number of sections in the plan — a plan can exist with none. */
  sectionCount: number;
  /**
   * ONE-LINE WIRING: `weekGrid={WeekGrid}` from `@/components/schedule`.
   * Omitted, an honest agenda placeholder renders instead.
   */
  weekGrid?: WeekGridSlotComponent;
  /** Marks the plan as the built-in sample rather than a saved one. */
  isSample?: boolean;
  /** Sections in the plan with no published meeting time for this term. */
  unscheduledCount?: number;
  /** Of those, how many are drawn from a previous term's pattern. */
  historicalCount?: number;
  /** Whether the reader has an account. Hides the sign-in prompt when true. */
  isSignedIn?: boolean;
  /** Href that switches Home to the sample plan, shown in the empty state. */
  sampleHref?: string;
  className?: string;
}

export function ScheduleColumn({
  termCode,
  plan,
  analysis,
  blocks,
  sectionCount,
  weekGrid,
  isSample = false,
  unscheduledCount = 0,
  historicalCount = 0,
  isSignedIn = false,
  sampleHref,
  className,
}: ScheduleColumnProps) {
  const termLabel = buildTerm(plan?.termCode ?? termCode).label;

  if (!plan || !analysis) {
    return (
      <NoPlanState
        termLabel={termLabel}
        isSignedIn={isSignedIn}
        sampleHref={sampleHref}
        className={className}
      />
    );
  }

  const { hard, soft } = partitionConflicts(analysis.conflicts);

  return (
    <section
      aria-labelledby="schedule-column-heading"
      className={cx(
        "flex w-full min-w-0 flex-col gap-4 rounded-[20px] bg-background-secondary-default p-4 sm:p-5",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-caption-1-regular text-text-secondary">Your week</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="schedule-column-heading" className="text-title-2-semibold -tracking-[0.01em] text-text-primary">
              {plan.name}
            </h2>
            <Chip variant="caption" color="soft">
              {termLabel}
            </Chip>
            {plan.isPrimary && (
              <Chip variant="caption" color="blue">
                Primary
              </Chip>
            )}
            {isSample && (
              <Chip variant="caption" color="yellow">
                Sample
              </Chip>
            )}
          </div>
        </div>

        <Link
          href="/schedule"
          className="text-body-medium inline-flex shrink-0 items-center gap-1 rounded-lg px-1 py-0.5 text-text-secondary outline-none transition-colors duration-150 ease hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Open schedule
          <RiArrowRightUpLine className="size-4" aria-hidden />
        </Link>
      </header>

      {/* Provenance for the plan itself. A fabricated plan presented as the
          student's own would be exactly the guess-as-fact the rules forbid. */}
      {isSample && (
        <p className="text-caption-1-regular flex items-start gap-2 rounded-2lg bg-background-inner-default p-3 text-text-secondary">
          <RiInformationLine
            className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
            aria-hidden
          />
          <span>
            This is a sample plan, not yours. The courses, sections, call numbers,
            instructors and seat counts are real Fall 2026 records; which sections sit
            in the plan is made up so the screen has something to show before accounts
            exist.
          </span>
        </p>
      )}

      <PlanStats analysis={analysis} sectionCount={sectionCount} />

      <WeekGridSlot weekGrid={weekGrid} blocks={blocks} />

      {unscheduledCount > 0 && (
        <p className="text-caption-2-regular text-text-tertiary">
          {unscheduledCount === 1 ? "One section" : `${unscheduledCount} sections`} here
          {unscheduledCount === 1 ? " has" : " have"} no published meeting time for this
          term — Columbia lists times only in Vergil now.
          {historicalCount > 0
            ? ` The grey blocks show when ${historicalCount === 1 ? "one of them" : "some of them"} met in an earlier term, which is a guide, not a schedule.`
            : " Nothing is drawn for them, because we have no earlier pattern to go on."}{" "}
          Seats and instructors above are real.
        </p>
      )}

      {(hard.length > 0 || soft.length > 0) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-headline-semibold text-text-primary">
            {hard.length > 0 ? "Needs a decision" : "Worth knowing"}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {[...hard, ...soft].slice(0, 4).map((conflict, index) => (
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
                  {/* Severity is never colour-only (spec §18). */}
                  <span
                    className={cx(
                      "text-caption-1-medium",
                      conflict.severity === "hard"
                        ? "text-status-rose-text"
                        : "text-text-secondary",
                    )}
                  >
                    {conflict.severity === "hard" ? "Conflict" : "Note"}
                  </span>
                  <span className="text-caption-1-regular text-text-secondary">
                    {conflict.message}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {hard.length + soft.length > 4 && (
            <Link
              href="/schedule"
              className="text-caption-1-medium rounded text-text-secondary underline underline-offset-2 outline-none transition-colors duration-150 ease hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              {hard.length + soft.length - 4} more on the schedule
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Summary stats — spec §5, "Cards"
// ---------------------------------------------------------------------------

/**
 * Credits, conflicts, commute, free days. All four read straight off
 * `PlanAnalysisDetail`.
 */
function PlanStats({
  analysis,
  sectionCount,
}: {
  analysis: PlanAnalysisDetail;
  sectionCount: number;
}) {
  const { hard, soft } = partitionConflicts(analysis.conflicts);

  // A range, never a single number: COMS 6900 is 1–3 points and flattening that
  // would misstate the student's load (`sectionCredits`, lib/schedule).
  const credits =
    analysis.creditsMin === analysis.creditsMax
      ? `${analysis.creditsMin}`
      : `${analysis.creditsMin}–${analysis.creditsMax}`;

  const infeasibleLegs = analysis.commuteLegs.filter((leg) => !leg.feasible).length;
  const longestWalk = Object.values(analysis.totalWalkMinutesByDay).reduce<number>(
    (most, minutes) => Math.max(most, minutes ?? 0),
    0,
  );

  const stats: StatProps[] = [
    {
      icon: RiStackLine,
      label: "Credits",
      value: credits,
      detail: `${sectionCount} ${sectionCount === 1 ? "section" : "sections"}`,
    },
    {
      icon: hard.length > 0 ? RiErrorWarningLine : RiCheckboxCircleLine,
      label: "Conflicts",
      value: `${hard.length}`,
      detail:
        soft.length > 0
          ? `${soft.length} soft ${soft.length === 1 ? "note" : "notes"}`
          : "no soft notes",
      tone: hard.length > 0 ? "alert" : "default",
    },
    {
      icon: RiWalkLine,
      label: "Commute",
      value: infeasibleLegs > 0 ? `${infeasibleLegs}` : `${longestWalk}m`,
      detail:
        infeasibleLegs > 0
          ? `${infeasibleLegs === 1 ? "walk that" : "walks that"} do not fit`
          : "busiest day of walking",
      tone: infeasibleLegs > 0 ? "alert" : "default",
    },
    {
      icon: RiCalendarEventLine,
      label: "Free days",
      value: `${analysis.daysWithNoClasses.length}`,
      detail:
        analysis.daysWithNoClasses.length > 0
          ? analysis.daysWithNoClasses.map((day) => WEEKDAY_SHORT[day]).join(" · ")
          : "class every weekday",
    },
  ];

  return (
    <StatStrip>
      {stats.map((stat) => (
        <Stat key={stat.label} {...stat} />
      ))}
    </StatStrip>
  );
}
