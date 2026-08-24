"use client";

import { termLabel } from "@/lib/constants";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * Which term's saved classes to show.
 *
 * ── Why it defaults to a term rather than to "All" ────────────────────────
 *
 * A saved list is a registration instrument, and registration is for one term.
 * Defaulting to everything means the first thing a student sees in November is
 * a list half-full of classes they already took, and the useful half buried.
 *
 * ── Why the pills are derived, not fixed ──────────────────────────────────
 *
 * Only terms the student has actually saved something in appear. A pill for a
 * term with nothing behind it is a control whose only outcome is an empty
 * screen, and the set is small enough that a dropdown would be a click
 * standing in front of a two-item list.
 *
 * "All" is offered last and never as the default, for the reason above.
 */

export interface TermFilterProps {
  terms: readonly TermCode[];
  value: TermCode | null;
  onChange: (value: TermCode | null) => void;
  className?: string;
}

export function TermFilter({ terms, value, onChange, className }: TermFilterProps) {
  // One term and nothing else means the control has no choice to offer.
  if (terms.length <= 1) return null;

  return (
    <div
      role="group"
      aria-label="Filter by term"
      className={cx("flex flex-wrap items-center gap-1", className)}
    >
      {terms.map((termCode) => (
        <Pill
          key={termCode}
          isActive={value === termCode}
          onPress={() => onChange(termCode)}
          label={termLabel(termCode)}
        />
      ))}
      <Pill isActive={value === null} onPress={() => onChange(null)} label="All terms" />
    </div>
  );
}

function Pill({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={isActive}
      className={cx(
        "inline-flex h-7 cursor-pointer items-center rounded-full px-2.5",
        "text-caption-1-medium whitespace-nowrap transition-colors duration-150 ease",
        "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        isActive
          ? "bg-background-tertiary-default text-text-primary"
          : "text-text-secondary hover:bg-background-secondary-hover",
      )}
    >
      {label}
    </button>
  );
}
