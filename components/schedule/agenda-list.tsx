import { RiAlertLine, RiEyeLine, RiMapPinLine } from "@remixicon/react";
import { cx } from "@/utils/cx";
import { WEEKDAY_LABEL, minutesToLabel } from "@/lib/constants";
import type { WeekGridBlock } from "@/components/course/contracts";
import { groupBlocksByWeekday, type WeekGridTone } from "./to-blocks";

/**
 * The agenda list — what the week grid becomes on a narrow viewport (spec §18).
 *
 * A phone at 390px cannot hold five readable columns, and 2am seat-checking
 * happens on a phone, so this is a first-class rendering rather than a fallback.
 * It says everything the grid says, in reading order: day, then time, then
 * course, then room, then why a row is flagged.
 *
 * Overlaps cannot be shown by geometry here, so a clash is stated in words on
 * the rows involved — the same information the grid conveys by putting two
 * rectangles side by side.
 */

const TONE_ACCENT: Record<WeekGridTone, string> = {
  plan: "border-l-4 border-l-calendar-event-blue-title",
  candidate: "border-l-4 border-dashed border-l-calendar-event-purple-title",
  conflict: "border-l-4 border-l-border-error-default",
};

const TONE_NOTE: Record<WeekGridTone, { label: string; className: string } | null> = {
  plan: null,
  candidate: {
    label: "Preview — not saved",
    className: "bg-status-purple-background text-status-purple-text",
  },
  conflict: {
    label: "Conflict",
    className: "bg-status-rose-background text-status-rose-text",
  },
};

const TONE_ICON: Partial<Record<WeekGridTone, typeof RiAlertLine>> = {
  candidate: RiEyeLine,
  conflict: RiAlertLine,
};

export interface AgendaListProps {
  blocks: WeekGridBlock[];
  className?: string;
}

export function AgendaList({ blocks, className }: AgendaListProps) {
  const days = groupBlocksByWeekday(blocks);

  if (days.length === 0) {
    return (
      <div
        className={cx(
          "rounded-2lg border border-dashed border-border-button-default bg-background-secondary-default p-6 text-center",
          className,
        )}
      >
        <p className="text-body-medium text-text-primary">Nothing scheduled yet</p>
        <p className="mt-1 text-caption-1-regular text-text-secondary">
          Sections and custom blocks you add show up here, day by day.
        </p>
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {days.map(({ weekday, blocks: dayBlocks }) => (
        <section key={weekday} aria-labelledby={`agenda-${weekday}`}>
          <h4
            id={`agenda-${weekday}`}
            className="mb-1.5 flex items-baseline justify-between gap-2 text-caption-1-medium uppercase tracking-wide text-text-tertiary"
          >
            {WEEKDAY_LABEL[weekday]}
            <span className="text-caption-2-regular normal-case tracking-normal text-text-tertiary">
              {dayBlocks.length === 1 ? "1 block" : `${dayBlocks.length} blocks`}
            </span>
          </h4>
          <ol className="flex flex-col gap-1.5">
            {dayBlocks.map((block) => (
              <AgendaRow key={block.blockId} block={block} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function AgendaRow({ block }: { block: WeekGridBlock }) {
  const note = TONE_NOTE[block.tone];
  const Icon = TONE_ICON[block.tone];

  return (
    <li
      className={cx(
        "flex items-start gap-3 rounded-md border border-border-table bg-background-primary-default p-2.5",
        TONE_ACCENT[block.tone],
      )}
    >
      {/* Time first: on a phone the question is "what is next", not "what is it". */}
      <div className="w-[5.5rem] shrink-0 tabular-nums">
        <p className="text-caption-1-medium text-text-primary">
          {minutesToLabel(block.startMinute)}
        </p>
        <p className="text-caption-2-regular text-text-tertiary">
          {minutesToLabel(block.endMinute)}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-body-medium text-text-primary">
          {Icon ? (
            <Icon className="size-3.5 shrink-0 text-foreground-icon-secondary" aria-hidden />
          ) : null}
          <span className="truncate">{block.label}</span>
        </p>
        {block.sublabel ? (
          <p className="mt-0.5 flex items-center gap-1 text-caption-1-regular text-text-secondary">
            <RiMapPinLine className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{block.sublabel}</span>
          </p>
        ) : null}
        {note ? (
          <span
            className={cx(
              "mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-caption-2-medium",
              note.className,
            )}
          >
            {note.label}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export default AgendaList;
