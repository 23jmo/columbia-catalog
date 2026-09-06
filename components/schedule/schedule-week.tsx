"use client";

import { useMemo, type CSSProperties } from "react";
import { RiAlertLine, RiEyeLine } from "@remixicon/react";

import type { WeekGridBlock } from "@/components/course/contracts";
import { WEEKDAY_LABEL, WEEKDAY_SHORT, minutesToLabel } from "@/lib/constants";
import type { Weekday } from "@/lib/types";
import { cx } from "@/utils/cx";

import { AgendaList } from "./agenda-list";
import {
  fitGridBounds,
  fractionOf,
  gridWeekdays,
  hourMarks,
  layoutWeek,
  ownerIdOf,
  type GridBounds,
  type PositionedBlock,
} from "./to-blocks";

/**
 * The week — the one calendar in the product.
 *
 * ── One recurring week, not dated weeks ──────────────────────────────────
 *
 * A class schedule repeats. Monday is every Monday until December, so the
 * canvas draws the pattern once and never asks which week you mean. That is
 * what let the month view, the mini-month, the "today" button and the date
 * arithmetic all go: there is nothing to navigate between.
 *
 * ── Mobile is the layout, desktop gets more room ─────────────────────────
 *
 * The grid is always five equal columns across the full width — never a
 * sideways scroll. At 375px each column is about 62px, which fits a course
 * code and a start time; the rest of a block's facts live in the sheet a tap
 * opens. Columns widen on a laptop and the labels simply get more room.
 * A Saturday lab grows a sixth column rather than vanishing (`gridWeekdays`).
 *
 * ── Colour is per course, and never the only signal ──────────────────────
 *
 * Every rectangle of the same course wears the same hue, so a Mo/We/Fr class
 * reads as one thing. A conflict keeps its hue and gains a rose ring, a hatch
 * and an icon; a preview is dashed with an eye. Each state also has a word in
 * the accessible name (spec §18).
 */

export interface ScheduleWeekProps {
  blocks: WeekGridBlock[];
  /** Columns to draw when Monday-to-Friday is the wrong week. Meeting days are always added. */
  weekdays?: Weekday[];
  /** Tapping a block. Omit for a read-only canvas (the share page, the chat card). */
  onSelectBlock?: (block: WeekGridBlock) => void;
  /** Owner id (section or custom block) of the block currently open in a sheet. */
  selectedOwnerId?: string | null;
  /** Owners drawn in the neutral "commitment" hue rather than a course hue. */
  commitmentIds?: ReadonlySet<string>;
  /** Shorter hours, for a card inside a chat thread or a drawer. */
  dense?: boolean;
  /** Below this width the grid degrades to the agenda list. */
  compact?: boolean;
  className?: string;
}

type Hue = "blue" | "pink" | "purple" | "lime" | "emerald" | "neutral";

const HUES: Hue[] = ["blue", "purple", "emerald", "pink", "lime"];

/** Static so Tailwind sees every class at build time. */
const HUE_SURFACE: Record<Hue, string> = {
  blue: "bg-calendar-event-blue-background text-calendar-event-blue-title",
  pink: "bg-calendar-event-pink-background text-calendar-event-pink-title",
  purple: "bg-calendar-event-purple-background text-calendar-event-purple-title",
  lime: "bg-calendar-event-lime-background text-calendar-event-lime-title",
  emerald: "bg-calendar-event-emerald-background text-calendar-event-emerald-title",
  neutral: "bg-background-tertiary-default text-text-secondary",
};

const HUE_RULE: Record<Hue, string> = {
  blue: "border-l-calendar-event-blue-title",
  pink: "border-l-calendar-event-pink-title",
  purple: "border-l-calendar-event-purple-title",
  lime: "border-l-calendar-event-lime-title",
  emerald: "border-l-calendar-event-emerald-title",
  neutral: "border-l-text-tertiary",
};

const CONFLICT_HATCH = "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 7px)";

const HOUR_PX = 56;
const DENSE_HOUR_PX = 44;

/**
 * Same course, same hue. Hashing the course id rather than counting order
 * keeps a course's colour stable when another is added before it.
 */
function hueFor(ownerId: string, commitmentIds?: ReadonlySet<string>): Hue {
  if (commitmentIds?.has(ownerId)) return "neutral";
  const courseKey = ownerId.replace(/^\d{5}/, "").replace(/\d{3}$/, "");
  let hash = 0;
  for (let index = 0; index < courseKey.length; index += 1) {
    hash = (hash * 31 + courseKey.charCodeAt(index)) >>> 0;
  }
  return HUES[hash % HUES.length];
}

function accessibleName(block: WeekGridBlock): string {
  const time = `${minutesToLabel(block.startMinute)} to ${minutesToLabel(block.endMinute)}`;
  const place = block.sublabel ? `, ${block.sublabel}` : "";
  const state =
    block.tone === "conflict" ? " — conflict" : block.tone === "candidate" ? " — preview, not saved" : "";
  return `${WEEKDAY_LABEL[block.weekday]} ${time}: ${block.label}${place}${state}`;
}

interface Placed extends PositionedBlock {
  topPercent: number;
  heightPercent: number;
}

function place(block: PositionedBlock, bounds: GridBounds): Placed {
  const top = fractionOf(block.startMinute, bounds) * 100;
  const bottom = fractionOf(block.endMinute, bounds) * 100;
  return { ...block, topPercent: top, heightPercent: Math.max(bottom - top, 1.5) };
}

export function ScheduleWeek({
  blocks,
  weekdays,
  onSelectBlock,
  selectedOwnerId = null,
  commitmentIds,
  dense = false,
  compact = false,
  className,
}: ScheduleWeekProps) {
  const bounds = fitGridBounds(blocks);
  const days = gridWeekdays(blocks, weekdays);
  const marks = hourMarks(bounds);
  const laidOut = useMemo(() => layoutWeek(blocks, days), [blocks, days]);

  if (compact) return <AgendaList blocks={blocks} className={className} />;

  const hourPx = dense ? DENSE_HOUR_PX : HOUR_PX;
  const bodyHeight = ((bounds.endMinute - bounds.startMinute) / 60) * hourPx;
  const columns: CSSProperties = {
    gridTemplateColumns: `var(--gutter) repeat(${days.length}, minmax(0, 1fr))`,
  };

  return (
    <div
      className={cx(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border-table bg-background-primary-default",
        "[--gutter:2.5rem] sm:[--gutter:3.5rem]",
        className,
      )}
    >
      <div
        className="grid border-b border-border-table bg-background-secondary-default"
        style={columns}
      >
        <div aria-hidden />
        {days.map((day) => (
          <div
            key={day}
            className="border-l border-border-table py-1.5 text-center text-caption-1-medium text-text-secondary sm:py-2"
          >
            <abbr title={WEEKDAY_LABEL[day]} className="no-underline">
              {WEEKDAY_SHORT[day]}
            </abbr>
          </div>
        ))}
      </div>

      <div className="grid" style={columns}>
        <div aria-hidden className="relative" style={{ height: bodyHeight }}>
          {marks.map((minute) => (
            <span
              key={minute}
              className="absolute right-1 -translate-y-1/2 text-[10px] leading-none tabular-nums text-text-tertiary sm:right-2 sm:text-caption-2-regular"
              style={{ top: `${fractionOf(minute, bounds) * 100}%` }}
            >
              {minute === bounds.startMinute ? "" : minutesToLabel(minute).replace(":00", "")}
            </span>
          ))}
        </div>

        {days.map((day) => (
          <div key={day} className="relative border-l border-border-table" style={{ height: bodyHeight }}>
            <div aria-hidden className="absolute inset-0">
              {marks
                .filter((minute) => minute > bounds.startMinute)
                .map((minute) => (
                  <span
                    key={minute}
                    className="absolute inset-x-0 border-t border-border-table"
                    style={{ top: `${fractionOf(minute, bounds) * 100}%` }}
                  />
                ))}
            </div>

            <ol className="absolute inset-0" aria-label={WEEKDAY_LABEL[day]}>
              {(laidOut.get(day) ?? [])
                .map((block) => place(block, bounds))
                .map((block) => (
                  <Block
                    key={block.blockId}
                    block={block}
                    hue={hueFor(ownerIdOf(block.blockId), commitmentIds)}
                    selected={selectedOwnerId !== null && ownerIdOf(block.blockId) === selectedOwnerId}
                    dense={dense || days.length > 5}
                    onSelect={onSelectBlock}
                  />
                ))}
            </ol>
          </div>
        ))}
      </div>

      {blocks.length === 0 ? (
        <p className="border-t border-border-table px-3 py-2 text-center text-caption-1-regular text-text-tertiary">
          Nothing on the week yet.
        </p>
      ) : null}
    </div>
  );
}

function Block({
  block,
  hue,
  selected,
  dense,
  onSelect,
}: {
  block: Placed;
  hue: Hue;
  selected: boolean;
  dense: boolean;
  onSelect?: (block: WeekGridBlock) => void;
}) {
  const laneWidth = 1 / block.laneCount;
  const minutes = block.endMinute - block.startMinute;
  const narrow = block.laneCount >= 3;
  const showTime = minutes >= 45 && !narrow;
  const showPlace = minutes >= 75 && !narrow && !dense && Boolean(block.sublabel);
  const interactive = Boolean(onSelect);

  const surface = cx(
    "relative flex h-full w-full flex-col overflow-hidden rounded-md border-l-[3px] px-1 py-0.5 text-left sm:px-1.5 sm:py-1",
    "outline-none transition-[transform,box-shadow] duration-150",
    HUE_SURFACE[hue],
    HUE_RULE[hue],
    block.tone === "candidate" && "border border-l-[3px] border-dashed border-current/50 opacity-90",
    block.tone === "conflict" && "ring-2 ring-inset ring-border-error-default",
    selected && "ring-2 ring-border-focus-ring",
    block.laneCount > 1 && "shadow-[0_0_0_1px_var(--color-background-primary-default)]",
    interactive &&
      "cursor-pointer touch-manipulation hover:brightness-95 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-border-focus-ring dark:hover:brightness-110",
  );

  const body = (
    <>
      {block.tone === "conflict" ? (
        <span aria-hidden className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: CONFLICT_HATCH }} />
      ) : null}
      <span className="sr-only">{accessibleName(block)}</span>
      <span aria-hidden className="relative flex min-w-0 flex-col gap-px">
        <span className="flex min-w-0 items-center gap-0.5">
          {block.tone === "conflict" ? <RiAlertLine className="hidden size-3 shrink-0 sm:block" /> : null}
          {block.tone === "candidate" ? <RiEyeLine className="size-3 shrink-0" /> : null}
          <span
            className={cx(
              "min-w-0 break-words",
              dense ? "truncate text-[11px] font-medium leading-tight" : "line-clamp-2 text-[11px] font-medium leading-[1.15] sm:truncate sm:text-caption-1-medium",
            )}
          >
            {block.label}
          </span>
        </span>
        {showTime ? (
          <span className="truncate text-[10px] leading-tight tabular-nums opacity-80 sm:text-caption-2-regular">
            {minutesToLabel(block.startMinute)}
          </span>
        ) : null}
        {showPlace ? (
          <span className="hidden truncate text-caption-2-regular opacity-80 sm:block">{block.sublabel}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <li
      className="absolute px-px"
      style={{
        top: `${block.topPercent}%`,
        height: `${block.heightPercent}%`,
        left: `${block.lane * laneWidth * 100}%`,
        width: `${laneWidth * 100}%`,
      }}
    >
      {interactive ? (
        <button type="button" className={surface} onClick={() => onSelect?.(block)}>
          {body}
        </button>
      ) : (
        <div className={surface}>{body}</div>
      )}
    </li>
  );
}
