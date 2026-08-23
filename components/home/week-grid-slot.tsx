/**
 * The week-grid seam.
 *
 * The real, editable week canvas (spec §8) belongs to the schedule lane at
 * `components/schedule/**`. This lane never reaches into it: Home and
 * `/schedule` code against the narrow interface below and take the canvas as a
 * prop, exactly the way `components/course/contracts.ts` codes against the
 * lanes the course drawer depends on.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ The wiring, in both callers today:                                        │
 * │                                                                           │
 * │   import { WeekGrid } from "@/components/schedule";                       │
 * │   <ScheduleColumn … weekGrid={WeekGrid} />                                │
 * │                                                                           │
 * │ Drop that one prop and `WeekGridPlaceholder` below takes over. That is    │
 * │ deliberate: the screens keep working — with real times, honestly labelled │
 * │ — if the canvas is ever unavailable or being rewritten.                   │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * `WeekGridBlock` / `WeekGridSlotProps` are deliberately structurally identical
 * to `WeekGridBlock` / `WeekGridProps` in `components/course/contracts.ts`, so
 * the schedule lane ships **one** component that satisfies the course drawer,
 * Home, and `/schedule` at once rather than three near-miss variants. That is
 * what let `WeekGrid` drop in unmodified.
 */

import type { ComponentType } from "react";
import { RiCalendarScheduleLine, RiErrorWarningLine, RiMapPin2Line } from "@remixicon/react";
import {
  ALL_WEEKDAYS,
  GRID_END_MINUTE,
  GRID_START_MINUTE,
  WEEKDAY_LABEL,
  minutesToLabel,
} from "@/lib/constants";
import type { Weekday } from "@/lib/types";
import { cx } from "@/utils/cx";

/** One rectangle on the week grid. */
export interface WeekGridBlock {
  blockId: string;
  label: string;
  /** Secondary line, e.g. "Mudd 833" or "Prof. Nieh". */
  sublabel?: string | null;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  /**
   * `plan` = already saved, `candidate` = previewed in but not committed,
   * `conflict` = overlaps something else in the plan.
   */
  tone: "plan" | "candidate" | "conflict";
}

export interface WeekGridSlotProps {
  blocks: WeekGridBlock[];
  /** Minutes from midnight. Defaults to GRID_START_MINUTE/GRID_END_MINUTE. */
  startMinute?: number;
  endMinute?: number;
  /** Narrow viewports degrade to an agenda list (spec §18). */
  compact?: boolean;
  className?: string;
}

/** What `components/schedule` must export for this lane to render it. */
export type WeekGridSlotComponent = ComponentType<WeekGridSlotProps>;

const TONE_SURFACE: Record<WeekGridBlock["tone"], string> = {
  plan: "bg-calendar-event-blue-background",
  candidate: "bg-calendar-event-purple-background",
  conflict: "bg-calendar-event-pink-background",
};

const TONE_TITLE: Record<WeekGridBlock["tone"], string> = {
  plan: "text-calendar-event-blue-title",
  candidate: "text-calendar-event-purple-title",
  conflict: "text-calendar-event-pink-title",
};

const TONE_DETAIL: Record<WeekGridBlock["tone"], string> = {
  plan: "text-calendar-event-blue-time",
  candidate: "text-calendar-event-purple-time",
  conflict: "text-calendar-event-pink-time",
};

/**
 * The fallback, for when no canvas is supplied.
 *
 * Deliberately **not** a week grid. A second grid here would guarantee two
 * divergent canvases, so this is an agenda list — the same degraded form spec
 * §18 already requires on narrow viewports — plus an unmissable note about what
 * is missing and why. Every time shown is real plan data, so the surface is
 * honest rather than decorative.
 */
export function WeekGridPlaceholder({
  blocks,
  startMinute = GRID_START_MINUTE,
  endMinute = GRID_END_MINUTE,
  className,
}: WeekGridSlotProps) {
  const withinWindow = blocks.filter(
    (block) => block.endMinute > startMinute && block.startMinute < endMinute,
  );

  const byDay = ALL_WEEKDAYS.map((weekday) => ({
    weekday,
    items: withinWindow
      .filter((block) => block.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute),
  })).filter((day) => day.items.length > 0);

  return (
    <div
      className={cx(
        "flex w-full min-w-0 flex-col gap-3 rounded-2lg border border-dashed border-border-button-default p-3",
        className,
      )}
    >
      {/* The seam, stated out loud rather than hidden behind a pretty stub. */}
      <div className="flex items-start gap-2">
        <RiCalendarScheduleLine
          className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
          aria-hidden
        />
        <p className="text-caption-1-regular text-text-secondary">
          The week canvas from{" "}
          <code className="rounded bg-background-tertiary-default px-1 py-0.5 font-mono text-caption-2-regular text-text-primary">
            @/components/schedule
          </code>{" "}
          is not loaded, so these are the same meetings listed by day.
        </p>
      </div>

      {byDay.length === 0 ? (
        <p className="text-body-regular text-text-tertiary">Nothing meets this week.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {byDay.map((day) => (
            <div key={day.weekday} className="flex min-w-0 flex-col gap-1.5">
              <h4 className="text-caption-1-medium text-text-secondary">
                {WEEKDAY_LABEL[day.weekday]}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {day.items.map((block) => (
                  <li
                    key={`${block.blockId}-${block.weekday}-${block.startMinute}`}
                    className={cx(
                      "flex items-start gap-3 rounded-2lg px-2.5 py-2",
                      TONE_SURFACE[block.tone],
                      block.tone === "conflict" && "ring-1 ring-inset ring-status-rose-text",
                    )}
                  >
                    <span
                      className={cx(
                        "text-caption-1-medium w-24 shrink-0 tabular-nums",
                        TONE_DETAIL[block.tone],
                      )}
                    >
                      {minutesToLabel(block.startMinute)}–{minutesToLabel(block.endMinute)}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cx("text-body-medium truncate", TONE_TITLE[block.tone])}>
                        {block.label}
                      </span>
                      {block.sublabel && (
                        <span
                          className={cx(
                            "text-caption-1-regular inline-flex items-center gap-1 truncate",
                            TONE_DETAIL[block.tone],
                          )}
                        >
                          <RiMapPin2Line className="size-3 shrink-0" aria-hidden />
                          {block.sublabel}
                        </span>
                      )}
                      {/* Never colour-only: the conflict says the word too (spec §18). */}
                      {block.tone === "conflict" && (
                        <span className="text-caption-1-medium inline-flex items-center gap-1 text-status-rose-text">
                          <RiErrorWarningLine className="size-3.5 shrink-0" aria-hidden />
                          Overlaps another block
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the supplied canvas, or the honest agenda fallback when there is
 * none. Both callers in this lane go through here so the behaviour can never
 * drift between Home and `/schedule`.
 */
export function WeekGridSlot({
  weekGrid: WeekGrid,
  ...props
}: WeekGridSlotProps & { weekGrid?: WeekGridSlotComponent }) {
  if (WeekGrid) return <WeekGrid {...props} />;
  return <WeekGridPlaceholder {...props} />;
}
