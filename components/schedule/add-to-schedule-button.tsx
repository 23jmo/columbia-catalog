"use client";

import { useState } from "react";
import { RiCalendarCheckFill, RiCalendarLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { usePlans } from "@/hooks/use-plans";
import { useSessionAccount } from "@/hooks/use-session-account";
import { CURRENT_TERM } from "@/lib/constants";
import { PlanWriteDeniedError, planStore } from "@/lib/schedule/plans";
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

export interface AddToScheduleButtonProps {
  sectionId: string;
  /** For the accessible label — "Add section 001 to your schedule". */
  sectionCode: string;
  termCode?: TermCode;
  size?: "xs" | "small" | "medium";
  iconOnly?: boolean;
  className?: string;
}

export function AddToScheduleButton({
  sectionId,
  sectionCode,
  termCode = CURRENT_TERM,
  size = "medium",
  iconOnly = false,
  className,
}: AddToScheduleButtonProps) {
  const plans = usePlans(termCode);
  const { account, isLoading } = useSessionAccount();
  const [denied, setDenied] = useState<string | null>(null);

  const primary = plans.find((plan) => plan.isPrimary) ?? plans[0] ?? null;
  const isOnSchedule = primary?.sectionIds.includes(sectionId) ?? false;
  const isSignedOut = !isLoading && account === null;

  const label = isSignedOut
    ? "Sign in to save a schedule"
    : isOnSchedule
      ? `Remove section ${sectionCode} from your schedule`
      : `Add section ${sectionCode} to your schedule`;

  function toggle() {
    setDenied(null);
    try {
      // First use in a term has no plan yet. Creating one as a side effect of
      // the first add is the whole "no dialog before the click" idea.
      const plan = primary ?? planStore.createPlan({ name: "My schedule", termCode });
      if (isOnSchedule) planStore.removeSection(plan.planId, sectionId);
      else planStore.addSection(plan.planId, sectionId);
    } catch (cause) {
      if (cause instanceof PlanWriteDeniedError) setDenied(cause.message);
      else throw cause;
    }
  }

  return (
    <span className={cx("inline-flex flex-col items-start gap-1", className)}>
      <Button
        size={size}
        variant={isOnSchedule ? "primary" : "secondary"}
        iconOnly={iconOnly}
        leadingIcon={isOnSchedule ? RiCalendarCheckFill : RiCalendarLine}
        onClick={toggle}
        disabled={isSignedOut}
        aria-pressed={isOnSchedule}
        aria-label={label}
        title={denied ?? label}
      >
        {iconOnly ? undefined : isOnSchedule ? "On schedule" : "Add to schedule"}
      </Button>
      {denied ? (
        <span role="status" className="text-caption-1-regular text-text-error-primary">
          {denied}
        </span>
      ) : null}
    </span>
  );
}
