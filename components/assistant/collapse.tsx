import { type ReactNode } from "react";
import { RiAddLine, RiSubtractLine } from "@remixicon/react";

import { cx } from "@/utils/cx";

/**
 * Accordion without animating height to `auto`.
 *
 * `grid-template-rows` 0fr → 1fr is the same two-way toggle the settings
 * tools list uses. 200ms — this is one of the few motions that costs layout
 * per frame, so the recipe keeps it short. Reduced motion drops the rows
 * interpolation and keeps the fade.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cx(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
        "motion-reduce:transition-opacity",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export function CollapseMark({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative flex size-6 shrink-0 items-center justify-center rounded-lg",
        "border border-border-table text-foreground-icon-quaternary",
      )}
    >
      <RiAddLine
        className={cx(
          "size-3.5 transition-opacity duration-150 ease-out motion-reduce:transition-none",
          open ? "opacity-0" : "opacity-100",
        )}
      />
      <RiSubtractLine
        className={cx(
          "absolute size-3.5 transition-opacity duration-150 ease-out motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}
