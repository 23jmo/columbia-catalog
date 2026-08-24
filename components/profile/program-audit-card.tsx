import { RiExternalLinkLine } from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import type { GroupResult, ProgramResult } from "@/lib/requirements/types";
import { cx } from "@/utils/cx";
import { AttestToggle } from "./attest-toggle";
import { CandidateChips } from "./candidate-chips";
import {
  STATUS_LABEL,
  VERIFICATION_CHIP_COLOR,
  percentLabel,
  progressLabel,
  statusFillClass,
  statusToneClass,
  verificationLabelFor,
  verificationNoteFor,
} from "./format";

/**
 * One program, every requirement in it, done and not done.
 *
 * ── Why finished requirements are not hidden ────────────────────────────────
 *
 * The obvious layout is a to-do list: show what is left, collapse what is done.
 * It is wrong for this screen. A degree audit is read to check *our* work as
 * much as to plan — "did it notice that Frontiers counts?" — and a requirement
 * that silently disappeared when it went green is one a student cannot audit
 * back. Done requirements stay, dimmed, with the courses that satisfied them
 * named.
 *
 * ── Why every row prints its verification tier ──────────────────────────────
 *
 * See `./format`. Three different claims — "the Bulletin names these courses
 * and you have them", "this course carried the flag when we last crawled it",
 * and "you ticked a box" — must not render as three identical green ticks. The
 * chip is the tier in words; the colour only reinforces it.
 */

export interface ProgramAuditCardProps {
  result: ProgramResult;
  className?: string;
}

export function ProgramAuditCard({ result, className }: ProgramAuditCardProps) {
  const { program } = result;

  return (
    <section
      className={cx(
        "flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
      aria-labelledby={`program-${program.id}-heading`}
    >
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-caption-1-semibold tracking-[0.04em] text-accent-600">
              {program.kind === "core" ? "Core curriculum" : program.kind}
            </p>
            <h2
              id={`program-${program.id}-heading`}
              className="text-title-3-medium text-pretty text-text-primary"
            >
              {program.name}
            </h2>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-title-2-medium tabular-nums text-text-primary">
              {percentLabel(result.fraction)}
            </span>
            <span className="text-caption-2-regular text-text-tertiary">
              {result.satisfiedCount} of {result.groups.length} requirements
            </span>
          </div>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-background-tertiary-default"
          role="img"
          aria-label={`${percentLabel(result.fraction)} of ${program.name} complete`}
        >
          <div
            className="h-full rounded-full bg-accent-500 transition-[width] duration-300 ease"
            style={{ width: `${Math.round(result.fraction * 100)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Chip variant="caption" color={program.origin === "authored" ? "soft" : "yellow"}>
            {program.origin === "authored"
              ? `Transcribed from the ${program.edition} Bulletin`
              : `Read automatically from the ${program.edition} Bulletin`}
          </Chip>
          <a
            href={program.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-caption-1-medium text-text-secondary outline-none transition-colors duration-150 ease hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            Check us against the Bulletin
            <RiExternalLinkLine className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {result.groups.map((group) => (
          <li key={group.group.id}>
            <RequirementRow programId={program.id} group={group} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequirementRow({ programId, group }: { programId: string; group: GroupResult }) {
  const done = group.status === "satisfied";
  const fraction = group.required > 0 ? Math.min(1, group.completed / group.required) : 1;
  const plannedMatches = group.matched.filter((match) => match.planned);

  return (
    <article
      className={cx(
        "flex flex-col gap-2 rounded-2lg bg-background-primary-default p-3",
        done && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-headline-semibold text-pretty text-text-primary">
            {group.group.label}
          </h3>
          {group.group.note ? (
            <p className="text-caption-1-regular text-pretty text-text-secondary">
              {group.group.note}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cx(
              "text-caption-1-medium tabular-nums",
              statusToneClass(group.status, group.verification),
            )}
          >
            {progressLabel(group.completed, group.required, group.unit)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-background-tertiary-default">
          <div
            className={cx(
              "h-full rounded-full transition-[width] duration-300 ease",
              statusFillClass(group.status, group.verification),
            )}
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
        <span className="shrink-0 text-caption-2-regular text-text-tertiary">
          {STATUS_LABEL[group.status]}
        </span>
        <Chip variant="caption" color={VERIFICATION_CHIP_COLOR[group.verification]}>
          {verificationLabelFor(group.group.rule)}
        </Chip>
      </div>

      {group.matched.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-caption-2-regular text-text-tertiary">
            {done ? "Satisfied by" : "Counting so far"}
          </p>
          <ul className="flex flex-wrap items-center gap-1.5">
            {group.matched.map((match) => (
              <li key={match.courseId}>
                <a
                  href={`/course/${match.courseId}`}
                  title={match.title ?? undefined}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-caption-1-medium tabular-nums outline-none transition-colors duration-150 ease",
                    "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                    match.planned
                      ? "border-status-cyan-text/40 bg-status-cyan-background text-status-cyan-text"
                      : "border-border-table bg-background-secondary-default text-text-secondary hover:text-accent-600",
                  )}
                >
                  {match.code}
                  {match.planned ? (
                    <span className="text-caption-2-regular">planned</span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
          {plannedMatches.length > 0 ? (
            <p className="text-caption-2-regular text-text-tertiary">
              {plannedMatches.length === 1 ? "One course" : `${plannedMatches.length} courses`} here
              {plannedMatches.length === 1 ? " is" : " are"} still only on a plan — this requirement
              is not finished until the term is.
            </p>
          ) : null}
        </div>
      ) : null}

      {!done && group.candidates.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-caption-2-regular text-text-tertiary">
            {group.group.rule.kind === "all_of"
              ? "Still needed"
              : "Any of these would count"}
          </p>
          <CandidateChips courseIds={group.candidates} />
        </div>
      ) : null}

      {group.verification === "attested" ? (
        <AttestToggle
          programId={programId}
          groupId={group.group.id}
          attestedAt={group.attestedAt ?? null}
        />
      ) : (
        <p className="text-caption-2-regular text-pretty text-text-tertiary">
          {verificationNoteFor(group.group.rule)}
        </p>
      )}
    </article>
  );
}
