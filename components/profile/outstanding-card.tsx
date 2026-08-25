import type { RemainingRequirement } from "@/lib/profile/audit";
import { cx } from "@/utils/cx";
import { VERIFICATION_LABEL, VERIFICATION_TEXT_COLOR, outstandingLabel } from "./format";

/**
 * Everything still outstanding, ordered by how actionable it is.
 *
 * The per-program cards further down are the complete picture; this is the
 * answer to "what do I do about it", which is a different question and deserves
 * its own surface at the top of the page.
 *
 * `auditProfile` has already sorted the list: requirements whose rule names
 * specific courses come first, then flag-matched ones, then the self-certified
 * ones — and within each tier, the closest to done. That ordering is the
 * feature. A requirement with a named candidate list is one click from
 * progress; a flagged one needs a search; an attested one is a box to tick and
 * a conversation with an adviser. Sorting by program instead would bury the
 * one-course-left requirement under a twelve-course elective block.
 */

export interface OutstandingCardProps {
  remaining: RemainingRequirement[];
  className?: string;
}

export function OutstandingCard({ remaining, className }: OutstandingCardProps) {
  if (remaining.length === 0) return null;

  return (
    <section
      className={cx(
        "flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
      aria-labelledby="outstanding-heading"
    >
      <div className="flex flex-col gap-0.5 px-1.5 pt-1">
        <p id="outstanding-heading" className="text-body-medium text-text-secondary">
          Still to do, most actionable first
        </p>
        <p className="text-title-2-medium tabular-nums text-text-primary">
          {remaining.length} requirement{remaining.length === 1 ? "" : "s"}
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {remaining.map((requirement) => (
          <li
            key={`${requirement.programId}:${requirement.groupId}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2lg bg-background-primary-default px-3 py-2"
          >
            <a
              href={`#program-${requirement.programId}-heading`}
              className="min-w-0 flex-1 rounded-lg outline-none transition-colors duration-150 hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <span className="block truncate text-body-medium text-text-primary">
                {requirement.label}
              </span>
              <span className="block truncate text-caption-2-regular text-text-tertiary">
                {requirement.programName}
              </span>
            </a>

            <span className="shrink-0 text-caption-1-medium tabular-nums text-text-secondary">
              {outstandingLabel(requirement.outstanding, requirement.unit)} left
            </span>

            {/*
              Only the tiers that change what you should do about the row.
              Nothing about a requirement here is finished, so "we can check
              this one exactly" is not news — it is the ordinary case, it was
              two thirds of the list, and rendering it as a lime pill on every
              row made the flagged and attested ones invisible. Those two do
              change the plan: one means search rather than click, the other
              means talk to an adviser.
            */}
            {requirement.verification === "exact" ? null : (
              <span
                className={cx(
                  "shrink-0 text-caption-2-regular",
                  VERIFICATION_TEXT_COLOR[requirement.verification],
                )}
              >
                {VERIFICATION_LABEL[requirement.verification]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
