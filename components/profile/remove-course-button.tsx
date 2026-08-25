"use client";

import { useState, useTransition } from "react";
import { RiDeleteBin6Line } from "@remixicon/react";

import { removeCourseAction } from "@/app/profile/actions";
import { cx } from "@/utils/cx";

/**
 * Take one course back off the record.
 *
 * No confirmation dialog. The row is one line of self-reported data the student
 * typed themselves, re-adding it is three seconds, and a modal for every
 * deletion would make correcting a mis-parsed transcript unbearable — which is
 * exactly the case this button exists for.
 */

export interface RemoveCourseButtonProps {
  courseId: string;
  code: string;
  className?: string;
}

export function RemoveCourseButton({ courseId, code, className }: RemoveCourseButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={`Remove ${code} from your record`}
      title={error ?? `Remove ${code} from your record`}
      disabled={isPending}
      onClick={() => {
        setError(null);
        startTransition(async () => {
          const result = await removeCourseAction(courseId);
          if (!result.ok) setError(result.error ?? "Could not remove that course.");
        });
      }}
      className={cx(
        "flex size-7 shrink-0 items-center justify-center rounded-lg outline-none transition-colors duration-150",
        "hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error ? "text-status-rose-text" : "text-foreground-icon-tertiary hover:text-text-primary",
        className,
      )}
    >
      <RiDeleteBin6Line className="size-4" aria-hidden />
    </button>
  );
}
