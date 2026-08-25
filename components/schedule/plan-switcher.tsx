"use client";

/**
 * Plan switcher — adapted from 21st `sshahaider/workspaces` (id 4511).
 * `21st add` needs marketplace membership; source pulled via `21st get`.
 * BoardUI Dropdown + tokens replace shadcn Popover/Avatar.
 */

import { useMemo, useState } from "react";
import { RiAddLine, RiCheckLine, RiExpandUpDownLine, RiStarFill } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import {
  Dropdown,
  DropdownDivider,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import type { PlanAnalysisDetail } from "@/lib/schedule";
import { cx } from "@/utils/cx";
import type { CalendarRailPlan } from "./calendar-rail";

function planSubtitle(plan: CalendarRailPlan): string | null {
  if (plan.isPrimary) return "Primary plan";
  return null;
}

function PlanAvatar({ name, primary }: { name: string; primary: boolean }) {
  return (
    <span
      className={cx(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-caption-1-semibold",
        primary ? "bg-accent-500 text-white" : "bg-background-tertiary-default text-text-secondary",
      )}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function PlanSwitcher({
  plans,
  selectedId,
  onSelectPlan,
  onCreatePlan,
  analysis,
}: {
  plans: readonly CalendarRailPlan[];
  selectedId: string | null;
  onSelectPlan: (planId: string) => void;
  onCreatePlan: () => void;
  analysis: PlanAnalysisDetail | null;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => plans.find((plan) => plan.planId === selectedId) ?? plans[0] ?? null,
    [plans, selectedId],
  );

  if (!selected) return null;

  const credits =
    analysis &&
    (analysis.creditsMin === analysis.creditsMax
      ? `${analysis.creditsMax} cr`
      : `${analysis.creditsMin}–${analysis.creditsMax} cr`);

  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger
        aria-label={`Plan: ${selected.name}. Switch plan`}
        className={cx(
          "flex w-full items-center justify-between gap-2 rounded-2lg border border-border-button-default",
          "bg-background-primary-default px-2.5 py-2 shadow-xs",
          "transition-[color,background-color,border-color,transform,scale] duration-150 ease-out",
          "active:scale-[0.97] active:duration-[160ms]",
          "motion-reduce:transition-none motion-reduce:active:scale-100",
          "hover:bg-background-primary-hover",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <PlanAvatar name={selected.name} primary={selected.isPrimary} />
          <span className="flex min-w-0 flex-col items-start">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-body-medium text-text-primary">{selected.name}</span>
              {selected.isPrimary ? (
                <RiStarFill className="size-3 shrink-0 text-foreground-icon-secondary" aria-label="Primary" />
              ) : null}
            </span>
            {credits ? (
              <span className="text-caption-1-regular text-text-tertiary">{credits} · editing</span>
            ) : (
              <span className="text-caption-1-regular text-text-tertiary">Editing</span>
            )}
          </span>
        </span>
        <RiExpandUpDownLine className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
      </DropdownTrigger>

      <DropdownPopover aria-label="Choose a plan" placement="bottom start" className="w-[min(100vw-2rem,17rem)]">
        <DropdownGroup label="Plans">
          {plans.map((plan) => (
            <DropdownItem
              key={plan.planId}
              selected={plan.planId === selected.planId}
              onSelect={() => {
                onSelectPlan(plan.planId);
                setOpen(false);
              }}
              className="justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <PlanAvatar name={plan.name} primary={plan.isPrimary} />
                <span className="flex min-w-0 flex-col items-start">
                  <span className="truncate text-body-medium text-text-primary">{plan.name}</span>
                  {planSubtitle(plan) ? (
                    <span className="text-caption-1-regular text-text-tertiary">
                      {planSubtitle(plan)}
                    </span>
                  ) : null}
                </span>
              </span>
              {plan.planId === selected.planId ? (
                <RiCheckLine className="size-4 shrink-0 text-text-primary" aria-hidden />
              ) : plan.isPrimary ? (
                <Chip variant="caption" color="soft">
                  Primary
                </Chip>
              ) : null}
            </DropdownItem>
          ))}
        </DropdownGroup>
        <DropdownDivider />
        <DropdownItem onSelect={onCreatePlan} className="text-text-secondary">
          <RiAddLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <span className="text-body-medium">New plan</span>
        </DropdownItem>
      </DropdownPopover>
    </Dropdown>
  );
}
