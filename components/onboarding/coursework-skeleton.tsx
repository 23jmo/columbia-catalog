import { cx } from "@/utils/cx";

import { ChipWrap } from "./chip";

/**
 * Placeholder chips while the guess deck loads.
 *
 * Matches the pill geometry of `RemovableChip` and `AddChip` so the coursework
 * step does not jump when tier-1 guesses land on the record.
 */

function ChipSkeleton({ className }: { className?: string }) {
  return (
    <li>
      <div
        className={cx(
          "h-10 min-w-20 animate-pulse rounded-full bg-background-tertiary-default motion-reduce:animate-none pointer-coarse:h-11",
          className,
        )}
      />
    </li>
  );
}

function LabelSkeleton() {
  return (
    <div
      className="mx-auto h-2.5 w-40 animate-pulse rounded-full bg-background-tertiary-default motion-reduce:animate-none"
      aria-hidden
    />
  );
}

export function CourseworkSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <ChipWrap aria-hidden>
        <ChipSkeleton className="w-28" />
        <ChipSkeleton className="w-32" />
        <ChipSkeleton className="w-24" />
        <ChipSkeleton className="w-36" />
        <ChipSkeleton className="w-28" />
        <ChipSkeleton className="w-30" />
      </ChipWrap>

      <div className="flex flex-col gap-3">
        <LabelSkeleton />
        <ChipWrap aria-hidden>
          <ChipSkeleton className="w-28" />
          <ChipSkeleton className="w-32" />
          <ChipSkeleton className="w-24" />
          <ChipSkeleton className="w-34" />
        </ChipWrap>
      </div>

      <p className="sr-only" role="status">
        Working out what you have probably taken
      </p>
    </div>
  );
}
