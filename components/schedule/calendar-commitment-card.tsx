"use client";

import { useEffect, useRef } from "react";
import {
  RiArrowRightLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiTimeLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { WEEKDAY_LABEL } from "@/lib/constants";
import type { CustomBlock, Weekday } from "@/lib/types";
import { cx } from "@/utils/cx";
import {
  formatDuration,
  formatTimeInput,
  parseTimeInput,
} from "./calendar-commitment";

/**
 * Inline commitment editor — stacked rows like the Nuxt event popover,
 * not a detached form under the grid.
 */
export function CommitmentCard({
  label,
  weekday,
  startMinute,
  endMinute,
  mode,
  onLabelChange,
  onWeekdayChange,
  onStartChange,
  onEndChange,
  onSave,
  onDelete,
  onClose,
  className,
}: {
  label: string;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  mode: "create" | "edit";
  onLabelChange: (value: string) => void;
  onWeekdayChange: (value: Weekday) => void;
  onStartChange: (minute: number) => void;
  onEndChange: (minute: number) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
  className?: string;
}) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  const timesValid = endMinute > startMinute;

  return (
    <div
      role="dialog"
      aria-label={mode === "create" ? "New commitment" : "Edit commitment"}
      className={cx(
        "w-80 rounded-2xl border border-border-table bg-background-primary-default p-3 shadow-lg",
        className,
      )}
    >
      <div className="mb-3 flex items-start gap-2">
        <input
          ref={titleRef}
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && timesValid) onSave();
            if (event.key === "Escape") onClose();
          }}
          placeholder="Commitment"
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg p-1 text-foreground-icon-tertiary hover:bg-background-secondary-hover"
        >
          <RiCloseLine className="size-4" aria-hidden />
        </button>
      </div>

      <p className="mb-3 text-sm text-text-tertiary">Every {WEEKDAY_LABEL[weekday]}</p>

      <div className="mb-2 flex flex-col gap-2">
        <label className="flex items-center gap-2 rounded-xl bg-background-secondary-default px-3 py-2">
          <RiTimeLine className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          <select
            value={weekday}
            onChange={(event) => onWeekdayChange(event.target.value as Weekday)}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
            aria-label="Weekday"
          >
            {(Object.keys(WEEKDAY_LABEL) as Weekday[]).map((day) => (
              <option key={day} value={day}>
                {WEEKDAY_LABEL[day]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2 rounded-xl bg-background-secondary-default px-3 py-2">
          <RiTimeLine className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          <input
            type="time"
            value={formatTimeInput(startMinute)}
            onChange={(event) => {
              const parsed = parseTimeInput(event.target.value);
              if (parsed !== null) onStartChange(parsed);
            }}
            className="min-w-0 flex-1 bg-transparent text-sm tabular-nums text-text-primary outline-none"
            aria-label="Start time"
          />
          <RiArrowRightLine className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          <input
            type="time"
            value={formatTimeInput(endMinute)}
            onChange={(event) => {
              const parsed = parseTimeInput(event.target.value);
              if (parsed !== null) onEndChange(parsed);
            }}
            className="min-w-0 flex-1 bg-transparent text-sm tabular-nums text-text-primary outline-none"
            aria-label="End time"
          />
          <span className="shrink-0 rounded-full bg-background-tertiary-default px-2 py-0.5 text-xs text-text-tertiary tabular-nums">
            {formatDuration(startMinute, endMinute)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="small" onClick={onSave} disabled={!timesValid} className="flex-1">
          {mode === "create" ? "Add" : "Save"}
        </Button>
        {mode === "edit" && onDelete ? (
          <Button
            size="small"
            variant="secondary"
            iconOnly
            leadingIcon={RiDeleteBinLine}
            aria-label="Delete commitment"
            onClick={onDelete}
          />
        ) : null}
      </div>
    </div>
  );
}

export type CommitmentDraft = {
  mode: "create" | "edit";
  block?: CustomBlock;
  weekday: Weekday;
  label: string;
  startMinute: number;
  endMinute: number;
  anchor: { top: number; left: number };
  /** Day column the draft ghost paints on (create only). */
  dayKey?: string;
};
