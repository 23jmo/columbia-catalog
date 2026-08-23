import type { ComponentType } from "react";
import {
  RiAlertLine,
  RiAwardLine,
  RiBookOpenLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiSunLine,
  RiWalkLine,
} from "@remixicon/react";
import { cx } from "@/utils/cx";
import { REQUIREMENT_FILTERS, WEEKDAY_LABEL, WEEKDAY_SHORT } from "@/lib/constants";
import type { PlanAnalysis, ScheduleConflict, Weekday } from "@/lib/types";
import { partitionConflicts } from "@/lib/schedule/analysis";

/**
 * The plan summary rail — spec §8: "Credit total, commute summary, and
 * requirement coverage update live."
 *
 * This component computes nothing. Every number comes from `analyzePlan` in
 * `lib/schedule`, which is the single implementation of credit ranges, conflict
 * detection and commute feasibility; duplicating any of it here would be a
 * second source of truth that drifts.
 *
 * Two product rules shape the presentation:
 *   - Credits are a RANGE. A 1–3 point section rendered as "1" is a lie about
 *     the student's load, so the range shows whenever min and max differ.
 *   - Hard and soft conflicts never merge into one count. A hard conflict means
 *     the student cannot be in both places; a soft one is a note they may
 *     legitimately ignore.
 */

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const REQUIREMENT_LABELS = new Map(
  REQUIREMENT_FILTERS.map((filter) => [filter.key, filter.label]),
);

export interface PlanSummaryProps {
  /** The output of `analyzePlan` — `PlanAnalysisDetail` is accepted as-is. */
  analysis: PlanAnalysis;
  /** Plan name, e.g. "If I don't get Op Systems". */
  planName?: string;
  /** Term label, e.g. "Fall 2026". */
  termLabel?: string;
  /** How many sections the plan holds, for the courses stat. */
  sectionCount?: number;
  className?: string;
}

export function PlanSummary({
  analysis,
  planName,
  termLabel,
  sectionCount,
  className,
}: PlanSummaryProps) {
  const { hard, soft } = partitionConflicts(analysis.conflicts);
  const totalWalkMinutes = Object.values(analysis.totalWalkMinutesByDay).reduce<number>(
    (total, minutes) => total + (minutes ?? 0),
    0,
  );

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {planName || termLabel ? (
        <header className="min-w-0">
          {planName ? (
            <h3 className="truncate text-title-3-semibold text-text-primary">{planName}</h3>
          ) : null}
          {termLabel ? (
            <p className="mt-0.5 text-caption-1-regular text-text-secondary">{termLabel}</p>
          ) : null}
        </header>
      ) : null}

      <dl className="grid grid-cols-2 gap-2">
        <Stat
          icon={RiAwardLine}
          label="Credits"
          value={creditText(analysis.creditsMin, analysis.creditsMax)}
        />
        <Stat
          icon={RiBookOpenLine}
          label="Sections"
          value={sectionCount == null ? "—" : String(sectionCount)}
        />
        <Stat
          icon={RiSunLine}
          label="Days off"
          value={
            analysis.daysWithNoClasses.length === 0
              ? "None"
              : analysis.daysWithNoClasses.map((day) => WEEKDAY_SHORT[day]).join(" · ")
          }
          detail={freeDaysDetail(analysis.daysWithNoClasses)}
        />
        <Stat
          icon={RiWalkLine}
          label="Walking"
          value={totalWalkMinutes === 0 ? "None" : `${totalWalkMinutes} min`}
          detail={walkDetail(analysis.totalWalkMinutesByDay)}
        />
      </dl>

      <ConflictSection
        title="Blocking conflicts"
        emptyLabel="No blocking conflicts"
        tone="hard"
        conflicts={hard}
      />
      <ConflictSection
        title="Worth a look"
        emptyLabel={null}
        tone="soft"
        conflicts={soft}
      />

      <RequirementCoverage keys={analysis.satisfiedRequirements} />
    </div>
  );
}

/** "16" when the plan is fixed, "14–17" when a section carries a point range. */
function creditText(min: number, max: number): string {
  const format = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  return min === max ? format(min) : `${format(min)}–${format(max)}`;
}

function freeDaysDetail(days: readonly Weekday[]): string | null {
  if (days.length === 0) return "Class every weekday";
  return `${days.map((day) => WEEKDAY_LABEL[day]).join(", ")} free of classes`;
}

function walkDetail(byDay: Partial<Record<Weekday, number>>): string | null {
  const entries = Object.entries(byDay).filter(([, minutes]) => (minutes ?? 0) > 0);
  if (entries.length === 0) return null;
  return entries
    .map(([day, minutes]) => `${WEEKDAY_SHORT[day as Weekday]} ${minutes} min`)
    .join(" · ");
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: IconComponent;
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="rounded-2lg border border-border-table bg-background-secondary-default p-2.5">
      <dt className="flex items-center gap-1.5 text-caption-2-medium uppercase tracking-wide text-text-tertiary">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 text-title-3-semibold tabular-nums text-text-primary">{value}</dd>
      {detail ? <p className="mt-0.5 text-caption-2-regular text-text-tertiary">{detail}</p> : null}
    </div>
  );
}

/**
 * Conflicts render inline, never as a modal (spec §8). Severity is carried by
 * the icon and the heading word as well as the colour, so the distinction
 * survives a monochrome screen (spec §18).
 */
function ConflictSection({
  title,
  emptyLabel,
  tone,
  conflicts,
}: {
  title: string;
  emptyLabel: string | null;
  tone: "hard" | "soft";
  conflicts: readonly ScheduleConflict[];
}) {
  if (conflicts.length === 0) {
    if (!emptyLabel) return null;
    return (
      <p className="flex items-center gap-1.5 text-caption-1-regular text-state-success-text">
        <RiCheckboxCircleLine className="size-4 shrink-0" aria-hidden />
        {emptyLabel}
      </p>
    );
  }

  const Icon = tone === "hard" ? RiErrorWarningLine : RiAlertLine;
  const surface =
    tone === "hard"
      ? "border-border-error-default bg-background-tertiary-error"
      : "border-border-table bg-background-secondary-default";
  const heading = tone === "hard" ? "text-text-error-primary" : "text-text-secondary";

  return (
    <section aria-label={title} className={cx("rounded-2lg border p-3", surface)}>
      <h4 className={cx("flex items-center gap-1.5 text-caption-1-medium", heading)}>
        <Icon className="size-4 shrink-0" aria-hidden />
        {title}
        <span className="tabular-nums">({conflicts.length})</span>
      </h4>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {conflicts.map((conflict, index) => (
          <li
            // Conflicts have no id of their own; message + day + index is stable
            // for a given analysis, which is all a key has to be.
            key={`${conflict.kind}-${conflict.weekday}-${index}`}
            className="text-caption-1-regular text-text-secondary"
          >
            <span className="sr-only">
              {conflict.severity === "hard" ? "Blocking: " : "Note: "}
            </span>
            {conflict.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequirementCoverage({ keys }: { keys: readonly string[] }) {
  if (keys.length === 0) {
    return (
      <p className="flex items-start gap-1.5 text-caption-1-regular text-text-tertiary">
        <RiInformationLine className="mt-px size-3.5 shrink-0" aria-hidden />
        No Core or Ways-of-Knowing requirement is flagged on these courses.
      </p>
    );
  }

  return (
    <section aria-label="Requirements covered">
      <h4 className="mb-1.5 text-caption-2-medium uppercase tracking-wide text-text-tertiary">
        Requirements covered
      </h4>
      <ul className="flex flex-wrap gap-1.5">
        {keys.map((key) => (
          <li
            key={key}
            className="rounded-md bg-status-lime-background px-1.5 py-0.5 text-caption-2-medium text-status-lime-text"
          >
            {REQUIREMENT_LABELS.get(key) ?? key}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PlanSummary;
