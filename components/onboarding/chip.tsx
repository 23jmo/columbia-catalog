"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { RiAddLine, RiCloseLine } from "@remixicon/react";

import { cx } from "@/utils/cx";

/**
 * The answer vocabulary: pills, wrapped, centred, ragged.
 *
 * ── Why chips rather than a grid or a list ──────────────────────────────────
 *
 * A grid forces every answer into the same box, so "AI and machine learning"
 * and "Theory" occupy identical rectangles and the layout stops carrying any
 * information about the answers. A wrap lets each pill be exactly as wide as
 * its own words, which makes a set of twelve options scannable as a shape
 * instead of as a table to read cell by cell. Ragged and centred rather than
 * justified for the same reason: the ragged edge is what tells the eye where
 * one option ends and the next begins.
 *
 * It is also the only layout that degrades to a phone without a media query.
 * A two-column grid becomes a one-column stack of full-width buttons — twelve
 * identical bars, which is the worst version of this screen. A wrap just wraps
 * sooner, and short options keep sharing a line all the way down to 320px.
 *
 * ── Touch targets ──────────────────────────────────────────────────────────
 *
 * `min-h-10` on every pointer, `pointer-coarse:min-h-11` on touch. Growing the
 * target only where the pointer is coarse is the pattern the schedule and
 * account surfaces already use: it reaches 44px on a phone without inflating
 * the desktop layout into something loose and clumsy.
 */

export function ChipWrap({ children, className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={cx("flex flex-wrap justify-center gap-2", className)} {...rest}>
      {children}
    </ul>
  );
}

const CHIP_BASE =
  "flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-body-regular transition-colors pointer-coarse:min-h-11";

/**
 * Coursework pills (code + title) are denser below `sm` so a long list wraps
 * instead of stacking off a phone. Degree/interest `OptionChip`s stay on
 * `CHIP_BASE` — they are one line and do not have this overflow problem.
 */
const COURSE_CHIP =
  "flex min-h-8 items-center gap-1 rounded-full border py-1 text-caption-1-regular sm:min-h-10 sm:gap-2 sm:py-2 sm:text-body-regular";

/** Title line: short on phones so two pills share a row; full length from `sm`. */
const COURSE_SUBLABEL = "max-w-[7.5rem] truncate text-caption-2-regular sm:max-w-[22rem]";

/** Unselected pills are a muted fill with dark text; selected is the accent, quietly. */
const CHIP_IDLE =
  "border-transparent bg-background-tertiary-default text-text-primary hover:bg-background-secondary-hover";
const CHIP_SELECTED = "border-accent-500 bg-accent-500/10 text-accent-500";

export interface OptionChipProps {
  isSelected: boolean;
  onPress: () => void;
  children: ReactNode;
  /** A second line inside the pill — a course title under its code. */
  sublabel?: string;
  /** Accessible name, when the visible label is an abbreviation. */
  label?: string;
  disabled?: boolean;
}

export function OptionChip({
  isSelected,
  onPress,
  children,
  sublabel,
  label,
  disabled = false,
}: OptionChipProps) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={label}
        disabled={disabled}
        onClick={onPress}
        className={cx(
          CHIP_BASE,
          sublabel && "py-2",
          isSelected ? CHIP_SELECTED : CHIP_IDLE,
          disabled && "cursor-default opacity-50",
        )}
      >
        <span className="flex flex-col items-start text-left">
          <span>{children}</span>
          {sublabel ? (
            <span
              className={cx(
                "max-w-[22rem] truncate text-caption-2-regular",
                isSelected ? "text-accent-500" : "text-text-secondary",
              )}
            >
              {sublabel}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/**
 * A pill that is already an answer, with the way to take it back.
 *
 * The × is a real button inside the pill rather than a second tap on the pill
 * itself, because these carry a `note` — "not in our catalog" — and a student
 * reading that label should be able to reach for the remove without wondering
 * whether tapping the words does something else.
 */
export function RemovableChip({
  children,
  sublabel,
  note,
  onRemove,
  removeLabel,
}: {
  children: ReactNode;
  /** Course title under the code, matching `AddChip`. */
  sublabel?: string;
  note?: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <li
      className={cx(
        COURSE_CHIP,
        "border-accent-500 bg-accent-500/10 pr-0.5 pl-2.5 text-accent-500 sm:pr-1 sm:pl-4",
        sublabel && "py-1 sm:py-2",
      )}
    >
      <span className="flex min-w-0 flex-col items-start text-left">
        <span>{children}</span>
        {sublabel ? (
          <span className={cx(COURSE_SUBLABEL, "text-accent-500/80")}>{sublabel}</span>
        ) : null}
        {note ? <span className="text-caption-2-regular text-text-secondary">{note}</span> : null}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-accent-500 transition-colors hover:bg-accent-500/20 sm:size-8 pointer-coarse:size-7 sm:pointer-coarse:size-9"
      >
        <RiCloseLine className="size-3.5 sm:size-4" aria-hidden />
      </button>
    </li>
  );
}

/** An offer, not an answer: the leading + says a tap adds rather than selects. */
export function AddChip({
  children,
  sublabel,
  onPress,
  label,
}: {
  children: ReactNode;
  sublabel?: string;
  onPress: () => void;
  label: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPress}
        aria-label={label}
        className={cx(COURSE_CHIP, "cursor-pointer px-2.5 pl-2 transition-colors sm:px-4 sm:pl-3", CHIP_IDLE)}
      >
        <RiAddLine className="size-3.5 shrink-0 text-text-tertiary sm:size-4" aria-hidden />
        <span className="flex flex-col items-start text-left">
          <span>{children}</span>
          {sublabel ? <span className={cx(COURSE_SUBLABEL, "text-text-secondary")}>{sublabel}</span> : null}
        </span>
      </button>
    </li>
  );
}
