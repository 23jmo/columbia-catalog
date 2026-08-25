"use client";

import { RiAddLine, RiCalendarCheckFill, RiCalendarLine, RiCheckLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { usePlans } from "@/hooks/use-plans";
import { useSessionAccount } from "@/hooks/use-session-account";
import { CURRENT_TERM } from "@/lib/constants";
import { haptic } from "@/lib/haptics";
import { PlanWriteDeniedError, planStore } from "@/lib/schedule/plans";
import { toast } from "@/lib/toast/store";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * Put a section on the schedule, or take it off.
 *
 * ── Why it toggles rather than only adds ──────────────────────────────────
 *
 * The button reflects the plan's actual contents, so a student who added a
 * section from search and then opened the course page sees "On schedule"
 * rather than an invitation to add it a second time. An add-only button makes
 * the reader keep the plan's state in their head; this one just tells them.
 *
 * ── Which plan ────────────────────────────────────────────────────────────
 *
 * The primary plan for the term, created on first use. Asking "which of your
 * plans?" before the student has more than one is a dialog in the way of a
 * click; moving a section between plans is the schedule page's job, where the
 * plans are visible.
 *
 * ── Signed out ────────────────────────────────────────────────────────────
 *
 * Same discipline as `WatchButton`: the affordance renders and says what it
 * needs rather than vanishing. Spec §15 makes reads free and writes an
 * account, and this is where a reader meets that line, so it should be legible
 * instead of absent. The guard itself lives in `lib/schedule/plans.ts` — this
 * component reads the session only to write the label, and a `PlanWriteDenied`
 * from the store is still caught and shown, because a UI that disables a
 * button is not a permission check.
 */

/**
 * Which glyph pair states the action.
 *
 * `calendar` is the default and belongs next to a label: the words already say
 * "add to schedule", so the icon's job is to name the destination.
 *
 * `plus` is for the bare square button beside a section heading, where there is
 * no label at all. A lone calendar there says "something to do with calendars"
 * and leaves the reader to guess the verb — the same reason a toolbar's "new"
 * control is a plus and not a document. The "on" half of the pair is a check
 * rather than a filled plus, because the state being reported is "done", and a
 * plus that stays a plus after a successful add reads as a no-op.
 */
const GLYPHS = {
  calendar: { idle: RiCalendarLine, active: RiCalendarCheckFill },
  plus: { idle: RiAddLine, active: RiCheckLine },
} as const;

export interface AddToScheduleButtonProps {
  sectionId: string;
  /** For the accessible label — "Add section 001 to your schedule". */
  sectionCode: string;
  termCode?: TermCode;
  size?: "xs" | "small" | "medium";
  iconOnly?: boolean;
  /** See `GLYPHS`. Default `calendar`; use `plus` for an unlabelled button. */
  glyph?: keyof typeof GLYPHS;
  /**
   * How loudly the button asks.
   *
   * `normal` is a secondary button that fills in once the section is on the
   * plan — right in a row of peer actions, where going primary would make one
   * of several equal choices look like the answer.
   *
   * `high` inverts it: primary while the section is NOT on the plan, secondary
   * once it is. That is the shape of a call to action — loud invitation, quiet
   * acknowledgement — and it is what the section heading wants, where this is
   * the only thing you can do to the class rather than one of five. Leaving it
   * primary after the add would keep shouting an invitation already accepted.
   */
  emphasis?: "normal" | "high";
  className?: string;
}

export function AddToScheduleButton({
  sectionId,
  sectionCode,
  termCode = CURRENT_TERM,
  size = "medium",
  iconOnly = false,
  glyph = "calendar",
  emphasis = "normal",
  className,
}: AddToScheduleButtonProps) {
  const plans = usePlans(termCode);
  const { account, isLoading } = useSessionAccount();

  const primary = plans.find((plan) => plan.isPrimary) ?? plans[0] ?? null;
  const isOnSchedule = primary?.sectionIds.includes(sectionId) ?? false;
  const isSignedOut = !isLoading && account === null;

  const label = isSignedOut
    ? "Sign in to add classes"
    : isOnSchedule
      ? `Remove section ${sectionCode} from your schedule`
      : `Add section ${sectionCode} to your schedule`;

  function toggle() {
    try {
      // First use in a term has no plan yet. Creating one as a side effect of
      // the first add is the whole "no dialog before the click" idea.
      const plan = primary ?? planStore.createPlan({ name: "My schedule", termCode });
      if (isOnSchedule) {
        // Quiet tick on remove — same discipline as un-bookmark.
        haptic("selection");
        planStore.removeSection(plan.planId, sectionId);
      } else {
        haptic("success");
        planStore.addSection(plan.planId, sectionId);
      }
    } catch (cause) {
      // A refusal used to render as a caption under the button, which in a
      // dense section list is both easy to miss and a layout shift on every
      // failure. It goes to the shared toast surface instead — the same place
      // every other refused write in the app now reports itself.
      if (cause instanceof PlanWriteDeniedError) {
        haptic("error");
        toast.error({
          title: "Couldn't update your schedule",
          description: cause.message,
          dedupeKey: `plan-denied:${sectionId}`,
        });
      } else throw cause;
    }
  }

  return (
    <span className={cx("inline-flex flex-col items-start gap-1", className)}>
      <Button
        size={size}
        variant={
          emphasis === "high"
            ? isOnSchedule
              ? "secondary"
              : "primary"
            : isOnSchedule
              ? "primary"
              : "secondary"
        }
        iconOnly={iconOnly}
        leadingIcon={isOnSchedule ? GLYPHS[glyph].active : GLYPHS[glyph].idle}
        onClick={toggle}
        disabled={isSignedOut}
        aria-pressed={isOnSchedule}
        aria-label={label}
        title={label}
      >
        {iconOnly ? undefined : isOnSchedule ? "On schedule" : "Add to schedule"}
      </Button>
    </span>
  );
}
