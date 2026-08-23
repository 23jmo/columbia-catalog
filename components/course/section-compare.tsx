"use client";

import { RiCloseLine, RiScales3Line } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import type { ReputationSummary, Section } from "@/lib/types";
import { cx } from "@/utils/cx";
import {
  instructorLabel,
  meetingLines,
  placeSummary,
  provenanceLabel,
  readSeats,
} from "./format";
import { CallNumberCopy } from "./registration-handoff";
import { formatDimension } from "./reputation";
import { SeatMeter } from "./seat-state";

/**
 * Compare, scoped to sections of the SAME course (spec §7). Five sections of
 * Calc I side by side on professor, time, seats, and rating dimensions. It
 * lives inside the drawer and needs no new screen.
 *
 * Column-per-section, row-per-attribute, because the question being asked is
 * "which of these differs?" and differences read down a row far better than
 * across a card grid. The whole table scrolls horizontally rather than
 * squeezing columns, so a 390px phone gets full-size text and a swipe.
 */

export interface SectionCompareProps {
  sections: Section[];
  /** Section ids currently in the comparison, in the order chosen. */
  selectedIds: string[];
  onRemove: (sectionId: string) => void;
  onClear: () => void;
  /** Instructor-level reputation, keyed by instructor name. */
  instructorReputation?: Record<string, ReputationSummary | null>;
  className?: string;
}

interface Row {
  label: string;
  render: (section: Section) => React.ReactNode;
  /** Rows where every section agrees are dimmed — the differences are the point. */
  sameValue?: (section: Section) => string;
}

export function SectionCompare({
  sections,
  selectedIds,
  onRemove,
  onClear,
  instructorReputation,
  className,
}: SectionCompareProps) {
  const chosen = selectedIds
    .map((id) => sections.find((s) => s.sectionId === id))
    .filter((s): s is Section => Boolean(s));

  if (chosen.length === 0) {
    return (
      <div className={cx("flex flex-col items-start gap-2", className)}>
        <p className="text-body-regular text-text-secondary">
          Pick two or more sections above to line them up on instructor, meeting time,
          seats, and review dimensions.
        </p>
      </div>
    );
  }

  const rows: Row[] = [
    {
      label: "Instructor",
      sameValue: (s) => s.instructors.join("|"),
      render: (s) => <span className="text-body-medium">{instructorLabel(s.instructors)}</span>,
    },
    {
      label: "Meets",
      sameValue: (s) => meetingLines(s.meetings).map((l) => `${l.daysLabel}${l.timeLabel}`).join("|"),
      render: (s) => {
        const lines = meetingLines(s.meetings);
        if (lines.length === 0) return <span className="text-text-tertiary">Not published</span>;
        return (
          <div className="flex flex-col gap-0.5">
            {lines.map((line) => (
              <span key={`${line.daysLabel}-${line.timeLabel}`}>
                <span className="text-body-medium">{line.daysLabel}</span>{" "}
                <span className="tabular-nums">{line.timeLabel}</span>
              </span>
            ))}
          </div>
        );
      },
    },
    {
      label: "Location",
      sameValue: (s) => placeSummary(s.meetings) ?? "",
      render: (s) => placeSummary(s.meetings) ?? <span className="text-text-tertiary">Not published</span>,
    },
    {
      label: "Seats",
      render: (s) => {
        const reading = readSeats(s);
        const stamp = provenanceLabel(s.sourceAsOf);
        return (
          <div className="flex flex-col gap-1">
            <span className="text-body-medium tabular-nums">{reading.headline}</span>
            <SeatMeter reading={reading} className="max-w-40" />
            {/* Provenance travels with every seat number. Spec §3. */}
            <span className="text-caption-2-regular text-text-tertiary">
              {stamp ? `as of ${stamp}` : "no “as of” published"}
            </span>
          </div>
        );
      },
    },
    {
      label: "Waitlist",
      render: (s) =>
        s.waitlistCount != null ? (
          <span className="tabular-nums">
            {s.waitlistCount}
            {s.waitlistCap != null ? ` / ${s.waitlistCap}` : ""}
          </span>
        ) : s.status === "waitlist" ? (
          "Open, count not published"
        ) : (
          <span className="text-text-tertiary">None reported</span>
        ),
    },
    {
      label: "Credits",
      sameValue: (s) => `${s.minUnit}-${s.maxUnit}`,
      render: (s) =>
        s.minUnit == null && s.maxUnit == null ? (
          <span className="text-text-tertiary">—</span>
        ) : s.minUnit === s.maxUnit ? (
          <span className="tabular-nums">{s.minUnit}</span>
        ) : (
          <span className="tabular-nums">
            {s.minUnit}–{s.maxUnit}
          </span>
        ),
    },
    {
      label: "Format",
      sameValue: (s) => `${s.component ?? ""}${s.methodOfInstruction ?? ""}`,
      render: (s) =>
        [s.component, s.methodOfInstruction].filter(Boolean).join(" · ") || (
          <span className="text-text-tertiary">Not published</span>
        ),
    },
    {
      label: "Teaching quality",
      render: (s) => {
        const summary = instructorReputation?.[s.instructors[0] ?? ""] ?? null;
        if (!summary) return <span className="text-text-tertiary">No reviews matched</span>;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-body-medium tabular-nums">
              {formatDimension("teachingQuality", summary.dimensions) ?? "No signal"}
            </span>
            <span className="text-caption-2-regular text-text-tertiary">
              n={summary.sampleSize}
            </span>
          </div>
        );
      },
    },
    {
      label: "Workload",
      render: (s) => {
        const summary = instructorReputation?.[s.instructors[0] ?? ""] ?? null;
        const value = summary ? formatDimension("workload", summary.dimensions) : null;
        return value ? (
          <span className="tabular-nums">{value}</span>
        ) : (
          <span className="text-text-tertiary">No reviews matched</span>
        );
      },
    },
    {
      label: "Register",
      render: (s) => <CallNumberCopy callNumber={s.callNumber} />,
    },
  ];

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-caption-1-regular text-text-secondary">
          <RiScales3Line className="size-4 shrink-0" aria-hidden />
          Comparing {chosen.length} section{chosen.length > 1 ? "s" : ""} of the same course.
          Rows where every section agrees are dimmed.
        </p>
        <Button size="xs" variant="secondary" onClick={onClear}>
          Clear
        </Button>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-max border-separate border-spacing-0 text-body-regular">
          <caption className="sr-only">
            Sections of this course compared on instructor, meeting time, seats and reviews
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-background-primary-default px-3 py-2 text-left align-bottom text-caption-2-medium uppercase tracking-wide text-text-tertiary"
              >
                <span className="sr-only">Attribute</span>
              </th>
              {chosen.map((section) => (
                <th
                  key={section.sectionId}
                  scope="col"
                  className="min-w-48 border-b border-border-table px-3 py-2 text-left align-bottom"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-body-semibold text-text-primary">
                        Section {section.sectionCode}
                      </p>
                      <Chip variant="caption" color="soft" className="mt-1">
                        Call {section.callNumber}
                      </Chip>
                    </div>
                    <Button
                      size="xs"
                      variant="secondary"
                      iconOnly
                      leadingIcon={RiCloseLine}
                      aria-label={`Remove section ${section.sectionCode} from the comparison`}
                      onClick={() => onRemove(section.sectionId)}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = row.sameValue ? chosen.map(row.sameValue) : null;
              const identical = values != null && chosen.length > 1 && new Set(values).size === 1;
              return (
                <tr key={row.label} className={cx(identical && "opacity-55")}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap border-b border-border-table bg-background-primary-default px-3 py-3 text-left align-top text-caption-2-medium uppercase tracking-wide text-text-tertiary"
                  >
                    {row.label}
                  </th>
                  {chosen.map((section) => (
                    <td
                      key={section.sectionId}
                      className="border-b border-border-table px-3 py-3 align-top text-text-primary"
                    >
                      {row.render(section)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
