"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { RiAddLine, RiCloseLine } from "@remixicon/react";

import { displayCourseTitle } from "@/lib/onboarding/course-title";
import { titleForCourseId } from "@/lib/onboarding/known-titles";
import { haptic } from "@/lib/haptics";
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

/**
 * Title on top, call number underneath.
 *
 * The coursework chips used to lead with `ENGL CC1010` and hide the name as
 * optional subtext, so a course our catalog has no title for looked like a
 * different kind of chip. Leading with the name (and always putting the code
 * on the second line when we have a name) makes every pill the same shape.
 */
export function courseChipLines(
  code: string,
  title: string | null | undefined,
): { label: string; sublabel?: string } {
  const pretty = title?.trim() ? displayCourseTitle(title.trim()) : "";
  if (pretty) return { label: pretty, sublabel: code };
  // Cores the guess deck names are often missing from a live-term catalog
  // extract. Fall back to the known name so the chip is still two lines —
  // "University Writing" over "ENGL CC1010" — not a bare call number.
  const known = titleForCourseId(code);
  if (known) return { label: known, sublabel: code };
  return { label: code };
}

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
const COURSE_TITLE = "max-w-[7.5rem] truncate sm:max-w-[22rem]";

/**
 * The dismiss badge both chips wear, on the top-right corner.
 *
 * One constant rather than two copies because it is one object: "take this off
 * my record" is the same gesture whether it is aimed at a course the student
 * confirmed or at one we guessed, and the coursework screen stacks both lists
 * one above the other where any difference would read as a difference in
 * meaning.
 *
 * Mid-grey (`neutral-500`) rather than the near-black it started as. Black
 * gave the screen fifteen of its highest-contrast objects at once, all of them
 * attached to the secondary action — the badges read before the courses did.
 * `text-tertiary` was the other candidate and is too faint to carry a white
 * glyph at this size.
 *
 * A full class string, never assembled, so Tailwind's source scan can see it.
 */
const DISMISS_BADGE =
  "absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full shadow-sm bg-text-secondary text-background-primary-default transition-opacity hover:opacity-80 pointer-coarse:size-6";

/** Unselected pills are a muted fill with dark text; selected is the accent, quietly. */
const CHIP_IDLE =
  "border-transparent bg-background-tertiary-default text-text-primary hover:bg-background-secondary-hover";
const CHIP_SELECTED = "border-accent-500 bg-accent-500/10 text-accent-500";

export interface OptionChipProps {
  isSelected: boolean;
  onPress: () => void;
  children: ReactNode;
  /** A second line inside the pill — a call number under a course title. */
  sublabel?: string;
  /** Accessible name, when the visible label is an abbreviation. */
  label?: string;
  /**
   * How many lines the sublabel may use before it is cut. One by default,
   * which is right for a call number under a title.
   *
   * The choose-one step asks for two: a multi-course route's second line is
   * the whole sequence — eight call numbers for the biology chemistry option —
   * and truncating it to one line hides the courses the student is being asked
   * to recognise. Nothing else passes this, so no other chip changes height.
   */
  sublabelLines?: 1 | 2;
  disabled?: boolean;
}

export function OptionChip({
  isSelected,
  onPress,
  children,
  sublabel,
  label,
  sublabelLines = 1,
  disabled = false,
}: OptionChipProps) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          // Same short tick as nav and back — a selection, not a save.
          haptic("selection");
          onPress();
        }}
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
                "max-w-[22rem] text-caption-2-regular",
                sublabelLines === 2 ? "line-clamp-2 text-left" : "truncate",
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
 * The × is a real button rather than a second tap on the pill itself, because
 * these carry a `note` — "not in our catalog" — and a student reading that
 * label should be able to reach for the remove without wondering whether
 * tapping the words does something else.
 *
 * It rides the corner as a badge, the same one `AddChip` uses, because the two
 * lists sit one above the other on the coursework screen and "take this off my
 * record" is one gesture whichever list it is aimed at. It used to be a glyph
 * inside the pill, which made the same action look like two different controls
 * depending on which half of the screen you were on.
 *
 * The pill keeps symmetric padding now that nothing sits inside it on the
 * right — the old `pr-0.5` was a slot reserved for a control that has moved
 * out, and left behind it read as a chip missing its right edge.
 */
export function RemovableChip({
  children,
  sublabel,
  note,
  onRemove,
  removeLabel,
}: {
  children: ReactNode;
  /** Call number under the title, matching `AddChip`. */
  sublabel?: string;
  note?: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <li
      className={cx(
        COURSE_CHIP,
        "relative border-accent-500 bg-accent-500/10 px-2.5 text-accent-500 sm:px-4",
        sublabel && "py-1 sm:py-2",
      )}
    >
      <span className="flex min-w-0 flex-col items-start text-left">
        <span className={COURSE_TITLE}>{children}</span>
        {sublabel ? (
          <span className={cx("text-caption-2-regular", "text-accent-500/80")}>{sublabel}</span>
        ) : null}
        {note ? <span className="text-caption-2-regular text-text-secondary">{note}</span> : null}
      </span>
      <button
        type="button"
        onClick={() => {
          haptic("selection");
          onRemove();
        }}
        aria-label={removeLabel}
        className={DISMISS_BADGE}
      >
        <RiCloseLine className="size-3" aria-hidden />
      </button>
    </li>
  );
}

/**
 * An offer, not an answer: the leading + says a tap adds rather than selects.
 *
 * The × in the top-right is a separate control — "I have not taken this" —
 * modelled on iOS's app-delete badge so it reads as dismiss, not as the
 * same tap that would add. It must not sit inside the add button: a nested
 * button is invalid HTML and would fire both handlers. See `DISMISS_BADGE`
 * for the styling, which `RemovableChip` shares.
 */
export function AddChip({
  children,
  sublabel,
  onPress,
  label,
  onDismiss,
  dismissLabel,
}: {
  children: ReactNode;
  sublabel?: string;
  onPress: () => void;
  label: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => {
          // Adding a course to the record is a completed act, not a toggle.
          haptic("success");
          onPress();
        }}
        aria-label={label}
        className={cx(COURSE_CHIP, "cursor-pointer px-2.5 pl-2 transition-colors sm:px-4 sm:pl-3", CHIP_IDLE)}
      >
        <RiAddLine className="size-3.5 shrink-0 text-text-tertiary sm:size-4" aria-hidden />
        <span className="flex min-w-0 flex-col items-start text-left">
          <span className={COURSE_TITLE}>{children}</span>
          {sublabel ? <span className="text-caption-2-regular text-text-secondary">{sublabel}</span> : null}
        </span>
      </button>
      {onDismiss ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            haptic("selection");
            onDismiss();
          }}
          aria-label={dismissLabel ?? "I have not taken this"}
          className={DISMISS_BADGE}
        >
          <RiCloseLine className="size-3" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
