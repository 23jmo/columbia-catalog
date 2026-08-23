import { RiAlertLine, RiEyeLine } from "@remixicon/react";
import { cx } from "@/utils/cx";
import { WEEKDAY_LABEL, WEEKDAY_SHORT, minutesToLabel } from "@/lib/constants";
import type { WeekGridBlock, WeekGridProps } from "@/components/course/contracts";
import { AgendaList } from "./agenda-list";
import {
  fractionOf,
  fitGridBounds,
  gridWeekdays,
  hourMarks,
  layoutWeek,
  type GridBounds,
  type PositionedBlock,
  type WeekGridTone,
} from "./to-blocks";

/**
 * The week canvas — spec §8.
 *
 * Satisfies `WeekGridComponent` from `components/course/contracts.ts` exactly,
 * so the course drawer can inject it without knowing anything about this lane.
 *
 * Three things this component refuses to do:
 *
 *  1. **Clip a meeting.** The 8am–11pm default window widens to whatever the
 *     blocks need (`gridBounds`), and a Saturday lab grows a Saturday column
 *     (`gridWeekdays`) instead of vanishing.
 *  2. **Hide an overlap.** Colliding rectangles share the day column
 *     side-by-side (`layoutDay`), so a conflict is visible as a shape, not only
 *     as a colour.
 *  3. **Speak in colour alone** (spec §18). Each tone carries a distinct border
 *     treatment, a distinct texture, an icon, and a word in its accessible name.
 *
 * No hooks and no browser APIs: this renders identically on the server, so the
 * home page can hold it without becoming a client component.
 */

/** Pixels per hour at the default density. Tall enough for a 50-minute label. */
const HOUR_HEIGHT_PX = 56;
const COMPACT_HOUR_HEIGHT_PX = 44;

/**
 * Tone styling.
 *
 * Colour is the *last* signal, never the only one:
 *   plan      — solid fill, thick left rule
 *   candidate — translucent fill, dashed outline, eye icon ("Preview")
 *   conflict  — solid outline, diagonal hatch, alert icon ("Conflict")
 */
const TONE_SURFACE: Record<WeekGridTone, string> = {
  plan: "border border-l-4 border-calendar-event-blue-background border-l-calendar-event-blue-title bg-calendar-event-blue-background text-calendar-event-blue-title",
  candidate:
    "border-2 border-dashed border-calendar-event-purple-title bg-calendar-event-purple-background/70 text-calendar-event-purple-title",
  conflict: "border-2 border-border-error-default bg-status-rose-background text-status-rose-text",
};

const TONE_WORD: Record<WeekGridTone, string> = {
  plan: "in your plan",
  candidate: "preview, not saved",
  conflict: "conflict",
};

const TONE_ICON: Partial<Record<WeekGridTone, typeof RiAlertLine>> = {
  candidate: RiEyeLine,
  conflict: RiAlertLine,
};

/**
 * A hatch drawn from `currentColor` so it inherits the tone's text colour and
 * flips with the theme automatically — no hard-coded ink anywhere.
 */
const CONFLICT_HATCH =
  "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 7px)";

const LEGEND_ENTRIES: { tone: WeekGridTone; label: string }[] = [
  { tone: "plan", label: "In your plan" },
  { tone: "candidate", label: "Preview — not saved" },
  { tone: "conflict", label: "Conflict" },
];

/** The sentence a screen reader hears: time, then day, then course. */
function accessibleName(block: WeekGridBlock): string {
  const time = `${minutesToLabel(block.startMinute)} to ${minutesToLabel(block.endMinute)}`;
  const place = block.sublabel ? `, ${block.sublabel}` : "";
  return `${time}, ${WEEKDAY_LABEL[block.weekday]}: ${block.label}${place} — ${TONE_WORD[block.tone]}`;
}

/**
 * At or beyond this many lanes a block is too narrow for anything but a name.
 *
 * At a 1440px viewport a three-lane cluster gives each block ~35px, which is
 * not enough for a time range or a room on top of the course code. Widening
 * the lanes into each other was tried and reverted: because the next lane
 * starts one lane-width over and paints on top, an overlapped block gains no
 * *visible* width at all — it only loses its ellipsis, since the label lays
 * out to the borrowed width and is then occluded mid-word. Equal lanes keep
 * `truncate` clipping at the real boundary; dropping ornamentation is what
 * actually buys characters back.
 */
const NARROW_LANE_COUNT = 3;

function EventBlock({ block, dense }: { block: PlacedBlock; dense: boolean }) {
  const Icon = TONE_ICON[block.tone];
  const durationMinutes = block.endMinute - block.startMinute;
  // Below ~50 minutes there is only room for one line; the rest still reaches a
  // screen reader through the accessible name.
  const narrow = block.laneCount >= NARROW_LANE_COUNT;
  const showSublabel = durationMinutes >= 50 && !narrow && Boolean(block.sublabel);
  const showTime = durationMinutes >= 40 && !narrow;

  const laneWidth = 1 / block.laneCount;
  const left = block.lane * laneWidth;

  return (
    <li
      className="absolute px-px"
      style={{
        top: `${block.topPercent}%`,
        height: `${block.heightPercent}%`,
        left: `${left * 100}%`,
        width: `${laneWidth * 100}%`,
      }}
    >
      <div
        className={cx(
          "relative flex h-full w-full flex-col overflow-hidden rounded-md px-1.5 py-1",
          // Only a stacked cluster needs the separating edge; a lone block on
          // an empty column would just look like it had picked up a border.
          block.laneCount > 1 && "shadow-[0_0_0_1px_var(--color-background-primary-default)]",
          TONE_SURFACE[block.tone],
        )}
      >
        {block.tone === "conflict" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{ backgroundImage: CONFLICT_HATCH }}
          />
        ) : null}

        <span className="sr-only">{accessibleName(block)}</span>

        <span aria-hidden className="relative flex min-w-0 flex-col gap-px">
          <span className="flex min-w-0 items-center gap-1">
            {Icon && !narrow ? <Icon className="size-3 shrink-0" /> : null}
            <span
              className={cx("truncate", dense ? "text-caption-2-medium" : "text-caption-1-medium")}
            >
              {block.label}
            </span>
          </span>
          {showTime ? (
            <span className="truncate text-caption-2-regular tabular-nums opacity-80">
              {minutesToLabel(block.startMinute)}–{minutesToLabel(block.endMinute)}
            </span>
          ) : null}
          {showSublabel ? (
            <span className="truncate text-caption-2-regular opacity-80">{block.sublabel}</span>
          ) : null}
        </span>
      </div>
    </li>
  );
}

/** `PositionedBlock` with its vertical placement resolved against the window. */
interface PlacedBlock extends PositionedBlock {
  topPercent: number;
  heightPercent: number;
}

function place(block: PositionedBlock, bounds: GridBounds): PlacedBlock {
  const top = fractionOf(block.startMinute, bounds) * 100;
  const bottom = fractionOf(block.endMinute, bounds) * 100;
  return {
    ...block,
    topPercent: top,
    // A meeting shorter than the ruled hour still has to be clickable and legible.
    heightPercent: Math.max(bottom - top, 1.2),
  };
}

export function WeekGrid({
  blocks,
  startMinute,
  endMinute,
  compact = false,
  className,
}: WeekGridProps) {
  // Narrow viewports get the agenda list, not a squeezed grid (spec §18).
  if (compact) return <AgendaList blocks={blocks} className={className} />;

  const bounds = fitGridBounds(blocks, startMinute, endMinute);
  const days = gridWeekdays(blocks);
  const marks = hourMarks(bounds);
  const laidOut = layoutWeek(blocks, days);
  const hourCount = (bounds.endMinute - bounds.startMinute) / 60;
  const bodyHeight = Math.max(hourCount * HOUR_HEIGHT_PX, COMPACT_HOUR_HEIGHT_PX * 4);
  const columns = `3.75rem repeat(${days.length}, minmax(0, 1fr))`;

  if (blocks.length === 0) {
    return (
      <div
        className={cx(
          "rounded-2lg border border-dashed border-border-button-default bg-background-secondary-default p-8 text-center",
          className,
        )}
      >
        <p className="text-body-medium text-text-primary">Nothing scheduled yet</p>
        <p className="mt-1 text-caption-1-regular text-text-secondary">
          Add a section or a custom block and it appears here, {minutesToLabel(bounds.startMinute)}{" "}
          to {minutesToLabel(bounds.endMinute)}, Monday through Friday.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "overflow-hidden rounded-2lg border border-border-table bg-background-primary-default shadow-card",
        className,
      )}
    >
      {/* Narrow screens scroll the week sideways rather than crushing five columns. */}
      <div className="overflow-x-auto">
        <div className="min-w-[42rem]">
          <div
            className="grid border-b border-border-table bg-background-secondary-default"
            style={{ gridTemplateColumns: columns }}
          >
            <div aria-hidden className="px-2 py-2" />
            {days.map((day) => (
              <div
                key={day}
                className="border-l border-border-table px-2 py-2 text-center text-caption-1-medium text-text-secondary"
              >
                <abbr title={WEEKDAY_LABEL[day]} className="no-underline">
                  {WEEKDAY_SHORT[day]}
                </abbr>
              </div>
            ))}
          </div>

          <div style={{ gridTemplateColumns: columns }} className="grid">
            {/* Time gutter. Each label sits just under the line that opens its
                hour band, so nothing is clipped at the top of the canvas. */}
            <div aria-hidden className="relative" style={{ height: bodyHeight }}>
              {marks.map((minute) => (
                <span
                  key={minute}
                  className="absolute right-2 pt-0.5 text-caption-2-regular tabular-nums text-text-tertiary"
                  style={{ top: `${fractionOf(minute, bounds) * 100}%` }}
                >
                  {minutesToLabel(minute)}
                </span>
              ))}
            </div>

            {days.map((day) => (
              <div
                key={day}
                className="relative border-l border-border-table"
                style={{ height: bodyHeight }}
              >
                {/* The opening mark is skipped: the header's own bottom border
                    already draws that line, and doubling it reads as a seam. */}
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
                      <EventBlock key={block.blockId} block={block} dense={days.length > 5} />
                    ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>

      <WeekGridLegend blocks={blocks} />
    </div>
  );
}

/**
 * The legend is what makes "distinguishable without colour" true rather than
 * aspirational: it names each treatment in words next to a swatch showing it.
 * Only tones actually present are listed, so a clean plan carries no warning.
 */
function WeekGridLegend({ blocks }: { blocks: readonly WeekGridBlock[] }) {
  const present = new Set<WeekGridTone>(blocks.map((block) => block.tone));
  const entries = LEGEND_ENTRIES.filter((entry) => present.has(entry.tone));

  // One tone on screen needs no key — the grid is already unambiguous.
  if (entries.length < 2) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-table px-3 py-2">
      {entries.map((entry) => {
        const Icon = TONE_ICON[entry.tone];
        return (
          <li
            key={entry.tone}
            className="flex items-center gap-1.5 text-caption-2-regular text-text-secondary"
          >
            <span
              aria-hidden
              className={cx("size-3 rounded-sm", TONE_SURFACE[entry.tone])}
              style={
                entry.tone === "conflict" ? { backgroundImage: CONFLICT_HATCH } : undefined
              }
            />
            {Icon ? <Icon className="size-3 text-foreground-icon-tertiary" aria-hidden /> : null}
            {entry.label}
          </li>
        );
      })}
    </ul>
  );
}

export default WeekGrid;
