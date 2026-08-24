import {
  RiArrowRightUpLine,
  RiCalendarEventLine,
  RiErrorWarningLine,
  RiHistoryLine,
  RiUserLine,
} from "@remixicon/react";

import { ButtonLink } from "@/components/base/buttons/button";
import { meetingLines } from "@/components/course/format";
import { ProvenanceStamp, SeatPill } from "@/components/course/seat-state";
import { termLabel } from "@/lib/constants";
import type { FeedSectionView } from "@/lib/recommend/feed";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * One section, rendered as the thing a student decides about.
 *
 * ── The Open-in-Vergil link is the legitimacy proof ────────────────────────
 *
 * `vergilSectionUrl` has existed since the first week and shipped inside emails
 * and ICS files, but no course card has ever carried it. That absence is the
 * difference between an app that reads like a planner and one that reads like a
 * scraper: a student who can click straight through to the registrar's own page
 * for this exact call number can verify everything above it in one step, and a
 * student who cannot has to take our word.
 *
 * It is also the one Columbia URL we ever send anyone to, and it opens in a new
 * tab where their UNI login and their own click do the actual work. We never
 * register, drop, or waitlist anyone.
 *
 * ── Three time states, never two ───────────────────────────────────────────
 *
 * 44.8% of sections have no published meeting pattern. Printing a historical
 * pattern without saying so would be the single most damaging thing this
 * surface could do — a student would build a week around last year's schedule —
 * so an estimate always names the term it came from, and "time TBA" is stated
 * outright rather than rendered as an empty row.
 */

export function SectionLine({
  section,
  courseCode,
  variant = "primary",
  className,
}: {
  section: FeedSectionView;
  /** `"COMS 4111"`. Printed inside the Vergil link's accessible name. */
  courseCode: string;
  /** `primary` is the card's chosen section; `sibling` is a row in the list. */
  variant?: "primary" | "sibling";
  className?: string;
}) {
  const isPrimary = variant === "primary";
  const instructors = section.instructors.filter(
    (name) => name.trim().length > 0 && !/^(tba|tbd)$/i.test(name.trim()),
  );

  return (
    <div
      className={cx(
        "flex flex-col gap-2.5",
        isPrimary
          ? "rounded-2lg border border-border-table bg-background-secondary-default p-3"
          : "border-t border-border-table pt-2.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-caption-2-medium tracking-[0.06em] text-text-tertiary uppercase">
          Section {section.sectionCode} · {termLabel(section.termCode as TermCode)}
        </span>
        <span className="font-mono text-caption-1-regular tabular-nums text-text-tertiary">
          #{section.callNumber}
        </span>
        {section.conflictsWithPlan ? (
          <span className="inline-flex items-center gap-1 text-caption-1-medium text-status-rose-text">
            <RiErrorWarningLine className="size-3.5 shrink-0" aria-hidden />
            Clashes with your plan
          </span>
        ) : null}
      </div>

      {/* The section's own topic, when it genuinely has one (container courses). */}
      {section.title ? (
        <p className="text-body-medium text-text-primary">{section.title}</p>
      ) : null}

      <dl className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Instructor</dt>
          <RiUserLine
            className="mt-0.5 size-3.5 shrink-0 text-foreground-icon-tertiary"
            aria-hidden
          />
          <dd className="min-w-0 text-body-regular text-text-primary">
            {instructors.length > 0 ? (
              instructors.join(" · ")
            ) : (
              <span className="text-text-tertiary">Instructor not yet announced</span>
            )}
          </dd>
        </div>

        <div className="flex items-start gap-2">
          <dt className="sr-only">Meeting time</dt>
          {section.timeKind === "estimated" ? (
            <RiHistoryLine
              className="mt-0.5 size-3.5 shrink-0 text-foreground-icon-tertiary"
              aria-hidden
            />
          ) : (
            <RiCalendarEventLine
              className="mt-0.5 size-3.5 shrink-0 text-foreground-icon-tertiary"
              aria-hidden
            />
          )}
          <dd className="min-w-0 text-body-regular text-text-primary">
            <MeetingText section={section} />
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SeatPill section={section} />
        <ProvenanceStamp sourceAsOf={section.sourceAsOf} className="min-w-0" />
        <ButtonLink
          size="xs"
          variant={isPrimary ? "secondary" : "ghost"}
          href={section.vergilUrl}
          target="_blank"
          rel="noopener noreferrer"
          trailingIcon={RiArrowRightUpLine}
          aria-label={`Open ${courseCode} section ${section.sectionCode}, call number ${section.callNumber}, in Vergil`}
          className="ml-auto"
        >
          Open in Vergil
        </ButtonLink>
      </div>
    </div>
  );
}

function MeetingText({ section }: { section: FeedSectionView }) {
  if (section.timeKind === "tba") {
    return <span className="text-text-tertiary">Time TBA — the directory has not published one</span>;
  }

  const lines = meetingLines(section.meetings);

  return (
    <span className="flex flex-col gap-0.5">
      {lines.map((line) => (
        <span key={`${line.daysLabel}-${line.startMinute}`} className="tabular-nums">
          {line.daysLabel} {line.timeLabel}
          {line.placeLabel ? (
            <span className="text-text-secondary"> · {line.placeLabel}</span>
          ) : null}
        </span>
      ))}
      {section.timeKind === "estimated" ? (
        /*
         * Never optional. `lib/db/typical-meetings.ts` is a hint drawn from an
         * earlier term, and it is only ever consulted when the registrar has
         * published nothing — so the label is what keeps it a hint.
         */
        <span className="text-caption-1-regular text-status-yellow-text">
          Estimated from{" "}
          {section.estimatedFromTerm
            ? termLabel(section.estimatedFromTerm as TermCode)
            : "an earlier term"}
          . Not confirmed for this term.
        </span>
      ) : null}
    </span>
  );
}
